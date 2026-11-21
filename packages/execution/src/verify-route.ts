/**
 * Stage 4 — independent route verifier. Like packages/protocols/src/verifier.ts it
 * deliberately does NOT import aave-v4-math: it replays every action over the raw
 * fresh-state fields with exact rationals and checks protocol rules (reserve flags,
 * balances, caps, liquidity, health ≥ 1) and VEYDARA policy (health ≥ floor).
 * Interest accrued between the state read and inclusion is ignored here and
 * bounded later in reconciliation.
 */
import type { FreshState } from "./state";
import type { Intent } from "./intent";

interface Q { n: bigint; d: bigint }
const q = (n: bigint, d = 1n): Q => ({ n, d });
const add = (a: Q, b: Q): Q => ({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });
const RAY = 10n ** 27n;
const WAD = 10n ** 18n;

export interface RouteCheck { actionIndex: number; name: string; pass: boolean; detail: string }
export interface PredictedReserve { reserveId: number; supplied: string; debtRay: string; wallet: string; collateralEnabled: boolean }
export interface RouteVerdict {
  accepted: boolean;
  checks: RouteCheck[];
  /** HF after each action (WAD string; null = no debt). */
  hfAfter: (string | null)[];
  predicted: { healthFactorWad: string | null; reserves: PredictedReserve[] };
  policyMinHfWad: string;
}

export function verifyRoute(intent: Intent, s: FreshState, policyMinHfWad: bigint): RouteVerdict {
  const m = s.market;
  const checks: RouteCheck[] = [];
  const st = m.reserves.map((r) => {
    const p = s.position.reserves[r.reserveId]!;
    return {
      supplied: BigInt(p.supplied),
      debtRay: BigInt(p.debtRay),
      wallet: BigInt(s.wallet[r.reserveId] ?? "0"),
      enabled: p.collateralEnabled,
      resSupplied: BigInt(r.suppliedAssets),
      resDebt: BigInt(r.totalDebt),
      liquidity: BigInt(r.hubLiquidity),
    };
  });
  const scale = (i: number) => 10n ** BigInt(m.reserves[i]!.decimals + m.oracleDecimals);
  const hf = (): Q | null => {
    let coll = q(0n);
    let debt = q(0n);
    st.forEach((x, i) => {
      const r = m.reserves[i]!;
      const px = BigInt(r.price);
      if (x.enabled && x.supplied > 0n) coll = add(coll, q(x.supplied * px * BigInt(r.collateralFactorBps), scale(i) * 10_000n));
      if (x.debtRay > 0n) debt = add(debt, q(x.debtRay * px, scale(i) * RAY));
    });
    if (debt.n === 0n) return null;
    return { n: coll.n * debt.d, d: coll.d * debt.n };
  };
  const wad = (h: Q | null) => (h ? ((h.n * WAD) / h.d).toString() : null);
  const fmt = (h: Q | null) => (h ? (Number((h.n * 10_000n) / h.d) / 10_000).toFixed(4) : "∞ (no debt)");
  const hfAfter: (string | null)[] = [];

  intent.actions.forEach((a, ai) => {
    const r = m.reserves[a.reserveId]!;
    const x = st[a.reserveId]!;
    const sym = r.symbol ?? `#${r.reserveId}`;
    const c = (name: string, pass: boolean, detail: string) => checks.push({ actionIndex: ai, name: `${a.kind} ${sym}: ${name}`, pass, detail });
    const open = r.spokeActive && !r.spokeHalted;
    if (a.kind === "enableCollateral") {
      c("reserve not paused/frozen", !r.paused && !r.frozen && open, `paused=${r.paused} frozen=${r.frozen} active=${r.spokeActive} halted=${r.spokeHalted}`);
      c("collateral factor > 0", r.collateralFactorBps > 0, `CF=${r.collateralFactorBps} bps`);
      c("has a supplied balance", x.supplied > 0n, `supplied=${x.supplied}`);
      x.enabled = true;
    } else {
      const amt = BigInt(a.amount);
      if (a.kind === "supply") {
        c("reserve open for supply", !r.paused && !r.frozen && open, `paused=${r.paused} frozen=${r.frozen} active=${r.spokeActive} halted=${r.spokeHalted}`);
        c("within wallet balance", amt <= x.wallet, `amount=${amt} wallet=${x.wallet}`);
        if (r.addCapTokens !== null) {
          const room = BigInt(r.addCapTokens) * 10n ** BigInt(r.decimals) - x.resSupplied;
          c("within spoke add cap", amt <= room, `room=${room}`);
        }
        x.wallet -= amt; x.supplied += amt; x.resSupplied += amt; x.liquidity += amt;
      } else if (a.kind === "borrow") {
        c("reserve borrowable and open", r.borrowable && !r.paused && !r.frozen && open, `borrowable=${r.borrowable} paused=${r.paused} frozen=${r.frozen}`);
        c("within hub liquidity", amt <= x.liquidity, `liquidity=${x.liquidity}`);
        if (r.drawCapTokens !== null) c("within spoke draw cap", x.resDebt + amt <= BigInt(r.drawCapTokens) * 10n ** BigInt(r.decimals), `drawCap=${r.drawCapTokens} tokens, debt=${x.resDebt}`);
        x.debtRay += amt * RAY; x.wallet += amt; x.liquidity -= amt; x.resDebt += amt;
        const h = hf();
        c("health factor ≥ 1.00 after borrow (protocol)", h !== null && h.n * 1n >= h.d, `HF=${fmt(h)}`);
        c("health factor ≥ VEYDARA policy floor", h !== null && h.n * WAD >= h.d * policyMinHfWad, `HF=${fmt(h)} floor=${Number(policyMinHfWad / 10n ** 14n) / 10_000}`);
      } else if (a.kind === "repay") {
        c("reserve not paused", !r.paused, `paused=${r.paused}`);
        c("account has debt in this reserve", x.debtRay > 0n, `debtRay=${x.debtRay}`);
        const debtUnits = (x.debtRay + RAY - 1n) / RAY;
        const pull = amt < debtUnits ? amt : debtUnits;
        c("within wallet balance", pull <= x.wallet, `pull=${pull} wallet=${x.wallet}`);
        const cut = amt * RAY >= x.debtRay ? x.debtRay : amt * RAY;
        x.debtRay -= cut; x.wallet -= pull; x.liquidity += pull; x.resDebt -= pull > x.resDebt ? x.resDebt : pull;
      } else {
        c("reserve not paused", !r.paused, `paused=${r.paused}`);
        c("has a supplied balance", x.supplied > 0n, `supplied=${x.supplied}`);
        const out = amt > x.supplied ? x.supplied : amt;
        c("within hub liquidity", out <= x.liquidity, `liquidity=${x.liquidity}`);
        x.supplied -= out; x.wallet += out; x.resSupplied -= out; x.liquidity -= out;
        const h = hf();
        if (h !== null) {
          c("health factor ≥ 1.00 after withdraw (protocol)", h.n >= h.d, `HF=${fmt(h)}`);
          c("health factor ≥ VEYDARA policy floor", h.n * WAD >= h.d * policyMinHfWad, `HF=${fmt(h)}`);
        }
      }
    }
    hfAfter.push(wad(hf()));
  });
  return {
    accepted: checks.every((c) => c.pass),
    checks,
    hfAfter,
    predicted: {
      healthFactorWad: wad(hf()),
      reserves: st.map((x, i) => ({ reserveId: i, supplied: x.supplied.toString(), debtRay: x.debtRay.toString(), wallet: x.wallet.toString(), collateralEnabled: x.enabled })),
    },
    policyMinHfWad: policyMinHfWad.toString(),
  };
}
