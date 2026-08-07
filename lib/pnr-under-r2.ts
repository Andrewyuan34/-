import {
  COURT,
  FIXED_DT,
  PLAYER_IDS,
  PnrSimulation,
  UNDER_MAX_COLLISION_SUPPRESSION_SECONDS,
  UNDER_MAX_MATCHUP_INVERSION_AUDIT_SECONDS,
  UNDER_PULLUP_CLEAN_STOP_MIN_BODY_GAP,
  UNDER_PULLUP_MIN_BODY_CLEARANCE,
  UNDER_PULLUP_MIN_RIMWARD_PROGRESS,
  copyInitialPlayerPositions,
  createPlannerObservation,
  distance,
  isInsideThreePointArc,
  isInsideUnderPullupRegion,
  mirrorInitialPlayerPositions,
  mirrorPointAcrossCenterline,
  mirrorVectorAcrossCenterline,
  type InitialPlayerPositions,
  type PlayerId,
  type ScreenSide,
  type SimulationConfig,
  type TeamPlanRoute,
  type Vec2,
} from "./pnr-core.ts";
import {
  F00_AUDIT,
  createF00Replay,
  makeF00Config,
} from "./pnr-f00-formation.ts";
import {
  DEFAULT_TEAM_STRATEGY_SELECTION,
  copyTeamStrategySelection,
} from "./pnr-strategy.ts";

export type UnderR2ReplayId = "f00-gap" | "deep-retreat";

/** The exact former false-positive input. It is automated-negative only. */
export const UNDER_R2_FALSE_POSITIVE_DEEP_RIGHT_INITIAL_POSITIONS = Object.freeze({
  O1: Object.freeze({ x: 4.62, y: 5.98 }),
  O5: Object.freeze({ x: 5.62, y: 5.62 }),
  D1: Object.freeze({ x: 5.1, y: 4.25 }),
  D5: Object.freeze({ x: 5.2, y: 2.6 }),
}) satisfies Readonly<InitialPlayerPositions>;

/**
 * Structured positive witness selected after the generic route/truth gates:
 * O1 begins outside the shared arc, O5 has legal teammate clearance, D1 owns
 * a real UNDER start, and D5 begins at an observable deep goal-side depth.
 */
export const UNDER_R2_DEEP_RETREAT_RIGHT_INITIAL_POSITIONS = Object.freeze({
  O1: Object.freeze({ x: 4.45, y: 5.75 }),
  O5: Object.freeze({ x: 5.45, y: 5.45 }),
  D1: Object.freeze({ x: 4.95, y: 4.15 }),
  D5: Object.freeze({ x: 5, y: 2.35 }),
}) satisfies Readonly<InitialPlayerPositions>;

export const UNDER_R2_REPLAYS = Object.freeze([
  Object.freeze({
    id: "f00-gap" as const,
    label: "F00 · 贴住 O5 后攻击髋部",
    note: "O5 正常顺下；D1 由身体外分段恢复，世界只按真实恢复与 contain 事实命名终局。",
  }),
  Object.freeze({
    id: "deep-retreat" as const,
    label: "测试级 · 真实深沉退中距离",
    note: "O1 先清掩护、真实向筐推进并进入共享三分弧内，再在无碰撞减速后形成窗口。",
  }),
]);

function makeDeepConfig(
  positions: Readonly<InitialPlayerPositions>,
  side: ScreenSide,
  plannerEvaluationOrder: "offense-first" | "defense-first" = "offense-first",
): SimulationConfig {
  const rightPositions = copyInitialPlayerPositions(positions);
  return {
    startMode: "preset_pnr",
    initialPositions:
      side === "right" ? rightPositions : mirrorInitialPlayerPositions(rightPositions),
    screenSide: side,
    seed: 17,
    maxTime: 7.4,
    d1FrontReactionDelay: 0,
    d1PostCatchRecoveryDelay: 0,
    o1MaxSpeed: 3.72,
    horizon: "under_pullup",
    strategies: copyTeamStrategySelection(DEFAULT_TEAM_STRATEGY_SELECTION),
    plannerEvaluationOrder,
  };
}

export function makeUnderR2FalsePositiveDeepConfig(
  side: ScreenSide = "right",
): SimulationConfig {
  return makeDeepConfig(UNDER_R2_FALSE_POSITIVE_DEEP_RIGHT_INITIAL_POSITIONS, side);
}

export function makeUnderR2DeepRetreatConfig(
  side: ScreenSide = "right",
  plannerEvaluationOrder: "offense-first" | "defense-first" = "offense-first",
): SimulationConfig {
  return makeDeepConfig(
    UNDER_R2_DEEP_RETREAT_RIGHT_INITIAL_POSITIONS,
    side,
    plannerEvaluationOrder,
  );
}

export function makeUnderR2ReplayConfig(
  replayId: UnderR2ReplayId,
  side: ScreenSide = "right",
): SimulationConfig {
  return replayId === "f00-gap"
    ? makeF00Config(side)
    : makeUnderR2DeepRetreatConfig(side);
}

export function createUnderR2Replay(
  replayId: UnderR2ReplayId,
  side: ScreenSide = "right",
): PnrSimulation {
  return replayId === "f00-gap"
    ? createF00Replay(side)
    : new PnrSimulation(makeUnderR2DeepRetreatConfig(side));
}

interface UnderR2AuditFrame {
  stateHash: string;
  players: Record<PlayerId, { pos: Vec2; vel: Vec2 }>;
  offensePlan: string;
  defensePlan: string;
  offenseRoute: TeamPlanRoute | null;
  defenseRoute: TeamPlanRoute | null;
  roles: Array<{ playerId: PlayerId; roleCode: string }>;
  events: Array<{ type: string; tick: number }>;
}

interface UnderR2AuditRun {
  simulation: PnrSimulation;
  frames: UnderR2AuditFrame[];
  maximumO1Speed: number;
  minimumO1BodyGapDuringDeceleration: number;
  maximumD1O5NearZeroSeconds: number;
  maximumMatchupInversionSeconds: number;
}

function cloneRoute(route: TeamPlanRoute | undefined): TeamPlanRoute | null {
  return route ? JSON.parse(JSON.stringify(route)) as TeamPlanRoute : null;
}

function runAudit(config: SimulationConfig): UnderR2AuditRun {
  const simulation = new PnrSimulation(config);
  const frames: UnderR2AuditFrame[] = [];
  let eventStart = 0;
  let maximumO1Speed = 0;
  let minimumO1BodyGapDuringDeceleration = Number.POSITIVE_INFINITY;
  let nearZeroSeconds = 0;
  let maximumD1O5NearZeroSeconds = 0;
  let inversionSeconds = 0;
  let maximumMatchupInversionSeconds = 0;

  const capture = (): void => {
    const o1 = simulation.world.players.O1;
    const o5 = simulation.world.players.O5;
    const d1 = simulation.world.players.D1;
    const d5 = simulation.world.players.D5;
    maximumO1Speed = Math.max(maximumO1Speed, Math.hypot(o1.vel.x, o1.vel.y));
    if (simulation.world.under.decelerationStartedAtTick !== null &&
        simulation.world.under.decelerationStartedAtTick !== undefined) {
      minimumO1BodyGapDuringDeceleration = Math.min(
        minimumO1BodyGapDuringDeceleration,
        distance(o1.pos, o5.pos) - o1.radius - o5.radius,
        distance(o1.pos, d1.pos) - o1.radius - d1.radius,
        distance(o1.pos, d5.pos) - o1.radius - d5.radius,
      );
    }
    if (simulation.world.under.active) {
      const d1O5Gap = distance(d1.pos, o5.pos) - d1.radius - o5.radius;
      nearZeroSeconds = d1O5Gap <= 0.025 ? nearZeroSeconds + FIXED_DT : 0;
      maximumD1O5NearZeroSeconds = Math.max(
        maximumD1O5NearZeroSeconds,
        nearZeroSeconds,
      );
      const actualPairingInverted =
        distance(d1.pos, o5.pos) < distance(d1.pos, o1.pos) &&
        distance(d5.pos, o1.pos) < distance(d5.pos, o5.pos);
      inversionSeconds = actualPairingInverted ? inversionSeconds + FIXED_DT : 0;
      maximumMatchupInversionSeconds = Math.max(
        maximumMatchupInversionSeconds,
        inversionSeconds,
      );
    }
    frames.push({
      stateHash: simulation.world.stateHash,
      players: Object.fromEntries(
        PLAYER_IDS.map((id) => [id, {
          pos: { ...simulation.world.players[id].pos },
          vel: { ...simulation.world.players[id].vel },
        }]),
      ) as Record<PlayerId, { pos: Vec2; vel: Vec2 }>,
      offensePlan: simulation.offensePlan.id,
      defensePlan: simulation.defensePlan.id,
      offenseRoute: cloneRoute(simulation.offensePlan.route),
      defenseRoute: cloneRoute(simulation.defensePlan.route),
      roles: simulation.getRoles().map(({ playerId, roleCode }) => ({ playerId, roleCode })),
      events: simulation.eventLog.slice(eventStart).map(({ type, tick }) => ({ type, tick })),
    });
    eventStart = simulation.eventLog.length;
  };
  capture();
  while (!simulation.world.terminal && simulation.world.tick < 720) {
    simulation.step();
    capture();
  }
  return {
    simulation,
    frames,
    maximumO1Speed,
    minimumO1BodyGapDuringDeceleration,
    maximumD1O5NearZeroSeconds,
    maximumMatchupInversionSeconds,
  };
}

function routeStructure(route: TeamPlanRoute | null): unknown {
  if (!route) return null;
  return {
    routeVersion: route.routeVersion,
    boundary: route.boundary,
    kind: route.kind,
    committedAtTick: route.committedAtTick,
    minimumCommitUntilTick: route.minimumCommitUntilTick,
    tracks: PLAYER_IDS.flatMap((id) => {
      const track = route.tracks[id];
      if (!track) return [];
      return [{
        playerId: id,
        segmentIndex: track.segmentIndex,
        reachedAtTick: track.reachedAtTick,
        segments: track.segments.map((segment) => ({
          phase: segment.phase,
          maxSpeed: segment.maxSpeed,
          minimumCruiseSpeed: segment.minimumCruiseSpeed ?? null,
          arriveRadius: segment.arriveRadius,
          advanceSubject: segment.advanceSubject,
          hasPassageHalfPlane: segment.passageHalfPlane !== null,
          proof: segment.proof,
        })),
      }];
    }),
  };
}

function mirroredRouteNumericError(
  right: TeamPlanRoute | null,
  left: TeamPlanRoute | null,
): number {
  if (!right || !left) return right === left ? 0 : Number.POSITIVE_INFINITY;
  let error = 0;
  for (const id of PLAYER_IDS) {
    const rightTrack = right.tracks[id];
    const leftTrack = left.tracks[id];
    if (!rightTrack || !leftTrack) {
      if (rightTrack !== leftTrack) return Number.POSITIVE_INFINITY;
      continue;
    }
    if (rightTrack.segments.length !== leftTrack.segments.length) {
      return Number.POSITIVE_INFINITY;
    }
    for (let index = 0; index < rightTrack.segments.length; index += 1) {
      const rightSegment = rightTrack.segments[index];
      const leftSegment = leftTrack.segments[index];
      const target = mirrorPointAcrossCenterline(rightSegment.target);
      error = Math.max(
        error,
        Math.abs(leftSegment.target.x - target.x),
        Math.abs(leftSegment.target.y - target.y),
      );
      if (rightSegment.passageHalfPlane && leftSegment.passageHalfPlane) {
        const normal = mirrorVectorAcrossCenterline(rightSegment.passageHalfPlane.normal);
        const offset =
          rightSegment.passageHalfPlane.offset -
          COURT.width * rightSegment.passageHalfPlane.normal.x;
        error = Math.max(
          error,
          Math.abs(leftSegment.passageHalfPlane.normal.x - normal.x),
          Math.abs(leftSegment.passageHalfPlane.normal.y - normal.y),
          Math.abs(leftSegment.passageHalfPlane.offset - offset),
        );
      } else if (rightSegment.passageHalfPlane !== leftSegment.passageHalfPlane) {
        return Number.POSITIVE_INFINITY;
      }
    }
  }
  return error;
}

function mirrorAudit(right: UnderR2AuditRun, left: UnderR2AuditRun): {
  maximumError: number;
  semanticMatch: boolean;
} {
  if (right.frames.length !== left.frames.length) {
    return { maximumError: Number.POSITIVE_INFINITY, semanticMatch: false };
  }
  let maximumError = 0;
  let semanticMatch = true;
  for (let index = 0; index < right.frames.length; index += 1) {
    const rightFrame = right.frames[index];
    const leftFrame = left.frames[index];
    for (const id of PLAYER_IDS) {
      const expectedPosition = mirrorPointAcrossCenterline(rightFrame.players[id].pos);
      const expectedVelocity = mirrorVectorAcrossCenterline(rightFrame.players[id].vel);
      maximumError = Math.max(
        maximumError,
        Math.abs(leftFrame.players[id].pos.x - expectedPosition.x),
        Math.abs(leftFrame.players[id].pos.y - expectedPosition.y),
        Math.abs(leftFrame.players[id].vel.x - expectedVelocity.x),
        Math.abs(leftFrame.players[id].vel.y - expectedVelocity.y),
      );
    }
    maximumError = Math.max(
      maximumError,
      mirroredRouteNumericError(rightFrame.offenseRoute, leftFrame.offenseRoute),
      mirroredRouteNumericError(rightFrame.defenseRoute, leftFrame.defenseRoute),
    );
    if (
      rightFrame.offensePlan !== leftFrame.offensePlan ||
      rightFrame.defensePlan !== leftFrame.defensePlan ||
      JSON.stringify(rightFrame.roles) !== JSON.stringify(leftFrame.roles) ||
      JSON.stringify(rightFrame.events) !== JSON.stringify(leftFrame.events) ||
      JSON.stringify(routeStructure(rightFrame.offenseRoute)) !==
        JSON.stringify(routeStructure(leftFrame.offenseRoute)) ||
      JSON.stringify(routeStructure(rightFrame.defenseRoute)) !==
        JSON.stringify(routeStructure(leftFrame.defenseRoute))
    ) {
      semanticMatch = false;
    }
  }
  return { maximumError, semanticMatch };
}

const deepRight = runAudit(makeUnderR2DeepRetreatConfig("right"));
const deepRightReplay = runAudit(makeUnderR2DeepRetreatConfig("right"));
const deepRightDefenseFirst = runAudit(
  makeUnderR2DeepRetreatConfig("right", "defense-first"),
);
const deepLeft = runAudit(makeUnderR2DeepRetreatConfig("left"));
const deepLeftReplay = runAudit(makeUnderR2DeepRetreatConfig("left"));
const deepMirror = mirrorAudit(deepRight, deepLeft);
const f00Right = runAudit(makeF00Config("right"));
const f00RightDefenseFirst = runAudit({
  ...makeF00Config("right"),
  plannerEvaluationOrder: "defense-first",
});
const negativeRight = runAudit(makeUnderR2FalsePositiveDeepConfig("right"));
const negativeLeft = runAudit(makeUnderR2FalsePositiveDeepConfig("left"));

const deepFailures = new Set<string>();
const deepUnder = deepRight.simulation.eventLog.find(
  (event) => event.type === "under_committed",
);
const deepClear = deepRight.simulation.eventLog.find(
  (event) => event.type === "screen_cleared",
);
const deepRead = deepRight.simulation.planningLog.find(
  (record) => record.decisionPhase === "offense_under_read",
);
const deepPostClearRead = deepRight.simulation.planningLog.find(
  (record) => record.team === "offense" && record.tick === deepClear?.availableAtTick,
);
const deepPostClearDefense = deepRight.simulation.planningLog.find(
  (record) => record.team === "defense" && record.tick === deepClear?.availableAtTick,
);
const deepPullup = deepRight.simulation.eventLog.find(
  (event) => event.type === "pullup_window",
);
const deepCandidate = deepRead?.candidates.find(
  (candidate) => candidate.id === "TAKE_UNDER_PULLUP",
);
const finalO1 = deepRight.simulation.world.players.O1;
const initialO1RimDistance = distance(
  UNDER_R2_DEEP_RETREAT_RIGHT_INITIAL_POSITIONS.O1,
  COURT.hoop,
);
const finalO1RimDistance = distance(finalO1.pos, COURT.hoop);
if (JSON.stringify(deepRight.frames) !== JSON.stringify(deepRightReplay.frames)) {
  deepFailures.add("RIGHT_PRIVATE_ROUTE_TRACE_NON_DETERMINISTIC");
}
if (JSON.stringify(deepLeft.frames) !== JSON.stringify(deepLeftReplay.frames)) {
  deepFailures.add("LEFT_PRIVATE_ROUTE_TRACE_NON_DETERMINISTIC");
}
if (JSON.stringify(deepRight.frames) !== JSON.stringify(deepRightDefenseFirst.frames)) {
  deepFailures.add("POST_CLEAR_REPLAN_ORDER_DEPENDENT");
}
if (JSON.stringify(f00Right.frames) !== JSON.stringify(f00RightDefenseFirst.frames)) {
  deepFailures.add("F00_REPLAN_ORDER_DEPENDENT");
}
if (!deepMirror.semanticMatch || deepMirror.maximumError > 1e-9) {
  deepFailures.add("PRIVATE_ROUTE_MIRROR_DIVERGED");
}
if (!deepUnder || !deepRead || deepRead.tick !== deepUnder.availableAtTick) {
  deepFailures.add("UNDER_READ_NOT_NEXT_BOUNDARY");
}
if (
  deepRead?.chosen !== "TAKE_UNDER_PULLUP" ||
  !deepCandidate?.feasible ||
  deepCandidate.strategyAdjustment !== 0
) {
  deepFailures.add("DEEP_RETREAT_PULLUP_NOT_SELECTED");
}
if (
  !deepClear ||
  !deepPostClearRead ||
  !deepPostClearDefense ||
  deepPostClearRead.tick !== deepClear.availableAtTick ||
  deepPostClearDefense.tick !== deepClear.availableAtTick
) {
  deepFailures.add("POST_CLEAR_ROUTES_NOT_AT_SHARED_NEXT_BOUNDARY");
}
if (!deepPullup || !deepClear || deepPullup.tick <= deepClear.tick) {
  deepFailures.add("PULLUP_PRECEDED_REAL_SCREEN_CLEAR");
}
if (
  deepRight.simulation.world.terminal?.reason !== "under_pullup_window" ||
  !deepRight.simulation.world.under.pullupWindow
) {
  deepFailures.add("MISSING_REAL_PULLUP_WINDOW");
}
if (
  !isInsideThreePointArc(finalO1.pos) ||
  !isInsideUnderPullupRegion(finalO1.pos) ||
  finalO1RimDistance >= initialO1RimDistance ||
  (deepRight.simulation.world.under.rimwardProgressAfterClear ?? 0) <
    UNDER_PULLUP_MIN_RIMWARD_PROGRESS
) {
  deepFailures.add("PULLUP_LACKS_ACTUAL_RIMWARD_ARC_ENTRY");
}
if (
  !deepRight.simulation.world.under.cleanDeceleration ||
  deepRight.minimumO1BodyGapDuringDeceleration <
    UNDER_PULLUP_CLEAN_STOP_MIN_BODY_GAP
) {
  deepFailures.add("PULLUP_DECELERATION_USED_BODY_COLLISION");
}
if (
  !deepRight.simulation.world.under.d5DeepRetreat ||
  deepRight.simulation.world.under.d5Contest ||
  (deepRight.simulation.world.under.d5BodyGap ?? Number.NEGATIVE_INFINITY) <
    UNDER_PULLUP_MIN_BODY_CLEARANCE
) {
  deepFailures.add("PULLUP_LACKS_DEEP_RETREAT_CLEARANCE");
}
if (deepRight.simulation.world.under.d1Recovered) {
  deepFailures.add("PULLUP_PUBLISHED_AFTER_D1_RECOVERED");
}

const negativeFailures = new Set<string>();
for (const [side, run] of [["right", negativeRight], ["left", negativeLeft]] as const) {
  if (run.simulation.eventLog.some((event) => event.type === "pullup_window")) {
    negativeFailures.add(`FALSE_POSITIVE_PULLUP_${side.toUpperCase()}`);
  }
  if (run.simulation.world.under.pullupWindow) {
    negativeFailures.add(`FALSE_POSITIVE_WORLD_FACT_${side.toUpperCase()}`);
  }
}
if (initialO1RimDistance <= COURT.threePointArcRadius) {
  deepFailures.add("POSITIVE_WITNESS_DID_NOT_START_OUTSIDE_ARC");
}
const negativeInitialO1RimDistance = distance(
  UNDER_R2_FALSE_POSITIVE_DEEP_RIGHT_INITIAL_POSITIONS.O1,
  COURT.hoop,
);
if (negativeInitialO1RimDistance <= COURT.threePointArcRadius) {
  negativeFailures.add("NEGATIVE_WITNESS_NOT_OUTSIDE_ARC");
}

const privacyFailures = new Set<string>();
for (const team of ["offense", "defense"] as const) {
  const serialized = JSON.stringify(createPlannerObservation(deepRight.simulation.world, team));
  for (const privateField of [
    "routeVersion",
    "minimumCommitUntilTick",
    "segmentIndex",
    "reachedAtTick",
    "passageHalfPlane",
  ]) {
    if (serialized.includes(privateField)) {
      privacyFailures.add(`${team.toUpperCase()}_OBSERVES_${privateField}`);
    }
  }
}

const f00Failures = new Set<string>();
if (f00Right.maximumD1O5NearZeroSeconds >
    UNDER_MAX_COLLISION_SUPPRESSION_SECONDS + 1e-9) {
  f00Failures.add("F00_SUSTAINED_D1_O5_COLLISION");
}
if (f00Right.maximumMatchupInversionSeconds >
    UNDER_MAX_MATCHUP_INVERSION_AUDIT_SECONDS + 1e-9) {
  f00Failures.add("F00_SUSTAINED_FACT_MATCHUP_INVERSION");
}
if (f00Right.simulation.world.facts.matchupExchange ||
    f00Right.simulation.eventLog.some((event) => event.type === "switch_completed")) {
  f00Failures.add("F00_FALSE_SWITCH");
}
if (
  f00Right.simulation.world.terminal?.reason === "under_contained" &&
  !f00Right.simulation.world.under.d1Recovered
) {
  f00Failures.add("F00_CONTAINED_WITHOUT_RECOVERY");
}

export const UNDER_R2_AUDIT = Object.freeze({
  passed:
    F00_AUDIT.passed &&
    f00Failures.size === 0 &&
    deepFailures.size === 0 &&
    negativeFailures.size === 0 &&
    privacyFailures.size === 0,
  f00Passed: F00_AUDIT.passed && f00Failures.size === 0,
  f00: Object.freeze({
    failures: Object.freeze([...f00Failures]),
    orderIndependent:
      JSON.stringify(f00Right.frames) === JSON.stringify(f00RightDefenseFirst.frames),
    maximumD1O5NearZeroSeconds: f00Right.maximumD1O5NearZeroSeconds,
    maximumMatchupInversionSeconds: f00Right.maximumMatchupInversionSeconds,
    terminalReason: f00Right.simulation.world.terminal?.reason ?? null,
  }),
  negativeDeep: Object.freeze({
    passed: negativeFailures.size === 0,
    failures: Object.freeze([...negativeFailures]),
    initialO1RimDistance: negativeInitialO1RimDistance,
    rightTerminalReason: negativeRight.simulation.world.terminal?.reason ?? null,
    leftTerminalReason: negativeLeft.simulation.world.terminal?.reason ?? null,
  }),
  privacy: Object.freeze({
    passed: privacyFailures.size === 0,
    failures: Object.freeze([...privacyFailures]),
    checkedPrivateFields: Object.freeze([
      "routeVersion",
      "minimumCommitUntilTick",
      "segmentIndex",
      "reachedAtTick",
      "passageHalfPlane",
    ]),
  }),
  deepRetreat: Object.freeze({
    passed: deepFailures.size === 0,
    deterministicRight:
      JSON.stringify(deepRight.frames) === JSON.stringify(deepRightReplay.frames),
    deterministicLeft:
      JSON.stringify(deepLeft.frames) === JSON.stringify(deepLeftReplay.frames),
    orderIndependent:
      JSON.stringify(deepRight.frames) === JSON.stringify(deepRightDefenseFirst.frames),
    privateRouteTraceAudited: deepRight.frames.some(
      (frame) => frame.offenseRoute !== null && frame.defenseRoute !== null,
    ),
    failures: Object.freeze([...deepFailures]),
    underTick: deepUnder?.tick ?? null,
    readTick: deepRead?.tick ?? null,
    screenClearedTick: deepClear?.tick ?? null,
    selectedPlan: deepRead?.chosen ?? null,
    pullupTick: deepPullup?.tick ?? null,
    terminalReason: deepRight.simulation.world.terminal?.reason ?? null,
    bodyGap: deepRight.simulation.world.under.d5BodyGap ?? null,
    maximumO1Speed: deepRight.maximumO1Speed,
    finalO1Speed: deepRight.simulation.world.under.o1Speed ?? null,
    initialO1RimDistance,
    finalO1RimDistance,
    rimwardProgressAfterClear:
      deepRight.simulation.world.under.rimwardProgressAfterClear ?? null,
    minimumO1BodyGapDuringDeceleration:
      deepRight.minimumO1BodyGapDuringDeceleration,
    maximumMirrorError: deepMirror.maximumError,
  }),
});
