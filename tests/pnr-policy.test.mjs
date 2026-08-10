// P00-P03 strategy and policy regression tests.

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
  mirrorPointAcrossCenterline,
} from "../lib/pnr-core.ts";
import { makeScenarioConfig } from "../lib/pnr-scenarios.ts";
import {
  G08_MANIFEST_HASH,
  canonicalG08ManifestJson,
} from "../lib/pnr-g08-heldout-manifest.ts";
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

import {
  makeTestConfig,
  runScenarioToStop,
  p00LegacyGroupDigest,
  approvedConfigGroups,
} from "./helpers/pnr-test-harness.mjs";

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

test("P00 default strategies preserve the 170-input ledger with the documented UNDER correction", () => {
  const groups = approvedConfigGroups();
  const expected = {
    S: [8, "da98a942b7a22bee09a7de866299620cfa83881ccf069e720d8cca5ec0e2f8e1"],
    G01: [19, "c4e24d170eb215871daff655b80ddc3cc646dfeabab26907f53a5c714ef2fb22"],
    G02: [17, "20d64cb0c44c54671006eab4e04f844e87d9d052c4b1b4299c66aa582934998b"],
    G03: [21, "d823b25d948216253ecfb705357bbf7749f3f7a8455cb0acf43d0def596fb39b"],
    G05: [31, "b7de26f94b554423407517932a04a0eb5eaad0f8d443671334fe000bc42dc04f"],
    G06: [21, "02c046e000f77e4c1696f5a237700aea1542f51ebdd716cbea300e9cf3b37eb7"],
    G07: [29, "c81d5ec65a6e0311eaeaf1d31a4a99c3f59c18389e7c2ff9ab1b96c8bccc0022"],
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
