// T00-T01 minimum tactical vocabulary tests.

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  FIXED_DT,
  MINIMUM_TACTICAL_VOCABULARY_VERSION,
  PnrSimulation,
  TACTICAL_CHASE_MIN_ROUTE_CLEARANCE,
  TACTICAL_POCKET_MIN_FLIGHT_TICKS,
  TACTICAL_POCKET_MIN_RELEASE_DISTANCE,
  TACTICAL_TEAMMATE_CHANNEL_CLEARANCE,
  createPlannerObservation,
  distance,
} from "../lib/pnr-core.ts";
import {
  TACTICAL_INPUT_HASH,
  TACTICAL_INPUT_MANIFEST_VERSION,
  TACTICAL_MANIFEST_INPUTS,
  canonicalTacticalInputJson,
  findTacticalManifestOutputFields,
} from "../lib/pnr-tactical-manifest.ts";
import {
  createTacticalReplay,
  makeTacticalAuditConfig,
  scanTacticalVocabulary,
} from "../lib/pnr-tactical-audit.ts";

let cachedAudit;

function tacticalAudit() {
  cachedAudit ??= scanTacticalVocabulary();
  return cachedAudit;
}

function runReplay(inputId, side = "right") {
  const simulation = createTacticalReplay(inputId, side);
  for (let tick = 0; tick < 500 && !simulation.world.terminal; tick += 1) {
    simulation.step();
  }
  return simulation;
}

function runReplayWithFrames(inputId, side = "right") {
  const simulation = createTacticalReplay(inputId, side);
  const frames = [];
  const capture = () => {
    frames.push({
      tick: simulation.world.tick,
      o1: { ...simulation.world.players.O1.pos },
      o5: { ...simulation.world.players.O5.pos },
      ballOwner: simulation.world.ballOwner,
      ballInFlight: simulation.world.ball.inFlight,
      ballKind: simulation.world.ball.kind,
    });
  };
  capture();
  for (let tick = 0; tick < 500 && !simulation.world.terminal; tick += 1) {
    simulation.step();
    capture();
  }
  return { simulation, frames };
}

function eventTick(simulation, type) {
  return simulation.eventLog.find((event) => event.type === type)?.tick ?? null;
}

test("T manifest is input-only, versioned, frozen, and hash-locked", () => {
  assert.equal(TACTICAL_INPUT_MANIFEST_VERSION, "minimum-t-inputs@1");
  assert.equal(TACTICAL_MANIFEST_INPUTS.length, 4);
  assert.deepEqual(
    TACTICAL_MANIFEST_INPUTS.map((input) => input.stage),
    ["T00", "T00", "T01", "T01"],
  );
  assert.equal(new Set(TACTICAL_MANIFEST_INPUTS.map((input) => input.id)).size, 4);
  assert.deepEqual(findTacticalManifestOutputFields(TACTICAL_MANIFEST_INPUTS), []);
  assert.equal(
    `sha256:${createHash("sha256").update(canonicalTacticalInputJson()).digest("hex")}`,
    TACTICAL_INPUT_HASH,
  );
  for (const input of TACTICAL_MANIFEST_INPUTS) {
    assert.ok(Object.isFrozen(input));
    assert.ok(Object.isFrozen(input.initialPositions));
    for (const point of Object.values(input.initialPositions)) assert.ok(Object.isFrozen(point));
  }
  const manifestSource = readFileSync(
    new URL("../lib/pnr-tactical-manifest.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    manifestSource,
    /new\s+PnrSimulation|planningLog|eventLog|world\.|scanTacticalVocabulary/,
  );
});

test("T vocabulary is an explicit preset-only opt-in and leaves legacy candidates untouched", () => {
  const input = TACTICAL_MANIFEST_INPUTS[0];
  const enabledConfig = makeTacticalAuditConfig(input, "right");
  const enabled = new PnrSimulation(enabledConfig);
  const legacy = new PnrSimulation({
    ...enabledConfig,
    horizon: "pnr_resolution",
    tacticalVocabularyVersion: undefined,
  });

  assert.equal(enabled.world.tacticalVocabularyVersion, MINIMUM_TACTICAL_VOCABULARY_VERSION);
  assert.ok(enabled.world.tacticalCoverage);
  assert.equal(legacy.world.tacticalCoverage, undefined);
  assert.equal(legacy.world.tacticalVocabularyVersion, undefined);
  assert.ok(enabled.planningLog.some((record) =>
    record.candidates.some((candidate) => candidate.id === "DROP_CONTAIN")
  ));
  assert.ok(legacy.planningLog.every((record) =>
    record.candidates.every((candidate) =>
      !["DROP_CONTAIN", "CHASE_OVER"].includes(candidate.id)
    )
  ));
  assert.throws(
    () => new PnrSimulation({ ...enabledConfig, tacticalVocabularyVersion: "minimum-t@2" }),
    /tacticalVocabularyVersion must be/,
  );
  assert.throws(
    () => new PnrSimulation({ ...enabledConfig, startMode: "form_pnr" }),
    /requires explicit preset_pnr/,
  );
  assert.throws(
    () => new PnrSimulation({ ...enabledConfig, setupMode: "auto" }),
    /requires explicit preset_pnr/,
  );
});

test("T00 publishes real drop facts before offense reads pull-up or containment", () => {
  const audit = tacticalAudit();
  const pullup = audit.rows.find((row) => row.focus === "deep_drop_read");
  const contained = audit.rows.find((row) => row.focus === "coverage_containment");
  assert.ok(pullup);
  assert.ok(contained);

  for (const side of [pullup.right, pullup.left]) {
    assert.equal(side.terminalReason, "tactical_pullup_window");
    assert.ok(side.dropCommittedTick < side.terminalTick);
    assert.ok(side.offenseReads.includes("TAKE_DROP_PULLUP"));
    assert.ok(side.defenseCoverages.includes("DROP_CONTAIN"));
    assert.equal(side.noMatchupExchange, true);
  }
  for (const side of [contained.right, contained.left]) {
    assert.equal(side.terminalReason, "tactical_contained");
    assert.ok(side.dropCommittedTick < side.terminalTick);
    assert.ok(side.offenseReads.includes("RESET_CHASE"));
    assert.equal(side.noMatchupExchange, true);
  }

  const replay = runReplay("T00-C01");
  const dropTick = eventTick(replay, "drop_committed");
  const pullupTick = eventTick(replay, "tactical_pullup_window");
  assert.ok(dropTick < pullupTick);
  assert.equal(replay.world.tacticalCoverage.dropCommitted, true);
  assert.equal(replay.world.tacticalCoverage.pullupWindow, true);
  assert.equal(replay.world.ballOwner, "O1");
  assert.equal(replay.world.ball.inFlight, false);
});

test("T01 resolves chase-over into snake and a real pocket-pass flight", () => {
  const snake = runReplay("T01-C01");
  assert.equal(snake.world.terminal?.reason, "tactical_snake_advantage");
  assert.ok(eventTick(snake, "drop_committed") < eventTick(snake, "chase_over_committed"));
  assert.ok(eventTick(snake, "chase_over_committed") < eventTick(snake, "tactical_snake_advantage"));
  assert.ok(snake.planningLog.some((record) => record.chosen === "CHASE_OVER"));
  assert.ok(snake.planningLog.some((record) => record.chosen === "SNAKE_CHASE"));
  assert.equal(snake.world.tacticalCoverage.snakeCommitted, true);
  assert.equal(snake.world.tacticalCoverage.snakeAdvantage, true);
  assert.equal(snake.world.facts.matchupExchange, false);

  const pocketReplay = runReplayWithFrames("T01-C02");
  const pocket = pocketReplay.simulation;
  const chaseTick = eventTick(pocket, "chase_over_committed");
  const windowTick = eventTick(pocket, "pocket_window_open");
  const launchTick = eventTick(pocket, "pocket_pass_launched");
  const catchTick = eventTick(pocket, "pocket_pass_caught");
  assert.equal(pocket.world.terminal?.reason, "tactical_pocket_caught");
  assert.ok(chaseTick < windowTick);
  assert.ok(windowTick < launchTick);
  assert.ok(catchTick - launchTick >= TACTICAL_POCKET_MIN_FLIGHT_TICKS);
  const releaseFrame = pocketReplay.frames.find((frame) => frame.tick === launchTick);
  assert.ok(releaseFrame);
  assert.ok(
    distance(releaseFrame.o1, releaseFrame.o5) >=
      TACTICAL_POCKET_MIN_RELEASE_DISTANCE - 1e-9,
  );
  const flightFrames = pocketReplay.frames.filter(
    (frame) => frame.tick >= launchTick && frame.tick < catchTick,
  );
  assert.equal(flightFrames.length, catchTick - launchTick);
  for (const frame of flightFrames) {
    assert.equal(frame.ballOwner, null);
    assert.equal(frame.ballInFlight, true);
    assert.equal(frame.ballKind, "pocket_pass");
  }
  assert.equal(pocket.world.ball.kind, "pocket_pass");
  assert.equal(pocket.world.ball.outcome, "caught");
  assert.equal(pocket.world.ballOwner, "O5");
  assert.ok(pocket.planningLog.some((record) => record.chosen === "POCKET_PASS"));
  assert.ok(pocket.planningLog.some((record) => record.chosen === "CHASE_OVER"));

  const chaseReads = pocket.planningLog.filter(
    (record) => record.decisionPhase === "offense_chase_read",
  );
  const committedPocket = chaseReads.at(-1).candidates.find(
    (candidate) => candidate.id === "POCKET_PASS",
  );
  assert.equal(committedPocket.feasible, true);
  assert.equal(committedPocket.strategyAdjustment, 0);
});

test("T pocket flight resolves before any already-public snake advantage", () => {
  const simulation = createTacticalReplay("T01-C02");
  while (
    !simulation.world.terminal &&
    eventTick(simulation, "pocket_pass_launched") === null
  ) {
    simulation.step();
  }
  assert.equal(simulation.world.ball.inFlight, true);
  assert.equal(simulation.world.ball.kind, "pocket_pass");
  simulation.world.tacticalCoverage = {
    ...simulation.world.tacticalCoverage,
    snakeAdvantage: true,
  };

  while (!simulation.world.terminal) simulation.step();

  assert.equal(simulation.world.terminal.reason, "tactical_pocket_caught");
  assert.ok(eventTick(simulation, "pocket_pass_caught") !== null);
});

test("T teammate channels preserve handler space without reset orbits", () => {
  const audit = tacticalAudit();
  assert.equal(audit.teammateCoordinationPassed, true);
  assert.equal(audit.pocketFlightPassed, true);

  for (const row of audit.rows) {
    for (const side of [row.right, row.left]) {
      assert.ok(
        side.minimumTeammateBodyGap >= TACTICAL_TEAMMATE_CHANNEL_CLEARANCE - 1e-6,
        `${row.id}/${side.side}: teammate gap ${side.minimumTeammateBodyGap}`,
      );
      assert.ok(side.maximumNearZeroTeammateTicks <= Math.ceil(0.1 / FIXED_DT));
      assert.ok(side.maximumCloseDualMovingTicks <= Math.ceil(0.05 / FIXED_DT));
      assert.ok(side.maximumResetRelativeTurnDegrees <= 45 + 1e-9);
      assert.ok(side.maximumChaseCloseTurnDegrees <= 90 + 1e-9);
      assert.equal(side.resetRollRouteSafe, true);
    }
  }

  const contained = audit.rows.find((row) => row.focus === "coverage_containment");
  assert.ok(contained);
  assert.ok(contained.right.offenseReads.includes("RESET_CHASE"));
  assert.ok(contained.left.offenseReads.includes("RESET_CHASE"));

  const pocket = audit.rows.find((row) => row.focus === "chase_pocket");
  assert.ok(pocket);
  for (const side of [pocket.right, pocket.left]) {
    assert.ok(
      side.pocketReleaseDistance >= TACTICAL_POCKET_MIN_RELEASE_DISTANCE - 1e-9,
    );
    assert.ok(side.pocketFlightTicks >= TACTICAL_POCKET_MIN_FLIGHT_TICKS);
    assert.equal(side.pocketFlightStatePassed, true);
  }
});

test("T chase routes are private legal commitments and observations expose no opponent plan", () => {
  const simulation = createTacticalReplay("T01-C01");
  assert.equal(simulation.defensePlan.id, "CHASE_OVER");
  const d1Track = simulation.defensePlan.route?.tracks.D1;
  const d5Track = simulation.defensePlan.route?.tracks.D5;
  assert.ok(d1Track?.segments.length > 0);
  assert.ok(d5Track?.segments.length > 0);
  for (const segment of [...d1Track.segments, ...d5Track.segments]) {
    assert.equal(segment.proof.legal, true);
    assert.equal(segment.proof.courtLegal, true);
    assert.ok(
      segment.proof.minimumBodyClearance >= TACTICAL_CHASE_MIN_ROUTE_CLEARANCE - 1e-6 ||
        segment.proof.releasesExistingContactByBlocker?.length,
    );
  }

  const offenseObservation = createPlannerObservation(simulation.world, "offense");
  const defenseObservation = createPlannerObservation(simulation.world, "defense");
  assert.deepEqual(offenseObservation.ownPlayerIds, ["O1", "O5"]);
  assert.deepEqual(defenseObservation.ownPlayerIds, ["D1", "D5"]);
  assert.equal(Object.hasOwn(offenseObservation, "defensePlan"), false);
  assert.equal(Object.hasOwn(defenseObservation, "offensePlan"), false);
  assert.equal(Object.hasOwn(offenseObservation, "defenseStrategy"), false);
  assert.equal(Object.hasOwn(defenseObservation, "offenseStrategy"), false);
});

test("T audit passes deterministic, planner-order, mirror, causality, route, and strategy gates", () => {
  const audit = tacticalAudit();
  assert.equal(audit.inputHash, TACTICAL_INPUT_HASH);
  assert.equal(audit.inputCount, 4);
  assert.equal(audit.worldCount, 8);
  assert.equal(audit.executionsPerWorld, 3);
  assert.equal(audit.deterministic, true);
  assert.equal(audit.evaluationOrderStable, true);
  assert.equal(audit.mirrored, true);
  assert.equal(audit.routesLegal, true);
  assert.equal(audit.publicCausalityPassed, true);
  assert.equal(audit.informationBoundaryPassed, true);
  assert.equal(audit.zeroStrategyAdjustment, true);
  assert.equal(audit.teammateCoordinationPassed, true);
  assert.equal(audit.pocketFlightPassed, true);
  assert.equal(audit.stageCoveragePassed, true);
  assert.equal(audit.firstFailure, null);
  assert.equal(audit.passed, true);
  for (const row of audit.rows) {
    assert.equal(row.passed, true, `${row.id}: ${row.failures.join(", ")}`);
    assert.ok(row.mirrorMaximumError <= 1e-9);
    assert.equal(row.right.terminalReason, row.left.terminalReason);
    assert.equal(row.right.terminalTick, row.left.terminalTick);
    assert.deepEqual(
      row.right.events.map((event) => [event.tick, event.type]),
      row.left.events.map((event) => [event.tick, event.type]),
    );
  }
});
