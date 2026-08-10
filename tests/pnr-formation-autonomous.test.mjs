// F00-F03 Formation and A00-A01 Autonomous Setup tests.

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  AUTONOMOUS_CANONICAL_ANCHORS,
  FORMATION_LANDMARK_OFFSETS,
  FORMATION_HANDLER_MAX_READY_SPEED,
  FORMATION_HANDLER_READY_RADIUS,
  FORMATION_SCREENER_MAX_SET_SPEED,
  FIXED_DT,
  PLAYER_IDS,
  PnrSimulation,
  UNDER_MAX_MATCHUP_INVERSION_AUDIT_SECONDS,
  UNDER_MAX_COLLISION_SUPPRESSION_SECONDS,
  UNDER_PULLUP_MIN_BODY_CLEARANCE,
  createPlannerObservation,
  formationReadiness,
  mirrorInitialPlayerPositions,
  mirrorPointAcrossCenterline,
} from "../lib/pnr-core.ts";
import {
  F00_AUDIT,
  F00_EXPECTED_RIGHT_LANDMARKS,
  F00_OUT_OF_BOUNDS_OFFSETS,
  F00_RIGHT_INITIAL_POSITIONS,
  F00_SWAPPED_GATE_OFFSETS,
  F00_UNAPPROVED_OFFSETS,
  F00_WAITING_CONFLICT_OFFSETS,
  createF00Replay,
  makeF00Config,
} from "../lib/pnr-f00-formation.ts";
import {
  F01_CANONICAL_STARTS,
  F01_FORMATION_INPUT_DOMAIN,
  measureFormationInputParameters,
} from "../lib/pnr-formation-domain.ts";
import {
  F01_FORMATION_SPECS,
  F02_FORMATION_SPECS,
  createF01Replay,
  createF02Replay,
  makeF01Config,
  scanF01Formation,
  scanF02Formation,
} from "../lib/pnr-formation-audit.ts";
import {
  F02_CANONICAL_SAMPLE_COUNT,
  F02_FORMATION_SAMPLES,
  F02_INPUT_HASH,
  F02_SAMPLE_GENERATION,
  F02_SAMPLE_SEED,
  canonicalF02InputJson,
} from "../lib/pnr-f02-formation-samples.ts";
import {
  F03_FROZEN_CORE_COMMIT,
  F03_HELDOUT_MANIFEST,
  F03_MANIFEST_GENERATION,
  F03_MANIFEST_HASH,
  F03_MANIFEST_SEED,
  F03_SIMULATION_SEED,
  canonicalF03ManifestJson,
  findF03ProhibitedOutputFields,
} from "../lib/pnr-f03-heldout-manifest.ts";
import {
  F03_MANIFEST_COMMIT,
  createF03Replay,
  scanF03Heldout,
} from "../lib/pnr-f03-heldout-audit.ts";
import {
  makeFormationGeneralizationReplayConfig,
  scanFormationGeneralization,
} from "../lib/pnr-formation-generalization-results.ts";
import {
  A00_AUTONOMOUS_SIDE_INPUTS,
  A00_INPUT_HASH,
  canonicalA00InputJson,
  findA00ProhibitedOutputFields,
} from "../lib/pnr-a00-autonomous-side-manifest.ts";
import {
  makeA00AutonomousConfig,
  scanA00AutonomousSides,
} from "../lib/pnr-a00-autonomous-side-audit.ts";
import {
  A01_AUTONOMOUS_SETUP_INPUTS,
  A01_INPUT_HASH,
  canonicalA01InputJson,
  findA01ProhibitedOutputFields,
} from "../lib/pnr-a01-autonomous-setup-manifest.ts";
import {
  createA01AutonomousReplay,
  makeA01RepresentativeReplayConfig,
  scanA01AutonomousSetups,
} from "../lib/pnr-a01-autonomous-setup-audit.ts";
import { UNDER_R2_AUDIT } from "../lib/pnr-under-r2.ts";
import {
  DEFAULT_SCENARIO_ID,
  makeScenarioConfig,
} from "../lib/pnr-scenarios.ts";

function frozenFormationTickFrame(simulation, planning, events) {
  return {
    tick: simulation.world.tick,
    time: simulation.world.time,
    stateHash: simulation.world.stateHash,
    players: PLAYER_IDS.map((id) => {
      const player = simulation.world.players[id];
      return [id, player.pos, player.vel, player.radius, player.maxSpeed];
    }),
    ballOwner: simulation.world.ballOwner,
    ball: simulation.world.ball,
    branch: simulation.world.branch,
    facts: simulation.world.facts,
    mismatch: simulation.world.mismatch,
    seal: simulation.world.seal,
    postCatch: simulation.world.postCatch,
    under: simulation.world.under,
    reject: simulation.world.reject,
    formation: simulation.world.formation,
    landmarks: simulation.world.landmarks,
    offensePlan: simulation.offensePlan,
    defensePlan: simulation.defensePlan,
    roles: simulation.getRoles(),
    planning,
    events,
    terminal: simulation.world.terminal,
  };
}

function frozenFormationTraceDigest(config) {
  const simulation = new PnrSimulation(config);
  const hash = createHash("sha256");
  hash.update(
    JSON.stringify(
      frozenFormationTickFrame(simulation, [...simulation.planningLog], []),
    ),
  );
  for (let index = 0; index < 720 && !simulation.world.terminal; index += 1) {
    const planningStart = simulation.planningLog.length;
    const eventStart = simulation.eventLog.length;
    simulation.step();
    hash.update(
      JSON.stringify(
        frozenFormationTickFrame(
          simulation,
          simulation.planningLog.slice(planningStart),
          simulation.eventLog.slice(eventStart),
        ),
      ),
    );
  }
  return {
    digest: hash.digest("hex"),
    terminalReason: simulation.world.terminal?.reason ?? null,
    terminalTick: simulation.world.tick,
  };
}

function f00ConfigWithOffsets(offsets) {
  return {
    ...makeF00Config("right"),
    formationLandmarkOffsets: Object.fromEntries(
      Object.entries(offsets).map(([name, point]) => [name, { ...point }]),
    ),
  };
}

test("F03 locks 16 input-only Formation held-out cases before any held-out world is run", () => {
  const expectedIds = [
    ...Array.from({ length: 8 }, (_, index) =>
      `F03-R${String(index + 1).padStart(2, "0")}`
    ),
    ...Array.from({ length: 8 }, (_, index) =>
      `F03-L${String(index + 1).padStart(2, "0")}`
    ),
  ];
  assert.equal(F03_FROZEN_CORE_COMMIT, "90631359ba5a52eacfdbfc1434d657f8743df45e");
  assert.equal(F03_MANIFEST_SEED, 20260810);
  assert.equal(F03_SIMULATION_SEED, 17);
  assert.equal(F03_MANIFEST_HASH,
    "sha256:7d7331992d4855d0d43704f926da97a0698e4c80a3da6b494ca4f350f3eb5b68");
  assert.deepEqual(F03_MANIFEST_GENERATION, {
    generator: "mulberry32-v1",
    seed: 20260810,
    domainVersion: "F01-v1",
    frozenF02InputHash: F02_INPUT_HASH,
    candidateCount: 16,
    geometryRejectedCount: 0,
    duplicateRejectedCount: 0,
    acceptedCount: 16,
    rightCount: 8,
    leftCount: 8,
  });
  assert.deepEqual(F03_HELDOUT_MANIFEST.map((item) => item.id), expectedIds);
  assert.equal(new Set(F03_HELDOUT_MANIFEST.map((item) => item.id)).size, 16);
  assert.deepEqual(findF03ProhibitedOutputFields(F03_HELDOUT_MANIFEST), []);
  assert.equal(
    `sha256:${createHash("sha256").update(canonicalF03ManifestJson()).digest("hex")}`,
    F03_MANIFEST_HASH,
  );

  const priorTacticalInputs = new Set([
    ...F01_CANONICAL_STARTS.map((start) => JSON.stringify(start.tacticalPositions)),
    ...F02_FORMATION_SAMPLES.map((sample) => JSON.stringify(sample.tacticalPositions)),
  ]);
  const heldoutTacticalInputs = [];
  for (const item of F03_HELDOUT_MANIFEST) {
    assert.deepEqual(Object.keys(item).sort(), ["id", "input", "side", "source"]);
    assert.deepEqual(Object.keys(item.source).sort(), [
      "candidateIndex",
      "domainVersion",
      "frozenF02InputHash",
      "generator",
      "parameters",
      "seed",
      "tacticalFrame",
    ]);
    assert.deepEqual(Object.keys(item.input).sort(), [
      "d1FrontReactionDelay",
      "d1PostCatchRecoveryDelay",
      "formationLandmarkOffsets",
      "horizon",
      "initialPositions",
      "maxTime",
      "o1MaxSpeed",
      "screenSide",
      "seed",
      "startMode",
    ]);
    assert.equal(item.input.screenSide, item.side);
    assert.equal(item.input.startMode, "form_pnr");
    assert.deepEqual(item.input.formationLandmarkOffsets, FORMATION_LANDMARK_OFFSETS);
    assert.equal(item.source.seed, F03_MANIFEST_SEED);
    assert.equal(item.source.domainVersion, F01_FORMATION_INPUT_DOMAIN.version);
    assert.equal(item.source.frozenF02InputHash, F02_INPUT_HASH);
    assert.ok(Object.isFrozen(item));
    const tacticalPositions = item.side === "right"
      ? item.input.initialPositions
      : mirrorInitialPlayerPositions(item.input.initialPositions);
    const key = JSON.stringify(tacticalPositions);
    assert.equal(priorTacticalInputs.has(key), false, item.id);
    heldoutTacticalInputs.push(key);
  }
  assert.equal(new Set(heldoutTacticalInputs).size, 16);
  const rightParameterKeys = new Set(
    F03_HELDOUT_MANIFEST
      .filter((item) => item.side === "right")
      .map((item) => JSON.stringify(item.source.parameters)),
  );
  assert.equal(
    F03_HELDOUT_MANIFEST
      .filter((item) => item.side === "left")
      .some((item) => rightParameterKeys.has(JSON.stringify(item.source.parameters))),
    false,
    "left cases must use different parameter combinations rather than paired mirrors",
  );

  const manifestSource = readFileSync(
    new URL("../lib/pnr-f03-heldout-manifest.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    manifestSource,
    /new\s+PnrSimulation|pnr-formation-audit|planningLog|eventLog|terminalReason|world\./,
    "manifest generation must not execute or inspect a held-out world",
  );
});

test("F00 defaults old inputs to preset_pnr and locks one validated landmark template", () => {
  const legacy = new PnrSimulation(makeScenarioConfig(DEFAULT_SCENARIO_ID));
  assert.equal(legacy.config.startMode, "preset_pnr");
  assert.equal(legacy.world.formation.phase, "pnr");

  const right = createF00Replay("right");
  const left = createF00Replay("left");
  assert.equal(right.config.startMode, "form_pnr");
  assert.equal(right.world.formation.phase, "formation");
  assert.equal(right.offensePlan.id, "FORM_SCREEN");
  assert.equal(right.defensePlan.id, "TRACK_FORMATION");
  assert.deepEqual(right.config.formationLandmarkOffsets, FORMATION_LANDMARK_OFFSETS);
  assert.deepEqual(right.config.initialPositions, F00_RIGHT_INITIAL_POSITIONS);
  assert.deepEqual(right.world.landmarks, F00_EXPECTED_RIGHT_LANDMARKS);
  assert.deepEqual(left.world.landmarks, {
    screenAnchor: mirrorPointAcrossCenterline(F00_EXPECTED_RIGHT_LANDMARKS.screenAnchor),
    handlerWaitingPoint: mirrorPointAcrossCenterline(
      F00_EXPECTED_RIGHT_LANDMARKS.handlerWaitingPoint,
    ),
    useGate: mirrorPointAcrossCenterline(F00_EXPECTED_RIGHT_LANDMARKS.useGate),
    rejectGate: mirrorPointAcrossCenterline(F00_EXPECTED_RIGHT_LANDMARKS.rejectGate),
  });

  const external = makeF00Config("right");
  const copied = new PnrSimulation(external);
  external.formationLandmarkOffsets.screenAnchor.x = 9;
  external.initialPositions.O1.x = 8;
  assert.deepEqual(copied.world.landmarks, F00_EXPECTED_RIGHT_LANDMARKS);
  assert.deepEqual(copied.config.initialPositions, F00_RIGHT_INITIAL_POSITIONS);

  assert.throws(
    () => new PnrSimulation(f00ConfigWithOffsets(F00_OUT_OF_BOUNDS_OFFSETS)),
    /formation landmark screenAnchor .* outside the court/,
  );
  assert.throws(
    () => new PnrSimulation(f00ConfigWithOffsets(F00_SWAPPED_GATE_OFFSETS)),
    /topology requires useGate on the screen side/,
  );
  assert.throws(
    () => new PnrSimulation(f00ConfigWithOffsets(F00_WAITING_CONFLICT_OFFSETS)),
    /handlerWaitingPoint.*initial O5|O1→handlerWaitingPoint crosses O5/,
  );
  assert.throws(
    () => new PnrSimulation(f00ConfigWithOffsets(F00_UNAPPROVED_OFFSETS)),
    /only the approved F00 landmark template/,
  );
  assert.deepEqual(makeF00Config("right", F00_SWAPPED_GATE_OFFSETS).formationLandmarkOffsets,
    FORMATION_LANDMARK_OFFSETS);
});

test("F00 requires O1 and O5 joint readiness before next-boundary PnR entry", () => {
  for (const side of ["right", "left"]) {
    const simulation = createF00Replay(side);
    const initialRoles = new Map(simulation.getRoles().map((role) => [role.playerId, role]));
    assert.equal(initialRoles.get("O1").roleCode, "setup_handler");
    assert.equal(initialRoles.get("O5").roleCode, "arrive_screen");
    assert.equal(initialRoles.get("D1").roleCode, "contain_setup");
    assert.equal(initialRoles.get("D5").roleCode, "track_screener");

    while (!simulation.world.terminal && simulation.world.tick < 720) {
      if (simulation.world.formation.phase === "formation") {
        assert.equal(simulation.world.branch, "undecided");
        assert.equal(simulation.world.facts.screenEffective, false);
        assert.equal(simulation.world.facts.impeded, false);
        assert.equal(simulation.offensePlan.id, "FORM_SCREEN");
        assert.equal(simulation.defensePlan.id, "TRACK_FORMATION");
      }
      simulation.step();
    }

    const screenSet = simulation.eventLog.find((event) => event.type === "screen_set");
    const jointReady = simulation.eventLog.find((event) => event.type === "formation_ready");
    const branch = simulation.eventLog.find(
      (event) => event.type === "branch_use" || event.type === "branch_reject",
    );
    const firstPnrOffense = simulation.planningLog.find(
      (record) => record.decisionPhase === "offense_initial_read",
    );
    const firstPnrDefense = simulation.planningLog.find(
      (record) => record.decisionPhase === "defense_initial_coverage",
    );
    assert.ok(screenSet);
    assert.ok(jointReady);
    assert.ok(screenSet.tick <= jointReady.tick);
    assert.equal(firstPnrOffense?.tick, jointReady.availableAtTick);
    assert.equal(firstPnrDefense?.tick, jointReady.availableAtTick);
    assert.ok(firstPnrOffense.tick > jointReady.tick);
    assert.ok(firstPnrDefense.tick > jointReady.tick);
    assert.match(firstPnrOffense.trigger, /联合就绪/);
    assert.match(firstPnrDefense.trigger, /联合就绪/);
    assert.ok(
      firstPnrOffense.candidates.find(
        (candidate) => candidate.id === firstPnrOffense.chosen && candidate.feasible,
      ),
    );
    assert.ok(
      firstPnrDefense.candidates.find(
        (candidate) => candidate.id === firstPnrDefense.chosen && candidate.feasible,
      ),
    );
    assert.ok(branch.tick > jointReady.tick);
    assert.notEqual(simulation.world.terminal?.reason, "formation_timeout");
    assert.ok(simulation.world.terminal);
  }
});

test("F00 screen_set alone cannot advance when O1 has not reached the waiting region", () => {
  const simulation = createF00Replay("right");
  simulation.world.players.O1.maxSpeed = 0;
  for (let index = 0; index < 240 && !simulation.world.terminal; index += 1) {
    simulation.step();
  }

  assert.ok(simulation.eventLog.some((event) => event.type === "screen_set"));
  assert.equal(simulation.eventLog.some((event) => event.type === "formation_ready"), false);
  assert.equal(
    simulation.planningLog.some((record) => record.decisionPhase === "offense_initial_read"),
    false,
  );
  assert.equal(simulation.world.formation.enteredPnrAtTick, null);
  assert.equal(simulation.eventLog.some((event) => event.type === "branch_use"), false);
  assert.equal(simulation.eventLog.some((event) => event.type === "branch_reject"), false);
  assert.equal(simulation.eventLog.some((event) => event.type === "screen_effective"), false);
  assert.equal(simulation.eventLog.some((event) => event.type === "impeded_on"), false);
  assert.equal(simulation.world.terminal?.reason, "formation_timeout");
});

test("F00 semantic gate is deterministic, locally causal, goal-side, and truly mirrored", () => {
  assert.equal(F00_AUDIT.passed, true);
  for (const result of [F00_AUDIT.right, F00_AUDIT.left]) {
    assert.equal(result.passed, true);
    assert.equal(result.deterministic, true);
    assert.deepEqual(result.failures, []);
    assert.notEqual(result.terminalReason, "formation_timeout");
    assert.ok(result.maximumPlayerStep <= result.maximumAllowedPlayerStep + 1e-9);
    assert.ok(result.minimumBodyGap >= -0.01);
    assert.ok(result.diagnostics.screenSetTick <= result.diagnostics.jointReadyTick);
    assert.equal(
      result.diagnostics.pnrPlanningTick,
      result.diagnostics.jointReadyTick + 1,
    );
    assert.ok(result.diagnostics.branchTick > result.diagnostics.jointReadyTick);
    assert.ok(result.diagnostics.terminalTick > result.diagnostics.branchTick);
    assert.ok(result.diagnostics.d1GoalSideMargin > 0);
    assert.ok(result.diagnostics.d1O1Distance < result.diagnostics.o5O1Distance);
    assert.equal(
      result.diagnostics.underReadTick,
      result.diagnostics.underCommittedTick + 1,
    );
    assert.equal(result.diagnostics.underReadPlan, "ATTACK_UNDER_GAP");
    assert.ok(
      result.diagnostics.minimumD5O1GapAfterUnder < UNDER_PULLUP_MIN_BODY_CLEARANCE,
    );
    assert.ok(
      result.terminalReason === "under_drive_advantage" ||
        result.terminalReason === "under_contained",
    );
  }
  assert.deepEqual(F00_AUDIT.mirrorFailures, []);
  assert.ok(F00_AUDIT.mirrorMaximumError <= 1e-9);
  assert.ok(F00_AUDIT.mirrorMaximumError > 0);
  assert.equal(F00_AUDIT.topologyPassed, true);
  assert.match(F00_AUDIT.topologyRejections.outOfBounds, /outside the court/);
  assert.match(F00_AUDIT.topologyRejections.swappedGates, /topology/);
  assert.match(F00_AUDIT.topologyRejections.waitingConflict, /O5/);
  assert.match(F00_AUDIT.topologyRejections.unapprovedTemplate, /approved F00/);
});

test("F00 exposes offense-local geometry only to offense and keeps defense decisions stable", () => {
  const simulation = createF00Replay("right");
  const offenseObservation = createPlannerObservation(simulation.world, "offense");
  const defenseObservation = createPlannerObservation(simulation.world, "defense");
  assert.deepEqual(offenseObservation.landmarks, F00_EXPECTED_RIGHT_LANDMARKS);
  assert.deepEqual(defenseObservation.landmarks, {
    screenAnchor: F00_EXPECTED_RIGHT_LANDMARKS.screenAnchor,
  });
  assert.equal(Object.hasOwn(defenseObservation.landmarks, "handlerWaitingPoint"), false);
  assert.equal(Object.hasOwn(defenseObservation.landmarks, "useGate"), false);
  assert.equal(Object.hasOwn(defenseObservation.landmarks, "rejectGate"), false);
  assert.equal(Object.hasOwn(defenseObservation, "strategies"), false);
  assert.equal(Object.hasOwn(defenseObservation, "opponentPlan"), false);
  assert.equal(F00_AUDIT.informationOwnership.privateFieldsHidden, true);
  assert.equal(F00_AUDIT.informationOwnership.decisionStable, true);
  assert.equal(F00_AUDIT.informationOwnership.passed, true);
});

test("F00 readiness thresholds are public facts and formation still terminates if O5 cannot arrive", () => {
  const simulation = createF00Replay("right");
  const initialReadiness = formationReadiness(simulation.world);
  assert.equal(initialReadiness.ready, false);
  assert.equal(FORMATION_HANDLER_READY_RADIUS, 0.12);
  assert.equal(FORMATION_HANDLER_MAX_READY_SPEED, 0.32);
  assert.equal(FORMATION_SCREENER_MAX_SET_SPEED, 0.28);

  simulation.world.players.O5.maxSpeed = 0;
  for (let index = 0; index < 240 && !simulation.world.terminal; index += 1) {
    simulation.step();
  }
  assert.equal(simulation.world.terminal?.reason, "formation_timeout");
  assert.ok(simulation.eventLog.some((event) => event.type === "formation_timeout"));
  assert.equal(simulation.eventLog.some((event) => event.type === "formation_ready"), false);
  assert.equal(simulation.eventLog.some((event) => event.type === "branch_use"), false);
  assert.equal(simulation.eventLog.some((event) => event.type === "screen_effective"), false);
});

test("F01 freezes eight public canonical starts and derives its legal domain only from them", () => {
  assert.equal(F01_FORMATION_INPUT_DOMAIN.version, "F01-v1");
  assert.equal(F01_FORMATION_INPUT_DOMAIN.tacticalFrame, "right-canonical");
  assert.deepEqual(F01_FORMATION_INPUT_DOMAIN.landmarkOffsets, FORMATION_LANDMARK_OFFSETS);
  assert.deepEqual(
    F01_CANONICAL_STARTS.map((start) => start.id),
    Array.from({ length: 8 }, (_, index) => `F01-C${String(index + 1).padStart(2, "0")}`),
  );
  assert.deepEqual(
    new Set(F01_CANONICAL_STARTS.map((start) => start.focus)),
    new Set([
      "baseline",
      "long_screener_route",
      "approach_angle",
      "handler_variation",
      "d1_depth",
      "d5_follow_distance",
      "formation_translation",
      "tight_legal_geometry",
    ]),
  );

  const measured = F01_CANONICAL_STARTS.map((start) =>
    measureFormationInputParameters(start.tacticalPositions)
  );
  for (const name of Object.keys(F01_FORMATION_INPUT_DOMAIN.parameters)) {
    assert.deepEqual(F01_FORMATION_INPUT_DOMAIN.parameters[name], [
      Math.min(...measured.map((parameters) => parameters[name])),
      Math.max(...measured.map((parameters) => parameters[name])),
    ]);
  }

  for (const start of F01_CANONICAL_STARTS) {
    const right = createF01Replay(start.id, "right");
    const left = createF01Replay(start.id, "left");
    assert.equal(right.config.startMode, "form_pnr");
    assert.equal(right.config.screenSide, "right");
    assert.equal(left.config.screenSide, "left");
    for (const id of PLAYER_IDS) {
      assert.deepEqual(
        left.config.initialPositions[id],
        mirrorPointAcrossCenterline(right.config.initialPositions[id]),
      );
    }
  }

  const outside = makeF00Config("right");
  for (const id of PLAYER_IDS) outside.initialPositions[id].x -= 0.05;
  const unchanged = structuredClone(outside.initialPositions);
  assert.throws(
    () => new PnrSimulation(outside),
    /outside the frozen F01 Formation domain.*handlerOriginX/,
  );
  assert.deepEqual(outside.initialPositions, unchanged, "illegal input must be rejected, not clamped");
});

test("F01 runs 8 canonical starts on both real sides twice through one Formation primitive set", () => {
  const audit = scanF01Formation();
  assert.equal(F01_FORMATION_SPECS.length, 8);
  assert.equal(audit.canonicalInputCount, 8);
  assert.equal(audit.worldCount, 16);
  assert.equal(audit.executionsPerWorld, 2);
  assert.equal(audit.rows.length, 8);
  assert.equal(audit.successfulFormationWorlds, 14);
  assert.equal(audit.safeExitWorlds, 2);
  assert.equal(audit.deterministic, true);
  assert.equal(audit.mirrored, true);
  assert.equal(audit.invariantsPassed, true);
  assert.equal(audit.passed, true);
  assert.deepEqual(audit.failedCaseIds, []);
  assert.deepEqual(audit.failureReasons, []);

  for (const row of audit.rows) {
    assert.equal(row.passed, true, row.id);
    assert.equal(row.mirrorPassed, true, row.id);
    assert.ok(row.mirrorMaximumError <= 1e-9, row.id);
    for (const side of [row.right, row.left]) {
      assert.equal(side.deterministic, true, `${row.id}/${side.side}`);
      assert.equal(side.passed, true, `${row.id}/${side.side}`);
      assert.deepEqual(side.failures, [], `${row.id}/${side.side}`);
      assert.ok(side.maximumPlayerStep <= side.maximumAllowedPlayerStep + 1e-9);
      assert.ok(side.minimumBodyGap >= -0.01);
      assert.ok(side.terminalReason);
      if (side.safeExitReason) {
        assert.equal(side.safeExitReason, "formation_timeout");
        assert.equal(side.eventTicks.jointReady, null);
        assert.equal(side.eventTicks.branch, null);
      } else {
        assert.ok(side.eventTicks.screenSet <= side.eventTicks.jointReady);
        assert.ok(side.eventTicks.jointReady < side.eventTicks.branch);
        assert.ok(side.eventTicks.branch < side.eventTicks.terminal);
      }
    }
  }

  assert.equal(audit.rows.find((row) => row.id === "F01-C08").right.safeExitReason,
    "formation_timeout");
  assert.equal(
    audit.rows.toSorted((first, second) => second.o5ArrivalDistance - first.o5ArrivalDistance)[0].id,
    "F01-C02",
  );
});

test("F01 leaves the sealed F00 right and left worlds unchanged at every tick", () => {
  assert.deepEqual(frozenFormationTraceDigest(makeF01Config("F01-C01", "right")), {
    digest: "47995851cde760ba06fd0900bad6ca387dbc2b37403bbbc8b8ceb965329b464f",
    terminalReason: "under_drive_advantage",
    terminalTick: 277,
  });
  assert.deepEqual(frozenFormationTraceDigest(makeF01Config("F01-C01", "left")), {
    digest: "c3dfc7439eafb9a91aac5ff9bda85b32b387db15aaa72d635cd66f097f539a65",
    terminalReason: "under_drive_advantage",
    terminalTick: 277,
  });
});

test("F02 deterministically samples 16 unique inputs from only the frozen F01 geometry domain", () => {
  assert.equal(F02_SAMPLE_SEED, 20260809);
  assert.equal(F02_CANONICAL_SAMPLE_COUNT, 16);
  assert.deepEqual(F02_SAMPLE_GENERATION, {
    generator: "mulberry32-v1",
    seed: 20260809,
    domainVersion: "F01-v1",
    candidateCount: 16,
    geometryRejectedCount: 0,
    duplicateRejectedCount: 0,
    acceptedCount: 16,
  });
  assert.deepEqual(
    F02_FORMATION_SAMPLES.map((sample) => sample.id),
    Array.from({ length: 16 }, (_, index) =>
      `F02-S${String(index + 1).padStart(2, "0")}`
    ),
  );
  assert.equal(
    new Set(F02_FORMATION_SAMPLES.map((sample) =>
      JSON.stringify(sample.tacticalPositions)
    )).size,
    16,
  );
  assert.equal(
    F02_FORMATION_SAMPLES.some((sample) =>
      F01_CANONICAL_STARTS.some((start) =>
        JSON.stringify(start.tacticalPositions) === JSON.stringify(sample.tacticalPositions)
      )
    ),
    false,
  );
  assert.equal(
    `sha256:${createHash("sha256").update(canonicalF02InputJson()).digest("hex")}`,
    F02_INPUT_HASH,
  );

  for (const sample of F02_FORMATION_SAMPLES) {
    assert.equal(sample.source.generator, "mulberry32-v1");
    assert.equal(sample.source.seed, F02_SAMPLE_SEED);
    assert.equal(sample.source.domainVersion, F01_FORMATION_INPUT_DOMAIN.version);
    assert.deepEqual(
      Object.keys(sample.source.parameters).sort(),
      Object.keys(F01_FORMATION_INPUT_DOMAIN.parameters).sort(),
    );
    for (const [name, value] of Object.entries(sample.source.parameters)) {
      const range = F01_FORMATION_INPUT_DOMAIN.parameters[name];
      assert.ok(value >= range[0] && value <= range[1], `${sample.id}/${name}`);
    }
    const right = createF02Replay(sample.id, "right");
    const left = createF02Replay(sample.id, "left");
    for (const id of PLAYER_IDS) {
      assert.deepEqual(
        left.config.initialPositions[id],
        mirrorPointAcrossCenterline(right.config.initialPositions[id]),
      );
    }
  }

  const samplerSource = readFileSync(
    new URL("../lib/pnr-f02-formation-samples.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    samplerSource,
    /new\s+PnrSimulation|planningLog|eventLog|terminalReason|world\.|scanF02Formation/,
    "the sampler must not execute or inspect simulation output",
  );
});

test("F02 runs 16 canonical inputs on both real sides twice with legal causal exits", () => {
  const audit = scanF02Formation();
  assert.equal(F02_FORMATION_SPECS.length, 16);
  assert.equal(audit.canonicalInputCount, 16);
  assert.equal(audit.worldCount, 32);
  assert.equal(audit.executionsPerWorld, 2);
  assert.equal(audit.rows.length, 16);
  assert.equal(audit.successfulFormationWorlds, 30);
  assert.equal(audit.safeExitWorlds, 2);
  assert.equal(audit.deterministic, true);
  assert.equal(audit.mirrored, true);
  assert.equal(audit.invariantsPassed, true);
  assert.equal(audit.passed, true);
  assert.deepEqual(audit.failedCaseIds, []);
  assert.deepEqual(audit.failureReasons, []);

  for (const row of audit.rows) {
    assert.equal(row.passed, true, row.id);
    assert.equal(row.mirrorPassed, true, row.id);
    assert.ok(row.mirrorMaximumError <= 1e-9, row.id);
    for (const side of [row.right, row.left]) {
      assert.equal(side.deterministic, true, `${row.id}/${side.side}`);
      assert.equal(side.passed, true, `${row.id}/${side.side}`);
      assert.deepEqual(side.failures, [], `${row.id}/${side.side}`);
      assert.equal(side.failureTrace, null, `${row.id}/${side.side}`);
      assert.ok(side.maximumPlayerStep <= side.maximumAllowedPlayerStep + 1e-9);
      assert.ok(side.minimumBodyGap >= -0.01);
      assert.ok(side.offenseReplans < 40);
      assert.ok(side.defenseReplans < 40);
      if (side.safeExitReason) {
        assert.equal(side.safeExitReason, "formation_timeout");
        assert.equal(side.eventTicks.jointReady, null);
        assert.equal(side.eventTicks.branch, null);
      } else {
        assert.ok(side.eventTicks.screenSet <= side.eventTicks.jointReady);
        assert.ok(side.eventTicks.jointReady < side.eventTicks.branch);
        assert.ok(side.eventTicks.branch < side.eventTicks.terminal);
      }
    }
  }
  assert.equal(audit.rows.find((row) => row.id === "F02-S15").right.safeExitReason,
    "formation_timeout");
});

test("F02 latches a published joint-ready fact through the exact next planner boundary", () => {
  for (const sampleId of ["F02-S02", "F02-S09"]) {
    const simulation = createF02Replay(sampleId, "right");
    for (let index = 0; index < 360 && !simulation.world.terminal; index += 1) {
      simulation.step();
    }
    const ready = simulation.eventLog.find((event) => event.type === "formation_ready");
    const firstOffense = simulation.planningLog.find(
      (record) => record.decisionPhase === "offense_initial_read",
    );
    const firstDefense = simulation.planningLog.find(
      (record) => record.decisionPhase === "defense_initial_coverage",
    );
    assert.ok(ready, sampleId);
    assert.equal(firstOffense?.tick, ready.availableAtTick, sampleId);
    assert.equal(firstDefense?.tick, ready.availableAtTick, sampleId);
    assert.notEqual(simulation.world.terminal?.reason, "formation_timeout", sampleId);
    assert.equal(
      simulation.eventLog.filter((event) => event.type === "formation_ready").length,
      1,
      sampleId,
    );
  }
});

test("F03 audits every locked held-out input twice plus its unlabeled corresponding mirror", () => {
  const audit = scanF03Heldout();
  assert.equal(F03_MANIFEST_COMMIT, "ba39ef025f29d181af8c7d137d6807f7825c9717");
  assert.equal(audit.frozenCoreCommit, F03_FROZEN_CORE_COMMIT);
  assert.equal(audit.manifestCommit, F03_MANIFEST_COMMIT);
  assert.equal(audit.manifestHash, F03_MANIFEST_HASH);
  assert.equal(audit.manifestCount, 16);
  assert.equal(audit.executedCount, 16);
  assert.equal(audit.primaryWorldCount, 16);
  assert.equal(audit.correspondingMirrorWorldCount, 16);
  assert.equal(audit.executionsPerWorld, 2);
  assert.equal(audit.successfulFormationWorlds, 28);
  assert.equal(audit.safeExitWorlds, 4);
  assert.equal(audit.deterministic, true);
  assert.equal(audit.mirrored, true);
  assert.equal(audit.invariantsPassed, true);
  assert.equal(audit.passed, true);
  assert.deepEqual(audit.failedCaseIds, []);
  assert.deepEqual(audit.failureReasons, []);

  for (const [index, row] of audit.rows.entries()) {
    const manifestItem = F03_HELDOUT_MANIFEST[index];
    assert.equal(row.id, manifestItem.id);
    assert.equal(row.side, manifestItem.side);
    assert.equal(row.primary.side, manifestItem.side);
    assert.notEqual(row.correspondingMirror.side, manifestItem.side);
    assert.equal(row.passed, true, row.id);
    assert.equal(row.pair.mirrorPassed, true, row.id);
    assert.ok(row.pair.mirrorMaximumError <= 1e-9, row.id);
    assert.deepEqual(row.primary.failures, [], row.id);
    assert.deepEqual(row.correspondingMirror.failures, [], row.id);
    assert.equal(row.earliestFailureTick, null, row.id);
    assert.equal(row.minimumFailureTrace, null, row.id);
    assert.equal(row.primary.deterministic, true, row.id);
    assert.equal(row.correspondingMirror.deterministic, true, row.id);
    assert.equal(row.primary.terminalReason, row.correspondingMirror.terminalReason, row.id);
    assert.equal(row.primary.terminalTick, row.correspondingMirror.terminalTick, row.id);
    if (row.primary.safeExitReason) {
      assert.equal(row.primary.safeExitReason, "formation_timeout");
      assert.equal(row.primary.eventTicks.jointReady, null);
      assert.equal(row.primary.eventTicks.branch, null);
    } else {
      assert.ok(row.primary.eventTicks.screenSet <= row.primary.eventTicks.jointReady);
      assert.ok(row.primary.eventTicks.jointReady < row.primary.eventTicks.branch);
      assert.ok(row.primary.eventTicks.branch < row.primary.eventTicks.terminal);
    }

    const replay = createF03Replay(row.id, row.side);
    assert.deepEqual(replay.config.initialPositions, manifestItem.input.initialPositions);
    assert.deepEqual(
      replay.config.formationLandmarkOffsets,
      manifestItem.input.formationLandmarkOffsets,
    );
  }
});

test("F01-F03 representative replays are selected only from completed public audit statistics", () => {
  const summary = scanFormationGeneralization();
  assert.equal(summary.passed, true);
  assert.deepEqual(summary.stageStatus, { F01: "PASS", F02: "PASS", F03: "PASS" });
  assert.equal(summary.f02Seed, 20260809);
  assert.equal(summary.f02InputHash, F02_INPUT_HASH);
  assert.equal(summary.f03FrozenCoreCommit, F03_FROZEN_CORE_COMMIT);
  assert.equal(summary.f03ManifestCommit, F03_MANIFEST_COMMIT);
  assert.equal(summary.f03ManifestSeed, F03_MANIFEST_SEED);
  assert.equal(summary.f03ManifestHash, F03_MANIFEST_HASH);
  assert.deepEqual(
    summary.replays.map(({ id, stage, sampleId, side }) => ({ id, stage, sampleId, side })),
    [
      {
        id: "longest-f01-arrival",
        stage: "F01",
        sampleId: "F01-C02",
        side: "right",
      },
      {
        id: "tightest-f02-clearance",
        stage: "F02",
        sampleId: "F02-S15",
        side: "right",
      },
      {
        id: "longest-or-safe-exit",
        stage: "F03",
        sampleId: "F03-R03",
        side: "right",
      },
      {
        id: "diverse-heldout",
        stage: "F03",
        sampleId: "F03-L04",
        side: "left",
      },
    ],
  );
  assert.equal(summary.replays[0].formationTimeSeconds > 0, true);
  assert.equal(summary.replays[1].initialMinimumBodyGap < 0.03, true);
  assert.equal(summary.replays[2].terminalCategory, "formation_timeout");
  assert.equal(summary.replays[3].side, "left");
  assert.notEqual(summary.replays[3].terminalCategory, summary.replays[2].terminalCategory);

  for (const replay of summary.replays) {
    const config = makeFormationGeneralizationReplayConfig(replay);
    assert.equal(config.screenSide, replay.side);
    assert.equal(config.startMode, "form_pnr");
  }
});

test("A00 locks an input-only audit set spanning the sealed Formation domain", () => {
  assert.equal(A00_AUTONOMOUS_SIDE_INPUTS.length, 12);
  assert.deepEqual(
    A00_AUTONOMOUS_SIDE_INPUTS.map((input) => input.sourceStage),
    ["F01", "F01", "F01", "F01", "F02", "F02", "F02", "F02", "F03", "F03", "F03", "F03"],
  );
  assert.equal(new Set(A00_AUTONOMOUS_SIDE_INPUTS.map((input) => input.id)).size, 12);
  assert.deepEqual(findA00ProhibitedOutputFields(A00_AUTONOMOUS_SIDE_INPUTS), []);
  assert.equal(
    `sha256:${createHash("sha256").update(canonicalA00InputJson()).digest("hex")}`,
    A00_INPUT_HASH,
  );
  const source = readFileSync(
    new URL("../lib/pnr-a00-autonomous-side-manifest.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /new\s+PnrSimulation|planningLog|eventLog|terminalReason|world\.|scanA00AutonomousSides/,
  );
});

test("A00 auto input rejects caller side, anchor, sample identity, and expected outcome", () => {
  const input = A00_AUTONOMOUS_SIDE_INPUTS[0];
  const base = makeA00AutonomousConfig(input);
  assert.equal(Object.hasOwn(base, "screenSide"), false);
  assert.equal(Object.hasOwn(base, "formationLandmarkOffsets"), false);
  assert.equal(new PnrSimulation(base).world.screenSide, null);

  for (const [field, value] of [
    ["screenSide", "right"],
    ["formationLandmarkOffsets", FORMATION_LANDMARK_OFFSETS],
    ["anchor", { x: 5.1, y: 5.8 }],
    ["sampleId", "F01-C01"],
    ["legacyInputId", "F03-R03"],
    ["expectedOutcome", "formation_ready"],
    ["maxTime", 4],
  ]) {
    assert.throws(
      () => new PnrSimulation({ ...base, [field]: value }),
      new RegExp(`rejects caller-owned ${field}`),
    );
  }
  assert.throws(
    () => new PnrSimulation({ ...base, formationDomainVersion: "F01-v0" }),
    /requires formationDomainVersion="F01-v1"/,
  );
});

test("A00 selects a private side from public geometry with deterministic mirror and commitment gates", () => {
  const audit = scanA00AutonomousSides();
  assert.equal(audit.inputHash, A00_INPUT_HASH);
  assert.equal(audit.inputCount, 12);
  assert.equal(audit.worldCount, 24);
  assert.equal(audit.executionsPerWorld, 2);
  assert.equal(audit.firstFailure, null);
  assert.equal(audit.deterministic, true);
  assert.equal(audit.mirrored, true);
  assert.equal(audit.minimumCommitPassed, true);
  assert.equal(audit.hysteresisPassed, true);
  assert.equal(audit.zeroStrategyAdjustment, true);
  assert.equal(audit.privateBeforeCommit, true);
  assert.equal(audit.passed, true);
  for (const row of audit.rows) {
    assert.equal(row.mirroredSelectedSide, row.selectedSide === "right" ? "left" : "right", row.id);
    assert.equal(row.publicCommitTick, row.mirroredPublicCommitTick, row.id);
    assert.ok((row.publicCommitTick ?? 0) > 0, row.id);
    assert.ok(row.mirrorMaximumError <= 1e-9, row.id);
    assert.deepEqual(row.failures, [], row.id);
  }
});

test("A00 leaves omitted and explicit setup modes identical at every sealed Formation tick", () => {
  for (const side of ["right", "left"]) {
    const legacy = makeF01Config("F01-C01", side);
    const explicit = { ...makeF01Config("F01-C01", side), setupMode: "explicit" };
    assert.deepEqual(
      frozenFormationTraceDigest(explicit),
      frozenFormationTraceDigest(legacy),
      side,
    );
  }
});

test("A01 locks an input-only side x anchor audit set without derived outputs", () => {
  assert.equal(A01_AUTONOMOUS_SETUP_INPUTS.length, 13);
  assert.deepEqual(
    A01_AUTONOMOUS_SETUP_INPUTS.map((input) => input.sourceStage),
    [
      "F01",
      "F01",
      "F01",
      "F01",
      "F02",
      "F02",
      "F02",
      "F02",
      "F03",
      "F03",
      "F03",
      "F03",
      "domain_cross_combination",
    ],
  );
  assert.equal(new Set(A01_AUTONOMOUS_SETUP_INPUTS.map((input) => input.id)).size, 13);
  assert.deepEqual(findA01ProhibitedOutputFields(A01_AUTONOMOUS_SETUP_INPUTS), []);
  assert.equal(
    `sha256:${createHash("sha256").update(canonicalA01InputJson()).digest("hex")}`,
    A01_INPUT_HASH,
  );
  const source = readFileSync(
    new URL("../lib/pnr-a01-autonomous-setup-manifest.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /new\s+PnrSimulation|planningLog|eventLog|terminalReason|world\.|scanA01AutonomousSetups/,
  );
});

test("A01 selects only fixed canonical side x anchor pairs and safely exits all-veto worlds", () => {
  const audit = scanA01AutonomousSetups();
  assert.equal(audit.inputHash, A01_INPUT_HASH);
  assert.equal(audit.inputCount, 13);
  assert.equal(audit.worldCount, 26);
  assert.equal(audit.executionsPerWorld, 2);
  assert.deepEqual(audit.canonicalAnchorIds, ["standard", "compact", "deep"]);
  assert.deepEqual(AUTONOMOUS_CANONICAL_ANCHORS, [
    {
      id: "standard",
      screenAnchor: { x: 1.27, y: -0.96 },
      handlerWaitingPoint: { x: 0.27, y: -0.6 },
      useGate: { x: 2.03, y: -1.86 },
      rejectGate: { x: -1.17, y: -1.76 },
    },
    {
      id: "compact",
      screenAnchor: { x: 1.12, y: -0.88 },
      handlerWaitingPoint: { x: 0.22, y: -0.56 },
      useGate: { x: 1.86, y: -1.74 },
      rejectGate: { x: -1.1, y: -1.68 },
    },
    {
      id: "deep",
      screenAnchor: { x: 1.42, y: -1.06 },
      handlerWaitingPoint: { x: 0.32, y: -0.66 },
      useGate: { x: 2.18, y: -1.98 },
      rejectGate: { x: -1.24, y: -1.86 },
    },
  ]);
  assert.equal(audit.formedWorlds, 22);
  assert.equal(audit.timeoutWorlds, 2);
  assert.equal(audit.safeExitWorlds, 2);
  assert.equal(audit.firstFailure, null);
  assert.equal(audit.deterministic, true);
  assert.equal(audit.evaluationOrderStable, true);
  assert.equal(audit.mirrored, true);
  assert.equal(audit.routeSegmentsMonotonic, true);
  assert.equal(audit.informationBoundaryPassed, true);
  assert.equal(audit.publicCausalityPassed, true);
  assert.equal(audit.zeroStrategyAdjustment, true);
  assert.equal(audit.passed, true);

  for (const row of audit.rows) {
    assert.deepEqual(row.failures, [], row.id);
    assert.ok(row.mirrorMaximumError <= 1e-9, row.id);
    assert.equal(row.choiceStable, true, row.id);
    assert.equal(row.safeExitReal, true, row.id);
    if (row.resolution === "formation_aborted") {
      assert.equal(row.id, "A01-X01");
      assert.equal(row.selectedSide, null);
      assert.equal(row.selectedAnchorId, null);
      assert.equal(row.publicCommitTick, null);
      assert.equal(row.resolvedTick, 1);
    } else {
      assert.notEqual(row.selectedSide, null, row.id);
      assert.ok(audit.canonicalAnchorIds.includes(row.selectedAnchorId), row.id);
      assert.equal(
        row.mirroredSelectedSide,
        row.selectedSide === "right" ? "left" : "right",
        row.id,
      );
      assert.equal(row.mirroredSelectedAnchorId, row.selectedAnchorId, row.id);
      assert.ok((row.publicCommitTick ?? 0) > 0, row.id);
      if (row.resolution === "formation_timeout") {
        assert.equal(row.id, "A01-F01-08");
        assert.equal(row.resolvedTick, 192);
        assert.equal(row.screenSetTick, null);
        assert.equal(row.jointReadyTick, null);
      } else {
        assert.ok((row.screenSetTick ?? 0) >= row.publicCommitTick, row.id);
        assert.ok((row.jointReadyTick ?? 0) >= row.screenSetTick, row.id);
      }
    }
  }
});

test("A01 derives four representative replays only from completed audit facts", () => {
  const audit = scanA01AutonomousSetups();
  assert.deepEqual(
    audit.replays.map((replay) => replay.id),
    ["longest-formed", "tightest-corridor", "diverse-mirror", "safe-exit"],
  );
  assert.equal(new Set(audit.replays.map((replay) => replay.inputId)).size, 4);

  for (const replay of audit.replays) {
    const config = makeA01RepresentativeReplayConfig(replay);
    assert.equal(config.setupMode, "auto");
    assert.equal(config.startMode, "form_pnr");
    assert.equal(Object.hasOwn(config, "screenSide"), false);
    assert.equal(Object.hasOwn(config, "formationLandmarkOffsets"), false);
    const simulation = createA01AutonomousReplay(replay.inputId, replay.mirrored);
    if (replay.resolution === "formation_aborted") {
      assert.equal(simulation.offensePlan.id, "ABORT_FORMATION");
      assert.equal(simulation.offensePlan.autonomousSetup, undefined);
    } else {
      assert.equal(simulation.offensePlan.autonomousSetup?.side, replay.side);
      assert.equal(simulation.offensePlan.autonomousSetup?.anchorId, replay.anchorId);
    }
    for (
      let tick = 0;
      tick <= Math.ceil(3.35 / FIXED_DT) &&
        simulation.world.formation.phase !== "pnr" &&
        !simulation.world.terminal;
      tick += 1
    ) {
      simulation.step();
    }
    const resolution = simulation.world.terminal?.reason === "formation_aborted"
      ? "formation_aborted"
      : simulation.world.terminal?.reason === "formation_timeout"
        ? "formation_timeout"
        : "formation_ready";
    assert.equal(resolution, replay.resolution, replay.id);
  }
});

test("A01 deep-copies auto inputs and keeps the private anchor outside defense observations", () => {
  const replay = scanA01AutonomousSetups().replays.find(
    (candidate) => candidate.resolution === "formation_ready",
  );
  assert.ok(replay);
  const config = makeA01RepresentativeReplayConfig(replay);
  const simulation = new PnrSimulation(config);
  const originalO1 = { ...simulation.world.players.O1.pos };
  const privateAnchor = simulation.offensePlan.autonomousSetup?.landmarks.screenAnchor;
  assert.ok(privateAnchor);

  config.initialPositions.O1.x += 0.5;
  config.initialPositions.O5.y -= 0.5;
  assert.deepEqual(simulation.world.players.O1.pos, originalO1);
  const defenseObservation = createPlannerObservation(simulation.world, "defense");
  assert.equal(defenseObservation.screenSide, null);
  assert.deepEqual(Object.keys(defenseObservation.landmarks), ["screenAnchor"]);
  assert.deepEqual(
    defenseObservation.landmarks.screenAnchor,
    simulation.world.players.O5.pos,
  );
  assert.notDeepEqual(defenseObservation.landmarks.screenAnchor, privateAnchor);
});

test("F00 post-clear recovery does not rely on sustained D1-O5 collision suppression", () => {
  const simulation = createF00Replay("right");
  let maximumNearZeroSeconds = 0;
  let currentNearZeroSeconds = 0;
  while (!simulation.world.terminal && simulation.world.tick < 720) {
    simulation.step();
    if (!simulation.world.facts.ballHandlerClearedScreen) continue;
    const d1 = simulation.world.players.D1;
    const o5 = simulation.world.players.O5;
    const bodyGap = Math.hypot(d1.pos.x - o5.pos.x, d1.pos.y - o5.pos.y) -
      d1.radius - o5.radius;
    currentNearZeroSeconds = bodyGap <= 0.025
      ? currentNearZeroSeconds + FIXED_DT
      : 0;
    maximumNearZeroSeconds = Math.max(maximumNearZeroSeconds, currentNearZeroSeconds);
  }

  assert.ok(
    maximumNearZeroSeconds <= UNDER_MAX_COLLISION_SUPPRESSION_SECONDS + 1e-9,
  );
  assert.ok(
    (simulation.world.under.d1O5CollisionSuppressedSeconds ?? 0) <=
      UNDER_MAX_COLLISION_SUPPRESSION_SECONDS + 1e-9,
  );
  assert.ok(
    UNDER_R2_AUDIT.f00.maximumMatchupInversionSeconds <=
      UNDER_MAX_MATCHUP_INVERSION_AUDIT_SECONDS + 1e-9,
  );
  assert.equal(simulation.world.facts.matchupExchange, false);
  assert.equal(simulation.eventLog.some((event) => event.type === "switch_completed"), false);
  if (simulation.world.terminal?.reason === "under_contained") {
    assert.equal(simulation.world.under.d1Recovered, true);
  }
});
