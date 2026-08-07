import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  COURT,
  EVENT_ORDER,
  FIXED_DT,
  PLAYER_IDS,
  PnrSimulation,
  createPlannerObservation,
  evaluateScreenFacts,
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
  makeG08Config,
  scanG08Heldout,
} from "../lib/pnr-g08-heldout-audit.ts";
import {
  DEFAULT_TEAM_STRATEGY_SELECTION,
  DEFENSE_BALANCED_COVERAGE,
  DEFENSE_EARLY_DIG,
  DEFENSE_EARLY_DIG_ADJUSTMENT,
  DEFENSE_MISMATCH_PRESSURE,
  DEFENSE_MISMATCH_PRESSURE_ADJUSTMENT,
  OFFENSE_BALANCED_READ,
  OFFENSE_MISMATCH_PRESSURE,
  OFFENSE_MISMATCH_PRESSURE_ATTACK_BIG_ADJUSTMENT,
  REGISTERED_TEAM_STRATEGIES,
  makeDefaultTeamStrategySelection,
  scoreCandidateWithStrategy,
  validateTeamStrategyProfile,
} from "../lib/pnr-strategy.ts";
import {
  createP01Replay,
  makeP01G01Config,
  scanP01Calibration,
  withP01OffenseStrategy,
} from "../lib/pnr-p01-offense-strategy.ts";
import {
  P02_DEFENSE_STRATEGIES,
  makeP02StrategySelection,
  scanP02DefenseCalibration,
  withP02Strategies,
} from "../lib/pnr-p02-defense-strategy.ts";
import {
  P03_COMMON_INPUT,
  P03_POLICY_MATCHUPS,
  createP03PolicyReplay,
  makeP03PolicyConfig,
  scanP03PolicyMatrix,
} from "../lib/pnr-p03-policy-matrix.ts";

function makeTestConfig(cue = "neutral", overrides = {}) {
  return {
    strategies: makeDefaultTeamStrategySelection(),
    initialPositions: makeInitialPositionsForCue(cue),
    screenSide: "right",
    seed: 17,
    maxTime: 7.4,
    d1FrontReactionDelay: 0,
    d1PostCatchRecoveryDelay: 0,
    o1MaxSpeed: 3.72,
    horizon: "pnr_resolution",
    ...overrides,
  };
}

function runToStop(cue = "neutral") {
  const simulation = new PnrSimulation(makeTestConfig(cue));
  for (let i = 0; i < 600 && !simulation.world.terminal; i += 1) {
    simulation.step();
  }
  return simulation;
}

function runScenarioToStop(scenarioId) {
  const simulation = new PnrSimulation(makeScenarioConfig(scenarioId));
  for (let i = 0; i < 600 && !simulation.world.terminal; i += 1) {
    simulation.step();
  }
  return simulation;
}

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

function p00LegacyPlanFrame(plan) {
  return {
    team: plan.team,
    id: plan.id,
    label: plan.label,
    version: plan.version,
    startedAt: plan.startedAt,
    startedTick: plan.startedTick,
    commitUntil: plan.commitUntil,
    watchdogAt: plan.watchdogAt,
    roles: plan.roles,
    rationale: plan.rationale,
    chosenScore: plan.chosenScore,
    primaryTarget: plan.primaryTarget,
    secondaryTarget: plan.secondaryTarget,
    passTarget: plan.passTarget,
  };
}

function p00LegacyPlanningFrame(record) {
  return {
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
  };
}

function p00LegacyTickFrame(simulation, planning, events) {
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
    offensePlan: p00LegacyPlanFrame(simulation.offensePlan),
    defensePlan: p00LegacyPlanFrame(simulation.defensePlan),
    roles: simulation.getRoles(),
    events,
    planning: planning.map(p00LegacyPlanningFrame),
    terminal: simulation.world.terminal,
  };
}

function p00LegacyTraceDigest(config) {
  const simulation = new PnrSimulation(config);
  const hash = createHash("sha256");
  hash.update(
    JSON.stringify(p00LegacyTickFrame(simulation, [...simulation.planningLog], [])),
  );
  for (let index = 0; index < 600 && !simulation.world.terminal; index += 1) {
    const planningStart = simulation.planningLog.length;
    const eventStart = simulation.eventLog.length;
    simulation.step();
    hash.update(
      JSON.stringify(
        p00LegacyTickFrame(
          simulation,
          simulation.planningLog.slice(planningStart),
          simulation.eventLog.slice(eventStart),
        ),
      ),
    );
  }
  return hash.digest("hex");
}

function p00LegacyGroupDigest(entries) {
  const hash = createHash("sha256");
  for (const [id, config] of entries) {
    hash.update(`${id}:${p00LegacyTraceDigest(config)}\n`);
  }
  return hash.digest("hex");
}

function approvedConfigGroups() {
  const legalG05 = G05_CANDIDATES.filter(
    ({ id }) => id !== "O1.y/-0.24" && id !== "D1.y/+0.24",
  );
  return {
    S: PNR_SCENARIOS.map((scenario) => [scenario.code, makeScenarioConfig(scenario.id)]),
    G01: G01_SPEEDS.map((speed) => [speed.toFixed(2), makeG01Config(speed)]),
    G02: G02_DELAYS.map((delay) => [delay.toFixed(2), makeG02Config(delay)]),
    G03: G03_DELAYS.map((delay) => [delay.toFixed(2), makeG03Config(delay)]),
    G05: legalG05.map((candidate) => [candidate.id, makeG05Config(candidate.id)]),
    G06: G06_SPECS.map((spec) => [spec.id, makeG06Config(spec.id)]),
    G07: G07_SPECS.map((spec) => [spec.id, makeG07Config(spec.id, "left")]),
    G08: G08_HELDOUT_MANIFEST.map((item) => [item.id, makeG08Config(item.id)]),
  };
}

function approvedConfigEntries() {
  return Object.entries(approvedConfigGroups()).flatMap(([group, entries]) =>
    entries.map(([id, config]) => [`${group}/${id}`, config]),
  );
}

const P01_PLAYER_PAIRS = [
  ["O1", "O5"],
  ["O1", "D1"],
  ["O1", "D5"],
  ["O5", "D1"],
  ["O5", "D5"],
  ["D1", "D5"],
];

function p01AuditRun(config) {
  const simulation = new PnrSimulation(config);
  const hash = createHash("sha256");
  const failures = new Set();
  let planningStart = 0;
  let eventStart = 0;

  const capture = () => {
    const planning = simulation.planningLog.slice(planningStart);
    const events = simulation.eventLog.slice(eventStart);
    hash.update(JSON.stringify({
      tick: simulation.world.tick,
      stateHash: simulation.world.stateHash,
      offensePlan: simulation.offensePlan,
      defensePlan: simulation.defensePlan,
      roles: simulation.getRoles(),
      planning,
      events,
      terminal: simulation.world.terminal,
    }));
    planningStart = simulation.planningLog.length;
    eventStart = simulation.eventLog.length;

    const roles = simulation.getRoles();
    if (roles.length !== 4 || new Set(roles.map((role) => role.playerId)).size !== 4) {
      failures.add("role ownership conflict");
    }
    if (roles.some(
      (role) =>
        role.owner !==
        (role.playerId.startsWith("O") ? "offense-planner" : "defense-planner"),
    )) {
      failures.add("role owned by wrong planner");
    }

    const world = simulation.world;
    if (world.ballOwner !== null && !PLAYER_IDS.includes(world.ballOwner)) {
      failures.add("illegal ball owner");
    }
    if (world.ball.inFlight !== (world.ballOwner === null)) {
      failures.add("possession and flight disagree");
    }
    if (world.time !== Math.round(world.tick * FIXED_DT * 1e6) / 1e6) {
      failures.add("fixed timestep drift");
    }
    if (world.lastStepMaxDisplacement > 0.15 + 1e-9) {
      failures.add("player path step too large");
    }
    if (
      world.ball.pos.x < -1e-9 ||
      world.ball.pos.x > COURT.width + 1e-9 ||
      world.ball.pos.y < -1e-9 ||
      world.ball.pos.y > COURT.height + 1e-9
    ) {
      failures.add("ball out of bounds");
    }
    for (const id of PLAYER_IDS) {
      const player = world.players[id];
      if (
        player.pos.x < player.radius - 1e-9 ||
        player.pos.x > COURT.width - player.radius + 1e-9 ||
        player.pos.y < player.radius - 1e-9 ||
        player.pos.y > COURT.height - player.radius + 1e-9
      ) {
        failures.add("player out of bounds");
      }
    }
    for (const [firstId, secondId] of P01_PLAYER_PAIRS) {
      const first = world.players[firstId];
      const second = world.players[secondId];
      const gap =
        Math.hypot(first.pos.x - second.pos.x, first.pos.y - second.pos.y) -
        first.radius -
        second.radius;
      if (gap < -0.01) failures.add("body penetration");
    }
    if (world.facts.impeded && !world.facts.contact && !world.facts.routeExposure) {
      failures.add("remote screen impediment");
    }

    for (let index = 1; index < events.length; index += 1) {
      if (events[index - 1].tick === events[index].tick) {
        if (EVENT_ORDER[events[index - 1].type] > EVENT_ORDER[events[index].type]) {
          failures.add("event order changed");
        }
      }
    }
    const touchOwner = {
      pass_caught: "O5",
      kickout_caught: "O1",
      reject_pass_caught: "O5",
    };
    for (const event of events) {
      if (event.type === "pass_denied" && world.ball.outcome === "missed") continue;
      const owner = event.type === "pass_denied" ? world.ballOwner : touchOwner[event.type];
      if (!owner) continue;
      if (event.type === "pass_denied" && owner !== "D1" && owner !== "D5") {
        failures.add("pass denial assigned to a non-defender");
        continue;
      }
      const player = world.players[owner];
      const localDistance = Math.hypot(
        world.ball.pos.x - player.pos.x,
        world.ball.pos.y - player.pos.y,
      );
      const localThreshold =
        player.radius + world.ball.radius + (event.type === "pass_denied" ? 0.045 : 0.075);
      if (
        world.ballOwner !== owner ||
        localDistance > localThreshold + 1e-9
      ) {
        failures.add("pass resolved without local touch");
      }
    }
  };

  for (const team of ["offense", "defense"]) {
    const observation = createPlannerObservation(simulation.world, team);
    if (/strategy|offensePlan|defensePlan|hiddenPlan/i.test(JSON.stringify(observation))) {
      failures.add("planner observation leaked hidden strategy or plan");
    }
  }

  capture();
  for (let index = 0; index < 600 && !simulation.world.terminal; index += 1) {
    simulation.step();
    capture();
  }
  if (!simulation.world.terminal) failures.add("world did not reach a finite terminal");

  const eventsById = new Map(simulation.eventLog.map((event) => [event.id, event]));
  for (const record of simulation.planningLog) {
    for (const id of record.triggerEventIds) {
      const event = eventsById.get(id);
      if (!event || event.availableAtTick <= event.tick || record.tick < event.availableAtTick) {
        failures.add("planner consumed event before its public boundary");
      }
    }
  }

  return {
    digest: hash.digest("hex"),
    failures: [...failures],
    terminalReason: simulation.world.terminal?.reason ?? null,
  };
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

test("saved scenario presets are unique, deterministic, and contain inputs rather than outcomes", () => {
  assert.equal(DEFAULT_SCENARIO_ID, "switch_feed_front_denied");
  assert.deepEqual(
    PNR_SCENARIOS.map(({ code, id }) => ({ code, id })),
    [
      { code: "S01", id: "switch_feed_front_denied" },
      { code: "S02", id: "reject_overplay_right" },
      { code: "S03", id: "switch_feed_front_late_catch" },
      { code: "S04", id: "post_catch_stay_home_finish" },
      { code: "S05", id: "post_catch_dig_kickout" },
      { code: "S06", id: "switch_attack_big_downhill" },
      { code: "S07", id: "under_screen_pullup_window" },
      { code: "S08", id: "reject_help_slip_catch" },
    ],
  );
  assert.equal(new Set(PNR_SCENARIOS.map((scenario) => scenario.id)).size, PNR_SCENARIOS.length);
  assert.equal(new Set(PNR_SCENARIOS.map((scenario) => scenario.code)).size, PNR_SCENARIOS.length);

  for (const scenario of PNR_SCENARIOS) {
    const publicInputText = JSON.stringify(scenario.publicInput);
    for (const forbidden of ["terminal", "outcome", "ballOwner", "winner", "plan", "cue"]) {
      assert.equal(publicInputText.includes(forbidden), false);
    }
    assert.deepEqual(
      scenario.publicInput.initialPositions,
      makeInitialPositionsForCue(scenario.cue),
    );

    const first = runScenarioToStop(scenario.id);
    const replay = runScenarioToStop(scenario.id);
    assert.equal(first.world.stateHash, replay.world.stateHash);
    assert.equal(first.world.branch, scenario.checkpoint.branch);
    assert.equal(first.world.terminal?.reason, scenario.checkpoint.terminalReason);
    assert.equal(first.world.ballOwner, scenario.checkpoint.ballOwner);
  }
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
    S07: "a3079918032d205fd15473c9d7590204119b4cf00158e06447d3010c2bfb2bbc",
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

test("P00 default strategies preserve all 170 approved S01-G08 tick traces", () => {
  const groups = approvedConfigGroups();
  const expected = {
    S: [8, "608ce5e837986214c713ad4ed4c0fbbdec99a89590b68bb36ad1a0c71ba21316"],
    G01: [19, "c4e24d170eb215871daff655b80ddc3cc646dfeabab26907f53a5c714ef2fb22"],
    G02: [17, "20d64cb0c44c54671006eab4e04f844e87d9d052c4b1b4299c66aa582934998b"],
    G03: [21, "d823b25d948216253ecfb705357bbf7749f3f7a8455cb0acf43d0def596fb39b"],
    G05: [31, "b7de26f94b554423407517932a04a0eb5eaad0f8d443671334fe000bc42dc04f"],
    G06: [21, "02c046e000f77e4c1696f5a237700aea1542f51ebdd716cbea300e9cf3b37eb7"],
    G07: [29, "d22b870f2a042ec990a4af86e818dc039218a1658b45a50ac86ceed044a251ed"],
    G08: [24, "836238e356d1983a9b119a2b55bc847eb8fbfcdfca4f15f5af6f836752942bc7"],
  };

  let inputCount = 0;
  for (const [group, entries] of Object.entries(groups)) {
    inputCount += entries.length;
    assert.equal(entries.length, expected[group][0], `${group} input count`);
    assert.equal(p00LegacyGroupDigest(entries), expected[group][1], `${group} tick trace`);
    for (const [, config] of entries) {
      assert.equal(Object.hasOwn(config, "strategies"), true);
      assert.deepEqual(config.strategies, DEFAULT_TEAM_STRATEGY_SELECTION);
    }
  }
  assert.equal(inputCount, 170);

  const phases = new Set();
  for (const scenarioId of [
    "reject_overplay_right",
    "switch_attack_big_downhill",
    "post_catch_dig_kickout",
  ]) {
    const simulation = runScenarioToStop(scenarioId);
    for (const record of simulation.planningLog) {
      phases.add(record.decisionPhase);
      assert.equal(
        record.strategy.id,
        record.team === "offense" ? OFFENSE_BALANCED_READ.id : DEFENSE_BALANCED_COVERAGE.id,
      );
      for (const candidate of record.candidates) {
        assert.equal(candidate.strategyAdjustment, 0);
        assert.equal(candidate.effectiveScore, candidate.baseScore);
        assert.equal(candidate.score, candidate.effectiveScore);
        assert.ok(candidate.strategyReason.length > 0);
      }
    }
  }
  assert.deepEqual(
    [...phases].sort(),
    [
      "defense_initial_coverage",
      "defense_mismatch",
      "defense_post_catch",
      "offense_initial_read",
      "offense_mismatch",
      "offense_post_catch",
    ],
  );
});

test("P00 keeps offense and defense strategies inside their own planner boundaries", () => {
  const simulation = new PnrSimulation(makeScenarioConfig("post_catch_dig_kickout"));
  const offenseObservation = createPlannerObservation(simulation.world, "offense");
  const defenseObservation = createPlannerObservation(simulation.world, "defense");
  for (const observation of [offenseObservation, defenseObservation]) {
    assert.doesNotMatch(JSON.stringify(observation), /strategy|OFFENSE_BALANCED|DEFENSE_BALANCED/i);
  }

  while (!simulation.world.terminal) simulation.step();
  for (const record of simulation.planningLog) {
    if (record.team === "offense") {
      assert.equal(record.strategy.id, OFFENSE_BALANCED_READ.id);
      assert.doesNotMatch(record.strategyBoundary, /DEFENSE_BALANCED_COVERAGE/);
    } else {
      assert.equal(record.strategy.id, DEFENSE_BALANCED_COVERAGE.id);
      assert.doesNotMatch(record.strategyBoundary, /OFFENSE_BALANCED_READ/);
    }
  }

  const source = readFileSync(new URL("../lib/pnr-core.ts", import.meta.url), "utf8");
  const offenseBody = source.slice(
    source.indexOf("  private replanOffense"),
    source.indexOf("  private replanDefense"),
  );
  const defenseBody = source.slice(
    source.indexOf("  private replanDefense"),
    source.indexOf("  private deliverEvents"),
  );
  assert.doesNotMatch(offenseBody, /this\.defenseStrategyProfile/);
  assert.doesNotMatch(defenseBody, /this\.offenseStrategyProfile/);
});

test("P00 neutral world and motion resolvers do not receive strategy profiles", () => {
  const source = readFileSync(new URL("../lib/pnr-core.ts", import.meta.url), "utf8");
  const initialWorldBody = source.slice(
    source.indexOf("interface WorldInitializationInput"),
    source.indexOf("export function createPlannerObservation"),
  );
  const stepBody = source.slice(
    source.indexOf("  step(count = 1)"),
    source.indexOf("  getRoles()"),
  );
  assert.doesNotMatch(initialWorldBody, /strategy/i);
  assert.doesNotMatch(stepBody, /StrategyProfile|strategyAdjustment|effectiveScore/);

  const simulation = new PnrSimulation(makeScenarioConfig("switch_feed_front_late_catch"));
  assert.equal(Object.hasOwn(simulation.world, "strategies"), false);
  assert.equal(Object.hasOwn(simulation.world, "offenseStrategy"), false);
  assert.equal(Object.hasOwn(simulation.world, "defenseStrategy"), false);
});

test("P00 temporary preferences can reorder feasible candidates but never revive a veto", () => {
  const temporary = validateTeamStrategyProfile({
    id: "TEST_OFFENSE_BIAS",
    version: 1,
    team: "offense",
    label: "测试偏置",
    description: "只验证策略接缝，不注册为可选策略。",
    phasePreferences: {
      offense_initial_read: [
        { planId: "USE_RIGHT_SCREEN", adjustment: -0.4, reason: "测试降低使用倾向" },
        { planId: "REJECT_LEFT", adjustment: 0.6, reason: "测试提高拒绝倾向" },
        { planId: "ATTACK_BIG", adjustment: 999, reason: "即使偏置极大也不能恢复 veto" },
      ],
    },
  });
  const use = scoreCandidateWithStrategy(temporary, "offense_initial_read", {
    planId: "USE_RIGHT_SCREEN",
    feasible: true,
    baseScore: 5,
  });
  const reject = scoreCandidateWithStrategy(temporary, "offense_initial_read", {
    planId: "REJECT_LEFT",
    feasible: true,
    baseScore: 4.8,
  });
  const vetoed = scoreCandidateWithStrategy(temporary, "offense_initial_read", {
    planId: "ATTACK_BIG",
    feasible: false,
    baseScore: null,
  });

  assert.ok(reject.effectiveScore > use.effectiveScore);
  assert.equal(vetoed.strategyAdjustment, 0);
  assert.equal(vetoed.effectiveScore, null);
  assert.match(vetoed.strategyReason, /不能恢复候选/);
  assert.throws(
    () => scoreCandidateWithStrategy(temporary, "offense_initial_read", {
      planId: "SWITCH",
      feasible: true,
      baseScore: 1,
    }),
    /cannot adjust opponent plan/,
  );
});

test("P00 strategy inputs are deep-copied, deterministic, registered, and locked after start", () => {
  assert.deepEqual(
    REGISTERED_TEAM_STRATEGIES
      .filter(({ id }) =>
        id === DEFAULT_TEAM_STRATEGY_SELECTION.offense.id ||
        id === DEFAULT_TEAM_STRATEGY_SELECTION.defense.id,
      )
      .map(({ id, version, team }) => ({ id, version, team })),
    [
      { id: "OFFENSE_BALANCED_READ", version: 1, team: "offense" },
      { id: "DEFENSE_BALANCED_COVERAGE", version: 1, team: "defense" },
    ],
  );
  const externalStrategies = {
    offense: { id: "OFFENSE_BALANCED_READ", version: 1 },
    defense: { id: "DEFENSE_BALANCED_COVERAGE", version: 1 },
  };
  const simulation = new PnrSimulation({
    ...makeScenarioConfig("switch_feed_front_late_catch"),
    strategies: externalStrategies,
  });
  externalStrategies.offense.id = "MUTATED_AFTER_CONSTRUCTION";
  externalStrategies.defense.version = 99;

  assert.deepEqual(simulation.config.strategies, DEFAULT_TEAM_STRATEGY_SELECTION);
  assert.equal(Object.isFrozen(simulation.config.strategies), true);
  assert.equal(Object.isFrozen(simulation.config.strategies.offense), true);
  assert.equal(Object.isFrozen(simulation.getStrategyProfile("offense")), true);
  assert.equal(
    Object.isFrozen(
      simulation.getStrategyProfile("offense").phasePreferences.offense_initial_read,
    ),
    true,
  );
  assert.equal(simulation.strategyLocked, false);
  simulation.step(0);
  assert.equal(simulation.strategyLocked, false);
  simulation.step();
  assert.equal(simulation.strategyLocked, true);
  assert.throws(() => {
    simulation.config.strategies.offense.id = "ILLEGAL_RUNTIME_CHANGE";
  }, TypeError);

  const resetRound = new PnrSimulation(makeScenarioConfig("switch_feed_front_late_catch"));
  assert.equal(resetRound.strategyLocked, false);
  const replay = new PnrSimulation(makeScenarioConfig("switch_feed_front_late_catch"));
  while (!resetRound.world.terminal && !replay.world.terminal) {
    resetRound.step();
    replay.step();
    assert.equal(resetRound.world.stateHash, replay.world.stateHash);
  }
  assert.equal(resetRound.world.terminal?.reason, replay.world.terminal?.reason);

  assert.throws(
    () => new PnrSimulation({
      ...makeTestConfig(),
      strategies: {
        offense: { id: "UNKNOWN_OFFENSE", version: 1 },
        defense: DEFAULT_TEAM_STRATEGY_SELECTION.defense,
      },
    }),
    /Unknown offense strategy/,
  );
  assert.throws(
    () => new PnrSimulation({
      ...makeTestConfig(),
      strategies: {
        offense: DEFAULT_TEAM_STRATEGY_SELECTION.defense,
        defense: DEFAULT_TEAM_STRATEGY_SELECTION.defense,
      },
    }),
    /belongs to defense, not offense/,
  );
  assert.throws(
    () => new PnrSimulation({
      ...makeTestConfig(),
      strategies: {
        offense: { id: OFFENSE_BALANCED_READ.id, version: 2 },
        defense: DEFAULT_TEAM_STRATEGY_SELECTION.defense,
      },
    }),
    /version 2 is unavailable/,
  );
});

test("P01 calibrates one global +0.02 post-switch ATTACK_BIG preference", () => {
  const audit = scanP01Calibration();
  assert.equal(audit.passed, true);
  assert.deepEqual(audit.failureReasons, []);
  assert.equal(audit.adjustment, 0.02);
  assert.equal(audit.adjustment, OFFENSE_MISMATCH_PRESSURE_ATTACK_BIG_ADJUSTMENT);
  assert.ok(audit.adjustment <= audit.maximumAllowedAdjustment);
  assert.deepEqual(
    REGISTERED_TEAM_STRATEGIES.map(({ id, version, team }) => ({ id, version, team })),
    [
      { id: "OFFENSE_BALANCED_READ", version: 1, team: "offense" },
      { id: "OFFENSE_MISMATCH_PRESSURE", version: 1, team: "offense" },
      { id: "DEFENSE_BALANCED_COVERAGE", version: 1, team: "defense" },
      { id: "DEFENSE_MISMATCH_PRESSURE", version: 1, team: "defense" },
      { id: "DEFENSE_EARLY_DIG", version: 1, team: "defense" },
    ],
  );
  assert.equal(
    REGISTERED_TEAM_STRATEGIES.filter((profile) => profile.team === "defense").length,
    3,
  );

  for (const [phase, preferences] of Object.entries(
    OFFENSE_MISMATCH_PRESSURE.phasePreferences,
  )) {
    for (const preference of preferences) {
      const expected =
        phase === "offense_mismatch" && preference.planId === "ATTACK_BIG"
          ? OFFENSE_MISMATCH_PRESSURE_ATTACK_BIG_ADJUSTMENT
          : 0;
      assert.equal(preference.adjustment, expected, `${phase}/${preference.planId}`);
    }
  }
  assert.equal(Object.isFrozen(OFFENSE_MISMATCH_PRESSURE), true);
  assert.equal(
    Object.isFrozen(OFFENSE_MISMATCH_PRESSURE.phasePreferences.offense_mismatch),
    true,
  );

  const row = (speed, strategyId, side = "right") =>
    audit.rows.find(
      (candidate) =>
        candidate.speed === speed &&
        candidate.strategyId === strategyId &&
        candidate.side === side,
    );
  const balanced372 = row(3.72, OFFENSE_BALANCED_READ.id);
  const pressure372 = row(3.72, OFFENSE_MISMATCH_PRESSURE.id);
  const balanced398 = row(3.98, OFFENSE_BALANCED_READ.id);
  const pressure398 = row(3.98, OFFENSE_MISMATCH_PRESSURE.id);
  const balanced400 = row(4, OFFENSE_BALANCED_READ.id);
  const pressure400 = row(4, OFFENSE_MISMATCH_PRESSURE.id);

  assert.equal(balanced398?.chosen, "FEED_SEAL");
  assert.equal(pressure398?.chosen, "ATTACK_BIG");
  assert.equal(balanced398?.attack.baseScore, 5.131);
  assert.equal(pressure398?.attack.baseScore, 5.131);
  assert.equal(pressure398?.attack.strategyAdjustment, 0.02);
  assert.equal(pressure398?.attack.effectiveScore, 5.151);
  assert.equal(pressure398?.feed.baseScore, 5.144);
  assert.equal(pressure398?.feed.strategyAdjustment, 0);
  assert.equal(pressure398?.feed.effectiveScore, 5.144);
  assert.equal(balanced372?.chosen, "FEED_SEAL");
  assert.equal(pressure372?.chosen, "FEED_SEAL");
  assert.equal(pressure372?.attack.effectiveScore, 4.632);
  assert.equal(pressure372?.feed.effectiveScore, 5.144);
  assert.equal(balanced400?.chosen, "ATTACK_BIG");
  assert.equal(pressure400?.chosen, "ATTACK_BIG");
  assert.equal(
    pressure398?.offenseRoles.find((role) => role.playerId === "O1")?.roleCode,
    "attack_big",
  );
  assert.equal(
    pressure398?.offenseRoles.find((role) => role.playerId === "O5")?.roleCode,
    "clear_lane",
  );
  assert.equal(audit.veto.feasible, false);
  assert.equal(audit.veto.baseScore, null);
  assert.equal(audit.veto.strategyAdjustment, 0);
  assert.equal(audit.veto.effectiveScore, null);
  assert.match(audit.veto.strategyReason, /不能恢复候选/);
  const postSwitchVeto = scoreCandidateWithStrategy(
    OFFENSE_MISMATCH_PRESSURE,
    "offense_mismatch",
    { planId: "ATTACK_BIG", feasible: false, baseScore: null },
  );
  assert.equal(postSwitchVeto.baseScore, null);
  assert.equal(postSwitchVeto.strategyAdjustment, 0);
  assert.equal(postSwitchVeto.effectiveScore, null);
  assert.match(postSwitchVeto.strategyReason, /不能恢复候选/);
});

test("P01 mismatch pressure is deterministic and legal on all 170 approved inputs", () => {
  const entries = approvedConfigEntries();
  assert.equal(entries.length, 170);
  for (const [id, balancedConfig] of entries) {
    const pressureConfig = withP01OffenseStrategy(
      balancedConfig,
      OFFENSE_MISMATCH_PRESSURE.id,
    );
    assert.equal(pressureConfig.strategies.offense.id, OFFENSE_MISMATCH_PRESSURE.id);
    assert.equal(pressureConfig.strategies.defense.id, DEFENSE_BALANCED_COVERAGE.id);
    const first = p01AuditRun(pressureConfig);
    const replay = p01AuditRun(pressureConfig);
    assert.deepEqual(first.failures, [], `${id} first-run invariants`);
    assert.deepEqual(replay.failures, [], `${id} replay invariants`);
    assert.equal(first.digest, replay.digest, `${id} tick determinism`);
    assert.equal(first.terminalReason, replay.terminalReason, `${id} terminal`);
  }
  assert.equal(
    `sha256:${createHash("sha256").update(canonicalG08ManifestJson()).digest("hex")}`,
    G08_MANIFEST_HASH,
  );
});

test("P01 changes only strategy scoring before public motion lets defense react", () => {
  const balanced = new PnrSimulation(
    makeP01G01Config(3.98, OFFENSE_BALANCED_READ.id),
  );
  const pressure = new PnrSimulation(
    makeP01G01Config(3.98, OFFENSE_MISMATCH_PRESSURE.id),
  );
  let firstPublicMotionDifferenceTick = null;

  for (let index = 0; index < 600; index += 1) {
    const samePublicPlayers = PLAYER_IDS.every((id) => {
      const first = balanced.world.players[id];
      const second = pressure.world.players[id];
      return (
        first.pos.x === second.pos.x &&
        first.pos.y === second.pos.y &&
        first.vel.x === second.vel.x &&
        first.vel.y === second.vel.y
      );
    });
    if (!samePublicPlayers) {
      firstPublicMotionDifferenceTick = balanced.world.tick;
      break;
    }
    assert.equal(balanced.defensePlan.id, pressure.defensePlan.id);
    balanced.step();
    pressure.step();
  }

  const balancedDecision = balanced.planningLog.find(
    (record) => record.team === "offense" && record.decisionPhase === "offense_mismatch",
  );
  const pressureDecision = pressure.planningLog.find(
    (record) => record.team === "offense" && record.decisionPhase === "offense_mismatch",
  );
  assert.ok(balancedDecision);
  assert.ok(pressureDecision);
  assert.equal(balancedDecision.tick, pressureDecision.tick);
  assert.equal(balancedDecision.chosen, "FEED_SEAL");
  assert.equal(pressureDecision.chosen, "ATTACK_BIG");
  assert.ok(firstPublicMotionDifferenceTick > pressureDecision.tick);

  for (const balancedCandidate of balancedDecision.candidates) {
    const pressureCandidate = pressureDecision.candidates.find(
      (candidate) => candidate.id === balancedCandidate.id,
    );
    assert.ok(pressureCandidate);
    assert.equal(pressureCandidate.baseScore, balancedCandidate.baseScore);
    assert.equal(pressureCandidate.feasible, balancedCandidate.feasible);
    assert.deepEqual(pressureCandidate.vetoes, balancedCandidate.vetoes);
    assert.deepEqual(pressureCandidate.evidence, balancedCandidate.evidence);
    assert.equal(
      pressureCandidate.strategyAdjustment,
      balancedCandidate.id === "ATTACK_BIG" ? 0.02 : 0,
    );
  }

  const defenseFrame = (simulation) => simulation.planningLog
    .filter(
      (record) =>
        record.team === "defense" && record.tick < firstPublicMotionDifferenceTick,
    )
    .map((record) => ({
      tick: record.tick,
      trigger: record.trigger,
      chosen: record.chosen,
      candidates: record.candidates.map((candidate) => ({
        id: candidate.id,
        feasible: candidate.feasible,
        baseScore: candidate.baseScore,
        effectiveScore: candidate.effectiveScore,
        vetoes: candidate.vetoes,
      })),
    }));
  assert.deepEqual(defenseFrame(pressure), defenseFrame(balanced));
});

test("P01 keeps the stable low side unchanged and mirrors pressure left/right", () => {
  const lowBalanced = new PnrSimulation(
    makeP01G01Config(3.72, OFFENSE_BALANCED_READ.id),
  );
  const lowPressure = new PnrSimulation(
    makeP01G01Config(3.72, OFFENSE_MISMATCH_PRESSURE.id),
  );
  while (!lowBalanced.world.terminal && !lowPressure.world.terminal) {
    assert.equal(lowPressure.world.stateHash, lowBalanced.world.stateHash);
    lowBalanced.step();
    lowPressure.step();
  }
  assert.equal(lowBalanced.world.terminal?.reason, lowPressure.world.terminal?.reason);
  assert.equal(lowBalanced.offensePlan.id, "FEED_SEAL");
  assert.equal(lowPressure.offensePlan.id, "FEED_SEAL");

  const right = new PnrSimulation(
    makeP01G01Config(3.98, OFFENSE_MISMATCH_PRESSURE.id, "right"),
  );
  const left = new PnrSimulation(
    makeP01G01Config(3.98, OFFENSE_MISMATCH_PRESSURE.id, "left"),
  );
  let maximumMirrorError = 0;
  while (!right.world.terminal && !left.world.terminal) {
    assert.equal(left.offensePlan.id, right.offensePlan.id);
    assert.equal(left.defensePlan.id, right.defensePlan.id);
    assert.deepEqual(
      left.getRoles().map(({ playerId, roleCode }) => ({ playerId, roleCode })),
      right.getRoles().map(({ playerId, roleCode }) => ({ playerId, roleCode })),
    );
    for (const id of PLAYER_IDS) {
      const mirrored = mirrorPointAcrossCenterline(right.world.players[id].pos);
      maximumMirrorError = Math.max(
        maximumMirrorError,
        Math.abs(left.world.players[id].pos.x - mirrored.x),
        Math.abs(left.world.players[id].pos.y - mirrored.y),
        Math.abs(left.world.players[id].vel.x + right.world.players[id].vel.x),
        Math.abs(left.world.players[id].vel.y - right.world.players[id].vel.y),
      );
    }
    right.step();
    left.step();
  }
  assert.equal(left.world.terminal?.reason, right.world.terminal?.reason);
  assert.ok(maximumMirrorError <= 1e-9);
});

test("P01 hard veto and runtime lock hold for the new offense profile", () => {
  const simulation = createP01Replay("hard-veto", OFFENSE_MISMATCH_PRESSURE.id);
  const initialOffense = simulation.planningLog.find((record) => record.team === "offense");
  const attack = initialOffense?.candidates.find((candidate) => candidate.id === "ATTACK_BIG");
  assert.ok(attack);
  assert.equal(attack.feasible, false);
  assert.equal(attack.baseScore, null);
  assert.equal(attack.strategyAdjustment, 0);
  assert.equal(attack.effectiveScore, null);
  assert.equal(simulation.config.strategies.offense.id, OFFENSE_MISMATCH_PRESSURE.id);
  assert.equal(simulation.config.strategies.defense.id, DEFENSE_BALANCED_COVERAGE.id);
  assert.equal(simulation.strategyLocked, false);
  simulation.step();
  assert.equal(simulation.strategyLocked, true);
});

test("P02 calibrates two global defense preferences without changing base scores", () => {
  const audit = scanP02DefenseCalibration();
  assert.equal(audit.passed, true);
  assert.deepEqual(audit.failureReasons, []);
  assert.equal(audit.mismatchAdjustment, 1.18);
  assert.equal(audit.mismatchAdjustment, DEFENSE_MISMATCH_PRESSURE_ADJUSTMENT);
  assert.equal(audit.earlyDigAdjustment, 0.24);
  assert.equal(audit.earlyDigAdjustment, DEFENSE_EARLY_DIG_ADJUSTMENT);
  assert.equal(audit.rows.length, 10);
  assert.deepEqual(
    P02_DEFENSE_STRATEGIES.map(({ id, version, team }) => ({ id, version, team })),
    [
      { id: "DEFENSE_BALANCED_COVERAGE", version: 1, team: "defense" },
      { id: "DEFENSE_MISMATCH_PRESSURE", version: 1, team: "defense" },
      { id: "DEFENSE_EARLY_DIG", version: 1, team: "defense" },
    ],
  );

  for (const [phase, preferences] of Object.entries(
    DEFENSE_MISMATCH_PRESSURE.phasePreferences,
  )) {
    for (const preference of preferences) {
      assert.equal(
        preference.adjustment,
        phase === "defense_mismatch" && preference.planId === "PRESSURE_MISMATCH"
          ? DEFENSE_MISMATCH_PRESSURE_ADJUSTMENT
          : 0,
        `${phase}/${preference.planId}`,
      );
    }
  }
  for (const [phase, preferences] of Object.entries(DEFENSE_EARLY_DIG.phasePreferences)) {
    for (const preference of preferences) {
      assert.equal(
        preference.adjustment,
        phase === "defense_post_catch" && preference.planId === "DIG_POST"
          ? DEFENSE_EARLY_DIG_ADJUSTMENT
          : 0,
        `${phase}/${preference.planId}`,
      );
    }
  }
  assert.equal(Object.isFrozen(DEFENSE_MISMATCH_PRESSURE), true);
  assert.equal(Object.isFrozen(DEFENSE_EARLY_DIG), true);

  const row = (family, input, defenseStrategyId) => audit.rows.find(
    (candidate) =>
      candidate.family === family &&
      candidate.input === input &&
      candidate.defenseStrategyId === defenseStrategyId,
  );
  const score = (entry, id) => entry?.candidates.find((candidate) => candidate.id === id);
  const balanced398 = row("mismatch", 3.98, DEFENSE_BALANCED_COVERAGE.id);
  const pressure398 = row("mismatch", 3.98, DEFENSE_MISMATCH_PRESSURE.id);
  const pressure400 = row("mismatch", 4, DEFENSE_MISMATCH_PRESSURE.id);
  assert.equal(balanced398?.chosen, "CONTAIN_MISMATCH");
  assert.equal(pressure398?.chosen, "PRESSURE_MISMATCH");
  assert.equal(pressure400?.chosen, "CONTAIN_MISMATCH");
  assert.deepEqual(
    [
      score(balanced398, "CONTAIN_MISMATCH")?.baseScore,
      score(balanced398, "PRESSURE_MISMATCH")?.baseScore,
      score(pressure398, "CONTAIN_MISMATCH")?.baseScore,
      score(pressure398, "PRESSURE_MISMATCH")?.baseScore,
      score(pressure398, "PRESSURE_MISMATCH")?.strategyAdjustment,
      score(pressure398, "PRESSURE_MISMATCH")?.effectiveScore,
      score(pressure400, "CONTAIN_MISMATCH")?.baseScore,
      score(pressure400, "PRESSURE_MISMATCH")?.baseScore,
      score(pressure400, "PRESSURE_MISMATCH")?.effectiveScore,
    ],
    [4.569, 3.396, 4.569, 3.396, 1.18, 4.576, 4.577, 3.387, 4.567],
  );

  const balanced000 = row("post-catch", 0, DEFENSE_BALANCED_COVERAGE.id);
  const early000 = row("post-catch", 0, DEFENSE_EARLY_DIG.id);
  const balanced018 = row("post-catch", 0.18, DEFENSE_BALANCED_COVERAGE.id);
  const early018 = row("post-catch", 0.18, DEFENSE_EARLY_DIG.id);
  const early021 = row("post-catch", 0.21, DEFENSE_EARLY_DIG.id);
  assert.equal(balanced000?.chosen, "STAY_HOME_POST");
  assert.equal(early000?.chosen, "STAY_HOME_POST");
  assert.equal(balanced018?.chosen, "STAY_HOME_POST");
  assert.equal(early018?.chosen, "DIG_POST");
  assert.equal(early021?.chosen, "DIG_POST");
  assert.deepEqual(
    [
      score(balanced018, "STAY_HOME_POST")?.baseScore,
      score(balanced018, "DIG_POST")?.baseScore,
      score(early018, "STAY_HOME_POST")?.baseScore,
      score(early018, "DIG_POST")?.baseScore,
      score(early018, "DIG_POST")?.strategyAdjustment,
      score(early018, "DIG_POST")?.effectiveScore,
    ],
    [1.217, 0.98, 1.217, 0.98, 0.24, 1.22],
  );

  for (const veto of [audit.pressureHardVeto, audit.digHardVeto]) {
    assert.equal(veto.feasible, false);
    assert.equal(veto.baseScore, null);
    assert.equal(veto.strategyAdjustment, 0);
    assert.equal(veto.effectiveScore, null);
    assert.match(veto.strategyReason, /不能恢复候选/);
  }
});

test("P02 defense profiles are deterministic and legal on all 170 approved inputs", () => {
  const entries = approvedConfigEntries();
  assert.equal(entries.length, 170);
  for (const profile of [DEFENSE_MISMATCH_PRESSURE, DEFENSE_EARLY_DIG]) {
    for (const [id, balancedConfig] of entries) {
      const config = withP02Strategies(
        balancedConfig,
        OFFENSE_BALANCED_READ.id,
        profile.id,
      );
      assert.equal(config.strategies.offense.id, OFFENSE_BALANCED_READ.id);
      assert.equal(config.strategies.defense.id, profile.id);
      const first = p01AuditRun(config);
      const replay = p01AuditRun(config);
      assert.deepEqual(first.failures, [], `${profile.id}/${id} first-run invariants`);
      assert.deepEqual(replay.failures, [], `${profile.id}/${id} replay invariants`);
      assert.equal(first.digest, replay.digest, `${profile.id}/${id} tick determinism`);
      assert.equal(first.terminalReason, replay.terminalReason, `${profile.id}/${id} terminal`);
    }
  }
  assert.equal(
    `sha256:${createHash("sha256").update(canonicalG08ManifestJson()).digest("hex")}`,
    G08_MANIFEST_HASH,
  );
});

test("P02 keeps defense policy hidden until its public movement can affect offense", () => {
  const base = makeP01G01Config(3.98, OFFENSE_BALANCED_READ.id);
  const balanced = new PnrSimulation(withP02Strategies(
    base,
    OFFENSE_BALANCED_READ.id,
    DEFENSE_BALANCED_COVERAGE.id,
  ));
  const pressure = new PnrSimulation(withP02Strategies(
    base,
    OFFENSE_BALANCED_READ.id,
    DEFENSE_MISMATCH_PRESSURE.id,
  ));
  let firstPublicMotionDifferenceTick = null;

  for (let index = 0; index < 600; index += 1) {
    const samePublicPlayers = PLAYER_IDS.every((id) => {
      const first = balanced.world.players[id];
      const second = pressure.world.players[id];
      return (
        first.pos.x === second.pos.x &&
        first.pos.y === second.pos.y &&
        first.vel.x === second.vel.x &&
        first.vel.y === second.vel.y
      );
    });
    if (!samePublicPlayers) {
      firstPublicMotionDifferenceTick = balanced.world.tick;
      break;
    }
    assert.equal(balanced.offensePlan.id, pressure.offensePlan.id);
    balanced.step();
    pressure.step();
  }

  const balancedDecision = balanced.planningLog.find(
    (record) => record.team === "defense" && record.decisionPhase === "defense_mismatch",
  );
  const pressureDecision = pressure.planningLog.find(
    (record) => record.team === "defense" && record.decisionPhase === "defense_mismatch",
  );
  assert.ok(balancedDecision);
  assert.ok(pressureDecision);
  assert.equal(balancedDecision.tick, pressureDecision.tick);
  assert.equal(balancedDecision.chosen, "CONTAIN_MISMATCH");
  assert.equal(pressureDecision.chosen, "PRESSURE_MISMATCH");
  assert.ok(firstPublicMotionDifferenceTick > pressureDecision.tick);

  for (const balancedCandidate of balancedDecision.candidates) {
    const pressureCandidate = pressureDecision.candidates.find(
      (candidate) => candidate.id === balancedCandidate.id,
    );
    assert.ok(pressureCandidate);
    assert.equal(pressureCandidate.baseScore, balancedCandidate.baseScore);
    assert.equal(pressureCandidate.feasible, balancedCandidate.feasible);
    assert.deepEqual(pressureCandidate.vetoes, balancedCandidate.vetoes);
    assert.deepEqual(pressureCandidate.evidence, balancedCandidate.evidence);
    assert.equal(
      pressureCandidate.strategyAdjustment,
      balancedCandidate.id === "PRESSURE_MISMATCH" ? 1.18 : 0,
    );
  }

  const offenseBeforeMotion = (simulation) => simulation.planningLog
    .filter(
      (record) => record.team === "offense" && record.tick < firstPublicMotionDifferenceTick,
    )
    .map((record) => ({
      tick: record.tick,
      trigger: record.trigger,
      chosen: record.chosen,
      candidates: record.candidates.map((candidate) => ({
        id: candidate.id,
        feasible: candidate.feasible,
        baseScore: candidate.baseScore,
        effectiveScore: candidate.effectiveScore,
        vetoes: candidate.vetoes,
      })),
    }));
  assert.deepEqual(offenseBeforeMotion(pressure), offenseBeforeMotion(balanced));
});

test("P02 early dig changes intent at the catch but kickout waits for real local help", () => {
  const simulation = createP03PolicyReplay("OB-DE");
  while (!simulation.world.terminal) simulation.step();
  const postCatchDefense = simulation.planningLog.find(
    (record) => record.team === "defense" && record.decisionPhase === "defense_post_catch",
  );
  const postCatchOffense = simulation.planningLog.filter(
    (record) => record.team === "offense" && record.decisionPhase === "offense_post_catch",
  );
  const eventTick = (type) => simulation.eventLog.find((event) => event.type === type)?.tick;
  const catchTick = eventTick("pass_caught");
  const helpTick = eventTick("help_committed");
  const launchTick = eventTick("kickout_launched");
  const caughtTick = eventTick("kickout_caught");
  const firstKickoutDecision = postCatchOffense.find((record) => record.chosen === "KICK_OUT");

  assert.equal(postCatchDefense?.chosen, "DIG_POST");
  assert.equal(postCatchOffense[0]?.chosen, "POST_FINISH");
  assert.ok(catchTick < postCatchDefense.tick);
  assert.ok(postCatchDefense.tick < helpTick);
  assert.ok(helpTick < firstKickoutDecision.tick);
  assert.ok(firstKickoutDecision.tick <= launchTick);
  assert.ok(launchTick < caughtTick);
  assert.equal(simulation.world.terminal?.reason, "post_catch_kickout_caught");
});

test("P03 runs the fixed two-by-three policy matrix twice without prewritten outcomes", () => {
  const audit = scanP03PolicyMatrix();
  assert.equal(audit.passed, true);
  assert.deepEqual(audit.failureReasons, []);
  assert.deepEqual(audit.commonInput, P03_COMMON_INPUT);
  assert.equal(audit.rows.length, 6);
  assert.equal(audit.leftRows.length, 6);
  assert.deepEqual(audit.rows.map((row) => row.id), P03_POLICY_MATCHUPS.map(({ id }) => id));
  assert.equal(
    new Set(audit.rows.map((row) => `${row.offenseStrategyId}/${row.defenseStrategyId}`)).size,
    6,
  );
  assert.equal(audit.deterministic, true);
  assert.equal(audit.invariantSafe, true);

  for (const row of [...audit.rows, ...audit.leftRows]) {
    assert.equal(row.deterministic, true, `${row.id}/${row.side}`);
    assert.deepEqual(row.invariantFailures, [], `${row.id}/${row.side}`);
    assert.ok(row.terminalTick > 0);
    assert.ok(row.terminal.reason.length > 0);
    assert.ok(row.offensePlanSequence.length > 0);
    assert.ok(row.defensePlanSequence.length > 0);
    assert.ok(row.minimumBodyGap >= -0.01);
    if (row.kickoutCaught) {
      const helpTick = row.keyEvents.find((event) => event.type === "help_committed")?.tick;
      const launchTick = row.keyEvents.find((event) => event.type === "kickout_launched")?.tick;
      const caughtTick = row.keyEvents.find((event) => event.type === "kickout_caught")?.tick;
      assert.ok(helpTick < launchTick);
      assert.ok(launchTick < caughtTick);
    }
  }

  const selection = makeP02StrategySelection(
    OFFENSE_MISMATCH_PRESSURE.id,
    DEFENSE_EARLY_DIG.id,
  );
  assert.deepEqual(selection, {
    offense: { id: OFFENSE_MISMATCH_PRESSURE.id, version: 1 },
    defense: { id: DEFENSE_EARLY_DIG.id, version: 1 },
  });
  const replay = createP03PolicyReplay("OM-DE");
  assert.equal(replay.strategyLocked, false);
  replay.step();
  assert.equal(replay.strategyLocked, true);
});

test("P03 uses real mirrored worlds with the same policy constants and events", () => {
  const audit = scanP03PolicyMatrix();
  assert.equal(audit.mirrorSafe, true);
  assert.equal(audit.mirrors.length, 6);
  for (const mirror of audit.mirrors) {
    assert.equal(mirror.deterministicRight, true);
    assert.equal(mirror.deterministicLeft, true);
    assert.equal(mirror.mirrored, true);
    assert.deepEqual(mirror.failureReasons, []);
    assert.ok(mirror.maximumMirrorError <= 1e-9);
    const right = audit.rows.find((row) => row.id === mirror.id);
    const left = audit.leftRows.find((row) => row.id === mirror.id);
    assert.ok(right);
    assert.ok(left);
    assert.equal(left.terminal.reason, right.terminal.reason);
    assert.equal(left.terminalTick, right.terminalTick);
    assert.deepEqual(left.offensePlanSequence, right.offensePlanSequence);
    assert.deepEqual(left.defensePlanSequence, right.defensePlanSequence);

    const rightConfig = makeP03PolicyConfig(mirror.id, "right");
    const leftConfig = makeP03PolicyConfig(mirror.id, "left");
    for (const id of PLAYER_IDS) {
      assert.deepEqual(
        leftConfig.initialPositions[id],
        mirrorPointAcrossCenterline(rightConfig.initialPositions[id]),
      );
    }
    assert.equal(rightConfig.strategies.offense.id, leftConfig.strategies.offense.id);
    assert.equal(rightConfig.strategies.defense.id, leftConfig.strategies.defense.id);
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

test("late fronting is vetoed by public time and path facts, then O5 wins the touch race", () => {
  const simulation = new PnrSimulation(makeScenarioConfig("switch_feed_front_late_catch"));
  let previousBall = { ...simulation.world.ball.pos };
  let maxBallStep = 0;
  let minimumO5D1Gap = Number.POSITIVE_INFINITY;
  let sawFlight = false;
  let sawEstablishedSeal = false;

  for (let i = 0; i < 600 && !simulation.world.terminal; i += 1) {
    simulation.step();
    const o5 = simulation.world.players.O5;
    const d1 = simulation.world.players.D1;
    const ballStep = Math.hypot(
      simulation.world.ball.pos.x - previousBall.x,
      simulation.world.ball.pos.y - previousBall.y,
    );
    maxBallStep = Math.max(maxBallStep, ballStep);
    previousBall = { ...simulation.world.ball.pos };

    if (simulation.world.seal.established) {
      sawEstablishedSeal = true;
      minimumO5D1Gap = Math.min(
        minimumO5D1Gap,
        Math.hypot(o5.pos.x - d1.pos.x, o5.pos.y - d1.pos.y) - o5.radius - d1.radius,
      );
      assert.ok(
        Math.hypot(d1.pos.x - COURT.hoop.x, d1.pos.y - COURT.hoop.y) >=
          Math.hypot(o5.pos.x - COURT.hoop.x, o5.pos.y - COURT.hoop.y) - 0.01,
      );
    }
    if (simulation.world.ball.inFlight) {
      sawFlight = true;
      assert.equal(simulation.world.ballOwner, null);
    }
  }

  const sealEvent = simulation.eventLog.find((event) => event.type === "seal_established");
  const launch = simulation.eventLog.find((event) => event.type === "pass_launched");
  const caught = simulation.eventLog.find((event) => event.type === "pass_caught");
  const backsideRecord = simulation.planningLog.find(
    (record) => record.team === "defense" && record.chosen === "BACKSIDE_CONTEST",
  );
  const frontCandidate = backsideRecord?.candidates.find((candidate) => candidate.id === "FRONT_SEAL");
  const roles = new Map(simulation.getRoles().map((role) => [role.playerId, role]));

  assert.ok(sealEvent);
  assert.ok(launch);
  assert.ok(caught);
  assert.ok(backsideRecord);
  assert.ok(backsideRecord.tick >= sealEvent.availableAtTick);
  assert.equal(frontCandidate?.feasible, false);
  assert.ok(frontCandidate?.vetoes.some((veto) => veto.includes("合法绕前 ETA")));
  assert.equal(simulation.world.seal.frontReactionDelay, 0.12);
  assert.equal(simulation.world.seal.frontRouteLegal, true);
  assert.equal(simulation.world.seal.frontFeasible, false);
  assert.ok(simulation.world.seal.frontEta > simulation.world.seal.entryFlightTime);
  assert.equal(simulation.eventLog.some((event) => event.type === "seal_fronted"), false);
  assert.equal(simulation.eventLog.some((event) => event.type === "pass_denied"), false);
  assert.ok(caught.tick > launch.tick);
  assert.equal(sawEstablishedSeal, true);
  assert.equal(sawFlight, true);
  assert.ok(minimumO5D1Gap >= -0.01);
  assert.ok(maxBallStep <= 9.2 * FIXED_DT + 0.007);
  assert.equal(simulation.world.ball.outcome, "caught");
  assert.equal(simulation.world.ballOwner, "O5");
  assert.equal(simulation.world.terminal?.reason, "seal_catch_advantage");
  assert.equal(roles.get("D1")?.roleCode, "backside_contest");
  assert.equal(roles.get("D5")?.roleCode, "contain_passer");
});

test("S04 preserves S03 through the catch, then forms a stay-home post finish window", () => {
  const s03 = runScenarioToStop("switch_feed_front_late_catch");
  const s04 = new PnrSimulation(makeScenarioConfig("post_catch_stay_home_finish"));
  let s04AtCatch;

  for (let i = 0; i < 600 && !s04.world.terminal; i += 1) {
    s04.step();
    if (!s04AtCatch && s04.eventLog.some((event) => event.type === "pass_caught")) {
      s04AtCatch = {
        tick: s04.world.tick,
        time: s04.world.time,
        ballOwner: s04.world.ballOwner,
        ball: structuredClone(s04.world.ball),
        players: structuredClone(s04.world.players),
      };
    }
  }

  const s03CaughtIndex = s03.eventLog.findIndex((event) => event.type === "pass_caught");
  const s04CaughtIndex = s04.eventLog.findIndex((event) => event.type === "pass_caught");
  const caught = s04.eventLog[s04CaughtIndex];
  const attack = s04.eventLog.find((event) => event.type === "post_catch_attack");
  const finish = s04.eventLog.find((event) => event.type === "finish_window");
  const terminal = s04.eventLog.find((event) => event.type === "terminal");
  const firstPostOffense = s04.planningLog.find(
    (record) => record.team === "offense" && record.chosen === "POST_FINISH",
  );
  const firstPostDefense = s04.planningLog.find(
    (record) => record.team === "defense" && record.chosen === "STAY_HOME_POST",
  );
  const kickOut = firstPostOffense?.candidates.find((candidate) => candidate.id === "KICK_OUT");
  const dig = firstPostDefense?.candidates.find((candidate) => candidate.id === "DIG_POST");
  const roles = new Map(s04.getRoles().map((role) => [role.playerId, role]));

  assert.ok(s04AtCatch);
  assert.deepEqual(s04AtCatch, {
    tick: s03.world.tick,
    time: s03.world.time,
    ballOwner: s03.world.ballOwner,
    ball: structuredClone(s03.world.ball),
    players: structuredClone(s03.world.players),
  });
  assert.deepEqual(
    s04.eventLog.slice(0, s04CaughtIndex + 1).map(({ type, tick, detail }) => ({ type, tick, detail })),
    s03.eventLog.slice(0, s03CaughtIndex + 1).map(({ type, tick, detail }) => ({ type, tick, detail })),
  );
  assert.deepEqual(
    s04.planningLog
      .filter((record) => record.tick <= s04AtCatch.tick)
      .map(({ tick, team, trigger, chosen }) => ({ tick, team, trigger, chosen })),
    s03.planningLog.map(({ tick, team, trigger, chosen }) => ({ tick, team, trigger, chosen })),
  );

  assert.ok(caught);
  assert.ok(attack);
  assert.ok(finish);
  assert.ok(terminal);
  assert.ok(caught.tick < attack.tick);
  assert.ok(attack.tick < finish.tick);
  assert.equal(finish.tick, terminal.tick);
  assert.ok(firstPostOffense);
  assert.ok(firstPostDefense);
  assert.ok(firstPostOffense.tick >= caught.availableAtTick);
  assert.ok(firstPostDefense.tick >= caught.availableAtTick);
  assert.equal(kickOut?.feasible, false);
  assert.ok(kickOut?.vetoes.some((veto) => veto.includes("禁止预判其隐藏方案")));
  assert.equal(dig?.feasible, true);
  assert.ok(firstPostDefense.candidates.find((candidate) => candidate.id === "STAY_HOME_POST").score > dig.score);

  assert.equal(s04.world.terminal?.reason, "post_catch_finish_window");
  assert.equal(s04.world.ballOwner, "O5");
  assert.equal(s04.world.ball.outcome, "caught");
  assert.equal(s04.world.postCatch.attackCommitted, true);
  assert.equal(s04.world.postCatch.finishWindow, true);
  assert.equal(s04.world.postCatch.d1Behind, true);
  assert.ok(s04.world.postCatch.d1BodyGap >= -0.01);
  assert.equal(s04.world.postCatch.d5AttachedToO1, true);
  assert.equal(s04.world.postCatch.o1Relocated, true);
  assert.ok(s04.world.postCatch.o5RimDistance <= 1.72);
  assert.equal(roles.get("O1")?.roleCode, "relocate_post_space");
  assert.equal(roles.get("O5")?.roleCode, "turn_finish");
  assert.equal(roles.get("D1")?.roleCode, "rear_contest_post");
  assert.equal(roles.get("D5")?.roleCode, "stay_attached_o1");
  assert.equal(s04.eventLog.some((event) => event.type.includes("shot")), false);
  assert.equal(s04.eventLog.some((event) => event.type === "pass_denied"), false);
});

test("S05 waits for a local D5 dig before O5 kicks out and O1 legally catches", () => {
  const s04 = new PnrSimulation(makeScenarioConfig("post_catch_stay_home_finish"));
  const s05 = new PnrSimulation(makeScenarioConfig("post_catch_dig_kickout"));
  let s04AtCatch;
  let s05AtCatch;
  let helpSnapshot;
  let windowSnapshot;
  let sawKickoutFlight = false;
  let maxKickoutStep = 0;
  let previousBall = { ...s05.world.ball.pos };

  for (let i = 0; i < 600 && (!s04AtCatch || !s04.world.terminal); i += 1) {
    s04.step();
    if (!s04AtCatch && s04.eventLog.some((event) => event.type === "pass_caught")) {
      s04AtCatch = {
        tick: s04.world.tick,
        time: s04.world.time,
        ballOwner: s04.world.ballOwner,
        ball: structuredClone(s04.world.ball),
        players: structuredClone(s04.world.players),
      };
    }
  }

  for (let i = 0; i < 600 && !s05.world.terminal; i += 1) {
    s05.step();
    if (!s05AtCatch && s05.eventLog.some((event) => event.type === "pass_caught")) {
      s05AtCatch = {
        tick: s05.world.tick,
        time: s05.world.time,
        ballOwner: s05.world.ballOwner,
        ball: structuredClone(s05.world.ball),
        players: structuredClone(s05.world.players),
      };
    }
    if (!helpSnapshot && s05.eventLog.some((event) => event.type === "help_committed")) {
      helpSnapshot = {
        d5O5Distance: s05.world.postCatch.d5O5Distance,
        d5O1Distance: s05.world.postCatch.d5O1Distance,
      };
    }
    if (!windowSnapshot && s05.eventLog.some((event) => event.type === "kickout_window_open")) {
      windowSnapshot = {
        clearance: s05.world.postCatch.kickoutLaneClearance,
        o1Relocated: s05.world.postCatch.o1Relocated,
      };
    }
    const ballStep = Math.hypot(
      s05.world.ball.pos.x - previousBall.x,
      s05.world.ball.pos.y - previousBall.y,
    );
    previousBall = { ...s05.world.ball.pos };
    if (s05.world.ball.inFlight && s05.world.ball.kind === "kick_out") {
      sawKickoutFlight = true;
      maxKickoutStep = Math.max(maxKickoutStep, ballStep);
      assert.equal(s05.world.ballOwner, null);
    }
  }

  const s04CaughtIndex = s04.eventLog.findIndex((event) => event.type === "pass_caught");
  const s05CaughtIndex = s05.eventLog.findIndex((event) => event.type === "pass_caught");
  const caught = s05.eventLog[s05CaughtIndex];
  const attack = s05.eventLog.find((event) => event.type === "post_catch_attack");
  const help = s05.eventLog.find((event) => event.type === "help_committed");
  const window = s05.eventLog.find((event) => event.type === "kickout_window_open");
  const launch = s05.eventLog.find((event) => event.type === "kickout_launched");
  const kickoutCaught = s05.eventLog.find((event) => event.type === "kickout_caught");
  const terminal = s05.eventLog.find((event) => event.type === "terminal");
  const firstPostOffense = s05.planningLog.find(
    (record) => record.team === "offense" && record.tick >= caught.availableAtTick,
  );
  const firstPostDefense = s05.planningLog.find(
    (record) => record.team === "defense" && record.tick >= caught.availableAtTick,
  );
  const firstKickout = s05.planningLog.find(
    (record) => record.team === "offense" && record.chosen === "KICK_OUT",
  );
  const kickoutCandidateAtCatch = firstPostOffense?.candidates.find(
    (candidate) => candidate.id === "KICK_OUT",
  );
  const finishAtRead = firstKickout?.candidates.find((candidate) => candidate.id === "POST_FINISH");
  const kickoutAtRead = firstKickout?.candidates.find((candidate) => candidate.id === "KICK_OUT");
  const stayAtCatch = firstPostDefense?.candidates.find(
    (candidate) => candidate.id === "STAY_HOME_POST",
  );
  const digAtCatch = firstPostDefense?.candidates.find((candidate) => candidate.id === "DIG_POST");
  const roles = new Map(s05.getRoles().map((role) => [role.playerId, role]));

  assert.ok(s04AtCatch);
  assert.ok(s05AtCatch);
  assert.deepEqual(s05AtCatch, s04AtCatch);
  assert.deepEqual(
    s05.eventLog.slice(0, s05CaughtIndex + 1).map(({ type, tick, detail }) => ({ type, tick, detail })),
    s04.eventLog.slice(0, s04CaughtIndex + 1).map(({ type, tick, detail }) => ({ type, tick, detail })),
  );
  assert.deepEqual(
    s05.planningLog
      .filter((record) => record.tick <= s05AtCatch.tick)
      .map(({ tick, team, trigger, chosen }) => ({ tick, team, trigger, chosen })),
    s04.planningLog
      .filter((record) => record.tick <= s04AtCatch.tick)
      .map(({ tick, team, trigger, chosen }) => ({ tick, team, trigger, chosen })),
  );

  assert.ok(caught);
  assert.ok(attack);
  assert.ok(help);
  assert.ok(window);
  assert.ok(launch);
  assert.ok(kickoutCaught);
  assert.ok(terminal);
  assert.ok(caught.tick < attack.tick);
  assert.ok(attack.tick < help.tick);
  assert.ok(help.tick < window.tick);
  assert.ok(window.tick < launch.tick);
  assert.ok(launch.tick < kickoutCaught.tick);
  assert.equal(kickoutCaught.tick, terminal.tick);

  assert.equal(firstPostOffense?.chosen, "POST_FINISH");
  assert.equal(firstPostDefense?.chosen, "DIG_POST");
  assert.equal(kickoutCandidateAtCatch?.feasible, false);
  assert.ok(kickoutCandidateAtCatch?.vetoes.some((veto) => veto.includes("禁止预判")));
  assert.ok(digAtCatch.score > stayAtCatch.score);
  assert.ok(firstKickout);
  assert.ok(firstKickout.tick >= help.availableAtTick);
  assert.equal(
    s05.planningLog.some(
      (record) => record.team === "offense" && record.chosen === "KICK_OUT" && record.tick < help.availableAtTick,
    ),
    false,
  );
  assert.equal(kickoutAtRead?.feasible, true);
  assert.ok(kickoutAtRead.score > finishAtRead.score);

  assert.ok(helpSnapshot);
  assert.ok(helpSnapshot.d5O5Distance <= 1.12);
  assert.ok(helpSnapshot.d5O1Distance >= 1.28);
  assert.ok(windowSnapshot);
  assert.equal(windowSnapshot.o1Relocated, true);
  assert.ok(windowSnapshot.clearance > 0.1);
  assert.equal(sawKickoutFlight, true);
  assert.ok(maxKickoutStep <= 13.6 * FIXED_DT + 0.007);
  assert.equal(s05.world.terminal?.reason, "post_catch_kickout_caught");
  assert.equal(s05.world.ballOwner, "O1");
  assert.equal(s05.world.ball.kind, "kick_out");
  assert.equal(s05.world.ball.outcome, "caught");
  assert.equal(s05.world.postCatch.d5HelpCommitted, true);
  assert.equal(s05.world.postCatch.kickoutWindow, true);
  assert.equal(s05.eventLog.some((event) => event.type === "pass_denied"), false);
  assert.equal(roles.get("O1")?.roleCode, "relocate_receive");
  assert.equal(roles.get("O5")?.roleCode, "kick_out_post");
  assert.equal(roles.get("D1")?.roleCode, "rear_contest_post");
  assert.equal(roles.get("D5")?.roleCode, "dig_post");
});

test("S06 chooses O1 attacking D5, clears O5, and reaches a real mismatch window", () => {
  const simulation = runScenarioToStop("switch_attack_big_downhill");
  const exchange = simulation.eventLog.find((event) => event.type === "switch_completed");
  const attackEvent = simulation.eventLog.find((event) => event.type === "mismatch_attack");
  const advantage = simulation.eventLog.find((event) => event.type === "mismatch_advantage");
  const firstAttackPlan = simulation.planningLog.find(
    (record) => record.team === "offense" && record.chosen === "ATTACK_BIG",
  );
  const firstContainPlan = simulation.planningLog.find(
    (record) => record.team === "defense" && record.chosen === "CONTAIN_MISMATCH",
  );
  const attackCandidate = firstAttackPlan?.candidates.find((candidate) => candidate.id === "ATTACK_BIG");
  const feedCandidate = firstAttackPlan?.candidates.find((candidate) => candidate.id === "FEED_SEAL");
  const roles = new Map(simulation.getRoles().map((role) => [role.playerId, role]));

  assert.ok(exchange);
  assert.ok(attackEvent);
  assert.ok(advantage);
  assert.ok(firstAttackPlan);
  assert.ok(firstContainPlan);
  assert.ok(firstAttackPlan.tick >= exchange.availableAtTick);
  assert.ok(firstContainPlan.tick >= exchange.availableAtTick);
  assert.ok(exchange.tick < attackEvent.tick);
  assert.ok(attackEvent.tick < advantage.tick);
  assert.ok(attackCandidate.score > feedCandidate.score);
  assert.equal(simulation.config.o1MaxSpeed, 4.08);
  assert.equal(simulation.world.mismatch.attackCommitted, true);
  assert.equal(simulation.world.mismatch.advantage, true);
  assert.equal(simulation.world.mismatch.d5GoalSide, false);
  assert.ok(simulation.world.mismatch.o1D5Separation > 0.76);
  assert.equal(simulation.world.ballOwner, "O1");
  assert.equal(simulation.world.terminal?.reason, "mismatch_advantage");
  assert.equal(simulation.eventLog.some((event) => event.type === "pass_launched"), false);
  assert.equal(roles.get("O1")?.roleCode, "attack_big");
  assert.equal(roles.get("O5")?.roleCode, "clear_lane");
  assert.equal(roles.get("D1")?.roleCode, "stay_roller");
  assert.equal(roles.get("D5")?.roleCode, "contain_ball");
});

test("S07 keeps original matchups while D1 goes under and O1 reaches a pull-up window", () => {
  const simulation = new PnrSimulation(makeScenarioConfig("under_screen_pullup_window"));
  let minimumD1O5Gap = Number.POSITIVE_INFINITY;

  for (let i = 0; i < 600 && !simulation.world.terminal; i += 1) {
    simulation.step();
    const d1 = simulation.world.players.D1;
    const o5 = simulation.world.players.O5;
    minimumD1O5Gap = Math.min(
      minimumD1O5Gap,
      Math.hypot(d1.pos.x - o5.pos.x, d1.pos.y - o5.pos.y) - d1.radius - o5.radius,
    );
  }

  const under = simulation.eventLog.find((event) => event.type === "under_committed");
  const cleared = simulation.eventLog.find((event) => event.type === "screen_cleared");
  const window = simulation.eventLog.find((event) => event.type === "pullup_window");
  const initialDefense = simulation.planningLog.find((record) => record.team === "defense");
  const roles = new Map(simulation.getRoles().map((role) => [role.playerId, role]));

  assert.ok(under);
  assert.ok(cleared);
  assert.ok(window);
  assert.equal(initialDefense?.chosen, "UNDER");
  assert.ok(under.tick < cleared.tick);
  assert.ok(cleared.tick < window.tick);
  assert.equal(simulation.planningLog.some((record) => record.chosen === "SWITCH"), false);
  assert.equal(simulation.eventLog.some((event) => event.type === "switch_completed"), false);
  assert.equal(simulation.world.facts.matchupExchange, false);
  assert.equal(simulation.world.under.active, true);
  assert.equal(simulation.world.under.pullupWindow, true);
  assert.equal(simulation.world.under.d1Recovered, false);
  assert.ok(simulation.world.under.d1O1Distance >= 1.08);
  assert.ok(simulation.world.under.d5O5Distance <= 1.02);
  assert.ok(minimumD1O5Gap >= -0.01);
  assert.equal(simulation.world.ballOwner, "O1");
  assert.equal(simulation.world.terminal?.reason, "under_pullup_window");
  assert.equal(roles.get("D1")?.roleCode, "navigate_under");
  assert.equal(roles.get("D5")?.roleCode, "under_hold_roller");
});

test("S08 waits for local reject help before O1 passes to the slipping O5", () => {
  const simulation = new PnrSimulation(makeScenarioConfig("reject_help_slip_catch"));
  let helpSnapshot;
  let windowSnapshot;
  let previousBall = { ...simulation.world.ball.pos };
  let maxPassStep = 0;
  let sawFlight = false;

  for (let i = 0; i < 600 && !simulation.world.terminal; i += 1) {
    simulation.step();
    if (!helpSnapshot && simulation.eventLog.some((event) => event.type === "reject_help_committed")) {
      helpSnapshot = {
        d5O1Distance: simulation.world.reject.d5O1Distance,
        d5O5Distance: simulation.world.reject.d5O5Distance,
      };
    }
    if (!windowSnapshot && simulation.eventLog.some((event) => event.type === "reject_pass_window_open")) {
      windowSnapshot = { clearance: simulation.world.reject.passLaneClearance };
    }
    const ballStep = Math.hypot(
      simulation.world.ball.pos.x - previousBall.x,
      simulation.world.ball.pos.y - previousBall.y,
    );
    previousBall = { ...simulation.world.ball.pos };
    if (simulation.world.ball.inFlight && simulation.world.ball.kind === "slip_pass") {
      sawFlight = true;
      maxPassStep = Math.max(maxPassStep, ballStep);
      assert.equal(simulation.world.ballOwner, null);
    }
  }

  const laneGained = simulation.eventLog.find((event) => event.type === "reject_lane_gained");
  const help = simulation.eventLog.find((event) => event.type === "reject_help_committed");
  const window = simulation.eventLog.find((event) => event.type === "reject_pass_window_open");
  const launch = simulation.eventLog.find((event) => event.type === "reject_pass_launched");
  const caught = simulation.eventLog.find((event) => event.type === "reject_pass_caught");
  const firstSlipPlan = simulation.planningLog.find(
    (record) => record.team === "offense" && record.chosen === "REJECT_SLIP_PASS",
  );
  const preHelpOffense = simulation.planningLog.find(
    (record) => record.team === "offense" && record.tick >= laneGained.availableAtTick,
  );
  const preHelpSlip = preHelpOffense?.candidates.find((candidate) => candidate.id === "REJECT_SLIP_PASS");
  const roles = new Map(simulation.getRoles().map((role) => [role.playerId, role]));

  assert.ok(laneGained);
  assert.ok(help);
  assert.ok(window);
  assert.ok(launch);
  assert.ok(caught);
  assert.ok(firstSlipPlan);
  assert.ok(laneGained.tick < help.tick);
  assert.ok(help.tick < window.tick);
  assert.ok(window.tick < launch.tick);
  assert.ok(launch.tick < caught.tick);
  assert.equal(preHelpOffense?.chosen, "REJECT_LEFT");
  assert.equal(preHelpSlip?.feasible, false);
  assert.ok(preHelpSlip?.vetoes.some((veto) => veto.includes("禁止预判")));
  assert.ok(firstSlipPlan.tick >= help.availableAtTick);
  assert.equal(
    simulation.planningLog.some(
      (record) => record.team === "offense" && record.chosen === "REJECT_SLIP_PASS" && record.tick < help.availableAtTick,
    ),
    false,
  );
  assert.ok(helpSnapshot);
  assert.ok(helpSnapshot.d5O1Distance <= 1.5);
  assert.ok(helpSnapshot.d5O5Distance >= 1);
  assert.ok(windowSnapshot);
  assert.ok(windowSnapshot.clearance > 0.08);
  assert.equal(sawFlight, true);
  assert.ok(maxPassStep <= 11.4 * FIXED_DT + 0.007);
  assert.equal(simulation.eventLog.some((event) => event.type === "switch_completed"), false);
  assert.equal(simulation.world.facts.matchupExchange, false);
  assert.equal(simulation.world.ballOwner, "O5");
  assert.equal(simulation.world.ball.kind, "slip_pass");
  assert.equal(simulation.world.ball.outcome, "caught");
  assert.equal(simulation.world.terminal?.reason, "reject_slip_caught");
  assert.equal(roles.get("O1")?.roleCode, "reject_slip_passer");
  assert.equal(roles.get("O5")?.roleCode, "reject_slip_receiver");
  assert.equal(roles.get("D1")?.roleCode, "chase_reject");
  assert.equal(roles.get("D5")?.roleCode, "tag_reject_drive");
});

test("same input reproduces the identical state and explanation trace", () => {
  const first = runToStop("neutral");
  const second = runToStop("neutral");

  assert.equal(first.world.stateHash, second.world.stateHash);
  assert.deepEqual(
    first.eventLog.map(({ type, tick, detail }) => ({ type, tick, detail })),
    second.eventLog.map(({ type, tick, detail }) => ({ type, tick, detail })),
  );
  assert.deepEqual(
    first.planningLog.map(({ tick, team, trigger, chosen }) => ({ tick, team, trigger, chosen })),
    second.planningLog.map(({ tick, team, trigger, chosen }) => ({ tick, team, trigger, chosen })),
  );
});

test("one right-side setup can visibly choose use or reject from public D1 stance", () => {
  const neutral = runToStop("neutral");
  const overplay = runToStop("overplay_right");

  assert.equal(neutral.planningLog.find((record) => record.team === "offense")?.chosen, "USE_RIGHT_SCREEN");
  assert.equal(neutral.planningLog.find((record) => record.team === "defense")?.chosen, "SWITCH_READY");
  assert.equal(neutral.world.branch, "use");
  assert.ok(neutral.eventLog.some((event) => event.type === "screen_cleared"));
  assert.ok(neutral.eventLog.some((event) => event.type === "switch_completed"));
  assert.equal(neutral.offensePlan.id, "FEED_SEAL");
  assert.equal(neutral.defensePlan.id, "FRONT_SEAL");
  assert.equal(neutral.world.terminal?.reason, "pass_denied");
  assert.equal(neutral.world.ballOwner, "D1");
  assert.equal(neutral.eventLog.some((event) => event.type === "screen_effective"), false);

  assert.equal(overplay.planningLog.find((record) => record.team === "offense")?.chosen, "REJECT_LEFT");
  assert.equal(overplay.world.branch, "reject");
  assert.ok(overplay.eventLog.some((event) => event.type === "branch_reject"));
  assert.equal(overplay.defensePlan.id, "STAY_HOME");
  assert.equal(overplay.eventLog.some((event) => event.type === "screen_cleared"), false);
  assert.equal(overplay.eventLog.some((event) => event.type === "switch_completed"), false);
});

test("O1 clears O5 on a shoulder arc before O5 rolls, without the old teammate jam", () => {
  const simulation = new PnrSimulation(makeTestConfig("neutral"));
  let jamTicks = 0;
  let minimumGap = Number.POSITIVE_INFINITY;
  let screenCleared = false;
  let o5HeldAtClear = false;
  let o5RolledAfterClear = false;

  for (let i = 0; i < 600 && !simulation.world.terminal; i += 1) {
    simulation.step();
    const o1 = simulation.world.players.O1;
    const o5 = simulation.world.players.O5;
    const teammateGap = Math.hypot(o1.pos.x - o5.pos.x, o1.pos.y - o5.pos.y) - o1.radius - o5.radius;
    minimumGap = Math.min(minimumGap, teammateGap);
    if (!screenCleared && teammateGap < 0.015 && Math.hypot(o1.vel.x, o1.vel.y) < 0.2) {
      jamTicks += 1;
    }
    if (!screenCleared && simulation.world.facts.ballHandlerClearedScreen) {
      screenCleared = true;
      o5HeldAtClear =
        Math.hypot(o5.pos.x - COURT.screenSpot.x, o5.pos.y - COURT.screenSpot.y) <= 0.18;
    }
    if (
      screenCleared &&
      Math.hypot(o5.pos.x - COURT.screenSpot.x, o5.pos.y - COURT.screenSpot.y) > 0.45
    ) {
      o5RolledAfterClear = true;
    }
  }

  assert.ok(minimumGap >= -0.01);
  assert.ok(jamTicks <= 3);
  assert.equal(screenCleared, true);
  assert.equal(o5HeldAtClear, true);
  assert.equal(o5RolledAfterClear, true);
});

test("the switch is an atomic post-clear role exchange, never a pre-read", () => {
  const simulation = new PnrSimulation(makeTestConfig("neutral"));
  let switchRoles;
  for (let i = 0; i < 600 && !simulation.world.terminal; i += 1) {
    simulation.step();
    if (!switchRoles && simulation.defensePlan.id === "SWITCH") {
      switchRoles = new Map(simulation.getRoles().map((role) => [role.playerId, { ...role }]));
    }
  }
  const clearEvent = simulation.eventLog.find((event) => event.type === "screen_cleared");
  const firstSwitchPlan = simulation.planningLog.find(
    (record) => record.team === "defense" && record.chosen === "SWITCH",
  );
  assert.ok(clearEvent);
  assert.ok(firstSwitchPlan);
  assert.ok(firstSwitchPlan.tick >= clearEvent.availableAtTick);
  assert.ok(switchRoles);
  assert.equal(switchRoles.get("D1")?.roleCode, "take_roller");
  assert.equal(switchRoles.get("D5")?.roleCode, "take_ball");

  const roles = new Map(simulation.getRoles().map((role) => [role.playerId, role]));
  assert.equal(roles.get("D1")?.roleCode, "front_seal");
  assert.equal(roles.get("D5")?.roleCode, "contain_passer");
});

test("post-switch offense and defense start only after the public exchange event", () => {
  const simulation = runToStop("neutral");
  const exchange = simulation.eventLog.find((event) => event.type === "switch_completed");
  const feed = simulation.planningLog.find(
    (record) => record.team === "offense" && record.chosen === "FEED_SEAL",
  );
  const contain = simulation.planningLog.find(
    (record) => record.team === "defense" && record.chosen === "CONTAIN_MISMATCH",
  );

  assert.ok(exchange);
  assert.ok(feed);
  assert.ok(contain);
  assert.ok(feed.tick >= exchange.availableAtTick);
  assert.ok(contain.tick >= exchange.availableAtTick);
  assert.equal(
    simulation.planningLog.some(
      (record) =>
        record.tick < exchange.availableAtTick &&
        [
          "ATTACK_BIG",
          "FEED_SEAL",
          "RESET_MISMATCH",
          "CONTAIN_MISMATCH",
          "FRONT_SEAL",
          "PRESSURE_MISMATCH",
        ].includes(record.chosen),
    ),
    false,
  );
});

test("O5 establishes the small-on-big seal while O1 creates an entry angle", () => {
  const simulation = new PnrSimulation(makeTestConfig("neutral"));
  let observedFeedPlan = false;
  let minimumTeammateGap = Number.POSITIVE_INFINITY;
  let o5YAtFeedStart = null;

  for (let i = 0; i < 600 && !simulation.world.terminal; i += 1) {
    simulation.step();
    if (simulation.offensePlan.id !== "FEED_SEAL") continue;
    observedFeedPlan = true;
    o5YAtFeedStart ??= simulation.world.players.O5.pos.y;
    assert.equal(simulation.offensePlan.passTarget, "O5");
    const o1 = simulation.world.players.O1;
    const o5 = simulation.world.players.O5;
    minimumTeammateGap = Math.min(
      minimumTeammateGap,
      Math.hypot(o1.pos.x - o5.pos.x, o1.pos.y - o5.pos.y) - o1.radius - o5.radius,
    );
  }

  assert.equal(observedFeedPlan, true);
  assert.ok(minimumTeammateGap >= -0.01);
  assert.ok(o5YAtFeedStart !== null);
  assert.ok(simulation.world.players.O5.pos.y < o5YAtFeedStart - 1.4);
  assert.ok(simulation.eventLog.some((event) => event.type === "seal_established"));
  assert.equal(simulation.world.seal.o5GoalSide, true);
});

test("the lob entry waits for a public window, then D1 can win the touch race", () => {
  const simulation = new PnrSimulation(makeTestConfig("neutral"));
  let previousBall = { ...simulation.world.ball.pos };
  let maxBallStep = 0;
  let sawFlight = false;

  for (let i = 0; i < 600 && !simulation.world.terminal; i += 1) {
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
  }

  const window = simulation.eventLog.find((event) => event.type === "pass_window_open");
  const launch = simulation.eventLog.find((event) => event.type === "pass_launched");
  const denied = simulation.eventLog.find((event) => event.type === "pass_denied");
  const frontPlan = simulation.planningLog.find(
    (record) => record.team === "defense" && record.chosen === "FRONT_SEAL",
  );
  assert.ok(window);
  assert.ok(launch);
  assert.ok(denied);
  assert.ok(frontPlan);
  assert.ok(frontPlan.tick >= window.availableAtTick);
  assert.ok(launch.tick > window.availableAtTick);
  assert.ok(denied.tick > launch.tick);
  assert.equal(simulation.eventLog.filter((event) => event.type === "seal_fronted").length, 1);
  assert.equal(sawFlight, true);
  assert.ok(maxBallStep <= 9.2 * FIXED_DT + 0.007);
  assert.equal(simulation.world.ballOwner, "D1");
  assert.equal(simulation.world.ball.outcome, "deflected");
  assert.ok(
    Math.hypot(
      simulation.world.ball.pos.x - simulation.world.players.D1.pos.x,
      simulation.world.ball.pos.y - simulation.world.players.D1.pos.y,
    ) <= simulation.world.players.D1.radius + simulation.world.ball.radius + 0.05,
  );
});

test("planner observations contain public facts but never the opponent hidden plan", () => {
  const simulation = new PnrSimulation(makeTestConfig("neutral"));
  const offenseView = createPlannerObservation(simulation.world, "offense");
  const defenseView = createPlannerObservation(simulation.world, "defense");
  const offenseText = JSON.stringify(offenseView);
  const defenseText = JSON.stringify(defenseView);

  assert.deepEqual(offenseView.ownPlayerIds, ["O1", "O5"]);
  assert.deepEqual(defenseView.ownPlayerIds, ["D1", "D5"]);
  for (const text of [offenseText, defenseText]) {
    assert.equal(text.includes("offensePlan"), false);
    assert.equal(text.includes("defensePlan"), false);
    assert.equal(text.includes("hidden"), false);
    assert.equal(text.includes("future"), false);
    assert.equal(text.includes("intendedReceiver"), false);
    assert.equal(text.includes("passTarget"), false);
  }
});

test("all four players always have exactly one role owner", () => {
  for (const scenario of PNR_SCENARIOS) {
    const simulation = new PnrSimulation(makeScenarioConfig(scenario.id));
    for (let i = 0; i < 520 && !simulation.world.terminal; i += 1) {
      const roles = simulation.getRoles();
      assert.equal(roles.length, 4);
      assert.deepEqual([...new Set(roles.map((role) => role.playerId))].sort(), [...PLAYER_IDS].sort());
      for (const role of roles) {
        assert.equal(
          role.owner,
          role.playerId.startsWith("O") ? "offense-planner" : "defense-planner",
        );
      }
      simulation.step();
    }
  }
});

test("possession, boundaries, speed-limited paths, and fixed timestep stay legal", () => {
  for (const scenario of PNR_SCENARIOS) {
    const simulation = new PnrSimulation(makeScenarioConfig(scenario.id));
    for (let i = 0; i < 520 && !simulation.world.terminal; i += 1) {
      simulation.step();
      assert.ok(
        simulation.world.ballOwner === null || PLAYER_IDS.includes(simulation.world.ballOwner),
      );
      assert.equal(simulation.world.ball.inFlight, simulation.world.ballOwner === null);
      assert.equal(simulation.world.time, Math.round(simulation.world.tick * FIXED_DT * 1e6) / 1e6);
      assert.ok(simulation.world.lastStepMaxDisplacement <= 0.15);
      assert.ok(simulation.world.ball.pos.x >= -1e-9);
      assert.ok(simulation.world.ball.pos.x <= COURT.width + 1e-9);
      assert.ok(simulation.world.ball.pos.y >= -1e-9);
      assert.ok(simulation.world.ball.pos.y <= COURT.height + 1e-9);
      for (const id of PLAYER_IDS) {
        const player = simulation.world.players[id];
        assert.ok(player.pos.x >= player.radius - 1e-9);
        assert.ok(player.pos.x <= COURT.width - player.radius + 1e-9);
        assert.ok(player.pos.y >= player.radius - 1e-9);
        assert.ok(player.pos.y <= COURT.height - player.radius + 1e-9);
      }
    }
  }
});

test("events use a fixed order and only reach planners at a later boundary", () => {
  for (const scenario of PNR_SCENARIOS) {
    const simulation = runScenarioToStop(scenario.id);
    const byTick = new Map();
    for (const event of simulation.eventLog) {
      const list = byTick.get(event.tick) ?? [];
      list.push(event);
      byTick.set(event.tick, list);
    }

    for (const events of byTick.values()) {
      for (let i = 1; i < events.length; i += 1) {
        assert.ok(EVENT_ORDER[events[i - 1].type] <= EVENT_ORDER[events[i].type]);
      }
    }

    const eventsById = new Map(simulation.eventLog.map((event) => [event.id, event]));
    for (const record of simulation.planningLog) {
      for (const id of record.triggerEventIds) {
        const event = eventsById.get(id);
        assert.ok(event);
        assert.ok(event.availableAtTick > event.tick);
        assert.ok(record.tick >= event.availableAtTick);
      }
    }
  }
});

test("no contact and no route exposure can never create remote impediment", () => {
  const simulation = new PnrSimulation(makeTestConfig("neutral"));
  const d1 = simulation.world.players.D1;
  const o5 = simulation.world.players.O5;
  d1.pos = { x: 1.2, y: 4.5 };
  o5.pos = { x: 8.6, y: 4.5 };

  const facts = evaluateScreenFacts({
    d1,
    o5,
    desiredD1Velocity: { x: 3.2, y: 0 },
    screenLegalPose: true,
    progressLoss: 0.9,
    priorDelay: 0,
    pnrLinked: true,
    ballHandlerSeparation: 2,
  });

  assert.equal(facts.contact, false);
  assert.equal(facts.routeExposure, false);
  assert.equal(facts.impeded, false);
  assert.equal(facts.screenEffective, false);
  assert.equal(facts.progressLoss, 0);
});

test("every live impediment has a local contact or corridor cause", () => {
  for (const scenario of PNR_SCENARIOS) {
    const simulation = new PnrSimulation(makeScenarioConfig(scenario.id));
    for (let i = 0; i < 600 && !simulation.world.terminal; i += 1) {
      simulation.step();
      if (simulation.world.facts.impeded) {
        assert.ok(simulation.world.facts.contact || simulation.world.facts.routeExposure);
      }
    }
  }
});
