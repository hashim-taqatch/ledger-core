export type CurrencyCode = "AED" | "BHD";

// Decimal places per currency. Amounts are stored as integers in this minor
// unit (fils for AED, fils/1000 for BHD) so ledger math never touches
// binary floating point. See NUMBERS.md for why.
export const CURRENCY_PRECISION: Record<CurrencyCode, number> = {
  AED: 2,
  BHD: 3,
};

export function toMinor(amount: string, currency: CurrencyCode): number {
  const precision = CURRENCY_PRECISION[currency];
  const negative = amount.startsWith("-");
  const unsigned = negative ? amount.slice(1) : amount;
  const [wholePart, fractionPart = ""] = unsigned.split(".");
  if (fractionPart.length > precision) {
    throw new Error(
      `Amount ${amount} has more decimal places than ${currency}'s precision (${precision})`,
    );
  }
  const paddedFraction = fractionPart.padEnd(precision, "0");
  const digits = `${wholePart}${paddedFraction}`;
  const value = parseInt(digits, 10);
  return negative ? -value : value;
}

export function formatMinor(minor: number, currency: CurrencyCode): string {
  const precision = CURRENCY_PRECISION[currency];
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const scale = 10 ** precision;
  const whole = Math.floor(abs / scale);
  const frac = abs % scale;
  return `${sign}${whole}.${frac.toString().padStart(precision, "0")}`;
}

// Round-half-up. Only ever applied to already-tiny, already-integer-scaled
// intermediate values (basis-point interest, three-way instalment splits) —
// never to a value a customer directly typed in.
export function roundHalfUp(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

// Splits `totalMinor` into `count` parts that sum EXACTLY to totalMinor,
// as close to equal as integer minor units allow. Largest-remainder method:
// give everyone the floor share, then hand the leftover minor units out
// one at a time starting from the end of the list.
// This is why three "equal" instalments of something not divisible by 3
// can never all be identical — see AMBIGUITIES.md.
export function splitEvenly(totalMinor: number, count: number): number[] {
  const base = Math.floor(totalMinor / count);
  const remainder = totalMinor - base * count;
  const parts = new Array<number>(count).fill(base);
  for (let i = 0; i < remainder; i++) {
    parts[count - 1 - i] += 1;
  }
  return parts;
}
