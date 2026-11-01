import * as account from "../storage/store/account.ts";
import * as accountEmail from "../storage/store/account-email.ts";
import * as activity from "../storage/store/activity.ts";
import * as billing from "../storage/store/billing.ts";
import * as credit from "../storage/store/credit.ts";
import * as customer from "../storage/store/customer.ts";
import * as keys from "../storage/store/keys.ts";
import * as usage from "../storage/store/usage.ts";

import { bound } from "./bound.ts";

/**
 * Customer and access façade (FID-086, step 4).
 *
 * Key auth, credit and usage are the money-adjacent half of the application, so
 * two renames are bridged here rather than left for each caller to discover:
 * the ported `reserveCredit`/`releaseHold` are exported under their own names and
 * also as `reserveCreditHold`/`releaseCreditHold`, which is what the synchronous
 * barrel called them. The shapes are identical — a hold or null, a boolean — so
 * the alias cannot change an admission decision; it only keeps the sweep from
 * rewriting call sites that have nothing to change.
 */

export const authenticateApiKey = bound(keys.authenticateApiKey);
export const listApiKeys = bound(keys.listApiKeys);
export const createDevApiKey = bound(keys.createDevApiKey);
export const revokeApiKey = bound(keys.revokeApiKey);

export const recordUsage = bound(usage.recordUsage);
export const listUsage = bound(usage.listUsage);
export const listAdminUsage = bound(usage.listAdminUsage);

export const availableCredit = bound(credit.availableCredit);
export const reserveCredit = bound(credit.reserveCredit);
export const releaseHold = bound(credit.releaseHold);
export const quarantineExpiredHolds = bound(credit.quarantineExpiredHolds);

/** Legacy names for the same two functions; identical return shapes. */
export const reserveCreditHold = bound(credit.reserveCredit);
export const releaseCreditHold = bound(credit.releaseHold);

export const getAccountSummary = bound(billing.getAccountSummary);
export const listCreditLedger = bound(billing.listCreditLedger);
export const grantCredit = bound(billing.grantCredit);

export const findCustomerByEmail = bound(customer.findCustomerByEmail);
export const findCustomerById = bound(customer.findCustomerById);
export const createCustomer = bound(customer.createCustomer);
export const markCustomerLogin = bound(customer.markCustomerLogin);
export const createCustomerSession = bound(customer.createCustomerSession);
export const resolveCustomerSession = bound(customer.resolveCustomerSession);
export const revokeCustomerSession = bound(customer.revokeCustomerSession);
export const listCustomerSummaries = bound(customer.listCustomerSummaries);

export const listCustomerApiKeys = bound(account.listCustomerApiKeys);
export const createCustomerApiKey = bound(account.createCustomerApiKey);
export const revokeCustomerApiKey = bound(account.revokeCustomerApiKey);
export const listCustomerUsage = bound(account.listCustomerUsage);
export const getCustomerUsageTotals = bound(account.getCustomerUsageTotals);
export const getCustomerAccount = bound(account.getCustomerAccount);

export const accountEmailStatus = bound(accountEmail.accountEmailStatus);

export const recordActivity = bound(activity.recordActivity);
export const recordActivityBestEffort = bound(
  activity.recordActivityBestEffort,
);
export const listActivity = bound(activity.listActivity);
