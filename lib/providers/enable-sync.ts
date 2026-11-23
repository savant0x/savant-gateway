/**
 * Whether a saved provider should read its catalog immediately.
 *
 * The operator's model of the page is "I set the key, so it should work now",
 * and the catalog is how the page shows that it does. So a save that makes a
 * provider able to serve — it is enabled and this runtime sees its key — reads
 * the catalog once, in the same request, when the save is what changed that
 * ability or moved the provider's address.
 *
 * A save that only renames a label, or edits a provider this runtime still has
 * no key for, touches no upstream. Re-reading every save would spend a vendor
 * round trip on an edit that cannot have changed the answer.
 */
export type ProviderConnection = {
  enabled: boolean;
  keyEnvVar: string;
  baseUrl: string;
  catalogUrl: string | null;
  balanceUrl: string | null;
  defaultHeaders: Record<string, string>;
};

function headersKey(headers: Record<string, string>) {
  return JSON.stringify(
    Object.entries(headers).sort(([a], [b]) => (a < b ? -1 : 1)),
  );
}

function moved(before: ProviderConnection, after: ProviderConnection) {
  return (
    before.keyEnvVar !== after.keyEnvVar ||
    before.baseUrl !== after.baseUrl ||
    before.catalogUrl !== after.catalogUrl ||
    before.balanceUrl !== after.balanceUrl ||
    headersKey(before.defaultHeaders) !== headersKey(after.defaultHeaders)
  );
}

export function syncAfterSave(input: {
  /** Null when the provider was just created. */
  before: ProviderConnection | null;
  after: ProviderConnection;
  /** Whether this runtime sees the key the record names. */
  configured: boolean;
}) {
  if (!input.after.enabled || !input.configured) return false;
  if (!input.before) return true;

  return !input.before.enabled || moved(input.before, input.after);
}
