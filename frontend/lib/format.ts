// Shared number/currency formatters.
// Negatives in parens (accountant convention), compact form for >€1M,
// one-decimal ratios, zero-decimal scores. Locale nl-NL so the
// thousands separator is "." and decimal is "," matching Dutch convention.

export function formatEur(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  const abs = new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(Math.abs(amount));
  return amount < 0 ? `(${abs})` : abs;
}

export function formatCompactEur(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}

export function formatPct(value: number, decimals = 0): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatDays(days: number): string {
  return `${days.toFixed(1)} days`;
}
