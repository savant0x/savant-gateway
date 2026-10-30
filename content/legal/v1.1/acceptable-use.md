## 1. Scope

This policy applies to every request made with an account or an API key,
including requests to `POST /v1/chat/completions`, and to any use of the
catalog, model prices or benchmark data this service publishes.

## 2. Prohibited uses

You must not use the service to:

1. Break the law of Kentucky, of the United States, or of any jurisdiction where
   you or an upstream provider operates.
2. Generate or distribute child sexual abuse material, or any content that
   sexually exploits a minor.
3. Threaten, harass, stalk or incite violence against a person or a group.
4. Create or distribute malware, run denial-of-service attacks, or attempt to
   gain unauthorized access to any system.
5. Circumvent this service's limits: rotate keys to exceed quotas, evade rate
   limits or capacity admission, or share one account among unrelated parties.
6. Resell raw access to this gateway, or give third parties direct use of your
   keys, without the operator's written permission. Building your own product or
   service on top of the API and selling that is permitted, and is the intended
   use of the gateway; what is not permitted is passing the gateway itself off as
   your own API to unrelated customers, or letting them use your keys directly.
7. Infringe intellectual-property rights, or violate another person's privacy by
   submitting their personal data without a lawful basis.
8. Submit data the service is not designed to hold. That includes health and
   medical records, biometric or genetic data, financial account or card
   numbers, government identifiers, precise location traces, and personal data
   about children. No data-processing agreement and no business-associate
   agreement is offered, so regulated data must not be sent.
9. Make a high-impact decision about a person — credit, employment, housing,
   insurance, education, legal access or medical care — using output as the sole
   or deciding basis, or without review by someone qualified to make that
   decision. Where the law requires you to disclose that content was
   AI-generated, you must disclose it.
10. Probe, scan, or attempt to extract upstream credentials, other customers'
    data, or operator configuration.

## 3. Your responsibility

You are responsible for what you submit and for how you use the output. The
gateway does not screen prompts or output for policy violations and does not
store their content. Upstream providers may apply their own policies and may
refuse or filter a request; the gateway reports that refusal but cannot override
it, and a refusal by an upstream provider does not entitle you to a refund.

## 4. Enforcement

The operator may, after review:

- refuse or rate-limit requests;
- suspend a key or an account;
- freeze credit while a dispute or an abuse review is open;
- terminate the account for a serious or repeated breach.

Where practical the reason is recorded on a support request in your account, and
the request stays visible with its resolution note. A suspension for suspected
fraud, for a legal demand, or for an imminent risk of harm may happen before any
notice is given.

## 5. Reporting abuse

Report abuse or a security issue through the support queue in your account,
choosing the support or privacy kind. Include the model identifier, the
timestamps and what you observed. Do not include another person's credentials or
personal data.

For a vulnerability in this software that does not involve your account data,
open an issue at https://github.com/savant0x/savant-gateway/issues.
