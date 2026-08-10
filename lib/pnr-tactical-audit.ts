import {
  FIXED_DT,
  MINIMUM_TACTICAL_VOCABULARY_VERSION,
  PLAYER_IDS,
  PnrSimulation,
  TACTICAL_CHASE_MIN_ROUTE_CLEARANCE,
  TACTICAL_DROP_MIN_RETREAT_PROGRESS,
  TACTICAL_POCKET_MIN_FLIGHT_TICKS,
  TACTICAL_POCKET_MIN_RELEASE_DISTANCE,
  TACTICAL_TEAMMATE_CHANNEL_CLEARANCE,
  copyInitialPlayerPositions,
  createPlannerObservation,
  distance,
  mirrorInitialPlayerPositions,
  mirrorPointAcrossCenterline,
  mirrorVectorAcrossCenterline,
  type PlayerId,
  type PlanningRecord,
  type ScreenSide,
  type SimulationConfig,
  type TeamPlan,
  type TerminalState,
  type Vec2,
  type WorldEvent,
} from "./pnr-core.ts";
import {
  TACTICAL_INPUT_HASH,
  TACTICAL_INPUT_MANIFEST_VERSION,
  TACTICAL_MANIFEST_INPUTS,
  type TacticalManifestInput,
} from "./pnr-tactical-manifest.ts";

export interface TacticalSideAudit {
  side: ScreenSide;
  terminalReason: TerminalState["reason"] | null;
  terminalTick: number | null;
  dropCommittedTick: number | null;
  chaseCommittedTick: number | null;
  pocketWindowTick: number | null;
  offenseReads: string[];
  defenseCoverages: string[];
  events: Array<Pick<WorldEvent, "type" | "tick" | "availableAtTick">>;
  minimumBodyGap: number;
  maximumPlayerStep: number;
  maximumAllowedPlayerStep: number;
  noMatchupExchange: boolean;
  minimumTeammateBodyGap: number;
  maximumNearZeroTeammateTicks: number;
  maximumCloseDualMovingTicks: number;
  maximumResetRelativeTurnDegrees: number;
  maximumChaseCloseTurnDegrees: number;
  resetRollRouteSafe: boolean;
  pocketReleaseDistance: number | null;
  pocketFlightTicks: number | null;
  pocketFlightStatePassed: boolean;
  routesLegal: boolean;
  publicCausalityPassed: boolean;
  zeroStrategyAdjustment: boolean;
}

export interface TacticalAuditRow {
  id: string;
  stage: TacticalManifestInput["stage"];
  focus: TacticalManifestInput["focus"];
  right: TacticalSideAudit;
  left: TacticalSideAudit;
  deterministic: boolean;
  evaluationOrderStable: boolean;
  mirrored: boolean;
  mirrorMaximumError: number;
  informationBoundaryPassed: boolean;
  failures: string[];
  passed: boolean;
}

export interface TacticalVocabularyAudit {
  manifestVersion: typeof TACTICAL_INPUT_MANIFEST_VERSION;
  inputHash: typeof TACTICAL_INPUT_HASH;
  inputCount: number;
  worldCount: number;
  executionsPerWorld: 3;
  rows: TacticalAuditRow[];
  deterministic: boolean;
  evaluationOrderStable: boolean;
  mirrored: boolean;
  routesLegal: boolean;
  publicCausalityPassed: boolean;
  informationBoundaryPassed: boolean;
  zeroStrategyAdjustment: boolean;
  teammateCoordinationPassed: boolean;
  pocketFlightPassed: boolean;
  stageCoveragePassed: boolean;
  passed: boolean;
  firstFailure: { id: string; reason: string } | null;
}

const TACTICAL_OFFENSE_READS = new Set([
  "ATTACK_DROP_GAP",
  "TAKE_DROP_PULLUP",
  "RESET_DROP",
  "SNAKE_CHASE",
  "POCKET_PASS",
  "RESET_CHASE",
]);

const TACTICAL_DEFENSE_COVERAGES = new Set(["DROP_CONTAIN", "CHASE_OVER"]);

const TACTICAL_NEAR_ZERO_TEAMMATE_GAP = 0.05;
const TACTICAL_CLOSE_TEAMMATE_GAP = 0.12;
const TACTICAL_CLOSE_MOVING_SPEED = 0.4;
const TACTICAL_MAX_NEAR_ZERO_TEAMMATE_TICKS = Math.ceil(0.1 / FIXED_DT);
const TACTICAL_MAX_CLOSE_DUAL_MOVING_TICKS = Math.ceil(0.05 / FIXED_DT);
const TACTICAL_RESET_MAX_CLOSE_TURN_RADIANS = Math.PI / 4;
const TACTICAL_CHASE_MAX_CLOSE_TURN_RADIANS = Math.PI / 2;
const RESET_READS = new Set(["RESET_CHASE"]);
const RESET_ROUTE_READS = new Set(["RESET_DROP", "RESET_CHASE"]);
const COORDINATED_CHASE_READS = new Set(["SNAKE_CHASE", "POCKET_PASS"]);
const RESET_ROLL_PHASE = /(?:^|_)(?:roll|tangent)(?:_|$)/;

type TeammateCoordinationSemantic = "reset" | "chase" | null;

interface TeammateCoordinationAuditState {
  minimumBodyGap: number;
  nearZeroTicks: number;
  maximumNearZeroTicks: number;
  closeDualMovingTicks: number;
  maximumCloseDualMovingTicks: number;
  previousTurnSemantic: TeammateCoordinationSemantic;
  previousTurnAngle: number | null;
  turnRadians: Record<Exclude<TeammateCoordinationSemantic, null>, number>;
  maximumTurnRadians: Record<Exclude<TeammateCoordinationSemantic, null>, number>;
  resetRollRouteSafe: boolean;
  pocketReleaseDistance: number | null;
  pocketFlightStatePassed: boolean;
}

const PLAYER_PAIRS = (() => {
  const pairs: Array<readonly [PlayerId, PlayerId]> = [];
  for (let first = 0; first < PLAYER_IDS.length; first += 1) {
    for (let second = first + 1; second < PLAYER_IDS.length; second += 1) {
      pairs.push([PLAYER_IDS[first], PLAYER_IDS[second]]);
    }
  }
  return pairs;
})();

function eventTick(simulation: PnrSimulation, type: WorldEvent["type"]): number | null {
  return simulation.eventLog.find((event) => event.type === type)?.tick ?? null;
}

export function makeTacticalAuditConfig(
  input: TacticalManifestInput,
  side: ScreenSide,
  plannerEvaluationOrder: "offense-first" | "defense-first" = "offense-first",
): SimulationConfig {
  return {
    initialPositions: side === "right"
      ? copyInitialPlayerPositions(input.initialPositions)
      : mirrorInitialPlayerPositions(input.initialPositions),
    screenSide: side,
    setupMode: "explicit",
    startMode: "preset_pnr",
    seed: input.seed,
    maxTime: 7.4,
    d1FrontReactionDelay: 0,
    d1PostCatchRecoveryDelay: 0,
    o1MaxSpeed: input.o1MaxSpeed,
    horizon: "tactical_resolution",
    tacticalVocabularyVersion: MINIMUM_TACTICAL_VOCABULARY_VERSION,
    plannerEvaluationOrder,
  };
}

export function createTacticalReplay(
  inputId: string,
  side: ScreenSide = "right",
): PnrSimulation {
  const input = TACTICAL_MANIFEST_INPUTS.find((candidate) => candidate.id === inputId);
  if (!input) throw new Error(`Unknown T tactical input: ${inputId}`);
  return new PnrSimulation(makeTacticalAuditConfig(input, side));
}

function deterministicFrame(simulation: PnrSimulation): string {
  const planFrame = (plan: TeamPlan) => ({
    id: plan.id,
    version: plan.version,
    route: plan.route
      ? Object.fromEntries(
          Object.entries(plan.route.tracks).map(([id, track]) => [
            id,
            track
              ? {
                  segmentIndex: track.segmentIndex,
                  reachedAtTick: track.reachedAtTick,
                }
              : null,
          ]),
        )
      : null,
  });
  return JSON.stringify({
    tick: simulation.world.tick,
    stateHash: simulation.world.stateHash,
    offense: planFrame(simulation.offensePlan),
    defense: planFrame(simulation.defensePlan),
    planning: simulation.planningLog.map((record) => ({
      tick: record.tick,
      team: record.team,
      chosen: record.chosen,
      phase: record.decisionPhase,
    })),
    events: simulation.eventLog.map((event) => [event.tick, event.type]),
    terminal: simulation.world.terminal?.reason ?? null,
  });
}

function vectorError(first: Vec2, second: Vec2): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function planMirrorError(right: TeamPlan, left: TeamPlan): number {
  if (right.id !== left.id) return Number.POSITIVE_INFINITY;
  let maximum = 0;
  const comparePoint = (rightPoint?: Vec2, leftPoint?: Vec2): void => {
    if (!rightPoint && !leftPoint) return;
    if (!rightPoint || !leftPoint) {
      maximum = Number.POSITIVE_INFINITY;
      return;
    }
    maximum = Math.max(
      maximum,
      vectorError(mirrorPointAcrossCenterline(rightPoint), leftPoint),
    );
  };
  comparePoint(right.primaryTarget, left.primaryTarget);
  comparePoint(right.secondaryTarget, left.secondaryTarget);
  for (const id of PLAYER_IDS) {
    const rightTrack = right.route?.tracks[id];
    const leftTrack = left.route?.tracks[id];
    if (!rightTrack && !leftTrack) continue;
    if (!rightTrack || !leftTrack || rightTrack.segments.length !== leftTrack.segments.length) {
      return Number.POSITIVE_INFINITY;
    }
    if (rightTrack.segmentIndex !== leftTrack.segmentIndex) {
      return Number.POSITIVE_INFINITY;
    }
    rightTrack.segments.forEach((segment, index) => {
      comparePoint(segment.target, leftTrack.segments[index]?.target);
    });
  }
  return maximum;
}

function simulationMirrorError(right: PnrSimulation, left: PnrSimulation): number {
  let maximum = Math.max(
    planMirrorError(right.offensePlan, left.offensePlan),
    planMirrorError(right.defensePlan, left.defensePlan),
    vectorError(
      mirrorPointAcrossCenterline(right.world.ball.pos),
      left.world.ball.pos,
    ),
    vectorError(
      mirrorVectorAcrossCenterline(right.world.ball.vel),
      left.world.ball.vel,
    ),
  );
  for (const id of PLAYER_IDS) {
    maximum = Math.max(
      maximum,
      vectorError(
        mirrorPointAcrossCenterline(right.world.players[id].pos),
        left.world.players[id].pos,
      ),
      vectorError(
        mirrorVectorAcrossCenterline(right.world.players[id].vel),
        left.world.players[id].vel,
      ),
    );
  }
  return maximum;
}

function mirrorSemanticsMatch(right: PnrSimulation, left: PnrSimulation): boolean {
  const coverage = (simulation: PnrSimulation) => {
    const facts = simulation.world.tacticalCoverage;
    return facts
      ? {
          dropCommitted: facts.dropCommitted,
          dropCommittedAtTick: facts.dropCommittedAtTick,
          chaseOverCommitted: facts.chaseOverCommitted,
          chaseOverCommittedAtTick: facts.chaseOverCommittedAtTick,
          d1Trail: facts.d1Trail,
          d1Recovered: facts.d1Recovered,
          d1OverShoulder: facts.d1OverShoulder,
          o5Rolling: facts.o5Rolling,
          pocketWindow: facts.pocketWindow,
          pocketWindowOpenedAtTick: facts.pocketWindowOpenedAtTick,
          driveAdvantage: facts.driveAdvantage,
          pullupWindow: facts.pullupWindow,
          snakeAdvantage: facts.snakeAdvantage,
          contained: facts.contained,
        }
      : null;
  };
  const planTimeline = (records: readonly PlanningRecord[]) =>
    records.map((record) => [record.tick, record.team, record.chosen, record.decisionPhase]);
  return right.offensePlan.id === left.offensePlan.id &&
    right.defensePlan.id === left.defensePlan.id &&
    right.world.branch === left.world.branch &&
    right.world.ballOwner === left.world.ballOwner &&
    right.world.ball.kind === left.world.ball.kind &&
    right.world.ball.outcome === left.world.ball.outcome &&
    right.world.facts.contact === left.world.facts.contact &&
    right.world.facts.routeExposure === left.world.facts.routeExposure &&
    right.world.facts.impeded === left.world.facts.impeded &&
    right.world.facts.screenEffective === left.world.facts.screenEffective &&
    right.world.facts.ballHandlerClearedScreen ===
      left.world.facts.ballHandlerClearedScreen &&
    right.world.facts.matchupExchange === left.world.facts.matchupExchange &&
    JSON.stringify(coverage(right)) === JSON.stringify(coverage(left)) &&
    JSON.stringify(planTimeline(right.planningLog)) ===
      JSON.stringify(planTimeline(left.planningLog)) &&
    JSON.stringify(right.eventLog.map((event) => [event.tick, event.type])) ===
      JSON.stringify(left.eventLog.map((event) => [event.tick, event.type])) &&
    right.world.terminal?.reason === left.world.terminal?.reason;
}

function minimumBodyGap(simulation: PnrSimulation): number {
  return Math.min(
    ...PLAYER_PAIRS.map(([firstId, secondId]) => {
      const first = simulation.world.players[firstId];
      const second = simulation.world.players[secondId];
      return distance(first.pos, second.pos) - first.radius - second.radius;
    }),
  );
}

function teammateBodyGap(simulation: PnrSimulation): number {
  const o1 = simulation.world.players.O1;
  const o5 = simulation.world.players.O5;
  return distance(o1.pos, o5.pos) - o1.radius - o5.radius;
}

function coordinationSemantic(simulation: PnrSimulation): TeammateCoordinationSemantic {
  if (RESET_READS.has(simulation.offensePlan.id)) return "reset";
  if (COORDINATED_CHASE_READS.has(simulation.offensePlan.id)) return "chase";
  return null;
}

function angleDelta(first: number, second: number): number {
  let delta = second - first;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return Math.abs(delta);
}

function newTeammateCoordinationState(
  simulation: PnrSimulation,
): TeammateCoordinationAuditState {
  return {
    minimumBodyGap: teammateBodyGap(simulation),
    nearZeroTicks: 0,
    maximumNearZeroTicks: 0,
    closeDualMovingTicks: 0,
    maximumCloseDualMovingTicks: 0,
    previousTurnSemantic: null,
    previousTurnAngle: null,
    turnRadians: { reset: 0, chase: 0 },
    maximumTurnRadians: { reset: 0, chase: 0 },
    resetRollRouteSafe: true,
    pocketReleaseDistance: null,
    pocketFlightStatePassed: true,
  };
}

function sampleTeammateCoordination(
  simulation: PnrSimulation,
  state: TeammateCoordinationAuditState,
): void {
  const o1 = simulation.world.players.O1;
  const o5 = simulation.world.players.O5;
  const bodyGap = teammateBodyGap(simulation);
  const semantic = coordinationSemantic(simulation);
  state.minimumBodyGap = Math.min(state.minimumBodyGap, bodyGap);

  state.nearZeroTicks = bodyGap < TACTICAL_NEAR_ZERO_TEAMMATE_GAP - 1e-9
    ? state.nearZeroTicks + 1
    : 0;
  state.maximumNearZeroTicks = Math.max(
    state.maximumNearZeroTicks,
    state.nearZeroTicks,
  );

  const closeDualMoving =
    semantic === "chase" &&
    bodyGap < TACTICAL_CLOSE_TEAMMATE_GAP - 1e-9 &&
    Math.hypot(o1.vel.x, o1.vel.y) > TACTICAL_CLOSE_MOVING_SPEED + 1e-9 &&
    Math.hypot(o5.vel.x, o5.vel.y) > TACTICAL_CLOSE_MOVING_SPEED + 1e-9;
  state.closeDualMovingTicks = closeDualMoving ? state.closeDualMovingTicks + 1 : 0;
  state.maximumCloseDualMovingTicks = Math.max(
    state.maximumCloseDualMovingTicks,
    state.closeDualMovingTicks,
  );

  const turnWindowOpen = semantic === "reset" ||
    (semantic === "chase" && bodyGap < TACTICAL_CLOSE_TEAMMATE_GAP - 1e-9);
  if (semantic && turnWindowOpen) {
    const relativeAngle = Math.atan2(o5.pos.y - o1.pos.y, o5.pos.x - o1.pos.x);
    if (state.previousTurnSemantic === semantic && state.previousTurnAngle !== null) {
      state.turnRadians[semantic] += angleDelta(
        state.previousTurnAngle,
        relativeAngle,
      );
    } else {
      state.turnRadians[semantic] = 0;
    }
    state.maximumTurnRadians[semantic] = Math.max(
      state.maximumTurnRadians[semantic],
      state.turnRadians[semantic],
    );
    state.previousTurnSemantic = semantic;
    state.previousTurnAngle = relativeAngle;
  } else {
    state.previousTurnSemantic = null;
    state.previousTurnAngle = null;
  }

  if (RESET_ROUTE_READS.has(simulation.offensePlan.id)) {
    const o5Track = simulation.offensePlan.route?.tracks.O5;
    if (o5Track?.segments.some((segment) => RESET_ROLL_PHASE.test(segment.phase))) {
      state.resetRollRouteSafe = false;
    }
  }

  const launchTick = eventTick(simulation, "pocket_pass_launched");
  const catchTick = eventTick(simulation, "pocket_pass_caught");
  if (
    launchTick !== null &&
    state.pocketReleaseDistance === null &&
    simulation.world.tick >= launchTick
  ) {
    state.pocketReleaseDistance = distance(o1.pos, o5.pos);
  }
  if (
    launchTick !== null &&
    simulation.world.tick >= launchTick &&
    (catchTick === null || simulation.world.tick < catchTick)
  ) {
    state.pocketFlightStatePassed = state.pocketFlightStatePassed &&
      simulation.world.ball.inFlight &&
      simulation.world.ball.kind === "pocket_pass" &&
      simulation.world.ballOwner === null;
  }
}

function planRoutesLegal(plan: TeamPlan): boolean {
  if (!plan.route) return true;
  return Object.values(plan.route.tracks).every((track) =>
    !track || track.segments.every((segment) =>
      segment.proof.legal &&
      segment.proof.courtLegal &&
      (segment.proof.minimumBodyClearance >=
          TACTICAL_CHASE_MIN_ROUTE_CLEARANCE - 1e-6 ||
        Boolean(segment.proof.releasesExistingContactByBlocker?.length))
    )
  );
}

function eventCausalityPassed(
  simulation: PnrSimulation,
  events: readonly WorldEvent[],
): boolean {
  const coverage = simulation.world.tacticalCoverage;
  return events.every((event) => {
    if (event.type === "drop_committed") {
      return Boolean(
        coverage?.dropCommitted &&
        simulation.world.facts.screenLegalPose &&
        coverage.d5RetreatProgress >= TACTICAL_DROP_MIN_RETREAT_PROGRESS - 1e-9,
      );
    }
    if (event.type === "chase_over_committed") {
      return Boolean(
        coverage?.dropCommitted &&
        coverage.chaseOverCommitted &&
        coverage.d1OverShoulder &&
        simulation.world.facts.ballHandlerClearedScreen &&
        !simulation.world.facts.matchupExchange,
      );
    }
    if (event.type === "pocket_window_open") {
      return Boolean(
        coverage?.pocketWindow &&
        coverage.pocketPassReady &&
        coverage.d1Trail &&
        coverage.o5Rolling &&
        coverage.d5ContainsBall &&
        coverage.pocketLaneClearance >= 0.035 - 1e-9 &&
        coverage.pocketReleaseDistance >=
          TACTICAL_POCKET_MIN_RELEASE_DISTANCE - 1e-9,
      );
    }
    if (event.type === "pocket_pass_launched") {
      return Boolean(coverage?.pocketPassReady) &&
        distance(simulation.world.players.O1.pos, simulation.world.players.O5.pos) >=
          TACTICAL_POCKET_MIN_RELEASE_DISTANCE - 1e-9 &&
        simulation.world.ball.inFlight &&
        simulation.world.ball.kind === "pocket_pass" &&
        simulation.world.ballOwner === null;
    }
    if (event.type === "pocket_pass_caught") {
      return simulation.world.ball.kind === "pocket_pass" &&
        simulation.world.ball.outcome === "caught" &&
        simulation.world.ballOwner === "O5";
    }
    if (event.type === "tactical_pullup_window") return Boolean(coverage?.pullupWindow);
    if (event.type === "tactical_snake_advantage") return Boolean(coverage?.snakeAdvantage);
    if (event.type === "tactical_drive_advantage") return Boolean(coverage?.driveAdvantage);
    if (event.type === "tactical_contained") return Boolean(coverage?.contained);
    return true;
  });
}

function zeroStrategyAdjustment(simulation: PnrSimulation): boolean {
  return simulation.planningLog.every((record) =>
    record.candidates.every((candidate) => candidate.strategyAdjustment === 0)
  );
}

function informationBoundaryPassed(simulation: PnrSimulation): boolean {
  const offense = createPlannerObservation(simulation.world, "offense") as unknown as Record<
    string,
    unknown
  >;
  const defense = createPlannerObservation(simulation.world, "defense") as unknown as Record<
    string,
    unknown
  >;
  return !Object.hasOwn(offense, "defensePlan") &&
    !Object.hasOwn(offense, "defenseStrategy") &&
    !Object.hasOwn(defense, "offensePlan") &&
    !Object.hasOwn(defense, "offenseStrategy");
}

function sideAudit(
  simulation: PnrSimulation,
  side: ScreenSide,
  minimumGap: number,
  maximumStep: number,
  routesLegal: boolean,
  publicCausalityPassed: boolean,
  teammateCoordination: TeammateCoordinationAuditState,
): TacticalSideAudit {
  const pocketLaunchTick = eventTick(simulation, "pocket_pass_launched");
  const pocketCatchTick = eventTick(simulation, "pocket_pass_caught");
  return {
    side,
    terminalReason: simulation.world.terminal?.reason ?? null,
    terminalTick: simulation.world.terminal ? simulation.world.tick : null,
    dropCommittedTick: eventTick(simulation, "drop_committed"),
    chaseCommittedTick: eventTick(simulation, "chase_over_committed"),
    pocketWindowTick: eventTick(simulation, "pocket_window_open"),
    offenseReads: [...new Set(
      simulation.planningLog
        .filter((record) => record.team === "offense" && TACTICAL_OFFENSE_READS.has(record.chosen))
        .map((record) => record.chosen),
    )],
    defenseCoverages: [...new Set(
      simulation.planningLog
        .filter((record) => record.team === "defense" && TACTICAL_DEFENSE_COVERAGES.has(record.chosen))
        .map((record) => record.chosen),
    )],
    events: simulation.eventLog.map(({ type, tick, availableAtTick }) => ({
      type,
      tick,
      availableAtTick,
    })),
    minimumBodyGap: minimumGap,
    maximumPlayerStep: maximumStep,
    maximumAllowedPlayerStep:
      Math.max(simulation.config.o1MaxSpeed, 3.64, 3.22, 2.92) * FIXED_DT,
    noMatchupExchange: !simulation.eventLog.some(
      (event) => event.type === "switch_completed",
    ) && !simulation.world.facts.matchupExchange,
    minimumTeammateBodyGap: teammateCoordination.minimumBodyGap,
    maximumNearZeroTeammateTicks: teammateCoordination.maximumNearZeroTicks,
    maximumCloseDualMovingTicks: teammateCoordination.maximumCloseDualMovingTicks,
    maximumResetRelativeTurnDegrees:
      teammateCoordination.maximumTurnRadians.reset * 180 / Math.PI,
    maximumChaseCloseTurnDegrees:
      teammateCoordination.maximumTurnRadians.chase * 180 / Math.PI,
    resetRollRouteSafe: teammateCoordination.resetRollRouteSafe,
    pocketReleaseDistance: teammateCoordination.pocketReleaseDistance,
    pocketFlightTicks:
      pocketLaunchTick !== null && pocketCatchTick !== null
        ? pocketCatchTick - pocketLaunchTick
        : null,
    pocketFlightStatePassed: teammateCoordination.pocketFlightStatePassed,
    routesLegal,
    publicCausalityPassed,
    zeroStrategyAdjustment: zeroStrategyAdjustment(simulation),
  };
}

function auditRow(input: TacticalManifestInput): TacticalAuditRow {
  const right = new PnrSimulation(makeTacticalAuditConfig(input, "right"));
  const rightDuplicate = new PnrSimulation(makeTacticalAuditConfig(input, "right"));
  const rightDefenseFirst = new PnrSimulation(
    makeTacticalAuditConfig(input, "right", "defense-first"),
  );
  const left = new PnrSimulation(makeTacticalAuditConfig(input, "left"));
  const leftDuplicate = new PnrSimulation(makeTacticalAuditConfig(input, "left"));
  const leftDefenseFirst = new PnrSimulation(
    makeTacticalAuditConfig(input, "left", "defense-first"),
  );
  const simulations = [
    right,
    rightDuplicate,
    rightDefenseFirst,
    left,
    leftDuplicate,
    leftDefenseFirst,
  ];
  const failures: string[] = [];
  let deterministic = true;
  let evaluationOrderStable = true;
  let mirrored = true;
  let mirrorMaximumError = 0;
  let rightMinimumGap = minimumBodyGap(right);
  let leftMinimumGap = minimumBodyGap(left);
  let rightMaximumStep = 0;
  let leftMaximumStep = 0;
  let rightRoutesLegal = true;
  let leftRoutesLegal = true;
  let rightCausality = true;
  let leftCausality = true;
  const rightTeammateCoordination = newTeammateCoordinationState(right);
  const leftTeammateCoordination = newTeammateCoordinationState(left);
  const maximumTicks = Math.ceil(7.4 / FIXED_DT) + 2;

  for (let tick = 0; tick <= maximumTicks; tick += 1) {
    sampleTeammateCoordination(right, rightTeammateCoordination);
    sampleTeammateCoordination(left, leftTeammateCoordination);
    if (
      deterministicFrame(right) !== deterministicFrame(rightDuplicate) ||
      deterministicFrame(left) !== deterministicFrame(leftDuplicate)
    ) {
      deterministic = false;
      failures.push(`NONDETERMINISTIC@${tick}`);
      break;
    }
    if (
      deterministicFrame(right) !== deterministicFrame(rightDefenseFirst) ||
      deterministicFrame(left) !== deterministicFrame(leftDefenseFirst)
    ) {
      evaluationOrderStable = false;
      failures.push(`EVALUATION_ORDER@${tick}`);
      break;
    }
    const mirrorError = simulationMirrorError(right, left);
    mirrorMaximumError = Math.max(mirrorMaximumError, mirrorError);
    if (!Number.isFinite(mirrorError) || mirrorError > 1e-9 || !mirrorSemanticsMatch(right, left)) {
      mirrored = false;
      failures.push(`MIRROR@${tick}`);
      break;
    }
    rightMinimumGap = Math.min(rightMinimumGap, minimumBodyGap(right));
    leftMinimumGap = Math.min(leftMinimumGap, minimumBodyGap(left));
    rightMaximumStep = Math.max(rightMaximumStep, right.world.lastStepMaxDisplacement);
    leftMaximumStep = Math.max(leftMaximumStep, left.world.lastStepMaxDisplacement);
    rightRoutesLegal = rightRoutesLegal &&
      planRoutesLegal(right.offensePlan) && planRoutesLegal(right.defensePlan);
    leftRoutesLegal = leftRoutesLegal &&
      planRoutesLegal(left.offensePlan) && planRoutesLegal(left.defensePlan);

    const terminalCount = simulations.filter((simulation) => simulation.world.terminal).length;
    if (terminalCount === simulations.length) break;
    if (terminalCount > 0) {
      failures.push(`TERMINAL_TICK_MISMATCH@${tick}`);
      break;
    }
    const rightEventStart = right.eventLog.length;
    const leftEventStart = left.eventLog.length;
    simulations.forEach((simulation) => simulation.step());
    rightCausality = rightCausality &&
      eventCausalityPassed(right, right.eventLog.slice(rightEventStart));
    leftCausality = leftCausality &&
      eventCausalityPassed(left, left.eventLog.slice(leftEventStart));
  }

  const rightSummary = sideAudit(
    right,
    "right",
    rightMinimumGap,
    rightMaximumStep,
    rightRoutesLegal,
    rightCausality,
    rightTeammateCoordination,
  );
  const leftSummary = sideAudit(
    left,
    "left",
    leftMinimumGap,
    leftMaximumStep,
    leftRoutesLegal,
    leftCausality,
    leftTeammateCoordination,
  );
  const informationBoundary = informationBoundaryPassed(right) &&
    informationBoundaryPassed(left);
  const summaries = [rightSummary, leftSummary];
  if (summaries.some((summary) => summary.dropCommittedTick === null)) {
    failures.push("DROP_FACT_MISSING");
  }
  if (
    input.stage === "T00" &&
    summaries.some((summary) => !summary.defenseCoverages.includes("DROP_CONTAIN"))
  ) {
    failures.push("DROP_PLAN_MISSING");
  }
  if (summaries.some((summary) => summary.offenseReads.length === 0)) {
    failures.push("OFFENSE_READ_MISSING");
  }
  if (input.stage === "T01") {
    if (summaries.some((summary) => summary.chaseCommittedTick === null)) {
      failures.push("CHASE_FACT_MISSING");
    }
    if (summaries.some((summary) => !summary.defenseCoverages.includes("CHASE_OVER"))) {
      failures.push("CHASE_PLAN_MISSING");
    }
    if (
      input.focus === "chase_snake" &&
      summaries.some((summary) => !summary.offenseReads.includes("SNAKE_CHASE"))
    ) {
      failures.push("SNAKE_READ_MISSING");
    }
    if (
      input.focus === "chase_pocket" &&
      summaries.some((summary) => !summary.offenseReads.includes("POCKET_PASS"))
    ) {
      failures.push("POCKET_READ_MISSING");
    }
  }
  if (summaries.some((summary) => !summary.terminalReason)) failures.push("NO_TERMINAL");
  if (summaries.some((summary) => !summary.noMatchupExchange)) failures.push("MATCHUP_EXCHANGE");
  if (summaries.some((summary) => summary.minimumBodyGap < -1e-4)) {
    failures.push("BODY_OVERLAP");
  }
  if (
    summaries.some((summary) =>
      summary.minimumTeammateBodyGap < TACTICAL_TEAMMATE_CHANNEL_CLEARANCE - 1e-6
    )
  ) {
    failures.push("TEAMMATE_CHANNEL_CLEARANCE");
  }
  if (
    summaries.some((summary) =>
      summary.maximumNearZeroTeammateTicks > TACTICAL_MAX_NEAR_ZERO_TEAMMATE_TICKS
    )
  ) {
    failures.push("TEAMMATE_NEAR_ZERO_RUN");
  }
  if (
    summaries.some((summary) =>
      summary.maximumCloseDualMovingTicks > TACTICAL_MAX_CLOSE_DUAL_MOVING_TICKS
    )
  ) {
    failures.push("TEAMMATE_DUAL_MOVING_SQUEEZE");
  }
  if (summaries.some((summary) => !summary.resetRollRouteSafe)) {
    failures.push("RESET_ROLL_ORBIT");
  }
  if (
    summaries.some((summary) =>
      summary.maximumResetRelativeTurnDegrees >
        TACTICAL_RESET_MAX_CLOSE_TURN_RADIANS * 180 / Math.PI + 1e-9
    )
  ) {
    failures.push("RESET_TEAMMATE_ORBIT");
  }
  if (
    summaries.some((summary) =>
      summary.maximumChaseCloseTurnDegrees >
        TACTICAL_CHASE_MAX_CLOSE_TURN_RADIANS * 180 / Math.PI + 1e-9
    )
  ) {
    failures.push("CHASE_TEAMMATE_ORBIT");
  }
  if (input.focus === "chase_pocket") {
    if (
      summaries.some((summary) =>
        summary.pocketReleaseDistance === null ||
        summary.pocketReleaseDistance < TACTICAL_POCKET_MIN_RELEASE_DISTANCE - 1e-9
      )
    ) {
      failures.push("POCKET_RELEASE_DISTANCE");
    }
    if (
      summaries.some((summary) =>
        summary.pocketFlightTicks === null ||
        summary.pocketFlightTicks < TACTICAL_POCKET_MIN_FLIGHT_TICKS
      )
    ) {
      failures.push("POCKET_FLIGHT_TICKS");
    }
    if (summaries.some((summary) => !summary.pocketFlightStatePassed)) {
      failures.push("POCKET_FLIGHT_STATE");
    }
  }
  if (
    summaries.some((summary) =>
      summary.maximumPlayerStep > summary.maximumAllowedPlayerStep + 1e-9
    )
  ) {
    failures.push("FIXED_STEP_SPEED");
  }
  if (summaries.some((summary) => !summary.routesLegal)) failures.push("ILLEGAL_ROUTE");
  if (summaries.some((summary) => !summary.publicCausalityPassed)) {
    failures.push("PUBLIC_CAUSALITY");
  }
  if (summaries.some((summary) => !summary.zeroStrategyAdjustment)) {
    failures.push("NONZERO_STRATEGY_ADJUSTMENT");
  }
  if (!informationBoundary) failures.push("INFORMATION_BOUNDARY");

  return {
    id: input.id,
    stage: input.stage,
    focus: input.focus,
    right: rightSummary,
    left: leftSummary,
    deterministic,
    evaluationOrderStable,
    mirrored,
    mirrorMaximumError,
    informationBoundaryPassed: informationBoundary,
    failures,
    passed: failures.length === 0,
  };
}

export function scanTacticalVocabulary(): TacticalVocabularyAudit {
  const rows = TACTICAL_MANIFEST_INPUTS.map(auditRow);
  const sides = rows.flatMap((row) => [row.right, row.left]);
  const terminalReasons = new Set(
    rows.flatMap((row) => [row.right.terminalReason, row.left.terminalReason]),
  );
  const allEvents = rows.flatMap((row) => [
    ...row.right.events.map((event) => event.type),
    ...row.left.events.map((event) => event.type),
  ]);
  const stageCoveragePassed =
    terminalReasons.has("tactical_pullup_window") &&
    terminalReasons.has("tactical_contained") &&
    terminalReasons.has("tactical_snake_advantage") &&
    terminalReasons.has("tactical_pocket_caught") &&
    allEvents.includes("pocket_pass_launched") &&
    allEvents.includes("pocket_pass_caught");
  const teammateCoordinationPassed = sides.every((side) =>
    side.minimumTeammateBodyGap >= TACTICAL_TEAMMATE_CHANNEL_CLEARANCE - 1e-6 &&
    side.maximumNearZeroTeammateTicks <= TACTICAL_MAX_NEAR_ZERO_TEAMMATE_TICKS &&
    side.maximumCloseDualMovingTicks <= TACTICAL_MAX_CLOSE_DUAL_MOVING_TICKS &&
    side.maximumResetRelativeTurnDegrees <=
      TACTICAL_RESET_MAX_CLOSE_TURN_RADIANS * 180 / Math.PI + 1e-9 &&
    side.maximumChaseCloseTurnDegrees <=
      TACTICAL_CHASE_MAX_CLOSE_TURN_RADIANS * 180 / Math.PI + 1e-9 &&
    side.resetRollRouteSafe
  );
  const pocketFlightPassed = rows
    .filter((row) => row.focus === "chase_pocket")
    .every((row) => [row.right, row.left].every((side) =>
      side.pocketReleaseDistance !== null &&
      side.pocketReleaseDistance >= TACTICAL_POCKET_MIN_RELEASE_DISTANCE - 1e-9 &&
      side.pocketFlightTicks !== null &&
      side.pocketFlightTicks >= TACTICAL_POCKET_MIN_FLIGHT_TICKS &&
      side.pocketFlightStatePassed
    ));
  const aggregateFailure = !teammateCoordinationPassed
    ? { id: "T-TEAMMATE-COORDINATION", reason: "teammate channel invariant failed" }
    : !pocketFlightPassed
      ? { id: "T-POCKET-FLIGHT", reason: "pocket release or flight invariant failed" }
      : stageCoveragePassed
        ? null
        : { id: "T-STAGE-COVERAGE", reason: "missing pullup/contained/snake/pocket resolution" };
  const firstRowFailure = rows.find((row) => !row.passed);
  const firstFailure = firstRowFailure
    ? { id: firstRowFailure.id, reason: firstRowFailure.failures[0] ?? "unknown" }
    : aggregateFailure;
  const passed = rows.every((row) => row.passed) &&
    teammateCoordinationPassed &&
    pocketFlightPassed &&
    stageCoveragePassed;
  return {
    manifestVersion: TACTICAL_INPUT_MANIFEST_VERSION,
    inputHash: TACTICAL_INPUT_HASH,
    inputCount: TACTICAL_MANIFEST_INPUTS.length,
    worldCount: TACTICAL_MANIFEST_INPUTS.length * 2,
    executionsPerWorld: 3,
    rows,
    deterministic: rows.every((row) => row.deterministic),
    evaluationOrderStable: rows.every((row) => row.evaluationOrderStable),
    mirrored: rows.every((row) => row.mirrored),
    routesLegal: rows.every((row) => row.right.routesLegal && row.left.routesLegal),
    publicCausalityPassed: rows.every(
      (row) => row.right.publicCausalityPassed && row.left.publicCausalityPassed,
    ),
    informationBoundaryPassed: rows.every((row) => row.informationBoundaryPassed),
    zeroStrategyAdjustment: rows.every(
      (row) => row.right.zeroStrategyAdjustment && row.left.zeroStrategyAdjustment,
    ),
    teammateCoordinationPassed,
    pocketFlightPassed,
    stageCoveragePassed,
    passed,
    firstFailure,
  };
}
