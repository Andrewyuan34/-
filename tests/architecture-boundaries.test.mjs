import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  analyzeArchitecture,
  renderCodeMap,
  renderSymbolIndex,
} from "../scripts/repository-architecture.mjs";
import { checkCodeMap, writeCodeMap } from "../scripts/generate-code-map.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("repository keeps the executable architecture boundaries", () => {
  const result = analyzeArchitecture(REPO_ROOT);
  assert.deepEqual(
    result.violations,
    [],
    result.violations
      .map((violation) => `${violation.file}:${violation.line} ${violation.code}`)
      .join("\n"),
  );
});

test("generated maps are deterministic and expose narrow lookup anchors", () => {
  const firstMap = renderCodeMap(REPO_ROOT);
  const secondMap = renderCodeMap(REPO_ROOT);
  const symbols = renderSymbolIndex(REPO_ROOT);

  assert.equal(firstMap, secondMap);
  assert.match(firstMap, /`lib\/pnr-core\.ts` \| simulation-kernel/);
  assert.match(firstMap, /`lib\/pnr-strategy\.ts`/);
  assert.match(firstMap, /docs\/generated\/SYMBOLS\.md/);
  assert.match(symbols, /`PnrSimulation` \| class/);
  assert.match(symbols, /`createPlannerObservation` \| function/);
});

test("generated map check detects a stale source index", () => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "pnr-code-map-check-"));
  try {
    mkdirSync(path.join(fixtureRoot, "lib"), { recursive: true });
    const source = path.join(fixtureRoot, "lib", "sample.ts");
    writeFileSync(source, "export const first = 1;\n", "utf8");
    writeCodeMap(fixtureRoot);
    assert.equal(checkCodeMap(fixtureRoot).current, true);

    writeFileSync(source, "export const first = 1;\nexport const second = 2;\n", "utf8");
    const stale = checkCodeMap(fixtureRoot);
    assert.equal(stale.current, false);
    assert.equal(stale.reason, "stale");
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("architecture checker reports actionable violations instead of silently drifting", () => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "pnr-architecture-check-"));
  try {
    mkdirSync(path.join(fixtureRoot, "lib"), { recursive: true });
    writeFileSync(
      path.join(fixtureRoot, "lib", "pnr-core.ts"),
      `import { auditValue } from "./pnr-audit.ts";

export const FIXED_DT = 1 / 30;
interface TeamPlan { id: string }
interface TeamStrategyProfile { id: string }
export interface PublicObservation {
  defensePlan: TeamPlan;
}
export interface WorldState {
  hidden: TeamPlan;
}
export interface SimulationConfig {
  scenarioId?: string;
}
export function createPlannerObservation(plan: TeamPlan): WorldState {
  return { hidden: plan };
}
function evaluateOffenseCandidates(world: WorldState) { return [world]; }
function evaluateDefenseCandidates(world: WorldState) { return [world]; }
function chooseCandidate(values: unknown[]) { return values[0]; }
class PnrSimulation {
  offensePlan = { id: "offense" };
  defensePlan = { id: "defense" };
  offenseStrategyProfile: TeamStrategyProfile = { id: "offense" };
  defenseStrategyProfile: TeamStrategyProfile = { id: "defense" };
  replanOffense() { return this.defensePlan; }
  replanDefense() { return this.offensePlan; }
  resolveFacts() { return chooseCandidate([]); }
}
export const nondeterministic = Math.random() + auditValue;
`,
      "utf8",
    );
    writeFileSync(
      path.join(fixtureRoot, "lib", "pnr-audit.ts"),
      `import { FIXED_DT } from "./pnr-core.ts";
export const auditValue = FIXED_DT;
`,
      "utf8",
    );

    const codes = new Set(
      analyzeArchitecture(fixtureRoot).violations.map((violation) => violation.code),
    );
    for (const expected of [
      "FIXED_DT_CHANGED",
      "KERNEL_DEPENDENCY_OUTSIDE_ALLOWLIST",
      "NEUTRAL_RESOLVER_SELECTS_PLAN",
      "NONDETERMINISTIC_KERNEL_API",
      "OBSERVATION_FACTORY_RETURN_TYPE",
      "OUTCOME_SHORTCUT_IN_CONFIG",
      "PLANNER_BYPASSES_PUBLIC_OBSERVATION",
      "PRIVATE_FIELD_IN_PLANNER_OBSERVATION",
      "PRIVATE_INPUT_TO_OBSERVATION_FACTORY",
      "PRIVATE_TYPE_IN_PUBLIC_WORLD",
      "RUNTIME_DEPENDENCY_CYCLE",
      "TEAM_READS_OPPONENT_PRIVATE_STATE",
    ]) {
      assert.ok(codes.has(expected), `missing expected violation ${expected}`);
    }
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
