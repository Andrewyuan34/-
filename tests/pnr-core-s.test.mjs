// Core invariants and S01-S08 regression tests.

import test from "node:test";
import assert from "node:assert/strict";
import {
  COURT,
  EVENT_ORDER,
  FIXED_DT,
  PLAYER_IDS,
  PnrSimulation,
  UNDER_PULLUP_CLEAN_STOP_MIN_BODY_GAP,
  UNDER_PULLUP_MAX_STOP_SPEED,
  UNDER_PULLUP_MIN_BODY_CLEARANCE,
  UNDER_PULLUP_MIN_RIMWARD_PROGRESS,
  createPlannerObservation,
  evaluateScreenFacts,
  isInsideThreePointArc,
  isInsideUnderPullupRegion,
  mirrorPointAcrossCenterline,
} from "../lib/pnr-core.ts";
import { createF00Replay } from "../lib/pnr-f00-formation.ts";
import {
  UNDER_R2_AUDIT,
  UNDER_R2_DEEP_RETREAT_RIGHT_INITIAL_POSITIONS,
  UNDER_R2_FALSE_POSITIVE_DEEP_RIGHT_INITIAL_POSITIONS,
  createUnderR2Replay,
  makeUnderR2DeepRetreatConfig,
  makeUnderR2FalsePositiveDeepConfig,
} from "../lib/pnr-under-r2.ts";
import {
  DEFAULT_SCENARIO_ID,
  PNR_SCENARIOS,
  makeInitialPositionsForCue,
  makeScenarioConfig,
} from "../lib/pnr-scenarios.ts";

import {
  makeTestConfig,
  runScenarioToStop,
  p00LegacyGroupDigest,
  approvedConfigGroups,
} from "./helpers/pnr-test-harness.mjs";

function runToStop(cue = "neutral") {
  const simulation = new PnrSimulation(makeTestConfig(cue));
  for (let i = 0; i < 600 && !simulation.world.terminal; i += 1) {
    simulation.step();
  }
  return simulation;
}

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

test("UNDER R2 changes only the two approved inputs that actually enter UNDER", () => {
  const groups = approvedConfigGroups();
  const underEntries = [];
  for (const [group, entries] of Object.entries(groups)) {
    for (const [id, config] of entries) {
      const simulation = new PnrSimulation(config);
      while (!simulation.world.terminal && simulation.world.tick < 600) simulation.step();
      if (simulation.eventLog.some((event) => event.type === "under_committed")) {
        underEntries.push(`${group}/${id}`);
      }
    }
  }
  assert.deepEqual(underEntries, ["S/S07", "G07/scenario/S07"]);

  const expectedNonUnder = {
    S: [7, "fba73bf322738fa9711441144867069b80b13fad7bcfb937d8b1162ebf0fb6cf"],
    G01: [19, "c4e24d170eb215871daff655b80ddc3cc646dfeabab26907f53a5c714ef2fb22"],
    G02: [17, "20d64cb0c44c54671006eab4e04f844e87d9d052c4b1b4299c66aa582934998b"],
    G03: [21, "d823b25d948216253ecfb705357bbf7749f3f7a8455cb0acf43d0def596fb39b"],
    G05: [31, "b7de26f94b554423407517932a04a0eb5eaad0f8d443671334fe000bc42dc04f"],
    G06: [21, "02c046e000f77e4c1696f5a237700aea1542f51ebdd716cbea300e9cf3b37eb7"],
    G07: [28, "6e26e4ef4519d0d5bc5d8201b36c4f3ca39a7d90f389052dd6023dfd3da61f7b"],
    G08: [24, "836238e356d1983a9b119a2b55bc847eb8fbfcdfca4f15f5af6f836752942bc7"],
  };
  for (const [group, entries] of Object.entries(groups)) {
    const filtered = entries.filter(([id]) =>
      !(group === "S" && id === "S07") &&
      !(group === "G07" && id === "scenario/S07")
    );
    assert.equal(filtered.length, expectedNonUnder[group][0], `${group} non-UNDER count`);
    assert.equal(
      p00LegacyGroupDigest(filtered),
      expectedNonUnder[group][1],
      `${group} non-UNDER tick trace`,
    );
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

test("S07 replans from the real clear snapshot before attacking the open hip", () => {
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
  const drive = simulation.eventLog.find((event) => event.type === "under_drive_advantage");
  const firstUnderRead = simulation.planningLog.find(
    (record) => record.decisionPhase === "offense_under_read",
  );
  const postClearRead = simulation.planningLog.find(
    (record) =>
      record.team === "offense" &&
      record.tick === cleared?.availableAtTick,
  );
  const postClearDefense = simulation.planningLog.find(
    (record) =>
      record.team === "defense" &&
      record.tick === cleared?.availableAtTick,
  );
  const eventualAttackRead = simulation.planningLog.find(
    (record) =>
      record.team === "offense" &&
      record.tick > (cleared?.availableAtTick ?? Number.POSITIVE_INFINITY) &&
      record.chosen === "ATTACK_UNDER_GAP",
  );
  const attack = eventualAttackRead?.candidates.find(
    (candidate) => candidate.id === "ATTACK_UNDER_GAP",
  );
  const pullup = eventualAttackRead?.candidates.find(
    (candidate) => candidate.id === "TAKE_UNDER_PULLUP",
  );
  const initialDefense = simulation.planningLog.find((record) => record.team === "defense");
  const roles = new Map(simulation.getRoles().map((role) => [role.playerId, role]));

  assert.ok(under);
  assert.ok(cleared);
  assert.ok(drive);
  assert.ok(firstUnderRead);
  assert.ok(postClearRead);
  assert.ok(postClearDefense);
  assert.ok(eventualAttackRead);
  assert.equal(initialDefense?.chosen, "UNDER");
  assert.equal(firstUnderRead.tick, under.availableAtTick);
  assert.ok(firstUnderRead.tick > under.tick);
  assert.equal(postClearRead.tick, cleared.availableAtTick);
  assert.equal(postClearDefense.tick, cleared.availableAtTick);
  assert.equal(postClearRead.chosen, "RESET_UNDER");
  assert.equal(simulation.offensePlan.route?.boundary, "screen_cleared");
  assert.equal(simulation.defensePlan.route?.boundary, "screen_cleared");
  assert.equal(attack?.feasible, true);
  assert.equal(attack?.strategyAdjustment, 0);
  assert.equal(pullup?.feasible, false);
  assert.ok(pullup?.vetoes.length > 0);
  assert.ok(under.tick < cleared.tick);
  assert.ok(cleared.tick < drive.tick);
  assert.equal(simulation.planningLog.some((record) => record.chosen === "SWITCH"), false);
  assert.equal(simulation.eventLog.some((event) => event.type === "switch_completed"), false);
  assert.equal(simulation.eventLog.some((event) => event.type === "pullup_window"), false);
  assert.equal(simulation.eventLog.some((event) => event.type === "under_contained"), false);
  assert.equal(simulation.world.facts.matchupExchange, false);
  assert.equal(simulation.world.under.active, true);
  assert.equal(simulation.world.under.pullupWindow, false);
  assert.equal(simulation.world.under.driveAdvantage, true);
  assert.equal(simulation.world.under.d1Recovered, false);
  assert.ok(minimumD1O5Gap >= -0.01);
  assert.equal(simulation.world.ballOwner, "O1");
  assert.equal(simulation.world.terminal?.reason, "under_drive_advantage");
  assert.equal(roles.get("O1")?.roleCode, "attack_under_gap");
  assert.equal(roles.get("O5")?.roleCode, "occupy_under_big");
  assert.equal(roles.get("D1")?.roleCode, "navigate_under");
  assert.equal(roles.get("D5")?.roleCode, "under_hold_roller");
});

test("UNDER never creates a pull-up window while D5 is at near-contact body clearance", () => {
  for (const [id, simulation] of [
    ["S07", new PnrSimulation(makeScenarioConfig("under_screen_pullup_window"))],
    ["F00", createF00Replay("right")],
  ]) {
    let sawNearContact = false;
    while (!simulation.world.terminal && simulation.world.tick < 600) {
      simulation.step();
      if (!simulation.world.under.active) continue;
      const o1 = simulation.world.players.O1;
      const d5 = simulation.world.players.D5;
      const bodyGap = Math.hypot(o1.pos.x - d5.pos.x, o1.pos.y - d5.pos.y) -
        o1.radius - d5.radius;
      if (bodyGap < UNDER_PULLUP_MIN_BODY_CLEARANCE) sawNearContact = true;
      if (simulation.world.under.pullupWindow) {
        assert.ok(
          bodyGap >= UNDER_PULLUP_MIN_BODY_CLEARANCE,
          `${id} produced pullup_window with only ${bodyGap.toFixed(3)}m body clearance`,
        );
        assert.equal(simulation.world.under.d5Contest, false);
      }
    }
    assert.equal(sawNearContact, true, `${id} must exercise the negative contest boundary`);
    assert.equal(
      simulation.eventLog.some((event) => event.type === "pullup_window"),
      false,
      `${id} must not turn near contact into a free pull-up`,
    );
  }
});

test("screen_cleared commits immutable post-clear routes on the next planner boundary", () => {
  const simulation = createF00Replay("right");
  while (
    !simulation.world.terminal &&
    !simulation.eventLog.some((event) => event.type === "screen_cleared") &&
    simulation.world.tick < 600
  ) {
    simulation.step();
  }
  const cleared = simulation.eventLog.find((event) => event.type === "screen_cleared");
  assert.ok(cleared);
  while (
    !simulation.world.terminal &&
    simulation.offensePlan.route?.boundary !== "screen_cleared" &&
    simulation.world.tick <= cleared.availableAtTick
  ) {
    simulation.step();
  }

  assert.equal(simulation.offensePlan.route?.boundary, "screen_cleared");
  assert.equal(simulation.defensePlan.route?.boundary, "screen_cleared");
  assert.equal(simulation.offensePlan.route?.committedAtTick, cleared.availableAtTick);
  assert.equal(simulation.defensePlan.route?.committedAtTick, cleared.availableAtTick);
  assert.ok(simulation.offensePlan.route?.tracks.O1?.segments.length > 0);
  assert.ok(simulation.defensePlan.route?.tracks.D1?.segments.length > 0);
  assert.ok(simulation.offensePlan.route.routeVersion > 0);
  assert.ok(simulation.defensePlan.route.routeVersion > 0);
  assert.ok(
    simulation.offensePlan.route.minimumCommitUntilTick >
      simulation.offensePlan.route.committedAtTick,
  );
  assert.ok(
    simulation.defensePlan.route.minimumCommitUntilTick >
      simulation.defensePlan.route.committedAtTick,
  );
  assert.equal(UNDER_R2_AUDIT.deepRetreat.orderIndependent, true);
  assert.equal(UNDER_R2_AUDIT.f00.orderIndependent, true);
});

test("the original deep-retreat false-positive coordinates never publish pullup_window", () => {
  assert.deepEqual(
    makeUnderR2FalsePositiveDeepConfig("right").initialPositions,
    UNDER_R2_FALSE_POSITIVE_DEEP_RIGHT_INITIAL_POSITIONS,
  );
  for (const side of ["right", "left"]) {
    const simulation = new PnrSimulation(makeUnderR2FalsePositiveDeepConfig(side));
    while (!simulation.world.terminal && simulation.world.tick < 600) simulation.step();
    assert.equal(simulation.eventLog.some((event) => event.type === "pullup_window"), false);
    assert.equal(simulation.world.under.pullupWindow, false);
  }
  assert.equal(UNDER_R2_AUDIT.negativeDeep.passed, true);
  assert.deepEqual(UNDER_R2_AUDIT.negativeDeep.failures, []);
});

test("a fixed test-level deep retreat creates a real deceleration pull-up and mirrors exactly", () => {
  assert.equal(UNDER_R2_AUDIT.passed, true);
  assert.equal(UNDER_R2_AUDIT.deepRetreat.passed, true);
  assert.deepEqual(UNDER_R2_AUDIT.deepRetreat.failures, []);
  assert.equal(UNDER_R2_AUDIT.deepRetreat.deterministicRight, true);
  assert.equal(UNDER_R2_AUDIT.deepRetreat.deterministicLeft, true);
  assert.equal(UNDER_R2_AUDIT.deepRetreat.orderIndependent, true);
  assert.equal(UNDER_R2_AUDIT.deepRetreat.privateRouteTraceAudited, true);
  assert.equal(UNDER_R2_AUDIT.f00.orderIndependent, true);
  assert.equal(UNDER_R2_AUDIT.privacy.passed, true);
  assert.deepEqual(UNDER_R2_AUDIT.privacy.failures, []);
  assert.deepEqual(
    makeUnderR2DeepRetreatConfig("right").initialPositions,
    UNDER_R2_DEEP_RETREAT_RIGHT_INITIAL_POSITIONS,
  );
  const right = createUnderR2Replay("deep-retreat", "right");
  const left = createUnderR2Replay("deep-retreat", "left");
  const rightReplay = createUnderR2Replay("deep-retreat", "right");
  const leftReplay = createUnderR2Replay("deep-retreat", "left");
  let maximumMirrorError = 0;
  let maximumO1Speed = 0;
  const lastRouteCursor = new Map();

  while (!right.world.terminal && !left.world.terminal) {
    assert.equal(right.world.stateHash, rightReplay.world.stateHash);
    assert.equal(left.world.stateHash, leftReplay.world.stateHash);
    assert.equal(left.offensePlan.id, right.offensePlan.id);
    assert.equal(left.defensePlan.id, right.defensePlan.id);
    assert.deepEqual(right.offensePlan.route, rightReplay.offensePlan.route);
    assert.deepEqual(right.defensePlan.route, rightReplay.defensePlan.route);
    assert.deepEqual(left.offensePlan.route, leftReplay.offensePlan.route);
    assert.deepEqual(left.defensePlan.route, leftReplay.defensePlan.route);
    for (const [side, simulation] of [["right", right], ["left", left]]) {
      for (const [team, route] of [
        ["offense", simulation.offensePlan.route],
        ["defense", simulation.defensePlan.route],
      ]) {
        if (!route) continue;
        for (const [playerId, track] of Object.entries(route.tracks)) {
          assert.ok(track.segments.every((segment) => segment.proof.legal));
          const key = `${side}/${team}/${route.routeVersion}/${playerId}`;
          const previousCursor = lastRouteCursor.get(key) ?? 0;
          assert.ok(track.segmentIndex >= previousCursor, `${key} route cursor regressed`);
          lastRouteCursor.set(key, track.segmentIndex);
        }
      }
    }
    assert.deepEqual(
      left.getRoles().map(({ playerId, roleCode }) => ({ playerId, roleCode })),
      right.getRoles().map(({ playerId, roleCode }) => ({ playerId, roleCode })),
    );
    maximumO1Speed = Math.max(
      maximumO1Speed,
      Math.hypot(right.world.players.O1.vel.x, right.world.players.O1.vel.y),
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
    rightReplay.step();
    leftReplay.step();
  }

  const under = right.eventLog.find((event) => event.type === "under_committed");
  const screenCleared = right.eventLog.find((event) => event.type === "screen_cleared");
  const pullupWindow = right.eventLog.find((event) => event.type === "pullup_window");
  const read = right.planningLog.find(
    (record) => record.decisionPhase === "offense_under_read",
  );
  const candidate = read?.candidates.find(
    (entry) => entry.id === "TAKE_UNDER_PULLUP",
  );
  assert.ok(under);
  assert.ok(screenCleared);
  assert.ok(pullupWindow);
  assert.ok(read);
  assert.equal(read.tick, under.availableAtTick);
  assert.equal(read.chosen, "TAKE_UNDER_PULLUP");
  assert.equal(candidate?.feasible, true);
  assert.equal(candidate?.strategyAdjustment, 0);
  assert.ok(pullupWindow.tick > screenCleared.tick);
  assert.ok(maximumO1Speed >= 2);
  assert.ok(right.world.under.o1Speed <= UNDER_PULLUP_MAX_STOP_SPEED);
  assert.equal(isInsideThreePointArc(right.world.players.O1.pos), true);
  assert.equal(isInsideUnderPullupRegion(right.world.players.O1.pos), true);
  assert.ok(
    right.world.under.rimwardProgressAfterClear >=
      UNDER_PULLUP_MIN_RIMWARD_PROGRESS,
  );
  assert.equal(right.world.under.cleanDeceleration, true);
  assert.ok(
    UNDER_R2_AUDIT.deepRetreat.minimumO1BodyGapDuringDeceleration >=
      UNDER_PULLUP_CLEAN_STOP_MIN_BODY_GAP,
  );
  assert.equal(right.world.under.pullupCommitted, true);
  assert.equal(right.world.under.d5DeepRetreat, true);
  assert.equal(right.world.under.d5Contest, false);
  assert.ok(right.world.under.d5BodyGap >= UNDER_PULLUP_MIN_BODY_CLEARANCE);
  assert.equal(right.world.terminal?.reason, "under_pullup_window");
  assert.equal(left.world.terminal?.reason, right.world.terminal?.reason);
  assert.deepEqual(
    left.eventLog.map(({ type, tick }) => ({ type, tick })),
    right.eventLog.map(({ type, tick }) => ({ type, tick })),
  );
  assert.ok(maximumMirrorError <= 1e-9);
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
