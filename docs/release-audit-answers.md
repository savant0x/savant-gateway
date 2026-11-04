# Release audit — plain-English questions and answers

Date: 2026-11-04. Fill in the **Your answer** lines. Short answers are enough.
You can write **unsure — explain this first** anywhere. Answer questions 1–4
first if you want to keep this short.

Do not put passwords, API keys, database connection strings or wallet recovery
information in this file. “Configured” or “not configured” is enough.

## What the report actually means

The application passes its normal automated checks, and the money records
balanced during the tests. That is useful evidence that much of it works.

Three things still need attention before inviting paying customers:

1. **The traffic counter needs to work across the whole website.** Imagine two
   checkout lanes, each believing it can use the last available upstream slot.
   The current counter lives inside each running copy of the application. We
   need to make those copies agree. This does not mean money was lost.
2. **The stress test found slow responses and some refused requests.** With a
   fake model answering locally and a real remote database, the gateway handled
   about 4.5 requests per second; the test asks for 20. Some free requests were
   also refused unexpectedly. I need to investigate the causes. This does not
   measure how fast the real AI model writes an answer, and it does not mean
   you need 20 requests per second to serve your first few users.
3. **We have not proved the complete real customer journey.** A simulated
   payment working is different from an actual payment arriving, credit being
   added once, and a real paid model call being billed correctly. We also need
   to prove that backups can be restored and urgent alerts reach you.

“No-go” meant **the evidence does not yet justify public paid launch**. It did
not mean development should stop or that the whole application is broken.
The report also mixed necessary fixes with optional growth ideas; those should
be considered separately.

## Decisions already on record

The earlier decision form selected NOWPayments crypto invoices, kept card
top-ups and subscription sales off, and kept the one-time trial disabled.
It also recorded a 25-customer initial cohort, a $25/day upstream-spend cap,
and planned funding. These are historical decisions, not proof that the current
accounts, balances or configuration are ready.

I will preserve those choices unless you explicitly change them. You do not
need to answer that whole form again. Your answers here guide the next work;
they do not themselves authorize public launch, purchases or publication.

## 1. What should we accomplish next?

**Why this matters:** preparing the application for your own testing is a
different milestone from opening it to paying customers.

- A — Finish the engineering fixes and make it reliable for my own testing.
  **Recommended next step.**
- B — Prepare a small, invitation-only group of testers after the fixes.
- C — Work toward public paid launch, with real acceptance checks first.

**Your answer:** A/C, we're not opening the door anytime soon but we need to ensure we find anything that does not work in production. Hence we have sandbox payments. We can test the full flow without loading real money via the sandbox w/ nowpayments.

If you have a target date, write it here. “No deadline” is fine:

**Target date:** no deadline

## 2. Should we keep the hosting and database we already have?

The repository records Vercel for the website and Supabase for the database.
I have not checked the live accounts again in this questionnaire step.

**My recommendation:** keep that setup for now and design the fixes around it.
I will choose and explain the technical implementation. You do not need to
choose a database locking strategy or a rate-limiting library.

- A — Keep Vercel and Supabase; fix the application for that setup.
- B — You may compare alternatives, but present the costs and migration impact
  before changing hosting.
- C — Unsure; explain the practical tradeoffs first.

**Your answer:** We're deploying to vercel and keeping the DB. The only reason we had 2 systems is because the first was local-only. Production will use vercel. Also the production DB is through vercel, it runs neon as a db.

If the actual setup has changed, describe the change without credentials:

**Hosting/database correction, if any:** vercel is for production. When i first started the project i believe we used a different system for local persistance, look deeper into this

## 3. What extra spending, if any, is acceptable?

**Why this matters:** I can start with code fixes and measurements. A new paid
service or a real payment test is a separate expense.

**My recommendation:** use existing services first and ask before any new paid
service or purchase. An earlier funding plan is not proof that money is available.

**Extra monthly infrastructure budget:** $_____ / no extra budget / unsure

**Budget available for real acceptance testing:** $_____ / not yet / unsure

**Ask before any new purchase?** Yes / other instruction:

Answer, i have funds but i prefer to build rather than pay. I'll fund both upstream providers, the vercel hosting and the nowpayments fees. All operational costs. We're not going to start spending money unless we need to.
Amounts here are planning limits, not instructions to charge or fund anything.

## 4. Which real services are ready today?

**Why this matters:** this tells me which checks can run now and which need an
account or configuration step. “Unsure” is a useful answer; I can inspect
available configuration without displaying its values.

Put **ready**, **not yet**, or **unsure** in each answer cell.

| Item | What “ready” means | Your answer |
| --- | --- | --- |
| Paid model provider | The upstream account has spendable paid credit | |
| NOWPayments | The account is usable and its API/IPN credentials are configured | |
| Test customer | You have an account you control for checking the purchase journey | |
| Account email | A sending service/address is set up for verification and password reset | |
| Urgent alerts | You have a destination for the operator alerts selected previously | |
| Database backups | You know whether Supabase backups are enabled and what period they cover | |

all of this should be working, we've been testing this since day one. You have my api keys in .env.local already.
**Anything you already tested successfully:**

No real payment or outbound message will be inferred from a “ready” answer.
The exact action, destination and spending authority still need to be clear.

## 5. Does the earlier small-launch plan still fit?

The recorded starting plan was 25 invited customers, at most eight customers
using it simultaneously, and a $25/day upstream-spend cap.

**My recommendation:** retain those as planning limits while measuring what
the actual provider and website can safely support. Do not promise the stress
test's 20 requests/second to customers.

- A — Keep those planning limits; prove the system can support them.
- B — Start smaller: _____ invited customers; _____ simultaneous users.
- C — I have a different target; describe it below.

**Your answer:** we'll do a small test group

**What you expect people to do:** occasional chat / coding tools / automated
agents / other: coding tools/agents

## 6. What should we improve first after reliability?

Pick up to two. These are optional product improvements, not requirements to
repair the accounting or traffic-control problems.

- A — **Get started faster:** guide a new user from signup to a successful
  first request. **Recommended first.**
- B — **Make Signal useful to returning visitors:** show new coverage for
  followed models and make saved pieces easier to revisit.
- C — **Connect reading to trying:** add a clear model-specific workflow or
  example beside an article.
- D — **Make costs understandable:** explain each charge and estimate the
  cost of a workload before running it.
- E — **Make operating easier:** one place showing problems, affected services
  and the next useful action.

**Your first choice:** i want to add more content

**Your second choice:**

**The most frustrating thing in the current site:**

## 7. Is anything in the report based on an outdated assumption?

Examples: you already funded the provider, configured payments, changed the
hosting, tested a real purchase, or decided that the site is only for private
use right now. Tell me what happened; I will verify the applicable evidence
and update the records.

**Your corrections:** your assumptions instead of actually reading

## Optional: one engineering-rule clarification

One ECHO rule literally forbids TypeScript's `unknown` type. That type is
normally useful for saying “this came from outside; check it before trusting
it.” The code already uses it in many input checks. This is a wording conflict,
not evidence that those input checks are unsafe.

**Recommended narrow clarification:** allow `unknown` for genuinely unvalidated
external data, require validation before using it, and require concrete domain
types inside the application. Keep `any`, ignored type errors and unchecked
casts as shortcuts forbidden. Any rule change must be recorded explicitly.

- A — Approve that exact narrow clarification to the repository's TypeScript rule.
- B — Explain this further before changing the rule.
- C — Leave the rule unchanged; present a compliant remediation plan.

**Your answer:** No, single agent echo is the rule set. Unknown is not acceptable, we use proper classes, not short cuts.

## Work I can handle without making you answer technical questions

Within the approved development scope, I can investigate and present the
implementation plans for:

- Making all running copies of the website share the traffic limits.
- Explaining the slow requests and the unexpected free-request refusals.
- Making database failures time out and recover predictably.
- Bounding feed downloads and making scheduled content work finish reliably.
- Aligning runtime versions, checks, documentation and browser verification.
- Drafting policy updates for review, using the actual services and stored data.

Those tasks still follow the FID and verification workflow. I will bring you
concrete choices when they affect money, hosting, public policies, recipients
or launch, rather than asking you to solve the underlying engineering problem.

Once you finish, tell me **“I answered docs/release-audit-answers.md.”** I will
read your answers, preserve the earlier decisions that still apply, and turn
them into a short ordered plan with the next concrete work identified.

A: all you're doing is the audit, a worker agent will do the coding.