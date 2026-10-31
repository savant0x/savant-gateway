# Account email privacy amendment for review

Status: proposed text for a new immutable privacy version; not published.
The current public version remains v1.1. Keep account email disabled until this
recipient disclosure and the selected sender are approved.

Add to section 2 (What is stored):

- Verification and password-reset action records: token hashes, account email,
  purpose, creation and expiry times, consumption time and delivery state.
  Raw action tokens are not stored in the database.

Add to section 3 (Who receives it):

- **Resend**, when account email delivery is enabled, receives your email
  address and the verification or password-reset message, including its
  single-use link, so it can deliver that message. It does not receive your
  password, session cookie, API key or model request content. Provider
  acceptance does not guarantee inbox delivery.

Add to section 6 (Retention):

- Verification and password-reset action records are retained while your
  account exists and are removed when the account is deleted. Links expire
  independently of record retention: verification links after 24 hours and
  password-reset links after 30 minutes. Requesting a new link invalidates the
  earlier link for that purpose. Email delivery records held by Resend follow
  its own retention terms; the gateway does not claim to delete those records
  automatically.

Add to section 8 (Security):

Account links require an explicit confirmation POST and can be used once.
Resetting a password revokes all existing gateway sessions and API keys.
The account must sign in again and create a new key after a reset.
