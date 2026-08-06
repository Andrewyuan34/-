import test from "node:test";
import assert from "node:assert/strict";
import {
  COURT,
  EVENT_ORDER,
  FIXED_DT,
  PLAYER_IDS,
  PnrSimulation,
  createPlannerObservation,
  evaluateScreenFacts,
} from "../lib/pnr-core.ts";
import {
  DEFAULT_SCENARIO_ID,
  PNR_SCENARIOS,
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

function runToStop(cue = "neutral") {
  const simulation = new PnrSimulation({ cue });
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
    for (const forbidden of ["terminal", "outcome", "ballOwner", "winner", "plan"]) {
      assert.equal(publicInputText.includes(forbidden), false);
    }

    const first = runScenarioToStop(scenario.id);
    const replay = runScenarioToStop(scenario.id);
    assert.equal(first.world.stateHash, replay.world.stateHash);
    assert.equal(first.world.branch, scenario.checkpoint.branch);
    assert.equal(first.world.terminal?.reason, scenario.checkpoint.terminalReason);
    assert.equal(first.world.ballOwner, scenario.checkpoint.ballOwner);
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
  const simulation = new PnrSimulation({ cue: "neutral" });
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
  const simulation = new PnrSimulation({ cue: "neutral" });
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
  const simulation = new PnrSimulation({ cue: "neutral" });
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
  const simulation = new PnrSimulation({ cue: "neutral" });
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
  const simulation = new PnrSimulation();
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
  const simulation = new PnrSimulation();
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
