import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  NOWPAYMENTS_TOPUPS_ENV,
  NowpaymentsInvoiceError,
  createIpnSignature,
  createNowpaymentsInvoice,
  isCreditWorthyStatus,
  isFinalFailStatus,
  isNonFinalStatus,
  nowpaymentsBaseUrl,
  parseIpnPayment,
  readNowpaymentsConfig,
  readNowpaymentsPolicy,
  sortObjectDeep,
  verifyIpnSignature,
} from "../lib/nowpayments.ts";

test("crypto top-ups are off when the flag is unset", () => {
  const policy = readNowpaymentsPolicy({});

  assert.equal(policy.enabled, false);
  assert.equal(policy.configured, false);
  assert.match(policy.reason, /NOWPAYMENTS_TOPUPS_ENABLED=true/);
});

test("crypto top-ups stay off for an explicit false", () => {
  const policy = readNowpaymentsPolicy({ [NOWPAYMENTS_TOPUPS_ENV]: "false" });

  assert.equal(policy.enabled, false);
  assert.equal(policy.configured, true);
  assert.match(policy.reason, /NOWPAYMENTS_TOPUPS_ENABLED=false/);
});

test("only an affirmative flag enables crypto sales", () => {
  for (const value of ["1", "true", "TRUE", " yes ", "on"]) {
    const policy = readNowpaymentsPolicy({ [NOWPAYMENTS_TOPUPS_ENV]: value });

    assert.equal(policy.enabled, true, value);
    assert.equal(policy.reason, "");
  }
});

test("payment credentials alone never enable crypto sales", () => {
  const policy = readNowpaymentsPolicy({
    NOWPAYMENTS_API_KEY: "np_placeholder",
    NOWPAYMENTS_IPN_SECRET: "ipn_placeholder",
  });

  assert.equal(policy.enabled, false);
  assert.equal(policy.configured, false);
});

test("config requires both the API key and the IPN secret", () => {
  const missingKey = readNowpaymentsConfig({ NOWPAYMENTS_IPN_SECRET: "ipn" });

  assert.equal(missingKey.configured, false);
  assert.match(missingKey.reason, /NOWPAYMENTS_API_KEY/);

  const missingSecret = readNowpaymentsConfig({ NOWPAYMENTS_API_KEY: "np" });

  assert.equal(missingSecret.configured, false);
  assert.match(missingSecret.reason, /NOWPAYMENTS_IPN_SECRET/);

  const ready = readNowpaymentsConfig({
    NOWPAYMENTS_API_KEY: "np",
    NOWPAYMENTS_IPN_SECRET: "ipn",
  });

  assert.equal(ready.configured, true);
  assert.equal(ready.apiKey, "np");
  assert.equal(ready.ipnSecret, "ipn");
});

test("the base URL picks live unless the sandbox flag is affirmative", () => {
  assert.equal(nowpaymentsBaseUrl({}), "https://api.nowpayments.io");
  assert.equal(nowpaymentsBaseUrl({ NOWPAYMENTS_SANDBOX: "false" }), "https://api.nowpayments.io");
  assert.equal(nowpaymentsBaseUrl({ NOWPAYMENTS_SANDBOX: "true" }), "https://api-sandbox.nowpayments.io");
  assert.equal(nowpaymentsBaseUrl({ NOWPAYMENTS_SANDBOX: "1" }), "https://api-sandbox.nowpayments.io");
  assert.equal(nowpaymentsBaseUrl({ NOWPAYMENTS_SANDBOX: "maybe" }), "https://api.nowpayments.io");
});

test("sortObjectDeep sorts keys at every nesting level", () => {
  const sorted = sortObjectDeep({
    b: 2,
    a: 1,
    nested: { z: 26, y: 25, inner: { q: 17, p: 16 } },
    list: [{ d: 4, c: 3 }, 5, "x"],
  });

  assert.deepEqual(sorted, {
    a: 1,
    b: 2,
    list: [{ c: 3, d: 4 }, 5, "x"],
    nested: { inner: { p: 16, q: 17 }, y: 25, z: 26 },
  });
  assert.equal(JSON.stringify(sortObjectDeep({ b: 1, a: 2 })), '{"a":2,"b":1}');
  assert.equal(sortObjectDeep("plain"), "plain");
  assert.equal(sortObjectDeep(7), 7);
  assert.equal(sortObjectDeep(null), null);
  assert.deepEqual(sortObjectDeep([3, { b: 1, a: 2 }]), [3, { a: 2, b: 1 }]);
});

test("the IPN signature is order-independent and verified in constant time", () => {
  const payload = {
    order_id: "topup_123",
    payment_status: "finished",
    payment_id: 3849524346,
    price_amount: "25.00",
    price_currency: "usd",
    nested: { z: 26, y: 25 },
  };
  const signature = createIpnSignature(payload, "ipn-secret");
  const reordered = JSON.stringify(
    sortObjectDeep({
      nested: { y: 25, z: 26 },
      price_currency: "usd",
      price_amount: "25.00",
      payment_id: 3849524346,
      payment_status: "finished",
      order_id: "topup_123",
    }),
  );

  assert.equal(
    createHmac("sha512", "ipn-secret").update(reordered).digest("hex"),
    signature,
  );
  assert.equal(
    verifyIpnSignature(JSON.stringify(payload), signature, "ipn-secret"),
    true,
  );
});

test("IPN verification rejects tampering, wrong secrets and bad shapes", () => {
  const payload = { payment_id: 1, payment_status: "finished", order_id: "t1", price_amount: 5 };
  const signature = createIpnSignature(payload, "ipn-secret");

  assert.equal(
    verifyIpnSignature(JSON.stringify({ ...payload, price_amount: 99 }), signature, "ipn-secret"),
    false,
  );
  assert.equal(
    verifyIpnSignature(JSON.stringify(payload), signature, "other-secret"),
    false,
  );
  assert.equal(verifyIpnSignature(JSON.stringify(payload), "0".repeat(128), "ipn-secret"), false);
  assert.equal(verifyIpnSignature("not json", signature, "ipn-secret"), false);
  assert.equal(verifyIpnSignature("[1,2]", createIpnSignature({ a: 1 }, "s"), "s"), false);
  assert.equal(verifyIpnSignature("42", createIpnSignature({ a: 1 }, "s"), "s"), false);
  assert.equal(verifyIpnSignature(JSON.stringify(payload), "", "ipn-secret"), false);
  assert.equal(verifyIpnSignature(JSON.stringify(payload), "abcd", "ipn-secret"), false);
});

test("the invoice client sends the API key header and fixed-rate body", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: 3849524346, invoice_url: "https://pay.nowpayments.io/invoice/abc" }),
    };
  };

  const invoice = await createNowpaymentsInvoice(
    {
      apiKey: "np_test_key",
      amountMicros: 25_500_000,
      orderId: "topup_abc",
      ipnCallbackUrl: "https://gateway.test/api/webhooks/nowpayments",
      successUrl: "https://gateway.test/account?topup=success",
      cancelUrl: "https://gateway.test/account?topup=cancelled",
    },
    { baseUrl: "https://api-sandbox.nowpayments.io", fetchImpl },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api-sandbox.nowpayments.io/v1/invoice");
  assert.equal(calls[0].init.headers["x-api-key"], "np_test_key");
  assert.equal(calls[0].init.headers["content-type"], "application/json");
  assert.equal(calls[0].init.redirect, "error");

  const body = JSON.parse(calls[0].init.body);

  assert.equal(body.price_amount, 25.5);
  assert.equal(body.price_currency, "usd");
  assert.equal(body.order_id, "topup_abc");
  assert.equal(body.ipn_callback_url, "https://gateway.test/api/webhooks/nowpayments");
  assert.equal(body.success_url, "https://gateway.test/account?topup=success");
  assert.equal(body.cancel_url, "https://gateway.test/account?topup=cancelled");
  assert.equal(body.is_fixed_rate, true);
  assert.equal(body.is_fee_paid_by_user, true);
  assert.equal("pay_currency" in body, false);

  assert.equal(invoice.id, "3849524346");
  assert.equal(invoice.invoiceUrl, "https://pay.nowpayments.io/invoice/abc");
});

test("the invoice client keeps a string id and normalizes a numeric one", async () => {
  const stringInvoice = await createNowpaymentsInvoice(
    {
      apiKey: "np_key",
      amountMicros: 5_000_000,
      orderId: "t1",
      ipnCallbackUrl: "https://x.test/ipn",
      successUrl: "https://x.test/ok",
      cancelUrl: "https://x.test/cancel",
    },
    {
      baseUrl: "https://api-sandbox.nowpayments.io",
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ id: "inv_123", invoice_url: "https://pay.example/i" }) }),
    },
  );

  assert.equal(stringInvoice.id, "inv_123");
});

test("the invoice client maps upstream failures and bad shapes to errors", async () => {
  const input = {
    apiKey: "np_key",
    amountMicros: 5_000_000,
    orderId: "t1",
    ipnCallbackUrl: "https://x.test/ipn",
    successUrl: "https://x.test/ok",
    cancelUrl: "https://x.test/cancel",
  };

  await assert.rejects(
    createNowpaymentsInvoice(input, {
      baseUrl: "https://api-sandbox.nowpayments.io",
      fetchImpl: async () => ({ ok: false, status: 502 }),
    }),
    (error) =>
      error instanceof NowpaymentsInvoiceError &&
      error.message.includes("502"),
  );

  await assert.rejects(
    createNowpaymentsInvoice(input, {
      baseUrl: "https://api-sandbox.nowpayments.io",
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }),
    }),
    (error) => error instanceof NowpaymentsInvoiceError,
  );
});

test("parseIpnPayment normalizes numeric ids and string amounts", () => {
  const parsed = parseIpnPayment({
    payment_id: 3849524346,
    payment_status: "finished",
    order_id: "topup_abc",
    price_amount: "25.00",
    price_currency: "usd",
    actually_paid: 24.9,
    pay_currency: "usdc",
  });

  assert.deepEqual(parsed, {
    paymentId: "3849524346",
    paymentStatus: "finished",
    orderId: "topup_abc",
    priceAmount: 25,
    priceCurrency: "usd",
    actuallyPaid: 24.9,
    payCurrency: "usdc",
  });

  const minimal = parseIpnPayment({
    payment_id: "1",
    payment_status: "waiting",
    order_id: "t1",
    price_amount: 5,
    price_currency: "usd",
  });

  assert.equal(minimal.actuallyPaid, null);
  assert.equal(minimal.payCurrency, null);
});

test("parseIpnPayment rejects payloads missing a required field", () => {
  assert.equal(parseIpnPayment({}), null);
  assert.equal(parseIpnPayment({ payment_id: 1 }), null);
  assert.equal(
    parseIpnPayment({ payment_id: 1, payment_status: "finished" }),
    null,
  );
  assert.equal(
    parseIpnPayment({
      payment_id: 1,
      payment_status: "finished",
      order_id: "t1",
      price_amount: "abc",
      price_currency: "usd",
    }),
    null,
  );
});

test("IPN statuses classify into settled, non-final and final-fail", () => {
  assert.equal(isCreditWorthyStatus("finished"), true);
  assert.equal(isCreditWorthyStatus("waiting"), false);
  assert.equal(isCreditWorthyStatus("sending"), false);

  for (const status of ["waiting", "confirming", "confirmed", "sending", "partially_paid"]) {
    assert.equal(isNonFinalStatus(status), true, status);
  }
  assert.equal(isNonFinalStatus("finished"), false);

  for (const status of ["failed", "expired", "refunded"]) {
    assert.equal(isFinalFailStatus(status), true, status);
  }
  assert.equal(isFinalFailStatus("finished"), false);
});
