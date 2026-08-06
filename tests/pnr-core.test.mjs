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

function runToStop(cue = "neutral") {
  const simulation = new PnrSimulation({ cue });
  for (let i = 0; i < 600 && !simulation.world.terminal; i += 1) {
    simulation.step();
  }
  return simulation;
}

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
  for (const cue of ["neutral", "overplay_right"]) {
    const simulation = new PnrSimulation({ cue });
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
  const simulation = new PnrSimulation();
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
});

test("events use a fixed order and only reach planners at a later boundary", () => {
  const simulation = runToStop("neutral");
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
  for (const cue of ["neutral", "overplay_right"]) {
    const simulation = new PnrSimulation({ cue });
    for (let i = 0; i < 600 && !simulation.world.terminal; i += 1) {
      simulation.step();
      if (simulation.world.facts.impeded) {
        assert.ok(simulation.world.facts.contact || simulation.world.facts.routeExposure);
      }
    }
  }
});
