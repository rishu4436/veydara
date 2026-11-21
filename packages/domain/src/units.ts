/**
 * Integer-safe token unit math. Token amounts are always bigint base units;
 * conversion to display strings never goes through JS floating point.
 */
export function parseUnitsSafe(value: string, decimals: number): bigint {
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error(`Invalid decimal amount: ${value}`);
  const [whole = "0", frac = ""] = value.split(".");
  if (frac.length > decimals) throw new Error(`Too many decimals (${frac.length} > ${decimals})`);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
}

export function formatUnitsSafe(amount: bigint, decimals: number, maxFraction = decimals): string {
  const neg = amount < 0n;
  const abs = neg ? -amount : amount;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  let frac = (abs % base).toString().padStart(decimals, "0");
  if (maxFraction < decimals) frac = frac.slice(0, maxFraction); // truncation = round toward zero (conservative for balances)
  frac = frac.replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole.toString()}${frac ? "." + frac : ""}`;
}

/**
 * Multiply a base-unit token amount by a decimal price string, returning a
 * fixed-point USD value with `outDecimals` precision, rounded DOWN (safe side
 * for collateral valuation).
 */
export function mulAmountByPrice(amount: bigint, tokenDecimals: number, price: string, outDecimals = 6): bigint {
  const [pw = "0", pf = ""] = normalizeDecimal(price).split(".");
  const priceScaled = BigInt(pw + pf); // price * 10^pf.length
  const num = amount * priceScaled * 10n ** BigInt(outDecimals);
  const den = 10n ** BigInt(tokenDecimals + pf.length);
  return num / den;
}

/** Convert a JS number/scientific string from an API into a plain decimal string. */
export function normalizeDecimal(input: string | number): string {
  const s = typeof input === "number" ? numberToPlainString(input) : input.trim();
  if (/^\d+(\.\d+)?$/.test(s)) return s;
  if (/^-?\d+(\.\d+)?e[+-]?\d+$/i.test(s)) return numberToPlainString(Number(s));
  throw new Error(`Not a non-negative decimal: ${input}`);
}

function numberToPlainString(n: number): string {
  if (!Number.isFinite(n) || n < 0) throw new Error(`Not a non-negative finite number: ${n}`);
  if (Math.abs(n) < 1e21 && !/e/i.test(String(n))) return String(n);
  return n.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 });
}
