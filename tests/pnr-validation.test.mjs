// V00 static contract tests only. The held-out V01 scan is executed exclusively by npm run validate:v01 after the lock commit.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { FIXED_DT } from "../lib/pnr-core.ts";
import {
  I02_STRATEGY_MATRIX,
} from "../lib/pnr-integration-audit.ts";
import { P03_POLICY_MATCHUPS } from "../lib/pnr-p03-policy-matrix.ts";
import {
  V00_ALLOWED_TERMINALS,
  V00_BEHAVIOR_COMMIT,
  V00_CONTRACT_VERSION,
  V00_EVIDENCE_CONTRACT,
  V00_EXECUTION_ORDER,
  V00_INPUT_COUNT,
  V00_INPUT_MANIFEST_VERSION,
  V00_MANIFEST_GENERATION,
  V00_MANIFEST_HASH,
  V00_MANIFEST_SEED,
  V00_OUT_OF_DOMAIN_POLICY,
  V00_PASS_THRESHOLDS,
  V00_REPOSITORY_GATES,
  V00_REPRESENTATIVE_REPLAY_RULE,
  V00_REQUIRED_GATES,
  V00_ROLLBACK_COMMIT,
  V00_RUNTIME_CONTRACT,
  V00_SIMULATION_SEED_BASE,
  V00_STRATEGY_MATCHUPS,
  V00_UPSTREAM_CONTRACT,
  V00_VALIDATION_INPUTS,
  canonicalV00ManifestJson,
  findV00ProhibitedInputFields,
} from "../lib/pnr-v00-validation-manifest.ts";
import { v00InputDomainFailures } from "../lib/pnr-v01-validation-audit.ts";

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

test("V00 locks an input-only integrated held-out contract before any V01 world runs", () => {
  assert.equal(V00_CONTRACT_VERSION, "locked-integrated-validation-contract@1");
  assert.equal(V00_INPUT_MANIFEST_VERSION, "locked-integrated-validation-inputs@1");
  assert.equal(V00_ROLLBACK_COMMIT, "28cf70e8c95710665f7ee2322a2dca8ff57e1951");
  assert.equal(V00_BEHAVIOR_COMMIT, "6f7af556823f372b012053b7eaa8ea194be7b5df");
  assert.equal(V00_MANIFEST_SEED, 20260811);
  assert.equal(V00_SIMULATION_SEED_BASE, 20261000);
  assert.equal(V00_INPUT_COUNT, 12);
  assert.equal(V00_VALIDATION_INPUTS.length, V00_INPUT_COUNT);
  assert.equal(new Set(V00_VALIDATION_INPUTS.map((input) => input.id)).size, V00_INPUT_COUNT);
  assert.equal(
    new Set(V00_VALIDATION_INPUTS.map((input) => JSON.stringify(input.initialPositions))).size,
    V00_INPUT_COUNT,
  );
  assert.deepEqual(findV00ProhibitedInputFields(V00_VALIDATION_INPUTS), []);
  assert.equal(Object.isFrozen(V00_VALIDATION_INPUTS), true);
  V00_VALIDATION_INPUTS.forEach((input, index) => {
    assert.equal(input.id, `V00-C${String(index + 1).padStart(2, "0")}`);
    assert.equal(input.seed, V00_SIMULATION_SEED_BASE + index + 1);
    assert.deepEqual(Object.keys(input).sort(), ["id", "initialPositions", "seed", "source"]);
    assert.deepEqual(Object.keys(input.source).sort(), [
      "candidateIndex",
      "domainVersion",
      "generator",
      "parameters",
      "seed",
      "tacticalFrame",
    ]);
    assert.equal(Object.isFrozen(input), true);
    assert.equal(Object.isFrozen(input.initialPositions), true);
    assert.equal(Object.isFrozen(input.source), true);
    assert.equal(Object.isFrozen(input.source.parameters), true);
    Object.values(input.initialPositions).forEach((point) => assert.equal(Object.isFrozen(point), true));
    assert.deepEqual(v00InputDomainFailures(input), []);
  });

  assert.equal(V00_MANIFEST_GENERATION.acceptedCount, V00_INPUT_COUNT);
  assert.ok(V00_MANIFEST_GENERATION.candidateCount >= V00_INPUT_COUNT);
  assert.equal(V00_MANIFEST_GENERATION.seed, V00_MANIFEST_SEED);
  assert.equal(sha256(canonicalV00ManifestJson()), V00_MANIFEST_HASH);

  const manifestSource = readFileSync(
    new URL("../lib/pnr-v00-validation-manifest.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    manifestSource,
    /new\s+PnrSimulation|planningLog|eventLog|world\.|scanV01|pnr-v01-validation-audit/,
  );
});

test("V00 binds the sealed 2x3 strategies, execution order, thresholds, OOD rule, and evidence schema", () => {
  assert.equal(V00_UPSTREAM_CONTRACT.integratedCheckpoint, V00_ROLLBACK_COMMIT);
  assert.equal(V00_UPSTREAM_CONTRACT.behaviorCheckpoint, V00_BEHAVIOR_COMMIT);
  assert.equal(V00_RUNTIME_CONTRACT.fixedDt, FIXED_DT);
  assert.deepEqual(
    V00_STRATEGY_MATCHUPS.map((matchup) => matchup.id),
    P03_POLICY_MATCHUPS.map((matchup) => matchup.id),
  );
  assert.deepEqual(
    V00_STRATEGY_MATCHUPS.map((matchup) => [matchup.offense, matchup.defense]),
    I02_STRATEGY_MATRIX.map((matchup) => [matchup.strategies.offense, matchup.strategies.defense]),
  );
  assert.deepEqual(V00_EXECUTION_ORDER.matchups, P03_POLICY_MATCHUPS.map((matchup) => matchup.id));
  assert.deepEqual(V00_EXECUTION_ORDER.worlds, ["right-canonical", "left-true-mirror"]);
  assert.deepEqual(V00_EXECUTION_ORDER.perWorld, ["primary", "duplicate", "defense-first"]);
  assert.deepEqual(V00_EXECUTION_ORDER.flattenedSimulations, [
    "right-primary",
    "right-duplicate",
    "right-defense-first",
    "left-primary",
    "left-duplicate",
    "left-defense-first",
  ]);
  assert.equal(V00_EXECUTION_ORDER.scheduler, "six-simulation-tick-lockstep");
  assert.equal(
    V00_INPUT_COUNT * V00_STRATEGY_MATCHUPS.length * V00_EXECUTION_ORDER.worlds.length *
      V00_EXECUTION_ORDER.perWorld.length,
    432,
  );
  assert.deepEqual(V00_ALLOWED_TERMINALS, [
    "formation_aborted",
    "formation_timeout",
    "tactical_drive_advantage",
    "tactical_pullup_window",
    "tactical_snake_advantage",
    "tactical_pocket_caught",
    "tactical_contained",
    "pass_denied",
  ]);
  assert.equal(V00_PASS_THRESHOLDS.mirrorMaximumError, 1e-9);
  assert.equal(V00_PASS_THRESHOLDS.minimumTeammateBodyGap, 0.06 - 1e-6);
  assert.ok(V00_REQUIRED_GATES.includes("no_remote_screen"));
  assert.ok(V00_REQUIRED_GATES.includes("role_ownership"));
  assert.ok(V00_REQUIRED_GATES.includes("route_and_ball_ownership"));
  assert.match(V00_OUT_OF_DOMAIN_POLICY.lockedInputRule, /fails V01.*never excluded/i);
  assert.match(V00_OUT_OF_DOMAIN_POLICY.safeExitRule, /never out-of-domain/i);
  assert.equal(V00_REPRESENTATIVE_REPLAY_RULE.tieBreak, "manifest-order, then locked matchup-order");
  assert.match(V00_REPRESENTATIVE_REPLAY_RULE.nonRunnableFailureFallback, /first failed.*unresolved/i);
  assert.equal(V00_EVIDENCE_CONTRACT.path, "outputs/v01-integrated-validation.json");
  assert.deepEqual(V00_REPOSITORY_GATES, [
    "context_check",
    "test",
    "lint",
    "build",
    "diff_check",
  ]);
});

test("V00 locks the V01 harness without executing it at module import", () => {
  const auditSource = readFileSync(
    new URL("../lib/pnr-v01-validation-audit.ts", import.meta.url),
    "utf8",
  );
  assert.match(auditSource, /auditIntegratedInput/);
  assert.match(auditSource, /export function scanV01IntegratedValidation/);
  assert.doesNotMatch(auditSource, /const\s+\w+\s*=\s*scanV01IntegratedValidation\s*\(/);
  const testSource = readFileSync(new URL(import.meta.url), "utf8");
  assert.doesNotMatch(testSource, /import\s*\{[^}]*scanV01IntegratedValidation/s);
  const runnerSource = readFileSync(
    new URL("../scripts/run-v01-validation.mjs", import.meta.url),
    "utf8",
  );
  assert.match(runnerSource, /lockParent\s*!==\s*V00_ROLLBACK_COMMIT/);
  assert.match(runnerSource, /--untracked-files=no/);
  assert.match(runnerSource, /existsSync\(evidencePath\)/);
  assert.match(runnerSource, /flag:\s*"wx"/);
});
