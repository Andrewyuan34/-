import {
  COURT,
  FIXED_DT,
  PLAYER_IDS,
  PnrSimulation,
  createPlannerObservation,
  distance,
  mirrorPointAcrossCenterline,
  type InitialPlayerPositions,
  type PlayerId,
  type PlanningRecord,
  type ScreenSide,
  type SimulationConfig,
  type TerminalState,
  type Vec2,
  type WorldEvent,
} from "./pnr-core.ts";
import {
  G06_SPECS,
  makeG06Config,
} from "./pnr-g06-combinations.ts";
import {
  PNR_SCENARIOS,
  makeScenarioConfig,
  type ScenarioId,
} from "./pnr-scenarios.ts";

export type G07SourceKind = "scenario" | "g06";

export interface G07Spec {
  id: string;
  sourceKind: G07SourceKind;
  sourceId: string;
  label: string;
}

export interface G07PairRow extends G07Spec {
  initialMirrorExact: boolean;
  rightDeterministic: boolean;
  leftDeterministic: boolean;
  worldMirrorPassed: boolean;
  plansAndRolesEquivalent: boolean;
  candidatesEquivalent: boolean;
  eventsEquivalent: boolean;
  factsEquivalent: boolean;
  terminalEquivalent: boolean;
  informationBoundaryPassed: boolean;
  rightInvariantFailures: string[];
  leftInvariantFailures: string[];
  maxPositionError: number;
  maxVelocityError: number;
  maxBallError: number;
  maxPlanTargetError: number;
  maxScalarError: number;
  maxMirrorError: number;
  minimumLeftBodyGap: number;
  rightTerminalReason: TerminalState["reason"];
  leftTerminalReason: TerminalState["reason"];
  terminalTick: number;
  rightEventSummary: string[];
  leftEventSummary: string[];
}

export interface G07ReplayPair {
  id: "switch" | "reject-slip" | "post-kickout";
  specId: string;
  label: string;
  note: string;
}

export type G07ReplayId = G07ReplayPair["id"];

export interface G07AuditResult {
  id: "G07";
  label: string;
  scenarioPairs: G07PairRow[];
  g06Pairs: G07PairRow[];
  rows: G07PairRow[];
  pairCount: number;
  deterministic: boolean;
  mirrorPassed: boolean;
  invariantsPassed: boolean;
  informationBoundaryPassed: boolean;
  maxMirrorError: number;
  tolerance: number;
  passed: boolean;
  failureReasons: string[];
  replays: G07ReplayPair[];
}

interface PairRun {
  row: Omit<G07PairRow, "rightDeterministic" | "leftDeterministic">;
  rightTrace: string[];
  leftTrace: string[];
}

const MIRROR_TOLERANCE = 1e-9;

export const G07_SPECS = Object.freeze([
  ...PNR_SCENARIOS.map((scenario) => ({
    id: `scenario/${scenario.code}`,
    sourceKind: "scenario" as const,
    sourceId: scenario.id,
    label: `${scenario.code} · ${scenario.label}`,
  })),
  ...G06_SPECS.map((spec) => ({
    id: `g06/${spec.id}`,
    sourceKind: "g06" as const,
    sourceId: spec.id,
    label: `G06 ${spec.id}`,
  })),
] satisfies G07Spec[]);

export const G07_REPLAY_PAIRS = Object.freeze([
  {
    id: "switch",
    specId: "scenario/S03",
    label: "正常使用掩护并换防",
    note: "S03 · 换防后 O5 深位接球",
  },
  {
    id: "reject-slip",
    specId: "scenario/S08",
    label: "拒绝后协防与顺下",
    note: "S08 · D5 真实协防后 O1 分给 O5",
  },
  {
    id: "post-kickout",
    specId: "scenario/S05",
    label: "接球后协防与分球",
    note: "S05 · D5 下沉后 O5 回传 O1",
  },
] satisfies G07ReplayPair[]);

function getSpec(id: string): G07Spec {
  const spec = G07_SPECS.find((candidate) => candidate.id === id);
  if (!spec) throw new Error(`Unknown G07 mirror spec: ${id}`);
  return spec;
}

export function makeG07Config(id: string, side: ScreenSide): SimulationConfig {
  const spec = getSpec(id);
  return spec.sourceKind === "scenario"
    ? makeScenarioConfig(spec.sourceId as ScenarioId, side)
    : makeG06Config(spec.sourceId, side);
}

export function createG07Replay(id: string, side: ScreenSide): PnrSimulation {
  return new PnrSimulation(makeG07Config(id, side));
}

function playerPairs(): Array<[PlayerId, PlayerId]> {
  const result: Array<[PlayerId, PlayerId]> = [];
  for (let first = 0; first < PLAYER_IDS.length; first += 1) {
    for (let second = first + 1; second < PLAYER_IDS.length; second += 1) {
      result.push([PLAYER_IDS[first], PLAYER_IDS[second]]);
    }
  }
  return result;
}

function eventFrame(events: WorldEvent[]): object[] {
  return events.map(({ type, tick, order, availableAtTick }) => ({
    type,
    tick,
    order,
    availableAtTick,
  }));
}

function planningFrame(records: PlanningRecord[]): object[] {
  return records.map(({ tick, at, team, trigger, triggerEventIds, chosen, candidates }) => ({
    tick,
    at,
    team,
    trigger,
    triggerEventIds,
    chosen,
    candidates: candidates.map(({ id, feasible, score, vetoes, evidence }) => ({
      id,
      feasible,
      score,
      vetoes,
      evidence,
    })),
  }));
}

function deterministicFrame(
  simulation: PnrSimulation,
  newPlanning: PlanningRecord[],
  newEvents: WorldEvent[],
): string {
  return JSON.stringify({
    world: simulation.world,
    offensePlan: simulation.offensePlan,
    defensePlan: simulation.defensePlan,
    roles: simulation.getRoles(),
    planning: planningFrame(newPlanning),
    events: eventFrame(newEvents),
  });
}

function pointMirrorError(right: Vec2, left: Vec2): number {
  const mirrored = mirrorPointAcrossCenterline(right);
  return Math.max(Math.abs(mirrored.x - left.x), Math.abs(mirrored.y - left.y));
}

function vectorMirrorError(right: Vec2, left: Vec2): number {
  return Math.max(Math.abs(right.x + left.x), Math.abs(right.y - left.y));
}

function structuredNumericError(right: unknown, left: unknown): number {
  if (typeof right === "number" && typeof left === "number") {
    return Math.abs(right - left);
  }
  if (right === left) return 0;
  if (Array.isArray(right) && Array.isArray(left) && right.length === left.length) {
    return Math.max(0, ...right.map((value, index) => structuredNumericError(value, left[index])));
  }
  if (
    right &&
    left &&
    typeof right === "object" &&
    typeof left === "object"
  ) {
    const rightRecord = right as Record<string, unknown>;
    const leftRecord = left as Record<string, unknown>;
    const rightKeys = Object.keys(rightRecord).sort();
    const leftKeys = Object.keys(leftRecord).sort();
    if (JSON.stringify(rightKeys) !== JSON.stringify(leftKeys)) return Number.POSITIVE_INFINITY;
    return Math.max(
      0,
      ...rightKeys.map((key) => structuredNumericError(rightRecord[key], leftRecord[key])),
    );
  }
  return Number.POSITIVE_INFINITY;
}

function planScalarFrame(simulation: PnrSimulation): object {
  return {
    offense: {
      id: simulation.offensePlan.id,
      version: simulation.offensePlan.version,
      startedAt: simulation.offensePlan.startedAt,
      startedTick: simulation.offensePlan.startedTick,
      commitUntil: simulation.offensePlan.commitUntil,
      watchdogAt: simulation.offensePlan.watchdogAt,
      chosenScore: simulation.offensePlan.chosenScore,
      passTarget: simulation.offensePlan.passTarget,
    },
    defense: {
      id: simulation.defensePlan.id,
      version: simulation.defensePlan.version,
      startedAt: simulation.defensePlan.startedAt,
      startedTick: simulation.defensePlan.startedTick,
      commitUntil: simulation.defensePlan.commitUntil,
      watchdogAt: simulation.defensePlan.watchdogAt,
      chosenScore: simulation.defensePlan.chosenScore,
    },
    roles: simulation.getRoles(),
  };
}

function factsFrame(simulation: PnrSimulation): object {
  return {
    branch: simulation.world.branch,
    facts: simulation.world.facts,
    mismatch: simulation.world.mismatch,
    seal: simulation.world.seal,
    postCatch: simulation.world.postCatch,
    under: simulation.world.under,
    reject: simulation.world.reject,
    ballOwner: simulation.world.ballOwner,
    ballMeta: {
      inFlight: simulation.world.ball.inFlight,
      from: simulation.world.ball.from,
      intendedReceiver: simulation.world.ball.intendedReceiver,
      launchedAt: simulation.world.ball.launchedAt,
      kind: simulation.world.ball.kind,
      outcome: simulation.world.ball.outcome,
    },
    terminal: simulation.world.terminal,
  };
}

function initialMirrorIsExact(
  right: InitialPlayerPositions,
  left: InitialPlayerPositions,
): boolean {
  return PLAYER_IDS.every(
    (id) =>
      left[id].x === COURT.centerlineX * 2 - right[id].x &&
      left[id].y === right[id].y,
  );
}

function rolesAreLegal(simulation: PnrSimulation): boolean {
  const roles = simulation.getRoles();
  return (
    roles.length === PLAYER_IDS.length &&
    new Set(roles.map((role) => role.playerId)).size === PLAYER_IDS.length &&
    roles.every(
      (role) =>
        role.owner ===
        (role.playerId.startsWith("O") ? "offense-planner" : "defense-planner"),
    )
  );
}

function addWorldInvariantFailures(
  simulation: PnrSimulation,
  failures: Set<string>,
  previousBall: { pos: Vec2; inFlight: boolean },
  newEvents: WorldEvent[],
): void {
  if (
    simulation.world.time !== Math.round(simulation.world.tick * FIXED_DT * 1e6) / 1e6
  ) {
    failures.add("FIXED_TIMESTEP_VIOLATION");
  }
  if (simulation.world.ball.inFlight !== (simulation.world.ballOwner === null)) {
    failures.add("ILLEGAL_POSSESSION");
  }
  if (
    simulation.world.facts.impeded &&
    !simulation.world.facts.contact &&
    !simulation.world.facts.routeExposure
  ) {
    failures.add("REMOTE_IMPEDED");
  }
  if (!rolesAreLegal(simulation)) failures.add("ROLE_OWNERSHIP_CONFLICT");
  if (simulation.world.lastStepMaxDisplacement > 0.15) {
    failures.add("MAX_DISPLACEMENT_EXCEEDED");
  }
  for (const id of PLAYER_IDS) {
    const player = simulation.world.players[id];
    if (
      player.pos.x < player.radius - 1e-9 ||
      player.pos.x > COURT.width - player.radius + 1e-9 ||
      player.pos.y < player.radius - 1e-9 ||
      player.pos.y > COURT.height - player.radius + 1e-9
    ) {
      failures.add("PLAYER_OUT_OF_BOUNDS");
    }
  }
  for (const [first, second] of playerPairs()) {
    const firstPlayer = simulation.world.players[first];
    const secondPlayer = simulation.world.players[second];
    const gap =
      distance(firstPlayer.pos, secondPlayer.pos) - firstPlayer.radius - secondPlayer.radius;
    if (gap < -0.01) failures.add("BODY_OVERLAP_DURING_RUN");
  }
  if (
    previousBall.inFlight &&
    distance(previousBall.pos, simulation.world.ball.pos) > 14 * FIXED_DT + 0.007
  ) {
    failures.add("BALL_STEP_TOO_LARGE");
  }
  for (const event of newEvents) {
    if (
      event.type === "pass_caught" ||
      event.type === "pass_denied" ||
      event.type === "kickout_caught" ||
      event.type === "reject_pass_caught"
    ) {
      const owner = simulation.world.ballOwner;
      if (!owner) {
        failures.add("TOUCH_WITHOUT_OWNER");
        continue;
      }
      const toucher = simulation.world.players[owner];
      const threshold =
        toucher.radius +
        simulation.world.ball.radius +
        (event.type === "pass_denied" ? 0.045 : 0.075);
      if (distance(simulation.world.ball.pos, toucher.pos) > threshold + 1e-9) {
        failures.add("NON_LOCAL_TOUCH");
      }
    }
  }
}

function observationBoundaryIsLegal(simulation: PnrSimulation): boolean {
  return (["offense", "defense"] as const).every((team) => {
    const observation = createPlannerObservation(simulation.world, team);
    const text = JSON.stringify(observation);
    return (
      observation.screenSide === simulation.config.screenSide &&
      !text.includes("offensePlan") &&
      !text.includes("defensePlan") &&
      !text.includes("hiddenPlan")
    );
  });
}

function minBodyGap(simulation: PnrSimulation): number {
  return Math.min(
    ...playerPairs().map(([first, second]) => {
      const firstPlayer = simulation.world.players[first];
      const secondPlayer = simulation.world.players[second];
      return distance(firstPlayer.pos, secondPlayer.pos) - firstPlayer.radius - secondPlayer.radius;
    }),
  );
}

function eventOrderIsLegal(events: WorldEvent[]): boolean {
  return events.every((event, index) => {
    if (index === 0) return true;
    const previous = events[index - 1];
    return event.tick > previous.tick || (event.tick === previous.tick && event.order >= previous.order);
  });
}

function runPair(spec: G07Spec): PairRun {
  const right = createG07Replay(spec.id, "right");
  const left = createG07Replay(spec.id, "left");
  const rightReplay = createG07Replay(spec.id, "right");
  const leftReplay = createG07Replay(spec.id, "left");
  const rightTrace: string[] = [];
  const leftTrace: string[] = [];
  const rightReplayTrace: string[] = [];
  const leftReplayTrace: string[] = [];
  const rightFailures = new Set<string>();
  const leftFailures = new Set<string>();
  const pairFailures = new Set<string>();
  let maxPositionError = 0;
  let maxVelocityError = 0;
  let maxBallError = 0;
  let maxPlanTargetError = 0;
  let maxScalarError = 0;
  let minimumLeftBodyGap = minBodyGap(left);
  let candidatesEquivalent = true;
  let eventsEquivalent = true;
  let factsEquivalent = true;
  let plansAndRolesEquivalent = true;
  let previousRightBall = { pos: { ...right.world.ball.pos }, inFlight: right.world.ball.inFlight };
  let previousLeftBall = { pos: { ...left.world.ball.pos }, inFlight: left.world.ball.inFlight };

  const compareFrame = (
    rightPlanning: PlanningRecord[],
    leftPlanning: PlanningRecord[],
    rightEvents: WorldEvent[],
    leftEvents: WorldEvent[],
  ): void => {
    if (right.world.tick !== left.world.tick) pairFailures.add("TICK_MISMATCH");
    for (const id of PLAYER_IDS) {
      const rightPlayer = right.world.players[id];
      const leftPlayer = left.world.players[id];
      maxPositionError = Math.max(
        maxPositionError,
        pointMirrorError(rightPlayer.pos, leftPlayer.pos),
      );
      maxVelocityError = Math.max(
        maxVelocityError,
        vectorMirrorError(rightPlayer.vel, leftPlayer.vel),
      );
    }
    maxBallError = Math.max(
      maxBallError,
      pointMirrorError(right.world.ball.pos, left.world.ball.pos),
      vectorMirrorError(right.world.ball.vel, left.world.ball.vel),
      right.world.ball.target && left.world.ball.target
        ? pointMirrorError(right.world.ball.target, left.world.ball.target)
        : right.world.ball.target === left.world.ball.target
          ? 0
          : Number.POSITIVE_INFINITY,
    );
    for (const key of ["primaryTarget", "secondaryTarget"] as const) {
      const rightOffenseTarget = right.offensePlan[key];
      const leftOffenseTarget = left.offensePlan[key];
      const rightDefenseTarget = right.defensePlan[key];
      const leftDefenseTarget = left.defensePlan[key];
      maxPlanTargetError = Math.max(
        maxPlanTargetError,
        rightOffenseTarget && leftOffenseTarget
          ? pointMirrorError(rightOffenseTarget, leftOffenseTarget)
          : rightOffenseTarget === leftOffenseTarget
            ? 0
            : Number.POSITIVE_INFINITY,
        rightDefenseTarget && leftDefenseTarget
          ? pointMirrorError(rightDefenseTarget, leftDefenseTarget)
          : rightDefenseTarget === leftDefenseTarget
            ? 0
            : Number.POSITIVE_INFINITY,
      );
    }
    if (JSON.stringify(planScalarFrame(right)) !== JSON.stringify(planScalarFrame(left))) {
      plansAndRolesEquivalent = false;
    }
    if (JSON.stringify(planningFrame(rightPlanning)) !== JSON.stringify(planningFrame(leftPlanning))) {
      candidatesEquivalent = false;
    }
    if (JSON.stringify(eventFrame(rightEvents)) !== JSON.stringify(eventFrame(leftEvents))) {
      eventsEquivalent = false;
    }
    const scalarError = structuredNumericError(factsFrame(right), factsFrame(left));
    maxScalarError = Math.max(maxScalarError, scalarError);
    if (scalarError > MIRROR_TOLERANCE) {
      factsEquivalent = false;
    }
  };

  const initialRightPlanning = [...right.planningLog];
  const initialLeftPlanning = [...left.planningLog];
  const initialRightReplayPlanning = [...rightReplay.planningLog];
  const initialLeftReplayPlanning = [...leftReplay.planningLog];
  rightTrace.push(deterministicFrame(right, initialRightPlanning, []));
  leftTrace.push(deterministicFrame(left, initialLeftPlanning, []));
  rightReplayTrace.push(deterministicFrame(rightReplay, initialRightReplayPlanning, []));
  leftReplayTrace.push(deterministicFrame(leftReplay, initialLeftReplayPlanning, []));
  compareFrame(initialRightPlanning, initialLeftPlanning, [], []);

  for (let index = 0; index < 600; index += 1) {
    if (
      right.world.terminal &&
      left.world.terminal &&
      rightReplay.world.terminal &&
      leftReplay.world.terminal
    ) {
      break;
    }
    const rightPlanningStart = right.planningLog.length;
    const leftPlanningStart = left.planningLog.length;
    const rightReplayPlanningStart = rightReplay.planningLog.length;
    const leftReplayPlanningStart = leftReplay.planningLog.length;
    const rightEventStart = right.eventLog.length;
    const leftEventStart = left.eventLog.length;
    const rightReplayEventStart = rightReplay.eventLog.length;
    const leftReplayEventStart = leftReplay.eventLog.length;
    right.step();
    left.step();
    rightReplay.step();
    leftReplay.step();
    const rightPlanning = right.planningLog.slice(rightPlanningStart);
    const leftPlanning = left.planningLog.slice(leftPlanningStart);
    const rightReplayPlanning = rightReplay.planningLog.slice(rightReplayPlanningStart);
    const leftReplayPlanning = leftReplay.planningLog.slice(leftReplayPlanningStart);
    const rightEvents = right.eventLog.slice(rightEventStart);
    const leftEvents = left.eventLog.slice(leftEventStart);
    const rightReplayEvents = rightReplay.eventLog.slice(rightReplayEventStart);
    const leftReplayEvents = leftReplay.eventLog.slice(leftReplayEventStart);
    rightTrace.push(deterministicFrame(right, rightPlanning, rightEvents));
    leftTrace.push(deterministicFrame(left, leftPlanning, leftEvents));
    rightReplayTrace.push(
      deterministicFrame(rightReplay, rightReplayPlanning, rightReplayEvents),
    );
    leftReplayTrace.push(
      deterministicFrame(leftReplay, leftReplayPlanning, leftReplayEvents),
    );
    compareFrame(rightPlanning, leftPlanning, rightEvents, leftEvents);
    addWorldInvariantFailures(right, rightFailures, previousRightBall, rightEvents);
    addWorldInvariantFailures(left, leftFailures, previousLeftBall, leftEvents);
    previousRightBall = {
      pos: { ...right.world.ball.pos },
      inFlight: right.world.ball.inFlight,
    };
    previousLeftBall = {
      pos: { ...left.world.ball.pos },
      inFlight: left.world.ball.inFlight,
    };
    minimumLeftBodyGap = Math.min(minimumLeftBodyGap, minBodyGap(left));
  }

  if (!right.world.terminal || !left.world.terminal) pairFailures.add("NO_TERMINAL");
  if (!eventOrderIsLegal(right.eventLog)) rightFailures.add("EVENT_ORDER_VIOLATION");
  if (!eventOrderIsLegal(left.eventLog)) leftFailures.add("EVENT_ORDER_VIOLATION");
  const terminalEquivalent =
    right.world.tick === left.world.tick &&
    right.world.terminal?.reason === left.world.terminal?.reason;
  const informationBoundaryPassed =
    observationBoundaryIsLegal(right) && observationBoundaryIsLegal(left);
  const maxMirrorError = Math.max(
    maxPositionError,
    maxVelocityError,
    maxBallError,
    maxPlanTargetError,
    maxScalarError,
  );
  const worldMirrorPassed =
    pairFailures.size === 0 &&
    Number.isFinite(maxMirrorError) &&
    maxMirrorError <= MIRROR_TOLERANCE;

  if (!right.world.terminal || !left.world.terminal) {
    throw new Error(`G07 ${spec.id} did not reach a terminal on both sides`);
  }

  return {
    row: {
      ...spec,
      initialMirrorExact: initialMirrorIsExact(
        right.config.initialPositions,
        left.config.initialPositions,
      ),
      worldMirrorPassed,
      plansAndRolesEquivalent,
      candidatesEquivalent,
      eventsEquivalent,
      factsEquivalent,
      terminalEquivalent,
      informationBoundaryPassed,
      rightInvariantFailures: [...rightFailures],
      leftInvariantFailures: [...leftFailures],
      maxPositionError,
      maxVelocityError,
      maxBallError,
      maxPlanTargetError,
      maxScalarError,
      maxMirrorError,
      minimumLeftBodyGap: Number(minimumLeftBodyGap.toFixed(9)),
      rightTerminalReason: right.world.terminal.reason,
      leftTerminalReason: left.world.terminal.reason,
      terminalTick: right.world.tick,
      rightEventSummary: right.eventLog.map((event) => `${event.type}@${event.tick}`),
      leftEventSummary: left.eventLog.map((event) => `${event.type}@${event.tick}`),
    },
    rightTrace: [JSON.stringify(rightReplayTrace), JSON.stringify(rightTrace)],
    leftTrace: [JSON.stringify(leftReplayTrace), JSON.stringify(leftTrace)],
  };
}

export function scanG07Mirrors(): G07AuditResult {
  const rows: G07PairRow[] = [];
  const failureReasons: string[] = [];

  for (const spec of G07_SPECS) {
    const run = runPair(spec);
    const rightDeterministic = run.rightTrace[0] === run.rightTrace[1];
    const leftDeterministic = run.leftTrace[0] === run.leftTrace[1];
    const row: G07PairRow = {
      ...run.row,
      rightDeterministic,
      leftDeterministic,
    };
    rows.push(row);
    if (!rightDeterministic) failureReasons.push(`${spec.id}: right replay diverged`);
    if (!leftDeterministic) failureReasons.push(`${spec.id}: left replay diverged`);
    if (!row.initialMirrorExact) failureReasons.push(`${spec.id}: initial mirror was not exact`);
    if (!row.worldMirrorPassed) {
      failureReasons.push(`${spec.id}: mirror error ${row.maxMirrorError} exceeded tolerance`);
    }
    if (!row.plansAndRolesEquivalent) failureReasons.push(`${spec.id}: plans or roles diverged`);
    if (!row.candidatesEquivalent) failureReasons.push(`${spec.id}: candidates diverged`);
    if (!row.eventsEquivalent) failureReasons.push(`${spec.id}: events diverged`);
    if (!row.factsEquivalent) failureReasons.push(`${spec.id}: scalar facts diverged`);
    if (!row.terminalEquivalent) failureReasons.push(`${spec.id}: terminal diverged`);
    if (!row.informationBoundaryPassed) failureReasons.push(`${spec.id}: information boundary failed`);
    for (const failure of row.rightInvariantFailures) {
      failureReasons.push(`${spec.id}/right: ${failure}`);
    }
    for (const failure of row.leftInvariantFailures) {
      failureReasons.push(`${spec.id}/left: ${failure}`);
    }
  }

  const scenarioPairs = rows.filter((row) => row.sourceKind === "scenario");
  const g06Pairs = rows.filter((row) => row.sourceKind === "g06");
  const deterministic = rows.every(
    (row) => row.rightDeterministic && row.leftDeterministic,
  );
  const mirrorPassed = rows.every(
    (row) =>
      row.initialMirrorExact &&
      row.worldMirrorPassed &&
      row.plansAndRolesEquivalent &&
      row.candidatesEquivalent &&
      row.eventsEquivalent &&
      row.factsEquivalent &&
      row.terminalEquivalent,
  );
  const invariantsPassed = rows.every(
    (row) =>
      row.rightInvariantFailures.length === 0 &&
      row.leftInvariantFailures.length === 0,
  );
  const informationBoundaryPassed = rows.every((row) => row.informationBoundaryPassed);
  const maxMirrorError = Math.max(...rows.map((row) => row.maxMirrorError));
  const passed =
    rows.length === 29 &&
    scenarioPairs.length === 8 &&
    g06Pairs.length === 21 &&
    deterministic &&
    mirrorPassed &&
    invariantsPassed &&
    informationBoundaryPassed &&
    maxMirrorError <= MIRROR_TOLERANCE &&
    failureReasons.length === 0;

  return {
    id: "G07",
    label: "左右镜像与相对战术坐标审计",
    scenarioPairs,
    g06Pairs,
    rows,
    pairCount: rows.length,
    deterministic,
    mirrorPassed,
    invariantsPassed,
    informationBoundaryPassed,
    maxMirrorError,
    tolerance: MIRROR_TOLERANCE,
    passed,
    failureReasons,
    replays: [...G07_REPLAY_PAIRS],
  };
}
