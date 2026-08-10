// I00-I03 Autonomous Formation -> minimum tactical vocabulary integration tests.

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  AUTONOMOUS_FORMATION_DOMAIN_VERSION,
  FIXED_DT,
  FORMATION_TACTICAL_INTEGRATION_VERSION,
  MINIMUM_TACTICAL_VOCABULARY_VERSION,
  PnrSimulation,
} from "../lib/pnr-core.ts";
import {
  I00_ALLOWED_TERMINALS,
  I00_CONTRACT_VERSION,
  I00_INPUT_MANIFEST_VERSION,
  I00_INTEGRATION_INPUTS,
  I00_MANIFEST_HASH,
  I00_REPOSITORY_GATES,
  I00_REQUIRED_GATES,
  I00_ROLLBACK_COMMIT,
  I00_RUNTIME_CONTRACT,
  I00_STRATEGY_CONTRACT,
  I00_UPSTREAM_CONTRACT,
  canonicalI00ManifestJson,
  findI00ProhibitedInputFields,
} from "../lib/pnr-integration-manifest.ts";
import { A01_INPUT_HASH } from "../lib/pnr-a01-autonomous-setup-manifest.ts";
import { F01_FORMATION_INPUT_DOMAIN } from "../lib/pnr-formation-domain.ts";
import {
  TACTICAL_MANIFEST_INPUTS,
  TACTICAL_INPUT_HASH,
  TACTICAL_INPUT_MANIFEST_VERSION,
} from "../lib/pnr-tactical-manifest.ts";
import { makeTacticalAuditConfig } from "../lib/pnr-tactical-audit.ts";
import {
  DEFENSE_EARLY_DIG,
  OFFENSE_MISMATCH_PRESSURE,
} from "../lib/pnr-strategy.ts";
import { P03_POLICY_MATCHUPS } from "../lib/pnr-p03-policy-matrix.ts";
import {
  I02_STRATEGY_MATRIX,
  I02_STRATEGY_MATRIX_VERSION,
  makeI01IntegrationConfig,
  scanI03Integration,
} from "../lib/pnr-integration-audit.ts";

const I01_676176C_TRACE_HASH =
  "sha256:01803c9f2a1a09a83543c6edd6ae124444fda822975e66605548f1f36a5ef868";

let cachedI03Audit;

function i03Audit() {
  cachedI03Audit ??= scanI03Integration();
  return cachedI03Audit;
}

function integrationAudit() {
  return i03Audit().i01;
}

function copyPositions(initialPositions) {
  return Object.fromEntries(
    Object.entries(initialPositions).map(([id, point]) => [id, { ...point }]),
  );
}

function makeIntegratedConfig(input = I00_INTEGRATION_INPUTS[0], overrides = {}) {
  return {
    initialPositions: copyPositions(input.initialPositions),
    setupMode: I00_RUNTIME_CONTRACT.setupMode,
    formationDomainVersion: I00_UPSTREAM_CONTRACT.formationDomainVersion,
    startMode: I00_RUNTIME_CONTRACT.startMode,
    seed: input.seed,
    horizon: I00_RUNTIME_CONTRACT.horizon,
    tacticalVocabularyVersion: I00_UPSTREAM_CONTRACT.tacticalVocabularyVersion,
    integrationVersion: I00_RUNTIME_CONTRACT.integrationVersion,
    strategies: {
      offense: { ...I00_STRATEGY_CONTRACT.offense },
      defense: { ...I00_STRATEGY_CONTRACT.defense },
    },
    ...overrides,
  };
}

function integrationTraceDigest(config) {
  const simulation = new PnrSimulation(config);
  const hash = createHash("sha256");
  const update = (planning, events) => hash.update(JSON.stringify({
    world: simulation.world,
    offensePlan: simulation.offensePlan,
    defensePlan: simulation.defensePlan,
    planning,
    events,
  }));
  update([...simulation.planningLog], []);
  for (let tick = 0; tick < 600 && !simulation.world.terminal; tick += 1) {
    const planningStart = simulation.planningLog.length;
    const eventStart = simulation.eventLog.length;
    simulation.step();
    update(
      simulation.planningLog.slice(planningStart),
      simulation.eventLog.slice(eventStart),
    );
  }
  assert.ok(simulation.world.terminal, "integration baseline trace must terminate");
  return hash.digest("hex");
}

function defaultIntegrationGroupDigest() {
  const hash = createHash("sha256");
  for (const input of I00_INTEGRATION_INPUTS) {
    for (const mirrored of [false, true]) {
      hash.update(
        `${input.id}/${mirrored ? "left" : "right"}:` +
        `${integrationTraceDigest(makeI01IntegrationConfig(input, mirrored))}\n`,
      );
    }
  }
  return `sha256:${hash.digest("hex")}`;
}

const TACTICAL_PLAN_IDS = new Set([
  "DROP_CONTAIN",
  "CHASE_OVER",
  "ATTACK_DROP_GAP",
  "TAKE_DROP_PULLUP",
  "RESET_DROP",
  "RESET_CHASE",
  "SNAKE_CHASE",
  "POCKET_PASS",
]);

function hasTacticalCandidate(record) {
  return record.candidates.some((candidate) => TACTICAL_PLAN_IDS.has(candidate.id));
}

test("I00 manifest is input-only, versioned, frozen, and hash-locked before integration", () => {
  assert.equal(I00_CONTRACT_VERSION, "formation-minimum-t-contract@1");
  assert.equal(I00_INPUT_MANIFEST_VERSION, "formation-minimum-t-inputs@1");
  assert.equal(I00_ROLLBACK_COMMIT, "7eb4bd2");
  assert.equal(I00_INTEGRATION_INPUTS.length, 13);
  assert.equal(new Set(I00_INTEGRATION_INPUTS.map((input) => input.id)).size, 13);
  assert.deepEqual(
    I00_INTEGRATION_INPUTS.map((input) => Object.keys(input).sort()),
    I00_INTEGRATION_INPUTS.map(() => ["id", "initialPositions", "seed"]),
  );
  assert.deepEqual(findI00ProhibitedInputFields(I00_INTEGRATION_INPUTS), []);
  assert.equal(Object.isFrozen(I00_INTEGRATION_INPUTS), true);
  for (const input of I00_INTEGRATION_INPUTS) {
    assert.equal(Object.isFrozen(input), true);
    assert.equal(Object.isFrozen(input.initialPositions), true);
    for (const point of Object.values(input.initialPositions)) {
      assert.equal(Object.isFrozen(point), true);
    }
  }

  assert.equal(
    I00_UPSTREAM_CONTRACT.formationDomainVersion,
    F01_FORMATION_INPUT_DOMAIN.version,
  );
  assert.equal(I00_UPSTREAM_CONTRACT.autonomousInputHash, A01_INPUT_HASH);
  assert.equal(
    I00_UPSTREAM_CONTRACT.tacticalVocabularyVersion,
    MINIMUM_TACTICAL_VOCABULARY_VERSION,
  );
  assert.equal(
    I00_UPSTREAM_CONTRACT.tacticalInputManifestVersion,
    TACTICAL_INPUT_MANIFEST_VERSION,
  );
  assert.equal(I00_UPSTREAM_CONTRACT.tacticalInputHash, TACTICAL_INPUT_HASH);
  assert.equal(
    I00_RUNTIME_CONTRACT.integrationVersion,
    FORMATION_TACTICAL_INTEGRATION_VERSION,
  );
  assert.equal(I00_RUNTIME_CONTRACT.fixedDt, FIXED_DT);
  assert.equal(I00_STRATEGY_CONTRACT.requiredAdjustment, 0);
  assert.equal(I00_ALLOWED_TERMINALS.includes("defense_contained"), false);
  assert.ok(I00_REQUIRED_GATES.includes("no_tactical_read_before_handoff"));
  assert.deepEqual(
    I00_REPOSITORY_GATES,
    ["context_check", "test", "lint", "build", "diff_check"],
  );
  assert.equal(
    `sha256:${createHash("sha256").update(canonicalI00ManifestJson()).digest("hex")}`,
    I00_MANIFEST_HASH,
  );

  const manifestSource = readFileSync(
    new URL("../lib/pnr-integration-manifest.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    manifestSource,
    /new\s+PnrSimulation|planningLog|eventLog|world\.|scan\w*Integration|pnr-integration-audit/,
  );
});

test("I01 requires the exact integration, A, T, and horizon tuple while I02 accepts registered P strategies", () => {
  const validConfig = makeIntegratedConfig();
  const valid = new PnrSimulation(validConfig);

  assert.equal(valid.config.integrationVersion, FORMATION_TACTICAL_INTEGRATION_VERSION);
  assert.equal(valid.config.formationDomainVersion, AUTONOMOUS_FORMATION_DOMAIN_VERSION);
  assert.equal(valid.config.tacticalVocabularyVersion, MINIMUM_TACTICAL_VOCABULARY_VERSION);
  assert.equal(valid.config.setupMode, "auto");
  assert.equal(valid.config.startMode, "form_pnr");
  assert.equal(valid.config.horizon, "tactical_resolution");

  assert.throws(
    () => new PnrSimulation(makeIntegratedConfig(undefined, { integrationVersion: undefined })),
    /requires explicit preset_pnr/,
  );
  assert.throws(
    () => new PnrSimulation(makeIntegratedConfig(undefined, {
      integrationVersion: "formation-minimum-t@0",
    })),
    /integrationVersion must be/,
  );
  assert.throws(
    () => new PnrSimulation(makeIntegratedConfig(undefined, {
      formationDomainVersion: undefined,
    })),
    /requires auto form_pnr.*formationDomainVersion/,
  );
  assert.throws(
    () => new PnrSimulation(makeIntegratedConfig(undefined, {
      formationDomainVersion: "F01-v0",
    })),
    /requires auto form_pnr.*formationDomainVersion/,
  );
  assert.throws(
    () => new PnrSimulation(makeIntegratedConfig(undefined, {
      tacticalVocabularyVersion: undefined,
    })),
    /requires auto form_pnr.*tacticalVocabularyVersion/,
  );
  assert.throws(
    () => new PnrSimulation(makeIntegratedConfig(undefined, {
      tacticalVocabularyVersion: "minimum-t@2",
    })),
    /tacticalVocabularyVersion must be/,
  );
  assert.throws(
    () => new PnrSimulation(makeIntegratedConfig(undefined, { horizon: undefined })),
    /requires auto form_pnr.*tactical_resolution/,
  );
  assert.throws(
    () => new PnrSimulation(makeIntegratedConfig(undefined, {
      horizon: "formation_resolution",
    })),
    /requires auto form_pnr.*tactical_resolution/,
  );
  assert.throws(
    () => new PnrSimulation(makeIntegratedConfig(undefined, { setupMode: "explicit" })),
    /requires auto form_pnr/,
  );
  assert.throws(
    () => new PnrSimulation(makeIntegratedConfig(undefined, { startMode: "preset_pnr" })),
    /requires auto form_pnr/,
  );
  const mutableSelection = {
    offense: {
      id: OFFENSE_MISMATCH_PRESSURE.id,
      version: OFFENSE_MISMATCH_PRESSURE.version,
    },
    defense: {
      id: DEFENSE_EARLY_DIG.id,
      version: DEFENSE_EARLY_DIG.version,
    },
  };
  const strategyIntegrated = new PnrSimulation(makeIntegratedConfig(undefined, {
    strategies: mutableSelection,
  }));
  mutableSelection.offense.id = "MUTATED_AFTER_CONSTRUCTION";
  assert.equal(strategyIntegrated.config.strategies.offense.id, OFFENSE_MISMATCH_PRESSURE.id);
  assert.equal(strategyIntegrated.config.strategies.defense.id, DEFENSE_EARLY_DIG.id);
  assert.equal(Object.isFrozen(strategyIntegrated.config.strategies), true);
  assert.equal(Object.isFrozen(strategyIntegrated.config.strategies.offense), true);
  assert.equal(Object.isFrozen(strategyIntegrated.config.strategies.defense), true);
  assert.equal(strategyIntegrated.strategyLocked, false);
  const internalSelection = strategyIntegrated.config.strategies;
  const internalOffenseProfile = strategyIntegrated.getStrategyProfile("offense");
  const internalDefenseProfile = strategyIntegrated.getStrategyProfile("defense");
  assert.deepEqual(
    strategyIntegrated.planningLog.map((record) => [record.team, record.strategy.id]),
    [
      ["offense", OFFENSE_MISMATCH_PRESSURE.id],
      ["defense", DEFENSE_EARLY_DIG.id],
    ],
  );
  strategyIntegrated.step();
  assert.equal(strategyIntegrated.strategyLocked, true);
  assert.throws(
    () => {
      strategyIntegrated.config.strategies.offense.id = "MUTATED_WHILE_RUNNING";
    },
    TypeError,
  );
  assert.throws(
    () => {
      strategyIntegrated.config.strategies = {
        offense: { ...I00_STRATEGY_CONTRACT.offense },
        defense: { ...I00_STRATEGY_CONTRACT.defense },
      };
    },
    TypeError,
  );
  assert.equal(strategyIntegrated.config.strategies, internalSelection);
  assert.equal(strategyIntegrated.getStrategyProfile("offense"), internalOffenseProfile);
  assert.equal(strategyIntegrated.getStrategyProfile("defense"), internalDefenseProfile);
  assert.throws(
    () => new PnrSimulation(makeIntegratedConfig(undefined, {
      strategies: {
        offense: { id: "UNKNOWN_OFFENSE", version: 1 },
        defense: { ...I00_STRATEGY_CONTRACT.defense },
      },
    })),
    /Unknown offense strategy/,
  );
});

test("I01 preserves legacy A isolation, keeps explicit T active at tick 0, and hides T before handoff", () => {
  const input = I00_INTEGRATION_INPUTS[0];
  const legacyConfig = {
    initialPositions: copyPositions(input.initialPositions),
    setupMode: "auto",
    formationDomainVersion: F01_FORMATION_INPUT_DOMAIN.version,
    startMode: "form_pnr",
    seed: input.seed,
    horizon: "formation_resolution",
  };
  const legacy = new PnrSimulation(legacyConfig);
  const legacyWithUndefinedI = new PnrSimulation({
    ...legacyConfig,
    initialPositions: copyPositions(input.initialPositions),
    tacticalVocabularyVersion: undefined,
    integrationVersion: undefined,
  });

  for (let tick = 0; tick < 240; tick += 1) {
    assert.equal(legacy.world.stateHash, legacyWithUndefinedI.world.stateHash, `legacy tick ${tick}`);
    assert.equal(legacy.world.tacticalVocabularyVersion, undefined, `legacy tick ${tick}`);
    assert.equal(legacy.world.tacticalCoverage, undefined, `legacy tick ${tick}`);
    assert.ok(legacy.planningLog.every((record) => !hasTacticalCandidate(record)));
    if (legacy.world.terminal || legacy.world.formation.phase === "pnr") break;
    legacy.step();
    legacyWithUndefinedI.step();
  }

  const explicitT = new PnrSimulation(
    makeTacticalAuditConfig(TACTICAL_MANIFEST_INPUTS[0], "right"),
  );
  assert.equal(explicitT.world.tick, 0);
  assert.equal(
    explicitT.world.tacticalVocabularyVersion,
    MINIMUM_TACTICAL_VOCABULARY_VERSION,
  );
  assert.ok(explicitT.world.tacticalCoverage);
  assert.ok(explicitT.planningLog.some(hasTacticalCandidate));

  const integrated = new PnrSimulation(makeIntegratedConfig(input));
  assert.equal(integrated.world.tacticalVocabularyVersion, undefined);
  assert.equal(integrated.world.tacticalCoverage, undefined);
  let formationTicks = 0;
  while (
    integrated.world.formation.phase === "formation" &&
    !integrated.world.terminal &&
    integrated.world.tick < 240
  ) {
    assert.equal(integrated.world.tacticalVocabularyVersion, undefined);
    assert.equal(integrated.world.tacticalCoverage, undefined);
    assert.ok(integrated.planningLog.every((record) => !hasTacticalCandidate(record)));
    integrated.step();
    formationTicks += 1;
  }
  assert.ok(formationTicks > 0);
  assert.equal(integrated.world.formation.phase, "pnr");
  assert.equal(
    integrated.world.tacticalVocabularyVersion,
    MINIMUM_TACTICAL_VOCABULARY_VERSION,
  );
  assert.ok(integrated.world.tacticalCoverage);
  assert.ok(integrated.planningLog.some(hasTacticalCandidate));
});

test("I02 preserves every default I01 tick trace from checkpoint 676176c", () => {
  assert.equal(defaultIntegrationGroupDigest(), I01_676176C_TRACE_HASH);
});

test("I01 audits every input and mirror through duplicate and defense-first same-world handoffs", () => {
  const audit = integrationAudit();

  assert.equal(audit.manifestVersion, I00_INPUT_MANIFEST_VERSION);
  assert.equal(audit.inputHash, I00_MANIFEST_HASH);
  assert.equal(audit.inputCount, I00_INTEGRATION_INPUTS.length);
  assert.equal(audit.worldCount, I00_INTEGRATION_INPUTS.length * 2);
  assert.equal(audit.executionsPerWorld, 3);
  assert.equal(audit.rows.length, I00_INTEGRATION_INPUTS.length);
  assert.ok(audit.formedWorlds > 0);
  assert.ok(audit.safeExitWorlds > 0);
  assert.equal(audit.deterministic, true);
  assert.equal(audit.evaluationOrderStable, true);
  assert.equal(audit.defenseFirstEquivalent, true);
  assert.equal(audit.mirrored, true);
  assert.equal(audit.sameSimulationWorldIdentity, true);
  assert.equal(audit.formationReadyNextBoundary, true);
  assert.equal(audit.monotonicTickTime, true);
  assert.equal(audit.playerContinuity, true);
  assert.equal(audit.ballContinuity, true);
  assert.equal(audit.noTacticalReadBeforeHandoff, true);
  assert.equal(audit.publicEventCausalityPassed, true);
  assert.equal(audit.informationBoundaryPassed, true);
  assert.equal(audit.strategyReferencesPassed, true);
  assert.equal(audit.strategyPhaseCoveragePassed, true);
  assert.equal(audit.strategyLocked, true);
  assert.equal(audit.hardVetoPriorityPassed, true);
  assert.equal(audit.routesLegal, true);
  assert.equal(audit.teammateChannelPassed, true);
  assert.equal(audit.pocketIntegrityPassed, true);
  assert.equal(audit.allowedTerminalsPassed, true);
  assert.equal(audit.safeExitPassed, true);
  assert.equal(audit.zeroStrategyAdjustment, true);
  assert.equal(audit.firstFailure, null);
  assert.equal(audit.passed, true);

  const allowedTerminals = new Set(I00_ALLOWED_TERMINALS);
  let handoffWorlds = 0;
  let safeExitWorlds = 0;
  for (const row of audit.rows) {
    assert.deepEqual(row.failures, [], row.id);
    assert.equal(row.passed, true, row.id);
    assert.equal(row.deterministic, true, row.id);
    assert.equal(row.evaluationOrderStable, true, row.id);
    assert.equal(row.defenseFirstEquivalent, true, row.id);
    assert.equal(row.mirrored, true, row.id);
    assert.ok(row.mirrorMaximumError <= 1e-9, row.id);
    assert.equal(row.sameSimulationWorldIdentity, true, row.id);
    assert.equal(row.formationReadyNextBoundary, true, row.id);
    assert.equal(row.monotonicTickTime, true, row.id);
    assert.equal(row.playerContinuity, true, row.id);
    assert.equal(row.ballContinuity, true, row.id);
    assert.equal(row.noTacticalReadBeforeHandoff, true, row.id);
    assert.equal(row.publicEventCausalityPassed, true, row.id);
    assert.equal(row.informationBoundaryPassed, true, row.id);
    assert.equal(row.strategyReferencesPassed, true, row.id);
    assert.equal(row.strategyPhaseCoveragePassed, true, row.id);
    assert.equal(row.strategyLocked, true, row.id);
    assert.equal(row.hardVetoPriorityPassed, true, row.id);
    assert.equal(row.routesLegal, true, row.id);
    assert.equal(row.teammateChannelPassed, true, row.id);
    assert.equal(row.pocketIntegrityPassed, true, row.id);
    assert.ok(row.minimumTeammateBodyGap >= 0.06 - 1e-6, row.id);
    assert.equal(row.allowedTerminalsPassed, true, row.id);
    assert.equal(row.safeExitPassed, true, row.id);
    assert.equal(row.zeroStrategyAdjustment, true, row.id);

    assert.equal(row.right.mirrored, false, row.id);
    assert.equal(row.left.mirrored, true, row.id);
    assert.equal(row.right.terminalReason, row.left.terminalReason, row.id);
    assert.equal(row.right.terminalTick, row.left.terminalTick, row.id);
    assert.ok(allowedTerminals.has(row.right.terminalReason), row.id);

    for (const side of [row.right, row.left]) {
      if (side.readyTick === null) {
        safeExitWorlds += 1;
        assert.ok(
          ["formation_aborted", "formation_timeout"].includes(side.terminalReason),
          row.id,
        );
        assert.equal(side.readyAvailableAtTick, null, row.id);
        assert.equal(side.handoffTick, null, row.id);
        assert.equal(side.enteredPnrAtTick, null, row.id);
        assert.deepEqual(side.handoffTeams, [], row.id);
        assert.deepEqual(side.defenseCoverages, [], row.id);
        assert.deepEqual(side.offenseReads, [], row.id);
        continue;
      }

      handoffWorlds += 1;
      assert.equal(side.readyAvailableAtTick, side.readyTick + 1, row.id);
      assert.equal(side.handoffTick, side.readyAvailableAtTick, row.id);
      assert.equal(side.enteredPnrAtTick, side.handoffTick, row.id);
      assert.deepEqual([...side.handoffTeams].sort(), ["defense", "offense"], row.id);
      assert.ok(["DROP_CONTAIN", "CHASE_OVER"].includes(side.handoffDefensePlan), row.id);
      assert.equal(side.handoffOffensePlan, "USE_RIGHT_SCREEN", row.id);
      assert.ok(side.defenseCoverages.length > 0, row.id);
      assert.ok(side.offenseReads.length > 0, row.id);
      assert.ok(side.handoffTick < side.terminalTick, row.id);
    }

    if (row.right.selectedSide === null) {
      assert.equal(row.left.selectedSide, null, row.id);
    } else {
      assert.equal(
        row.left.selectedSide,
        row.right.selectedSide === "right" ? "left" : "right",
        row.id,
      );
    }
  }
  assert.equal(handoffWorlds, audit.formedWorlds);
  assert.equal(safeExitWorlds, audit.safeExitWorlds);
  assert.equal(handoffWorlds + safeExitWorlds, audit.worldCount);
});

test("I02-I03 audit every locked I input through the sealed 2x3 strategy matrix without inventing outcomes", () => {
  const audit = i03Audit();
  const matrix = audit.i02;

  assert.equal(I02_STRATEGY_MATRIX_VERSION, "formation-minimum-t-policy-matrix@1");
  assert.deepEqual(
    I02_STRATEGY_MATRIX.map((matchup) => matchup.id),
    P03_POLICY_MATCHUPS.map((matchup) => matchup.id),
  );
  assert.equal(Object.isFrozen(I02_STRATEGY_MATRIX), true);
  for (const matchup of I02_STRATEGY_MATRIX) {
    assert.equal(Object.isFrozen(matchup), true);
    assert.equal(Object.isFrozen(matchup.strategies), true);
    assert.equal(Object.isFrozen(matchup.strategies.offense), true);
    assert.equal(Object.isFrozen(matchup.strategies.defense), true);
  }

  assert.equal(matrix.version, I02_STRATEGY_MATRIX_VERSION);
  assert.equal(matrix.manifestVersion, I00_INPUT_MANIFEST_VERSION);
  assert.equal(matrix.inputHash, I00_MANIFEST_HASH);
  assert.equal(matrix.inputCount, I00_INTEGRATION_INPUTS.length);
  assert.equal(matrix.matchupCount, 6);
  assert.equal(matrix.cellCount, I00_INTEGRATION_INPUTS.length * 6);
  assert.equal(matrix.worldCount, I00_INTEGRATION_INPUTS.length * 6 * 2);
  assert.equal(matrix.executionsPerWorld, 3);
  assert.equal(matrix.rows.length, matrix.cellCount);
  assert.equal(matrix.deterministic, true);
  assert.equal(matrix.defenseFirstEquivalent, true);
  assert.equal(matrix.mirrored, true);
  assert.equal(matrix.sameSimulationWorldIdentity, true);
  assert.equal(matrix.formationReadyNextBoundary, true);
  assert.equal(matrix.monotonicTickTime, true);
  assert.equal(matrix.playerContinuity, true);
  assert.equal(matrix.ballContinuity, true);
  assert.equal(matrix.noTacticalReadBeforeHandoff, true);
  assert.equal(matrix.publicEventCausalityPassed, true);
  assert.equal(matrix.informationBoundaryPassed, true);
  assert.equal(matrix.opponentStrategyIsolationPassed, true);
  assert.equal(matrix.strategyReferencesPassed, true);
  assert.equal(matrix.strategyPhaseCoveragePassed, true);
  assert.equal(matrix.strategyLocked, true);
  assert.equal(matrix.hardVetoPriorityPassed, true);
  assert.equal(matrix.routesLegal, true);
  assert.equal(matrix.teammateChannelPassed, true);
  assert.equal(matrix.pocketIntegrityPassed, true);
  assert.equal(matrix.safeExitPassed, true);
  assert.equal(matrix.allowedTerminalsPassed, true);
  assert.equal(matrix.defaultBaselineUnchanged, true);
  assert.equal(matrix.strategyEffectCausalityPassed, true);
  assert.equal(matrix.observedBehaviorDifferenceInputs, 0);
  assert.equal(matrix.allObservedAdjustmentsZero, true);
  assert.equal(matrix.firstFailure, null);
  assert.equal(matrix.passed, true);

  for (const row of matrix.rows) {
    assert.deepEqual(row.failures, [], row.id);
    assert.equal(row.passed, true, row.id);
    assert.equal(row.audit.strategyReferencesPassed, true, row.id);
    assert.equal(row.audit.strategyPhaseCoveragePassed, true, row.id);
    assert.equal(row.audit.strategyLocked, true, row.id);
    assert.equal(row.audit.hardVetoPriorityPassed, true, row.id);
    assert.equal(row.audit.routesLegal, true, row.id);
    assert.equal(row.audit.teammateChannelPassed, true, row.id);
    assert.equal(row.audit.pocketIntegrityPassed, true, row.id);
    assert.ok(row.behaviorSignature.length > 0, row.id);
  }

  assert.equal(audit.inheritedTacticalTeammateCoordinationPassed, true);
  assert.equal(audit.inheritedTacticalPocketFlightPassed, true);
  assert.equal(audit.inheritedTacticalStageCoveragePassed, true);
  assert.deepEqual(
    audit.replays.map((replay) => replay.id),
    ["formed-handoff", "strategy-carry", "mirrored-handoff", "safe-exit"],
  );
  assert.equal(audit.replays.find((replay) => replay.id === "strategy-carry")?.matchupId, "OM-DE");
  assert.equal(audit.replays.find((replay) => replay.id === "safe-exit")?.terminalReason, "formation_aborted");
  assert.equal(audit.firstFailure, null);
  assert.equal(audit.passed, true);
});
