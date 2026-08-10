// G01-G08 generalization and held-out audit tests.

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  COURT,
  FIXED_DT,
  PLAYER_IDS,
  PnrSimulation,
  createPlannerObservation,
  mirrorPointAcrossCenterline,
  validateInitialPlayerPositions,
} from "../lib/pnr-core.ts";
import {
  DEFAULT_SCENARIO_ID,
  PNR_SCENARIOS,
  makeInitialPositionsForCue,
  makeScenarioConfig,
} from "../lib/pnr-scenarios.ts";
import {
  G01_BASE_CONFIG,
  G01_SPEEDS,
  createG01Replay,
  makeG01Config,
  scanG01SpeedBoundary,
} from "../lib/pnr-generalization.ts";
import {
  G02_BASE_CONFIG,
  G02_DELAYS,
  createG02Replay,
  makeG02Config,
  scanG02FrontReactionBoundary,
} from "../lib/pnr-g02-generalization.ts";
import {
  G03_BASE_CONFIG,
  G03_DELAYS,
  createG03Replay,
  makeG03Config,
  scanG03PostCatchRecoveryBoundary,
} from "../lib/pnr-g03-generalization.ts";
import {
  G05_CANDIDATES,
  createG05Replay,
  makeG05Config,
  scanG05SpatialBoundary,
} from "../lib/pnr-g05-spatial-generalization.ts";
import {
  G06_MATRIX_A_FRONT_DELAYS,
  G06_MATRIX_A_SPEEDS,
  G06_MATRIX_B_RECOVERY_DELAYS,
  G06_POSITION_IDS,
  G06_SPECS,
  makeG06Config,
  scanG06Combinations,
} from "../lib/pnr-g06-combinations.ts";
import {
  G07_REPLAY_PAIRS,
  G07_SPECS,
  makeG07Config,
  scanG07Mirrors,
} from "../lib/pnr-g07-mirroring.ts";
import {
  G08_COMMON_HORIZON,
  G08_COMMON_MAX_TIME,
  G08_FROZEN_CORE_COMMIT,
  G08_HELDOUT_MANIFEST,
  G08_INPUT_DOMAIN,
  G08_MANIFEST_GENERATION,
  G08_MANIFEST_HASH,
  G08_MANIFEST_SEED,
  G08_SIMULATION_SEED,
  canonicalG08ManifestJson,
  findG08ProhibitedOutputFields,
  isG08ValueOnPriorGrid,
} from "../lib/pnr-g08-heldout-manifest.ts";
import {
  G08_MANIFEST_COMMIT,
  createG08Replay,
  scanG08Heldout,
} from "../lib/pnr-g08-heldout-audit.ts";

import {
  makeTestConfig,
} from "./helpers/pnr-test-harness.mjs";

function behaviorFrame(simulation, newPlanning) {
  return {
    tick: simulation.world.tick,
    time: simulation.world.time,
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
    offensePlan: simulation.offensePlan,
    defensePlan: simulation.defensePlan,
    roles: simulation.getRoles(),
    events: simulation.eventLog.filter((event) => event.tick === simulation.world.tick),
    planning: newPlanning.map((record) => ({
      tick: record.tick,
      at: record.at,
      team: record.team,
      trigger: record.trigger,
      triggerEventIds: record.triggerEventIds,
      chosen: record.chosen,
      chosenLabel: record.chosenLabel,
      candidates: record.candidates.map((candidate) => ({
        id: candidate.id,
        label: candidate.label,
        feasible: candidate.feasible,
        score: candidate.score,
        vetoes: candidate.vetoes,
        evidence: candidate.evidence,
      })),
      observationBoundary: record.observationBoundary,
    })),
    terminal: simulation.world.terminal,
  };
}

function behaviorTrace(config) {
  const simulation = new PnrSimulation(config);
  const trace = [behaviorFrame(simulation, [...simulation.planningLog])];
  for (let index = 0; index < 600 && !simulation.world.terminal; index += 1) {
    const planningStart = simulation.planningLog.length;
    simulation.step();
    trace.push(behaviorFrame(simulation, simulation.planningLog.slice(planningStart)));
  }
  return trace;
}

function behaviorDigest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

test("G08 locks 24 input-only held-out cases before any world is run", () => {
  const expectedIds = [
    ...Array.from({ length: 12 }, (_, index) => `G08-R${String(index + 1).padStart(2, "0")}`),
    ...Array.from({ length: 12 }, (_, index) => `G08-L${String(index + 1).padStart(2, "0")}`),
  ];
  const inRange = (value, range) => value >= range[0] && value <= range[1];
  const threeDecimals = (value) => Math.abs(value * 1000 - Math.round(value * 1000)) <= 1e-9;

  assert.equal(G08_FROZEN_CORE_COMMIT, "d92ed9f63bba3dcfa28d65d54b6a47c7e3e1f74c");
  assert.equal(G08_MANIFEST_SEED, 20260808);
  assert.equal(G08_SIMULATION_SEED, 17);
  assert.equal(G08_COMMON_HORIZON, "post_catch_resolution");
  assert.equal(G08_COMMON_MAX_TIME, 7.4);
  assert.deepEqual(G08_MANIFEST_GENERATION, {
    generator: "mulberry32-v1",
    candidateCount: 24,
    geometryRejectedCount: 0,
    duplicateRejectedCount: 0,
    acceptedCount: 24,
    rightCount: 12,
    leftCount: 12,
  });
  assert.equal(G08_HELDOUT_MANIFEST.length, 24);
  assert.deepEqual(G08_HELDOUT_MANIFEST.map((item) => item.id), expectedIds);
  assert.equal(new Set(G08_HELDOUT_MANIFEST.map((item) => item.id)).size, 24);
  assert.equal(
    new Set(G08_HELDOUT_MANIFEST.map((item) => JSON.stringify(item.input))).size,
    24,
  );
  assert.deepEqual(findG08ProhibitedOutputFields(G08_HELDOUT_MANIFEST), []);
  assert.equal(
    `sha256:${createHash("sha256").update(canonicalG08ManifestJson()).digest("hex")}`,
    G08_MANIFEST_HASH,
  );

  for (const item of G08_HELDOUT_MANIFEST) {
    assert.deepEqual(Object.keys(item).sort(), ["id", "input", "side", "source"]);
    assert.deepEqual(Object.keys(item.source).sort(), [
      "candidateIndex",
      "generator",
      "offsets",
      "tacticalFrame",
    ]);
    assert.deepEqual(Object.keys(item.input).sort(), [
      "d1FrontReactionDelay",
      "d1PostCatchRecoveryDelay",
      "horizon",
      "initialPositions",
      "maxTime",
      "o1MaxSpeed",
      "screenSide",
      "seed",
    ]);
    assert.equal(item.side, item.input.screenSide);
    assert.equal(item.input.seed, G08_SIMULATION_SEED);
    assert.equal(item.input.maxTime, G08_COMMON_MAX_TIME);
    assert.equal(item.input.horizon, G08_COMMON_HORIZON);
    assert.deepEqual(validateInitialPlayerPositions(item.input.initialPositions), item.input.initialPositions);
    assert.equal(inRange(item.input.o1MaxSpeed, G08_INPUT_DOMAIN.o1MaxSpeed), true);
    assert.equal(
      inRange(item.input.d1FrontReactionDelay, G08_INPUT_DOMAIN.d1FrontReactionDelay),
      true,
    );
    assert.equal(
      inRange(item.input.d1PostCatchRecoveryDelay, G08_INPUT_DOMAIN.d1PostCatchRecoveryDelay),
      true,
    );
    assert.equal(isG08ValueOnPriorGrid("speed", item.input.o1MaxSpeed), false);
    assert.equal(isG08ValueOnPriorGrid("front", item.input.d1FrontReactionDelay), false);
    assert.equal(isG08ValueOnPriorGrid("recovery", item.input.d1PostCatchRecoveryDelay), false);

    const offsets = item.source.offsets;
    assert.equal(inRange(offsets.formation.x, G08_INPUT_DOMAIN.formationTranslationX), true);
    assert.equal(inRange(offsets.formation.y, G08_INPUT_DOMAIN.formationTranslationY), true);
    assert.equal(inRange(offsets.O5.x, G08_INPUT_DOMAIN.o5RelativeX), true);
    assert.equal(inRange(offsets.O5.y, G08_INPUT_DOMAIN.o5RelativeY), true);
    assert.equal(inRange(offsets.D1.x, G08_INPUT_DOMAIN.d1RelativeX), true);
    assert.equal(inRange(offsets.D1.y, G08_INPUT_DOMAIN.d1RelativeY), true);
    assert.equal(inRange(offsets.D5.x, G08_INPUT_DOMAIN.d5RelativeX), true);
    assert.equal(inRange(offsets.D5.y, G08_INPUT_DOMAIN.d5RelativeY), true);
    assert.ok(
      [
        offsets.formation.x,
        offsets.formation.y,
        offsets.O5.x,
        offsets.O5.y,
        offsets.D1.x,
        offsets.D1.y,
        offsets.D5.x,
        offsets.D5.y,
      ].filter((value) => value !== 0).length >= 2,
    );
    for (const point of Object.values(item.input.initialPositions)) {
      assert.equal(threeDecimals(point.x), true);
      assert.equal(threeDecimals(point.y), true);
    }
    assert.equal(threeDecimals(item.input.o1MaxSpeed), true);
    assert.equal(threeDecimals(item.input.d1FrontReactionDelay), true);
    assert.equal(threeDecimals(item.input.d1PostCatchRecoveryDelay), true);
    assert.equal(Object.isFrozen(item), true);
    assert.equal(Object.isFrozen(item.input), true);
    assert.equal(Object.isFrozen(item.input.initialPositions), true);
  }

  const tacticalFingerprint = (item) => JSON.stringify({
    positions: Object.fromEntries(
      PLAYER_IDS.map((id) => {
        const point = item.input.initialPositions[id];
        const tactical = item.side === "right" ? point : mirrorPointAcrossCenterline(point);
        return [id, { x: Number(tactical.x.toFixed(3)), y: Number(tactical.y.toFixed(3)) }];
      }),
    ),
    speed: item.input.o1MaxSpeed,
    front: item.input.d1FrontReactionDelay,
    recovery: item.input.d1PostCatchRecoveryDelay,
  });
  const rightFingerprints = new Set(
    G08_HELDOUT_MANIFEST.filter((item) => item.side === "right").map(tacticalFingerprint),
  );
  assert.equal(
    G08_HELDOUT_MANIFEST.filter((item) => item.side === "left").some((item) =>
      rightFingerprints.has(tacticalFingerprint(item))),
    false,
  );

  const source = readFileSync(
    new URL("../lib/pnr-g08-heldout-manifest.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /new\s+PnrSimulation|evaluateOffenseCandidates|evaluateDefenseCandidates|scanG0[1-7]/);
});

test("G04 requires explicit legal initial positions, deep-copies them, and hashes the real first frame", () => {
  const externalPositions = makeInitialPositionsForCue("neutral");
  const externalConfig = makeTestConfig("neutral", { initialPositions: externalPositions });
  const simulation = new PnrSimulation(externalConfig);
  const expectedPositions = structuredClone(externalPositions);

  assert.deepEqual(
    Object.fromEntries(PLAYER_IDS.map((id) => [id, simulation.world.players[id].pos])),
    expectedPositions,
  );
  assert.equal(simulation.world.ballOwner, "O1");
  assert.deepEqual(simulation.world.ball.pos, expectedPositions.O1);
  assert.equal(simulation.world.ball.inFlight, false);

  externalPositions.O1.x += 0.24;
  externalPositions.D1.y -= 0.24;
  assert.deepEqual(simulation.config.initialPositions, expectedPositions);
  assert.deepEqual(simulation.world.players.O1.pos, expectedPositions.O1);
  assert.deepEqual(simulation.world.players.D1.pos, expectedPositions.D1);

  const shiftedPositions = makeInitialPositionsForCue("neutral");
  shiftedPositions.O1.x += 0.12;
  const shifted = new PnrSimulation(
    makeTestConfig("neutral", { initialPositions: shiftedPositions }),
  );
  assert.equal(shifted.world.players.O1.pos.x, expectedPositions.O1.x + 0.12);
  assert.deepEqual(shifted.world.ball.pos, shifted.world.players.O1.pos);
  assert.notEqual(shifted.world.stateHash, simulation.world.stateHash);

  const firstScenarioConfig = makeScenarioConfig(DEFAULT_SCENARIO_ID);
  const secondScenarioConfig = makeScenarioConfig(DEFAULT_SCENARIO_ID);
  firstScenarioConfig.initialPositions.O5.x -= 0.12;
  assert.notDeepEqual(firstScenarioConfig.initialPositions, secondScenarioConfig.initialPositions);
  assert.deepEqual(
    secondScenarioConfig.initialPositions,
    makeInitialPositionsForCue("neutral"),
  );

  assert.throws(
    () => new PnrSimulation({ ...makeTestConfig("neutral"), initialPositions: undefined }),
    /initialPositions must be an object/,
  );

  const missingPlayer = makeInitialPositionsForCue("neutral");
  delete missingPlayer.D5;
  assert.throws(
    () => new PnrSimulation(makeTestConfig("neutral", { initialPositions: missingPlayer })),
    /initialPositions\.D5 is required/,
  );

  const nonFinite = makeInitialPositionsForCue("neutral");
  nonFinite.O1.x = Number.NaN;
  assert.throws(
    () => new PnrSimulation(makeTestConfig("neutral", { initialPositions: nonFinite })),
    /initialPositions\.O1\.x and \.y must be finite numbers/,
  );

  const outsideCourt = makeInitialPositionsForCue("neutral");
  outsideCourt.O5.x = 0.2;
  assert.throws(
    () => new PnrSimulation(makeTestConfig("neutral", { initialPositions: outsideCourt })),
    /initialPositions\.O5 .* outside the court/,
  );

  const overlapping = makeInitialPositionsForCue("neutral");
  overlapping.D1 = { ...overlapping.O1 };
  assert.throws(
    () => new PnrSimulation(makeTestConfig("neutral", { initialPositions: overlapping })),
    /initialPositions O1\/D1 overlap/,
  );
});

test("G04 removes cue/scenario position branches from the core and planner runtime", () => {
  const coreSource = readFileSync(new URL("../lib/pnr-core.ts", import.meta.url), "utf8");
  assert.equal(/\bcue\b/.test(coreSource), false);
  assert.equal(/\bscenarioId\b/.test(coreSource), false);

  for (const scenario of PNR_SCENARIOS) {
    const config = makeScenarioConfig(scenario.id);
    const simulation = new PnrSimulation(config);
    const offenseObservation = createPlannerObservation(simulation.world, "offense", []);
    const defenseObservation = createPlannerObservation(simulation.world, "defense", []);
    assert.equal(Object.hasOwn(simulation.config, "cue"), false);
    assert.equal(Object.hasOwn(offenseObservation, "cue"), false);
    assert.equal(Object.hasOwn(defenseObservation, "cue"), false);
    assert.equal(Object.hasOwn(offenseObservation, "initialPositions"), false);
    assert.equal(Object.hasOwn(defenseObservation, "initialPositions"), false);
    assert.deepEqual(
      Object.fromEntries(PLAYER_IDS.map((id) => [id, simulation.world.players[id].pos])),
      config.initialPositions,
    );
  }
});

test("G04 explicit-position refactor preserves every approved S/G behavior trajectory", () => {
  const scenarioDigests = Object.fromEntries(
    PNR_SCENARIOS.map((scenario) => [
      scenario.code,
      behaviorDigest(behaviorTrace(makeScenarioConfig(scenario.id))),
    ]),
  );
  assert.deepEqual(scenarioDigests, {
    S01: "f8eec9e79bddfc1aeb0b13240005a6e5c4f6c7e50f465ef4ca5651042cacf4b7",
    S02: "a523ad5d29716711d08cb94544e34f6b8ed0daaf0c4e90726a228c62bd306f03",
    S03: "57c93b3be2c5ea9c5619574e1a19c919aab5cd07ae52fdd6f6f9a6fb81618135",
    S04: "7eabadc212fcfe42c480faf6446693b6616a62cef7147414fde47e208a074440",
    S05: "dd40668118d4c68e33f84edd13c37bebbac3cf54806619114aa79b5fdc934ba0",
    S06: "d3f02c807203c4a4ab656829f84241c961e9c9933bb442e25e926e455e21fb13",
    S07: "8e7f857e1563237469ed5e0a75c369d531c4e2fa3c3f90e96804f36c5fc91413",
    S08: "0f27369978dd535ad3732a51fcf5643255735712fd28463a5542e2c568fc2051",
  });

  assert.equal(
    behaviorDigest(G01_SPEEDS.map((speed) => [speed, behaviorTrace(makeG01Config(speed))])),
    "d21aa0e983c06bc8aaa3789ba10206fab18d3263b7f698a3752c6197573463b5",
  );
  assert.equal(
    behaviorDigest(G02_DELAYS.map((delay) => [delay, behaviorTrace(makeG02Config(delay))])),
    "547b0f577c7ca9b3b2a720c2f94fd3589187d03d4361f4bbb1d6ba7bf35cfde7",
  );
  assert.equal(
    behaviorDigest(G03_DELAYS.map((delay) => [delay, behaviorTrace(makeG03Config(delay))])),
    "a3074ad10bfed7ede85aec0836bd6c44d7b765ce62fdfaf29ec3250716b0c97a",
  );
});

test("G05 audits 33 candidates as 31 deterministic simulations plus two expected G04 rejections", () => {
  const audit = scanG05SpatialBoundary();

  assert.equal(G05_CANDIDATES.length, 33);
  assert.equal(new Set(G05_CANDIDATES.map((sample) => sample.id)).size, 33);
  assert.equal(audit.candidateCount, 33);
  assert.equal(audit.simulatedCount, 31);
  assert.equal(audit.expectedRejectedCount, 2);
  assert.equal(audit.rows.length, 33);
  assert.deepEqual(
    audit.rejectedRows.map(({ id, status, error }) => ({ id, status, error })),
    [
      {
        id: "O1.y/-0.24",
        status: "EXPECTED_INVALID_INITIAL_OVERLAP",
        error: "initialPositions O1/D1 overlap: 0.599m < 0.68m",
      },
      {
        id: "D1.y/+0.24",
        status: "EXPECTED_INVALID_INITIAL_OVERLAP",
        error: "initialPositions O1/D1 overlap: 0.599m < 0.68m",
      },
    ],
  );
  assert.throws(
    () => createG05Replay("O1.y/-0.24"),
    /initialPositions O1\/D1 overlap: 0\.599m < 0\.68m/,
  );
  assert.throws(
    () => createG05Replay("D1.y/+0.24"),
    /initialPositions O1\/D1 overlap: 0\.599m < 0\.68m/,
  );

  assert.equal(audit.deterministic, true);
  assert.equal(audit.invariantsPassed, true);
  assert.equal(audit.monotonic, true);
  assert.equal(audit.passed, true);
  assert.deepEqual(audit.axisFailures, []);
  assert.deepEqual(audit.failureReasons, []);
  assert.equal(audit.simulatedRows.every((row) => row.initialApplied), true);
  assert.equal(audit.simulatedRows.every((row) => row.deterministic), true);
  assert.equal(audit.simulatedRows.every((row) => row.invariantFailures.length === 0), true);
  assert.equal(audit.simulatedRows.every((row) => row.watchdogReplans === 0), true);
  assert.deepEqual(
    audit.replays.map(({ id, sampleId }) => ({ id, sampleId })),
    [
      { id: "baseline", sampleId: "baseline" },
      { id: "screen-shift", sampleId: "O5.x/-0.24" },
      { id: "d1-impact", sampleId: "D1.x/+0.24" },
    ],
  );
});

test("G06 audits 12 switch/front combinations and 9 post-catch combinations without causal leakage", () => {
  const audit = scanG06Combinations();

  assert.deepEqual(G06_MATRIX_A_SPEEDS, [3.98, 4]);
  assert.deepEqual(G06_MATRIX_A_FRONT_DELAYS, [0.01, 0.02]);
  assert.deepEqual(G06_MATRIX_B_RECOVERY_DELAYS, [0.18, 0.21, 0.36]);
  assert.deepEqual(G06_POSITION_IDS, ["baseline", "O5.x/-0.24", "D1.x/+0.24"]);
  assert.equal(G06_SPECS.length, 21);
  assert.equal(new Set(G06_SPECS.map((spec) => spec.id)).size, 21);
  assert.equal(audit.matrixA.length, 12);
  assert.equal(audit.matrixB.length, 9);
  assert.equal(audit.sampleCount, 21);
  assert.equal(audit.deterministic, true);
  assert.equal(audit.invariantsPassed, true);
  assert.equal(audit.stageCausalityPassed, true);
  assert.equal(audit.attackNoLobPassed, true);
  assert.equal(audit.explainable, true);
  assert.equal(audit.passed, true);
  assert.deepEqual(audit.failureReasons, []);

  assert.equal(audit.rows.every((row) => row.deterministic), true);
  assert.equal(audit.rows.every((row) => row.explainable), true);
  assert.equal(audit.rows.every((row) => row.invariantFailures.length === 0), true);
  assert.equal(
    audit.rows.every(
      (row) =>
        row.publicInput.seed === 17 &&
        row.publicInput.screenSide === "right" &&
        row.publicInput.o1MaxSpeed === row.o1MaxSpeed &&
        row.publicInput.d1FrontReactionDelay === row.d1FrontReactionDelay &&
        row.publicInput.d1PostCatchRecoveryDelay === row.d1PostCatchRecoveryDelay &&
        row.publicInput.horizon === row.horizon &&
        PLAYER_IDS.every(
          (id) =>
            row.publicInput.initialPositions[id].x === row.initialPositions[id].x &&
            row.publicInput.initialPositions[id].y === row.initialPositions[id].y,
        ),
    ),
    true,
  );
  assert.equal(audit.rows.every((row) => row.minimumBodyGap >= -0.01), true);
  assert.equal(
    audit.matrixA
      .filter((row) => row.firstMismatchOffense === "ATTACK_BIG")
      .every((row) => !row.passLaunched && row.ballOwner === "O1"),
    true,
  );
  assert.ok(new Set(audit.rows.map((row) => row.terminalReason)).size >= 4);
  assert.equal(audit.replays.length, 3);
});

test("G07 tactical frame keeps every approved right-side G05/G06 trajectory unchanged", () => {
  const legalG05Candidates = G05_CANDIDATES.filter(
    ({ id }) => id !== "O1.y/-0.24" && id !== "D1.y/+0.24",
  );
  assert.equal(
    behaviorDigest(
      legalG05Candidates.map((candidate) => [
        candidate.id,
        behaviorTrace(makeG05Config(candidate.id)),
      ]),
    ),
    "c1e0280ccd72046cf2416c1ba445dc733c762ec2866852afc1e5e66a26c337fd",
  );
  assert.equal(
    behaviorDigest(G06_SPECS.map((spec) => [spec.id, behaviorTrace(makeG06Config(spec.id))])),
    "4fb1c36a9f27c5a4da56088e18059e8bd1d874c60d1272186ae36301bf5f61b0",
  );
  assert.equal(scanG05SpatialBoundary().passed, true);
  assert.equal(scanG06Combinations().passed, true);
  assert.equal(PNR_SCENARIOS.every((scenario) => scenario.publicInput.screenSide === "right"), true);
});

test("G07 runs real left worlds for all S01-S08 and G06 inputs with deterministic tick mirrors", () => {
  const audit = scanG07Mirrors();

  assert.equal(G07_SPECS.length, 29);
  assert.equal(new Set(G07_SPECS.map((spec) => spec.id)).size, 29);
  assert.equal(audit.pairCount, 29);
  assert.equal(audit.scenarioPairs.length, 8);
  assert.equal(audit.g06Pairs.length, 21);
  assert.equal(audit.deterministic, true);
  assert.equal(audit.mirrorPassed, true);
  assert.equal(audit.invariantsPassed, true);
  assert.equal(audit.informationBoundaryPassed, true);
  assert.equal(audit.passed, true);
  assert.deepEqual(audit.failureReasons, []);
  assert.ok(audit.maxMirrorError <= audit.tolerance);
  assert.ok(audit.maxMirrorError < 1e-12);
  assert.equal(
    audit.rows.every(
      (row) =>
        row.initialMirrorExact &&
        row.rightDeterministic &&
        row.leftDeterministic &&
        row.worldMirrorPassed &&
        row.plansAndRolesEquivalent &&
        row.candidatesEquivalent &&
        row.eventsEquivalent &&
        row.factsEquivalent &&
        row.terminalEquivalent &&
        row.rightInvariantFailures.length === 0 &&
        row.leftInvariantFailures.length === 0,
    ),
    true,
  );
  assert.deepEqual(
    G07_REPLAY_PAIRS.map(({ id, specId }) => ({ id, specId })),
    [
      { id: "switch", specId: "scenario/S03" },
      { id: "reject-slip", specId: "scenario/S08" },
      { id: "post-kickout", specId: "scenario/S05" },
    ],
  );

  const left = new PnrSimulation(makeG07Config("scenario/S03", "left"));
  assert.equal(left.world.screenSide, "left");
  assert.equal(left.config.screenSide, "left");
  assert.equal(createPlannerObservation(left.world, "offense").screenSide, "left");
  assert.throws(
    () => new PnrSimulation({ ...makeG07Config("scenario/S03", "right"), screenSide: undefined }),
    /screenSide must be "right" or "left"/,
  );
});

test("G08 keeps the locked held-out manifest and approved result checkpoint", () => {
  assert.doesNotMatch(
    readFileSync(new URL("../lib/pnr-core.ts", import.meta.url), "utf8"),
    /G08-[RL]\d|heldout/i,
  );

  const audit = scanG08Heldout();
  assert.equal(audit.frozenCoreCommit, G08_FROZEN_CORE_COMMIT);
  assert.equal(audit.manifestCommit, G08_MANIFEST_COMMIT);
  assert.equal(audit.manifestHash, G08_MANIFEST_HASH);
  assert.equal(audit.manifestCount, 24);
  assert.equal(audit.executedCount, 24);
  assert.equal(audit.rows.length, 24);
  assert.equal(audit.rightSummary.count, 12);
  assert.equal(audit.leftSummary.count, 12);
  assert.equal(audit.deterministic, true);
  assert.equal(audit.informationBoundaryPassed, true);
  assert.equal(audit.invariantsPassed, true);
  assert.equal(audit.explainable, true);
  assert.equal(audit.passed, true);
  assert.deepEqual(audit.failedCaseIds, []);
  assert.deepEqual(audit.failureReasons, []);
  assert.equal(audit.rightSummary.maxReplayNumericError, 0);
  assert.equal(audit.leftSummary.maxReplayNumericError, 0);
  assert.ok(audit.rightSummary.minimumBodyGap >= -0.01);
  assert.ok(audit.leftSummary.minimumBodyGap >= -0.01);
  assert.deepEqual(audit.terminalCounts, {
    post_catch_kickout_caught: 16,
    mismatch_advantage: 3,
    switch_contained: 1,
    post_catch_finish_window: 4,
  });
  assert.deepEqual(audit.outcomeCounts, {
    "defensive-stop": 1,
    "handler-advantage": 3,
    "interior-window": 4,
    "kickout-catch": 16,
  });
  assert.equal(audit.rows.filter((row) => row.defenseContained).length, 0);
  assert.equal(
    audit.rows.every(
      (row) =>
        row.manifestHash === G08_MANIFEST_HASH &&
        row.deterministic &&
        row.earliestDivergenceTick === null &&
        row.maxReplayNumericError === 0 &&
        row.informationBoundaryPassed &&
        row.explainable &&
        row.invariantFailures.length === 0 &&
        row.minimumBodyGap >= -0.01 &&
        row.passLaunches === row.passResolutions &&
        row.touches.every((touch) => touch.local) &&
        row.planning.length === row.offenseReplans + row.defenseReplans &&
        row.watchdogReplans === 0 &&
        row.minimumCommitmentSeconds > 0,
    ),
    true,
  );
  assert.deepEqual(
    audit.replays.map(({ id, manifestId }) => ({ id, manifestId })),
    [
      { id: "closest-boundary", manifestId: "G08-L08" },
      { id: "largest-displacement", manifestId: "G08-L09" },
      { id: "longest-run", manifestId: "G08-R12" },
      { id: "diverse-fourth", manifestId: "G08-R08" },
    ],
  );

  for (const replay of audit.replays) {
    const simulation = createG08Replay(replay.manifestId);
    const manifest = G08_HELDOUT_MANIFEST.find((item) => item.id === replay.manifestId);
    assert.ok(manifest);
    assert.equal(simulation.world.screenSide, manifest.side);
    assert.deepEqual(
      Object.fromEntries(PLAYER_IDS.map((id) => [id, simulation.world.players[id].pos])),
      manifest.input.initialPositions,
    );
  }
});

test("G01 scans 19 speed-only samples twice and finds one deterministic decision boundary", () => {
  const audit = scanG01SpeedBoundary();

  assert.deepEqual(
    G01_SPEEDS,
    Array.from({ length: 19 }, (_, index) => Number((3.72 + index * 0.02).toFixed(2))),
  );
  assert.equal(audit.rows.length, 19);
  assert.equal(audit.deterministic, true);
  assert.equal(audit.monotonic, true);
  assert.equal(audit.passed, true);
  assert.equal(audit.failureIntervals.length, 0);
  assert.deepEqual(audit.transitions, [
    {
      fromSpeed: 3.98,
      fromPlan: "FEED_SEAL",
      toSpeed: 4,
      toPlan: "ATTACK_BIG",
    },
  ]);
  assert.equal(audit.lastFeedSpeed, 3.98);
  assert.equal(audit.firstAttackSpeed, 4);
  assert.deepEqual(
    audit.replays.map(({ id, speed, chosen }) => ({ id, speed, chosen })),
    [
      { id: "stable-high", speed: 4.08, chosen: "ATTACK_BIG" },
      { id: "last-feed", speed: 3.98, chosen: "FEED_SEAL" },
      { id: "first-attack", speed: 4, chosen: "ATTACK_BIG" },
    ],
  );

  const expectedChoices = [
    ...Array.from({ length: 14 }, () => "FEED_SEAL"),
    ...Array.from({ length: 5 }, () => "ATTACK_BIG"),
  ];
  assert.deepEqual(audit.rows.map((row) => row.chosen), expectedChoices);
  for (const row of audit.rows) {
    assert.equal(row.deterministic, true);
    assert.equal(row.decisionTick, 145);
    assert.ok(row.decisionTick > row.switchTick);
    assert.equal(row.attack.feasible, true);
    assert.equal(row.feed.feasible, true);
    assert.deepEqual(row.attack.vetoes, []);
    assert.deepEqual(row.feed.vetoes, []);
    assert.ok(row.attack.score !== null);
    assert.ok(row.feed.score !== null);
    assert.equal(row.chosen, row.attack.score > row.feed.score ? "ATTACK_BIG" : "FEED_SEAL");
  }

  const fixedInputs = G01_SPEEDS.map((speed) => {
    const { o1MaxSpeed, ...fixed } = makeG01Config(speed);
    assert.equal(o1MaxSpeed, speed);
    return fixed;
  });
  for (const fixed of fixedInputs) {
    const { o1MaxSpeed, ...baseline } = G01_BASE_CONFIG;
    assert.equal(o1MaxSpeed, 3.72);
    assert.deepEqual(fixed, baseline);
  }
});

test("all G01 samples preserve the core world and causality invariants", () => {
  for (const speed of G01_SPEEDS) {
    const simulation = createG01Replay(speed);
    for (let index = 0; index < 600 && !simulation.world.terminal; index += 1) {
      const roles = simulation.getRoles();
      assert.equal(roles.length, 4);
      assert.deepEqual(
        [...new Set(roles.map((role) => role.playerId))].sort(),
        [...PLAYER_IDS].sort(),
      );

      simulation.step();
      assert.equal(
        simulation.world.time,
        Math.round(simulation.world.tick * FIXED_DT * 1e6) / 1e6,
      );
      assert.ok(simulation.world.lastStepMaxDisplacement <= 0.15);
      assert.equal(simulation.world.ball.inFlight, simulation.world.ballOwner === null);
      if (simulation.world.facts.impeded) {
        assert.ok(simulation.world.facts.contact || simulation.world.facts.routeExposure);
      }
      for (const id of PLAYER_IDS) {
        const player = simulation.world.players[id];
        assert.ok(player.pos.x >= player.radius - 1e-9);
        assert.ok(player.pos.x <= COURT.width - player.radius + 1e-9);
        assert.ok(player.pos.y >= player.radius - 1e-9);
        assert.ok(player.pos.y <= COURT.height - player.radius + 1e-9);
      }
    }

    const switchEvent = simulation.eventLog.find((event) => event.type === "switch_completed");
    const decision = simulation.planningLog.find(
      (record) =>
        record.team === "offense" &&
        switchEvent &&
        record.triggerEventIds.includes(switchEvent.id),
    );
    assert.ok(switchEvent);
    assert.ok(decision);
    assert.ok(decision.tick >= switchEvent.availableAtTick);

    const eventsById = new Map(simulation.eventLog.map((event) => [event.id, event]));
    for (const record of simulation.planningLog) {
      for (const id of record.triggerEventIds) {
        const event = eventsById.get(id);
        assert.ok(event);
        assert.ok(record.tick >= event.availableAtTick);
      }
    }
  }
});

test("G02 scans 17 reaction delays twice and finds one real-touch boundary", () => {
  const audit = scanG02FrontReactionBoundary();

  assert.deepEqual(
    G02_DELAYS,
    Array.from({ length: 17 }, (_, index) => Number((index * 0.01).toFixed(2))),
  );
  assert.equal(audit.rows.length, 17);
  assert.equal(audit.deterministic, true);
  assert.equal(audit.monotonic, true);
  assert.equal(audit.passed, true);
  assert.deepEqual(audit.failureIntervals, []);
  assert.deepEqual(audit.transitions, [
    {
      fromDelay: 0.01,
      fromOutcome: "D1_DEFLECTION",
      toDelay: 0.02,
      toOutcome: "O5_CATCH",
    },
  ]);
  assert.equal(audit.lastDeflectionDelay, 0.01);
  assert.equal(audit.firstCatchDelay, 0.02);
  assert.deepEqual(
    audit.replays.map(({ id, delay, outcome }) => ({ id, delay, outcome })),
    [
      { id: "last-deflection", delay: 0.01, outcome: "D1_DEFLECTION" },
      { id: "first-catch", delay: 0.02, outcome: "O5_CATCH" },
      { id: "stable-catch", delay: 0.12, outcome: "O5_CATCH" },
    ],
  );
  assert.deepEqual(
    audit.rows.map((row) => row.outcome),
    [
      "D1_DEFLECTION",
      "D1_DEFLECTION",
      ...Array.from({ length: 15 }, () => "O5_CATCH"),
    ],
  );

  for (const row of audit.rows) {
    const d1Wins = row.outcome === "D1_DEFLECTION";
    assert.equal(row.deterministic, true);
    assert.equal(row.sealTick, 179);
    assert.equal(row.decisionTick, 180);
    assert.equal(row.launchTick, 181);
    assert.equal(row.touchTick, d1Wins ? 191 : 192);
    assert.equal(row.frontEta, Number((0.189 + row.delay).toFixed(3)));
    assert.equal(row.entryFlightTime, 0.21);
    assert.equal(row.frontFeasible, d1Wins);
    assert.equal(row.front.feasible, d1Wins);
    assert.equal(row.backside.feasible, !d1Wins);
    assert.equal(row.chosen, d1Wins ? "FRONT_SEAL" : "BACKSIDE_CONTEST");
    assert.equal(row.actualFirstToucher, d1Wins ? "D1" : "O5");
    assert.equal(row.ballOutcome, d1Wins ? "deflected" : "caught");
    assert.equal(row.front.score, d1Wins ? 5.228 : null);
    assert.equal(row.backside.score, d1Wins ? null : 5.048);
    assert.equal(row.localTouch, true);
    assert.ok(row.touchDistance <= row.touchThreshold + 1e-9);
    assert.ok(row.flightSteps >= 10);
    assert.ok(row.flightDistance > 1.4);
    assert.ok(row.maxBallStep <= 9.2 * FIXED_DT + 0.007);
    assert.ok(row.launchTick < row.touchTick);
    if (d1Wins) {
      assert.deepEqual(row.front.vetoes, []);
      assert.ok(row.backside.vetoes.some((veto) => veto.includes("绕前窗口仍然充足")));
    } else {
      assert.deepEqual(row.backside.vetoes, []);
      assert.ok(row.front.vetoes.some((veto) => veto.includes("合法绕前 ETA")));
    }
  }

  for (const delay of G02_DELAYS) {
    const { d1FrontReactionDelay, ...fixed } = makeG02Config(delay);
    const { d1FrontReactionDelay: baselineDelay, ...baseline } = G02_BASE_CONFIG;
    assert.equal(d1FrontReactionDelay, delay);
    assert.equal(baselineDelay, 0);
    assert.deepEqual(fixed, baseline);
  }
});

test("G02 outcomes come from full local ball paths while core invariants stay legal", () => {
  for (const delay of G02_DELAYS) {
    const simulation = createG02Replay(delay);
    let sawFlight = false;
    let previousBall = { ...simulation.world.ball.pos };
    let maxBallStep = 0;

    for (let index = 0; index < 600 && !simulation.world.terminal; index += 1) {
      const roles = simulation.getRoles();
      assert.equal(roles.length, 4);
      assert.deepEqual(
        [...new Set(roles.map((role) => role.playerId))].sort(),
        [...PLAYER_IDS].sort(),
      );

      simulation.step();
      const ballStep = Math.hypot(
        simulation.world.ball.pos.x - previousBall.x,
        simulation.world.ball.pos.y - previousBall.y,
      );
      maxBallStep = Math.max(maxBallStep, ballStep);
      previousBall = { ...simulation.world.ball.pos };
      if (simulation.world.ball.inFlight) {
        sawFlight = true;
        assert.equal(simulation.world.ballOwner, null);
        assert.equal(simulation.world.ball.kind, "lob_entry");
      }
      assert.equal(
        simulation.world.time,
        Math.round(simulation.world.tick * FIXED_DT * 1e6) / 1e6,
      );
      assert.ok(simulation.world.lastStepMaxDisplacement <= 0.15);
      if (simulation.world.facts.impeded) {
        assert.ok(simulation.world.facts.contact || simulation.world.facts.routeExposure);
      }
      for (const id of PLAYER_IDS) {
        const player = simulation.world.players[id];
        assert.ok(player.pos.x >= player.radius - 1e-9);
        assert.ok(player.pos.x <= COURT.width - player.radius + 1e-9);
        assert.ok(player.pos.y >= player.radius - 1e-9);
        assert.ok(player.pos.y <= COURT.height - player.radius + 1e-9);
      }
    }

    const seal = simulation.eventLog.find((event) => event.type === "seal_established");
    const launch = simulation.eventLog.find((event) => event.type === "pass_launched");
    const touch = simulation.eventLog.find(
      (event) => event.type === "pass_caught" || event.type === "pass_denied",
    );
    const decision = simulation.planningLog.find(
      (record) => record.team === "defense" && seal && record.triggerEventIds.includes(seal.id),
    );
    assert.ok(seal);
    assert.ok(decision);
    assert.ok(launch);
    assert.ok(touch);
    assert.ok(decision.tick >= seal.availableAtTick);
    assert.ok(launch.tick > decision.tick);
    assert.ok(touch.tick > launch.tick);
    assert.equal(sawFlight, true);
    assert.ok(maxBallStep <= 9.2 * FIXED_DT + 0.007);

    const owner = simulation.world.ballOwner;
    assert.ok(owner === "D1" || owner === "O5");
    const toucher = simulation.world.players[owner];
    const localLimit =
      toucher.radius +
      simulation.world.ball.radius +
      (owner === "O5" ? 0.075 : 0.045) +
      1e-9;
    assert.ok(
      Math.hypot(
        simulation.world.ball.pos.x - toucher.pos.x,
        simulation.world.ball.pos.y - toucher.pos.y,
      ) <= localLimit,
    );
  }
});

test("G03 scans 21 post-catch recovery delays with one stable defense and outcome boundary", () => {
  const audit = scanG03PostCatchRecoveryBoundary();

  assert.deepEqual(
    G03_DELAYS,
    Array.from({ length: 21 }, (_, index) => Number((index * 0.03).toFixed(2))),
  );
  assert.equal(audit.rows.length, 21);
  assert.equal(audit.deterministic, true);
  assert.equal(audit.sharedCatchPrefix, true);
  assert.equal(audit.commonCatchTick, 192);
  assert.equal(audit.commonStopRule, "FIRST_FINISH_WINDOW_OR_KICKOUT_CAUGHT");
  assert.equal(audit.monotonic, true);
  assert.equal(audit.passed, true);
  assert.deepEqual(audit.failureIntervals, []);
  assert.deepEqual(audit.transitions, [
    {
      fromDelay: 0.18,
      fromPlan: "STAY_HOME_POST",
      toDelay: 0.21,
      toPlan: "DIG_POST",
    },
  ]);
  assert.equal(audit.lastStayDelay, 0.18);
  assert.equal(audit.firstDigDelay, 0.21);
  assert.deepEqual(audit.transitionBandDelays, []);
  assert.deepEqual(
    audit.replays.map(({ id, delay, phase, outcome }) => ({ id, delay, phase, outcome })),
    [
      {
        id: "last-stay",
        delay: 0.18,
        phase: "STAY_FINISH",
        outcome: "POST_FINISH_WINDOW",
      },
      {
        id: "first-dig",
        delay: 0.21,
        phase: "DIG_HELP_KICKOUT",
        outcome: "KICKOUT_CAUGHT",
      },
      {
        id: "s05-baseline",
        delay: 0.36,
        phase: "DIG_HELP_KICKOUT",
        outcome: "KICKOUT_CAUGHT",
      },
    ],
  );
  assert.deepEqual(
    audit.rows.map((row) => row.firstDefense.chosen),
    [
      ...Array.from({ length: 7 }, () => "STAY_HOME_POST"),
      ...Array.from({ length: 14 }, () => "DIG_POST"),
    ],
  );
  assert.deepEqual(
    audit.rows.map((row) => row.outcome),
    [
      ...Array.from({ length: 7 }, () => "POST_FINISH_WINDOW"),
      ...Array.from({ length: 14 }, () => "KICKOUT_CAUGHT"),
    ],
  );

  for (const row of audit.rows) {
    const dig = row.delay >= 0.21;
    assert.equal(row.deterministic, true);
    assert.equal(row.catchTick, 192);
    assert.equal(row.firstDefense.tick, 193);
    assert.equal(row.firstOffense.tick, 193);
    assert.equal(row.firstOffense.chosen, "POST_FINISH");
    assert.equal(row.firstOffense.helpObserved, false);
    assert.equal(row.firstOffense.kickout.feasible, false);
    assert.ok(row.firstOffense.kickout.vetoes.some((veto) => veto.includes("禁止预判")));
    assert.equal(row.postCatchAttackTick, 197);
    assert.equal(row.firstDefense.stay.feasible, true);
    assert.equal(row.firstDefense.dig.feasible, true);
    assert.equal(row.firstDefense.d1RoleCode, "rear_contest_post");
    assert.equal(
      row.firstDefense.d1PursuitState,
      row.delay === 0 ? "CHASE_READY" : "RECOVERING_REAR_CONTEST",
    );
    assert.equal(row.recoveryReadyTime, Number((row.recoveryReadyTick / 60).toFixed(6)));
    assert.equal(row.firstDefense.chosen, dig ? "DIG_POST" : "STAY_HOME_POST");
    assert.ok(
      dig
        ? row.firstDefense.dig.score > row.firstDefense.stay.score
        : row.firstDefense.stay.score > row.firstDefense.dig.score,
    );
    assert.equal(
      row.defenseDecisions.every((decision) => decision.chosen === row.firstDefense.chosen),
      true,
    );

    if (dig) {
      assert.equal(row.phase, "DIG_HELP_KICKOUT");
      assert.equal(row.digDecided, true);
      assert.equal(row.helpCommitted, true);
      assert.equal(row.helpWasLocal, true);
      assert.equal(row.helpCommittedTick, 231);
      assert.ok(row.helpD5O5Distance <= 1.12);
      assert.ok(row.helpD5O1Distance >= 1.28);
      assert.equal(row.kickoutChosen, true);
      assert.equal(row.kickoutAfterHelp, true);
      assert.equal(row.firstKickoutDecisionTick, 232);
      assert.equal(row.kickoutWindowTick, 258);
      assert.equal(row.kickoutLaunchedTick, 260);
      assert.equal(row.kickoutCaughtTick, 273);
      assert.equal(row.finishWindowTick, null);
      assert.equal(row.stopTick, 273);
      assert.deepEqual(
        row.offenseDecisions.map(({ tick, chosen, helpObserved }) => ({ tick, chosen, helpObserved })),
        [
          { tick: 193, chosen: "POST_FINISH", helpObserved: false },
          { tick: 225, chosen: "POST_FINISH", helpObserved: false },
          { tick: 232, chosen: "KICK_OUT", helpObserved: true },
          { tick: 259, chosen: "KICK_OUT", helpObserved: true },
        ],
      );
    } else {
      assert.equal(row.phase, "STAY_FINISH");
      assert.equal(row.digDecided, false);
      assert.equal(row.helpCommitted, false);
      assert.equal(row.kickoutChosen, false);
      assert.equal(row.helpCommittedTick, null);
      assert.equal(row.firstKickoutDecisionTick, null);
      assert.equal(row.finishWindowTick, 228);
      assert.equal(row.kickoutCaughtTick, null);
      assert.equal(row.stopTick, 228);
    }
  }

  for (const delay of G03_DELAYS) {
    const { d1PostCatchRecoveryDelay, ...fixed } = makeG03Config(delay);
    const { d1PostCatchRecoveryDelay: baselineDelay, ...baseline } = G03_BASE_CONFIG;
    assert.equal(d1PostCatchRecoveryDelay, delay);
    assert.equal(baselineDelay, 0);
    assert.deepEqual(fixed, baseline);
    assert.equal(fixed.horizon, "post_catch_resolution");
  }
});

test("G03 keeps DIG intent, real D5 help, and observed KICK_OUT as three causal layers", () => {
  for (const delay of G03_DELAYS) {
    const simulation = createG03Replay(delay);
    const offenseObservation = createPlannerObservation(simulation.world, "offense", []);
    const defenseObservation = createPlannerObservation(simulation.world, "defense", []);
    assert.equal(Object.hasOwn(offenseObservation, "horizon"), false);
    assert.equal(Object.hasOwn(defenseObservation, "horizon"), false);
    assert.equal(JSON.stringify(offenseObservation).includes("defensePlan"), false);
    assert.equal(JSON.stringify(defenseObservation).includes("offensePlan"), false);

    let previousBall = { ...simulation.world.ball.pos };
    let sawKickoutFlight = false;
    let maxKickoutStep = 0;
    let helpSnapshot = null;

    for (let index = 0; index < 600 && !simulation.world.terminal; index += 1) {
      const roles = simulation.getRoles();
      assert.equal(roles.length, 4);
      assert.deepEqual(
        [...new Set(roles.map((role) => role.playerId))].sort(),
        [...PLAYER_IDS].sort(),
      );
      for (const role of roles) {
        assert.equal(
          role.owner,
          role.playerId.startsWith("O") ? "offense-planner" : "defense-planner",
        );
      }

      simulation.step();
      const ballStep = Math.hypot(
        simulation.world.ball.pos.x - previousBall.x,
        simulation.world.ball.pos.y - previousBall.y,
      );
      previousBall = { ...simulation.world.ball.pos };
      if (simulation.world.ball.inFlight) {
        assert.equal(simulation.world.ballOwner, null);
      }
      if (simulation.world.ball.inFlight && simulation.world.ball.kind === "kick_out") {
        sawKickoutFlight = true;
        maxKickoutStep = Math.max(maxKickoutStep, ballStep);
      }
      if (!helpSnapshot && simulation.eventLog.some((event) => event.type === "help_committed")) {
        helpSnapshot = {
          d5O1Distance: simulation.world.postCatch.d5O1Distance,
          d5O5Distance: simulation.world.postCatch.d5O5Distance,
        };
      }

      assert.equal(
        simulation.world.time,
        Math.round(simulation.world.tick * FIXED_DT * 1e6) / 1e6,
      );
      assert.ok(simulation.world.lastStepMaxDisplacement <= 0.15);
      if (simulation.world.facts.impeded) {
        assert.ok(simulation.world.facts.contact || simulation.world.facts.routeExposure);
      }
      for (const id of PLAYER_IDS) {
        const player = simulation.world.players[id];
        assert.ok(player.pos.x >= player.radius - 1e-9);
        assert.ok(player.pos.x <= COURT.width - player.radius + 1e-9);
        assert.ok(player.pos.y >= player.radius - 1e-9);
        assert.ok(player.pos.y <= COURT.height - player.radius + 1e-9);
      }
    }

    const catchEvent = simulation.eventLog.find((event) => event.type === "pass_caught");
    const help = simulation.eventLog.find((event) => event.type === "help_committed");
    const finish = simulation.eventLog.find((event) => event.type === "finish_window");
    const launch = simulation.eventLog.find((event) => event.type === "kickout_launched");
    const caught = simulation.eventLog.find((event) => event.type === "kickout_caught");
    const firstDefense = simulation.planningLog.find(
      (record) =>
        record.team === "defense" &&
        catchEvent &&
        record.tick >= catchEvent.availableAtTick &&
        (record.chosen === "STAY_HOME_POST" || record.chosen === "DIG_POST"),
    );
    const firstKickout = simulation.planningLog.find(
      (record) => record.team === "offense" && record.chosen === "KICK_OUT",
    );
    assert.ok(catchEvent);
    assert.ok(firstDefense);
    assert.equal(catchEvent.tick, 192);
    assert.equal(firstDefense.tick, 193);

    const eventsById = new Map(simulation.eventLog.map((event) => [event.id, event]));
    for (const record of simulation.planningLog) {
      for (const id of record.triggerEventIds) {
        const source = eventsById.get(id);
        assert.ok(source);
        assert.ok(record.tick >= source.availableAtTick);
      }
    }

    if (delay < 0.21) {
      assert.equal(firstDefense.chosen, "STAY_HOME_POST");
      assert.ok(finish);
      assert.equal(help, undefined);
      assert.equal(firstKickout, undefined);
      assert.equal(simulation.world.terminal?.reason, "post_catch_finish_window");
      assert.equal(simulation.world.ballOwner, "O5");
      assert.equal(sawKickoutFlight, false);
    } else {
      assert.equal(firstDefense.chosen, "DIG_POST");
      assert.ok(help);
      assert.ok(helpSnapshot);
      assert.ok(helpSnapshot.d5O5Distance <= 1.12);
      assert.ok(helpSnapshot.d5O1Distance >= 1.28);
      assert.ok(firstKickout);
      assert.ok(firstKickout.tick >= help.availableAtTick);
      assert.equal(
        simulation.planningLog.some(
          (record) =>
            record.team === "offense" &&
            record.chosen === "KICK_OUT" &&
            record.tick < help.availableAtTick,
        ),
        false,
      );
      assert.ok(launch);
      assert.ok(caught);
      assert.ok(help.tick < launch.tick);
      assert.ok(launch.tick < caught.tick);
      assert.equal(finish, undefined);
      assert.equal(sawKickoutFlight, true);
      assert.ok(maxKickoutStep <= 13.6 * FIXED_DT + 0.007);
      assert.equal(simulation.world.terminal?.reason, "post_catch_kickout_caught");
      assert.equal(simulation.world.ballOwner, "O1");
      assert.equal(simulation.world.ball.outcome, "caught");
      const o1 = simulation.world.players.O1;
      assert.ok(
        Math.hypot(
          simulation.world.ball.pos.x - o1.pos.x,
          simulation.world.ball.pos.y - o1.pos.y,
        ) <= o1.radius + simulation.world.ball.radius + 0.075 + 1e-9,
      );
    }
    assert.equal(simulation.eventLog.some((event) => event.type.includes("shot")), false);
    assert.equal(simulation.eventLog.some((event) => event.type === "pass_denied"), false);
  }
});
