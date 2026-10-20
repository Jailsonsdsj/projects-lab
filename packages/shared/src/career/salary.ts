// Salary ranges (docs/prd/22-career-documents.md, K-16): integers in whole
// currency units, never cents or floats, with a currency and a period.

/** CA-00 may extend it; the K-16 trigger checks the same list. */
export const CURRENCIES = [
  "BRL",
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "CHF",
] as const;
export type Currency = (typeof CURRENCIES)[number];

export const PAY_PERIODS = ["hour", "month", "year"] as const;
export type PayPeriod = (typeof PAY_PERIODS)[number];

export interface SalaryRange {
  min: number;
  max: number;
  currency: string;
  period: string;
}

export function isSalaryRange(range: SalaryRange): boolean {
  return (
    Number.isSafeInteger(range.min) &&
    Number.isSafeInteger(range.max) &&
    range.min >= 0 &&
    range.min <= range.max &&
    (CURRENCIES as readonly string[]).includes(range.currency) &&
    (PAY_PERIODS as readonly string[]).includes(range.period)
  );
}

/** "USD 40–60 / hour"; one figure when min = max. */
export function formatSalaryRange(range: SalaryRange): string {
  if (!isSalaryRange(range))
    throw new RangeError(`Not a salary range: ${JSON.stringify(range)}`);
  const figures =
    range.min === range.max ? `${range.min}` : `${range.min}–${range.max}`;
  return `${range.currency} ${figures} / ${range.period}`;
}
