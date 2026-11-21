/**
 * Deterministic natural-language → Constraints parser. Pure regex grammar, no model calls.
 * Every recognised phrase is recorded in `trace` (span → field). Clauses that match nothing are
 * returned in `unrecognised` so the UI can say exactly what was ignored. Out-of-bound values are
 * errors, never clamped. An LLM is never needed; if one is configured it may only explain.
 */
import { BOUNDS, ConstraintsSchema, DEFAULT_CONSTRAINTS, EQUITY_SYMBOLS, PRESETS, type Constraints, type EquitySymbol } from "./constraints";

export interface TraceItem { span: string; field: keyof Constraints | "preset"; value: string }
export interface ParseResult {
  ok: boolean;
  constraints: Constraints | null;
  trace: TraceItem[];
  unrecognised: string[];
  errors: string[];
  notes: string[];
  parser: "deterministic-grammar-v1";
}

const ALIASES: Record<string, EquitySymbol> = {
  aapl: "AAPLc", aaplc: "AAPLc", apple: "AAPLc",
  amzn: "AMZNc", amznc: "AMZNc", amazon: "AMZNc",
  googl: "GOOGLc", googlc: "GOOGLc", goog: "GOOGLc", google: "GOOGLc", alphabet: "GOOGLc",
  meta: "METAc", metac: "METAc", facebook: "METAc",
  msft: "MSFTc", msftc: "MSFTc", microsoft: "MSFTc",
  nvda: "NVDAc", nvdac: "NVDAc", nvidia: "NVDAc",
  tsla: "TSLAc", tslac: "TSLAc", tesla: "TSLAc",
  spcx: "SPCXc", spcxc: "SPCXc", spacex: "SPCXc",
};
const ALIAS_RE = Object.keys(ALIASES).sort((a, b) => b.length - a.length).join("|");

const num = (s: string) => {
  const t = s.replace(/[$,\s]/g, "").toLowerCase();
  const m = /^([0-9]*\.?[0-9]+)(k|m)?$/.exec(t);
  if (!m) return NaN;
  return Number(m[1]) * (m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : 1);
};

interface Rule { re: RegExp; apply: (m: RegExpExecArray, c: Constraints, r: ParseResult) => void }

const inBounds = (r: ParseResult, field: string, v: number, b: { min: number; max: number }) => {
  if (!Number.isFinite(v) || v < b.min || v > b.max) {
    r.errors.push(`${field} ${v} is outside the allowed range [${b.min}, ${b.max}].`);
    return false;
  }
  return true;
};

const RULES: Rule[] = [
  {
    re: /\b(?:preset[:\s]+)?(fortress|gap-proof|balanced|policy-floor)\b(?:\s+preset)?/g,
    apply: (m, c, r) => {
      Object.assign(c, PRESETS[m[1]!]!.constraints);
      r.trace.push({ span: m[0], field: "preset", value: m[1]! });
    },
  },
  {
    re: /\b(protect|de-?risk|deleverage|reduce (?:my )?risk|no new (?:debt|borrow(?:ing)?))\b/g,
    apply: (m, c, r) => {
      c.goal = "protect";
      r.trace.push({ span: m[0], field: "goal", value: "protect" });
    },
  },
  {
    re: /\bborrow\s+(?:as much as (?:possible|safe|allowed)|the max(?:imum)?|max(?:imum)?)\b(?:\s+(?:usdc|dollars?|usd))?/g,
    apply: (m, c, r) => {
      c.goal = "borrow";
      c.borrowAmountUsd = null;
      r.trace.push({ span: m[0], field: "borrowAmountUsd", value: "max allowed by constraints" });
    },
  },
  {
    re: new RegExp(String.raw`\b(?:against|using|with|backed by|collateral(?:ise|ize)?d? (?:by|with)?)\s+(?:my\s+)?((?:(?:${ALIAS_RE})(?:\s*(?:,|and|&|\+|/)\s*)?)+)`, "g"),
    apply: (m, c, r) => {
      const syms = [...m[1]!.matchAll(new RegExp(String.raw`\b(${ALIAS_RE})\b`, "g"))].map((x) => ALIASES[x[1]!]!);
      for (const s of syms) if (!c.collateral.includes(s)) c.collateral.push(s);
      r.trace.push({ span: m[0], field: "collateral", value: syms.join(", ") });
    },
  },
  {
    re: /\b(?:keep|stay|maintain|hold)?\s*(?:my\s+)?(?:hf|health(?:\s*factor)?)\s*(?:above|over|at least|>=|≥|>|of at least|no lower than|not below|min(?:imum)?(?: of)?)?\s*([0-9]+(?:\.[0-9]+)?)\b/g,
    apply: (m, c, r) => {
      const v = Number(m[1]);
      if (!inBounds(r, "minimum health factor", v, BOUNDS.minHealthFactor)) return;
      c.minHealthFactor = v;
      r.trace.push({ span: m[0].trim(), field: "minHealthFactor", value: String(v) });
    },
  },
  {
    re: /\b(?:monday|weekend|overnight|open(?:ing)?)\s+gap\s+(?:of\s+)?(?:-|−)?([0-9]+(?:\.[0-9]+)?)\s?%|\b(?:-|−)?([0-9]+(?:\.[0-9]+)?)\s?%\s+(?:monday|weekend|overnight)\s+gap\b/g,
    apply: (m, c, r) => {
      const v = Number(m[1] ?? m[2]);
      if (!inBounds(r, "gap %", v, BOUNDS.survivesDropPct)) return;
      c.gapPct = v;
      r.trace.push({ span: m[0], field: "gapPct", value: String(v) });
    },
  },
  {
    re: /\b(?:surviv\w*|withstand\w*|handle|tolerate|ride out)\s+(?:a\s+|an\s+)?(?:-|−)?([0-9]+(?:\.[0-9]+)?)\s?%\s*(?:drop|crash|fall|decline|drawdown|dip|sell-?off)?/g,
    apply: (m, c, r) => {
      const v = Number(m[1]);
      if (!inBounds(r, "survivable drop %", v, BOUNDS.survivesDropPct)) return;
      c.survivesDropPct = v;
      r.trace.push({ span: m[0].trim(), field: "survivesDropPct", value: String(v) });
    },
  },
  {
    re: /\b(?:apr|rate|interest(?: rate)?|borrow(?:ing)? cost)\s*(?:below|under|<=|≤|<|at most|max(?:imum)?|no more than|not above|capped at)\s*([0-9]+(?:\.[0-9]+)?)\s?%/g,
    apply: (m, c, r) => {
      const v = Number(m[1]);
      if (!inBounds(r, "max APR %", v, BOUNDS.maxAprPct)) return;
      c.maxAprPct = v;
      r.trace.push({ span: m[0], field: "maxAprPct", value: String(v) });
    },
  },
  {
    re: /\b(?:borrow|get|need|take out|draw)\s+(\$?\s?[0-9][0-9,]*(?:\.[0-9]+)?\s?[km]?)\s*(?:usdc|usd|dollars?|bucks)?\b/g,
    apply: (m, c, r) => {
      const v = num(m[1]!);
      if (!inBounds(r, "borrow amount (USD)", v, BOUNDS.borrowAmountUsd)) return;
      c.goal = "borrow";
      c.borrowAmountUsd = v;
      r.trace.push({ span: m[0], field: "borrowAmountUsd", value: String(v) });
    },
  },
  {
    re: /\b(?:for|over|within|horizon(?: of)?)\s+([0-9]+)\s*(days?|weeks?|months?)\b/g,
    apply: (m, c, r) => {
      const n = Number(m[1]);
      const days = m[2]!.startsWith("week") ? n * 7 : m[2]!.startsWith("month") ? n * 30 : n;
      if (!inBounds(r, "horizon (days)", days, BOUNDS.horizonDays)) return;
      c.horizonDays = days;
      r.trace.push({ span: m[0], field: "horizonDays", value: String(days) });
    },
  },
];

const FILLER = /^(?:i|i'd|i would|i want|want|to|please|like|and|then|but|also|my|me|the|a|an|of|it|in|on|while|so|that|usdc|loan|position|safely|safe|just|can|you|let's|lets)$/;

export function parseIntent(text: string, opts: { preset?: string } = {}): ParseResult {
  const r: ParseResult = { ok: false, constraints: null, trace: [], unrecognised: [], errors: [], notes: [], parser: "deterministic-grammar-v1" };
  const c: Constraints = { ...DEFAULT_CONSTRAINTS, collateral: [] };
  if (opts.preset) {
    const p = PRESETS[opts.preset];
    if (!p) r.errors.push(`unknown preset "${opts.preset}"`);
    else {
      Object.assign(c, p.constraints);
      r.trace.push({ span: `preset:${opts.preset}`, field: "preset", value: opts.preset });
    }
  }
  if (text.length > 500) r.errors.push("intent text is limited to 500 characters");
  let rest = ` ${text.toLowerCase().slice(0, 500)} `;
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    const matches = [...rest.matchAll(rule.re)];
    for (const m of matches) {
      rule.apply(m as RegExpExecArray, c, r);
      rest = rest.replace(m[0], " ".repeat(m[0].length));
    }
  }
  const leftovers = rest
    .split(/[,.;!?]|\band\b|\bthen\b|\bbut\b/)
    .map((s) => s.trim())
    .filter((s) => s && s.split(/\s+/).some((w) => !FILLER.test(w)));
  r.unrecognised = leftovers;
  if (c.minHealthFactor < BOUNDS.policyFloorHealthFactor) {
    r.notes.push(`Requested HF ${c.minHealthFactor} is below VEYDARA's policy floor; plans must still reach HF ≥ ${BOUNDS.policyFloorHealthFactor}.`);
  }
  if (r.trace.some((t) => t.field === "goal" && t.value === "protect") && r.trace.some((t) => t.field === "borrowAmountUsd")) {
    r.errors.push("Conflicting goals: 'protect / no new debt' and a borrow amount were both requested.");
  }
  void EQUITY_SYMBOLS;
  const parsed = ConstraintsSchema.safeParse(c);
  if (!parsed.success) r.errors.push(...parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  r.ok = r.errors.length === 0 && parsed.success;
  r.constraints = parsed.success ? parsed.data : null;
  return r;
}
