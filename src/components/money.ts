// nexos sells credits at a published rate of 1 credit = €1, so the
// provider-reported `nexos_credits_cost` is shown directly as euros.
const CENTS = new Intl.NumberFormat("lt-LT", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const SMALL = new Intl.NumberFormat("lt-LT", {
  style: "currency",
  currency: "EUR",
  maximumSignificantDigits: 3,
});

/** Euro amount from nexos credits; sub-cent amounts keep 3 significant digits. */
export function formatEuro(credits: number): string {
  if (!Number.isFinite(credits)) return "–";
  if (credits === 0) return CENTS.format(0);
  return Math.abs(credits) >= 0.01
    ? CENTS.format(credits)
    : SMALL.format(credits);
}
