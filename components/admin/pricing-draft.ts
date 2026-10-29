export type PriceDraft = { input: string; output: string };

export function initialPrice(value: number) {
  return String(Number(value.toFixed(6)));
}

export function parseDraftPrice(value: string) {
  if (!value.trim()) return null;

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
