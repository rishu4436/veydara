/**
 * Controlled dataset mode (VEYDARA_DATASET=fixture): serves the committed, labelled
 * live recordings in /fixtures instead of reading Base. Used by the Playwright e2e and
 * for offline demos; every response carries provenance source "fixture" and the UI
 * shows a FIXTURE DATASET banner.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAddress } from "viem";
import type { AaveMarket, AaveUserPosition } from "@veydara/protocols";
import { serverEnv } from "./env";

export function repoRoot(): string {
  let d = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(d, "pnpm-workspace.yaml"))) return d;
    d = dirname(d);
  }
  return process.cwd();
}

export const isFixtureMode = () => serverEnv().VEYDARA_DATASET === "fixture";

interface MarketFixture extends AaveMarket { _fixture: { recordedAt: string; note: string } }
interface PositionsFixture { _fixture: { recordedAt: string }; positions: AaveUserPosition[] }

let market: AaveMarket | null = null;
let positions: AaveUserPosition[] | null = null;

export function fixtureMarket(): AaveMarket {
  if (market) return market;
  const raw = JSON.parse(readFileSync(join(repoRoot(), "fixtures/chain/aave-v4-market.live.json"), "utf8")) as MarketFixture;
  const { _fixture, ...m } = raw;
  market = { ...m, provenance: { ...m.provenance, source: "fixture", freshness: "cached", observedAt: _fixture.recordedAt } };
  return market;
}

function loadPositions(): AaveUserPosition[] {
  if (!positions) positions = (JSON.parse(readFileSync(join(repoRoot(), "fixtures/chain/aave-v4-positions.live.json"), "utf8")) as PositionsFixture).positions;
  return positions;
}

export function fixturePosition(user: string): AaveUserPosition {
  const all = loadPositions();
  const p = all.find((x) => getAddress(x.user) === getAddress(user));
  if (!p) throw new Error(`FIXTURE DATASET: ${getAddress(user)} is not in fixtures/chain/aave-v4-positions.live.json (${all.length} recorded borrowers).`);
  return { ...p, provenance: { ...p.provenance, source: "fixture", freshness: "cached" } };
}

export const fixtureBorrowers = (): string[] => loadPositions().map((p) => getAddress(p.user));
