const MAXU = (2n ** 256n - 1n).toString();
export function fmtHf(wad: string | null | undefined): string {
  if (!wad) return "—";
  if (wad === MAXU) return "∞ (no debt)";
  const n = Number(BigInt(wad) / 10n ** 14n) / 10_000;
  return n.toFixed(n < 10 ? 3 : 2);
}
export const hfNum = (wad: string) => (wad === MAXU ? Infinity : Number(BigInt(wad) / 10n ** 14n) / 10_000);
export const bpsPct = (bps: string | number | null | undefined, digits = 2) => (bps === null || bps === undefined ? "—" : `${(Number(bps) / 100).toFixed(digits)}%`);
export function fmtNum(s: string | number | null | undefined, max = 2, compact = false) {
  if (s === null || s === undefined) return "—";
  const n = Number(s);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: max, notation: compact ? "compact" : "standard" }).format(n);
}
/** Format base units with decimals for display only (never for math). */
export function units(raw: string, decimals: number, max = 2) {
  const b = BigInt(raw);
  const whole = b / 10n ** BigInt(decimals);
  const frac = Number(b % 10n ** BigInt(decimals)) / 10 ** decimals;
  return fmtNum(Number(whole) + frac, max);
}
export const rayPct = (ray: string) => `${(Number(BigInt(ray) / 10n ** 21n) / 10_000).toFixed(2)}%`;
export function hfTone(wad: string) {
  const h = hfNum(wad);
  return h === Infinity ? "text-muted" : h < 1 ? "text-danger" : h < 1.25 ? "text-amber" : h < 1.6 ? "text-ice" : "text-mint";
}
