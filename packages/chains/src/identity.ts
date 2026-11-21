/**
 * Token identity + spam quarantine (spec §1.1.1, §1.1.8, threat model:
 * token impersonation, ticker collision, malicious token metadata).
 */
import type { TokenRepresentation, VerificationStatus } from "@veydara/domain";
import { ALL_VERIFIED, findVerified } from "./registry";

export interface RawTokenMeta {
  chain: "base" | "solana";
  address: string;
  symbol: string | null;
  name: string | null;
  decimals: number | null;
}

export interface IdentityVerdict {
  status: VerificationStatus;
  reasons: string[];
  verified?: TokenRepresentation;
  /** Sanitized display metadata (never raw token strings). */
  display: { symbol: string; name: string };
}

const SPAM_PATTERNS: [RegExp, string][] = [
  [/https?:\/\/|www\.|\.(com|io|xyz|net|org|app|site|top|vip|claim)\b/i, "metadata contains a URL/domain (common airdrop-phishing lure)"],
  [/\b(claim|reward|airdrop|visit|bonus|free|gift|voucher|redeem)\b/i, "metadata contains a claim/reward lure"],
  [/[$€£]\s?\d/, "metadata advertises a monetary amount"],
];

/** Map common confusables to ASCII so "USDС" (Cyrillic С) collides with "USDC". */
export function foldConfusables(s: string): string {
  const map: Record<string, string> = { "А": "A", "В": "B", "С": "C", "Е": "E", "Н": "H", "К": "K", "М": "M", "О": "O", "Р": "P", "Т": "T", "Х": "X", "а": "a", "с": "c", "е": "e", "о": "o", "р": "p", "х": "x", "Ѕ": "S", "І": "I", "Ј": "J", "ο": "o", "Ο": "O", "Α": "A", "Β": "B", "Ε": "E", "Ζ": "Z", "Η": "H", "Ι": "I", "Κ": "K", "Μ": "M", "Ν": "N", "Ρ": "P", "Τ": "T", "Υ": "Y", "Χ": "X" };
  return s.normalize("NFKC").replace(/[\s\u200B-\u200F\u2060\uFEFF]/g, "").split("").map((c) => map[c] ?? c).join("");
}

export function sanitizeMeta(s: string | null, max = 32): string {
  if (!s) return "";
  // strip control/bidi chars, collapse whitespace, cap length
  // eslint-disable-next-line no-control-regex -- intentionally matching control characters to strip them
  const cleaned = s.replace(/[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim();
  return cleaned.length > max ? cleaned.slice(0, max - 1) + "…" : cleaned;
}

export function classifyToken(meta: RawTokenMeta): IdentityVerdict {
  const display = { symbol: sanitizeMeta(meta.symbol, 16) || "?", name: sanitizeMeta(meta.name, 48) || "Unknown token" };
  const verified = findVerified(meta.chain, meta.address);
  if (verified) {
    return { status: "verified", reasons: [`Exact ${meta.chain} contract matches the verified registry (${verified.sources[0]?.label ?? "official source"}).`], verified, display: { symbol: verified.symbol, name: verified.name } };
  }
  const reasons: string[] = [];
  const raw = `${meta.symbol ?? ""} ${meta.name ?? ""}`;
  for (const [re, why] of SPAM_PATTERNS) if (re.test(raw)) reasons.push(why);
  if (meta.decimals === null || meta.decimals < 0 || meta.decimals > 36) reasons.push("decimals() missing or out of range");
  if (/[^\x20-\x7E]/.test(raw)) reasons.push("metadata contains non-ASCII characters (possible homoglyph spoof)");

  const folded = foldConfusables(meta.symbol ?? "").toUpperCase();
  const collision = ALL_VERIFIED.find((t) => t.symbol.toUpperCase() === folded);
  if (collision) {
    return {
      status: "impersonation",
      reasons: [`Ticker "${display.symbol}" collides with verified ${collision.symbol} (${collision.chain}:${collision.address}) but the contract differs.`, ...reasons],
      display,
    };
  }
  if (reasons.length) return { status: "suspected-spam", reasons, display };
  return { status: "unverified", reasons: ["Contract is not in VEYDARA's verified registry; no price, eligibility or analysis is assumed."], display };
}
