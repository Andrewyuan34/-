import {
  AUTONOMOUS_FORMATION_DOMAIN_VERSION,
  COURT,
  FIXED_DT,
  FORMATION_TACTICAL_INTEGRATION_VERSION,
  MINIMUM_TACTICAL_VOCABULARY_VERSION,
  PLAYER_IDS,
  PnrSimulation,
  TACTICAL_POCKET_MIN_FLIGHT_TICKS,
  TACTICAL_POCKET_MIN_RELEASE_DISTANCE,
  TACTICAL_TEAMMATE_CHANNEL_CLEARANCE,
  copyInitialPlayerPositions,
  createPlannerObservation,
  mirrorInitialPlayerPositions,
  mirrorPointAcrossCenterline,
  mirrorVectorAcrossCenterline,
  type InitialPlayerPositions,
  type PlanningRecord,
  type ScreenSide,
  type SimulationConfig,
  type TeamPlan,
  type TerminalState,
  type Vec2,
  type WorldEvent,
} from "./pnr-core.ts";
import {
  I00_ALLOWED_TERMINALS,
  I00_INPUT_MANIFEST_VERSION,
  I00_INTEGRATION_INPUTS,
  I00_MANIFEST_HASH,
  I00_RUNTIME_CONTRACT,
  I00_STRATEGY_CONTRACT,
  type I00IntegrationInput,
} from "./pnr-integration-manifest.ts";
import {
  makeP02StrategySelection,
} from "./pnr-p02-defense-strategy.ts";
import {
  P03_POLICY_MATCHUPS,
  type P03MatchupId,
} from "./pnr-p03-policy-matrix.ts";
import {
  scanTacticalVocabulary,
} from "./pnr-tactical-audit.ts";
import type {
  TeamStrategyReference,
  TeamStrategySelection,
} from "./pnr-strategy.ts";

const TACTICAL_OFFENSE_READS = new Set([
  "ATTACK_DROP_GAP",
  "TAKE_DROP_PULLUP",
  "RESET_DROP",
  "SNAKE_CHASE",
  "POCKET_PASS",
  "RESET_CHASE",
]);
const TACTICAL_DEFENSE_COVERAGES = new Set(["DROP_CONTAIN", "CHASE_OVER"]);
const TACTICAL_EVENTS = new Set([
  "drop_committed",
  "chase_over_committed",
  "pocket_window_open",
  "pocket_pass_launched",
  "pocket_pass_caught",
  "tactical_drive_advantage",
  "tactical_pullup_window",
  "tactical_snake_advantage",
  "tactical_contained",
]);
const MAXIMUM_TICKS = Math.ceil(I00_RUNTIME_CONTRACT.maxTime / FIXED_DT) + 3;
const EPSILON = 1e-9;
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

export const I02_STRATEGY_MATRIX_VERSION = "formation-minimum-t-policy-matrix@1";

export interface I02StrategyMatchup {
  readonly id: P03MatchupId;
  readonly strategies: TeamStrategySelection;
}

export const I02_STRATEGY_MATRIX: readonly I02StrategyMatchup[] = Object.freeze(
  P03_POLICY_MATCHUPS.map((matchup) => Object.freeze({
    id: matchup.id,
    strategies: makeP02StrategySelection(
      matchup.offenseStrategyId,
      matchup.defenseStrategyId,
    ),
  })),
);

export type I01Resolution = TerminalState["reason"] | "unresolved";

export interface I01SideAudit {
  mirrored: boolean;
  selectedSide: ScreenSide | null;
  readyTick: number | null;
  readyAvailableAtTick: number | null;
  handoffTick: number | null;
  enteredPnrAtTick: number | null;
  handoffTeams: Array<"offense" | "defense">;
  handoffOffensePlan: string | null;
  handoffDefensePlan: string | null;
  defenseCoverages: string[];
  offenseReads: string[];
  terminalReason: I01Resolution;
  terminalTick: number | null;
  sameSimulationWorldIdentity: boolean;
  monotonicTickTime: boolean;
  playerContinuity: boolean;
  ballContinuity: boolean;
  noTacticalReadBeforeHandoff: boolean;
  publicEventCausalityPassed: boolean;
  informationBoundaryPassed: boolean;
  zeroStrategyAdjustment: boolean;
  strategyReferencesPassed: boolean;
  strategyPhaseCoveragePassed: boolean;
  strategyLocked: boolean;
  hardVetoPriorityPassed: boolean;
  roleOwnershipPassed: boolean;
  routesLegal: boolean;
  ballStatePassed: boolean;
  worldStatePassed: boolean;
  localScreenCausalityPassed: boolean;
  minimumTeammateBodyGap: number;
  maximumNearZeroTeammateTicks: number;
  maximumCloseDualMovingTicks: number;
  maximumResetRelativeTurnDegrees: number;
  maximumChaseCloseTurnDegrees: number;
  resetRollRouteSafe: boolean;
  teammateChannelPassed: boolean;
  pocketIntegrityPassed: boolean;
  safeExitPassed: boolean;
  tacticalResolutionPassed: boolean;
  allowedTerminal: boolean;
}

export interface I01IntegrationRow {
  id: string;
  resolution: I01Resolution;
  terminalTick: number | null;
  formed: boolean;
  readyTick: number | null;
  handoffTick: number | null;
  handoffDefensePlan: string | null;
  offenseReads: string[];
  right: I01SideAudit;
  left: I01SideAudit;
  deterministic: boolean;
  evaluationOrderStable: boolean;
  defenseFirstEquivalent: boolean;
  mirrored: boolean;
  mirrorMaximumError: number;
  sameSimulationWorldIdentity: boolean;
  formationReadyNextBoundary: boolean;
  monotonicTickTime: boolean;
  playerContinuity: boolean;
  ballContinuity: boolean;
  noTacticalReadBeforeHandoff: boolean;
  publicEventCausalityPassed: boolean;
  informationBoundaryPassed: boolean;
  zeroStrategyAdjustment: boolean;
  strategyReferencesPassed: boolean;
  strategyPhaseCoveragePassed: boolean;
  strategyLocked: boolean;
  hardVetoPriorityPassed: boolean;
  roleOwnershipPassed: boolean;
  routesLegal: boolean;
  ballStatePassed: boolean;
  worldStatePassed: boolean;
  localScreenCausalityPassed: boolean;
  minimumTeammateBodyGap: number;
  teammateChannelPassed: boolean;
  pocketIntegrityPassed: boolean;
  safeExitPassed: boolean;
  tacticalResolutionPassed: boolean;
  allowedTerminalsPassed: boolean;
  behaviorTraceSignature: string;
  failures: string[];
  passed: boolean;
}

export interface I01RepresentativeReplay {
  id: "formed-handoff" | "chase-read" | "mirrored-handoff" | "safe-exit";
  inputId: string;
  mirrored: boolean;
  side: ScreenSide | null;
  terminalReason: I01Resolution;
  note: string;
}

export interface I01IntegrationAudit {
  manifestVersion: typeof I00_INPUT_MANIFEST_VERSION;
  inputHash: typeof I00_MANIFEST_HASH;
  inputCount: number;
  worldCount: number;
  executionsPerWorld: 3;
  rows: I01IntegrationRow[];
  formedWorlds: number;
  safeExitWorlds: number;
  sameSimulationWorldIdentity: boolean;
  formationReadyNextBoundary: boolean;
  monotonicTickTime: boolean;
  playerContinuity: boolean;
  ballContinuity: boolean;
  deterministic: boolean;
  evaluationOrderStable: boolean;
  defenseFirstEquivalent: boolean;
  noTacticalReadBeforeHandoff: boolean;
  publicEventCausalityPassed: boolean;
  mirrored: boolean;
  informationBoundaryPassed: boolean;
  zeroStrategyAdjustment: boolean;
  strategyReferencesPassed: boolean;
  strategyPhaseCoveragePassed: boolean;
  strategyLocked: boolean;
  hardVetoPriorityPassed: boolean;
  roleOwnershipPassed: boolean;
  routesLegal: boolean;
  ballStatePassed: boolean;
  worldStatePassed: boolean;
  localScreenCausalityPassed: boolean;
  teammateChannelPassed: boolean;
  pocketIntegrityPassed: boolean;
  safeExitPassed: boolean;
  tacticalResolutionPassed: boolean;
  allowedTerminalsPassed: boolean;
  replays: I01RepresentativeReplay[];
  passed: boolean;
  firstFailure: { id: string; reason: string } | null;
}

export interface I02StrategyAuditRow {
  id: string;
  inputId: string;
  matchupId: P03MatchupId;
  offenseStrategy: TeamStrategyReference;
  defenseStrategy: TeamStrategyReference;
  audit: I01IntegrationRow;
  initialOffenseSignature: string;
  initialDefenseSignature: string;
  behaviorSignature: string;
  passed: boolean;
  failures: string[];
}

export interface I02StrategyMatrixAudit {
  version: typeof I02_STRATEGY_MATRIX_VERSION;
  manifestVersion: typeof I00_INPUT_MANIFEST_VERSION;
  inputHash: typeof I00_MANIFEST_HASH;
  inputCount: number;
  matchupCount: number;
  cellCount: number;
  worldCount: number;
  executionsPerWorld: 3;
  rows: I02StrategyAuditRow[];
  deterministic: boolean;
  defenseFirstEquivalent: boolean;
  mirrored: boolean;
  sameSimulationWorldIdentity: boolean;
  formationReadyNextBoundary: boolean;
  monotonicTickTime: boolean;
  playerContinuity: boolean;
  ballContinuity: boolean;
  noTacticalReadBeforeHandoff: boolean;
  publicEventCausalityPassed: boolean;
  informationBoundaryPassed: boolean;
  opponentStrategyIsolationPassed: boolean;
  strategyReferencesPassed: boolean;
  strategyPhaseCoveragePassed: boolean;
  strategyLocked: boolean;
  hardVetoPriorityPassed: boolean;
  roleOwnershipPassed: boolean;
  routesLegal: boolean;
  ballStatePassed: boolean;
  worldStatePassed: boolean;
  localScreenCausalityPassed: boolean;
  teammateChannelPassed: boolean;
  pocketIntegrityPassed: boolean;
  safeExitPassed: boolean;
  tacticalResolutionPassed: boolean;
  allowedTerminalsPassed: boolean;
  defaultBaselineUnchanged: boolean;
  strategyEffectCausalityPassed: boolean;
  observedBehaviorDifferenceInputs: number;
  allObservedAdjustmentsZero: boolean;
  passed: boolean;
  firstFailure: { id: string; reason: string } | null;
}

export interface I03RepresentativeReplay {
  id: "formed-handoff" | "strategy-carry" | "mirrored-handoff" | "safe-exit";
  inputId: string;
  matchupId: P03MatchupId;
  strategies: TeamStrategySelection;
  mirrored: boolean;
  side: ScreenSide | null;
  terminalReason: I01Resolution;
  note: string;
}

export interface I03IntegrationAudit {
  i01: I01IntegrationAudit;
  i02: I02StrategyMatrixAudit;
  inheritedTacticalTeammateCoordinationPassed: boolean;
  inheritedTacticalPocketFlightPassed: boolean;
  inheritedTacticalStageCoveragePassed: boolean;
  replays: I03RepresentativeReplay[];
  passed: boolean;
  firstFailure: { id: string; reason: string } | null;
}

function copyPositions(positions: InitialPlayerPositions): InitialPlayerPositions {
  return copyInitialPlayerPositions(positions);
}

export function makeI01IntegrationConfig(
  input: I00IntegrationInput,
  mirrored = false,
  plannerEvaluationOrder: "offense-first" | "defense-first" = "offense-first",
): SimulationConfig {
  return {
    initialPositions: mirrored
      ? mirrorInitialPlayerPositions(input.initialPositions)
      : copyPositions(input.initialPositions),
    setupMode: I00_RUNTIME_CONTRACT.setupMode,
    startMode: I00_RUNTIME_CONTRACT.startMode,
    formationDomainVersion: AUTONOMOUS_FORMATION_DOMAIN_VERSION,
    seed: input.seed,
    horizon: I00_RUNTIME_CONTRACT.horizon,
    tacticalVocabularyVersion: MINIMUM_TACTICAL_VOCABULARY_VERSION,
    integrationVersion: FORMATION_TACTICAL_INTEGRATION_VERSION,
    strategies: {
      offense: { ...I00_STRATEGY_CONTRACT.offense },
      defense: { ...I00_STRATEGY_CONTRACT.defense },
    },
    plannerEvaluationOrder,
  };
}

export function getI02StrategyMatchup(matchupId: P03MatchupId): I02StrategyMatchup {
  const matchup = I02_STRATEGY_MATRIX.find((candidate) => candidate.id === matchupId);
  if (!matchup) throw new Error(`Unknown I02 strategy matchup: ${matchupId}`);
  return matchup;
}

export function makeI02IntegrationConfig(
  input: I00IntegrationInput,
  matchup: I02StrategyMatchup,
  mirrored = false,
  plannerEvaluationOrder: "offense-first" | "defense-first" = "offense-first",
): SimulationConfig {
  return {
    ...makeI01IntegrationConfig(input, mirrored, plannerEvaluationOrder),
    strategies: matchup.strategies,
  };
}

export function createI01IntegrationReplay(
  inputId: string,
  mirrored = false,
): PnrSimulation {
  const input = I00_INTEGRATION_INPUTS.find((candidate) => candidate.id === inputId);
  if (!input) throw new Error(`Unknown I01 integration input: ${inputId}`);
  return new PnrSimulation(makeI01IntegrationConfig(input, mirrored));
}

interface IdentityFrame {
  simulation: PnrSimulation;
  world: PnrSimulation["world"];
  players: PnrSimulation["world"]["players"];
  playerObjects: Array<PnrSimulation["world"]["players"][keyof PnrSimulation["world"]["players"]]>;
  ball: PnrSimulation["world"]["ball"];
  strategies: PnrSimulation["config"]["strategies"];
  offenseStrategy: TeamStrategyReference;
  defenseStrategy: TeamStrategyReference;
  offenseProfile: ReturnType<PnrSimulation["getStrategyProfile"]>;
  defenseProfile: ReturnType<PnrSimulation["getStrategyProfile"]>;
}

interface StepFrame {
  tick: number;
  time: number;
  phase: "formation" | "pnr";
  players: Record<string, { pos: Vec2; vel: Vec2; maxSpeed: number }>;
  ballOwner: string | null;
  ball: { pos: Vec2; vel: Vec2; inFlight: boolean; kind: string | null; outcome: string };
}

interface RuntimeChecks {
  identity: IdentityFrame;
  sameObject: boolean;
  monotonic: boolean;
  playerContinuity: boolean;
  ballContinuity: boolean;
  noTBefore: boolean;
  strategyStable: boolean;
  strategyLocked: boolean;
  roleOwnership: boolean;
  routesLegal: boolean;
  ballState: boolean;
  worldState: boolean;
  localScreenCausality: boolean;
  previousScreenEffective: boolean;
  teammate: TeammateCoordinationState;
}

interface BehaviorTraceState {
  first: number;
  second: number;
  frames: number;
  planningCursor: number;
  eventCursor: number;
}

type TeammateCoordinationSemantic = "reset" | "chase" | null;

interface TeammateCoordinationState {
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

function teammateBodyGap(simulation: PnrSimulation): number {
  const o1 = simulation.world.players.O1;
  const o5 = simulation.world.players.O5;
  return Math.hypot(o1.pos.x - o5.pos.x, o1.pos.y - o5.pos.y) - o1.radius - o5.radius;
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

function eventTick(simulation: PnrSimulation, type: string): number | null {
  return simulation.eventLog.find((event) => event.type === type)?.tick ?? null;
}

function newTeammateCoordinationState(
  simulation: PnrSimulation,
): TeammateCoordinationState {
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
  state: TeammateCoordinationState,
): void {
  const o1 = simulation.world.players.O1;
  const o5 = simulation.world.players.O5;
  const bodyGap = teammateBodyGap(simulation);
  const semantic = coordinationSemantic(simulation);
  state.minimumBodyGap = Math.min(state.minimumBodyGap, bodyGap);
  state.nearZeroTicks = bodyGap < TACTICAL_NEAR_ZERO_TEAMMATE_GAP - EPSILON
    ? state.nearZeroTicks + 1
    : 0;
  state.maximumNearZeroTicks = Math.max(state.maximumNearZeroTicks, state.nearZeroTicks);
  const closeDualMoving = semantic === "chase" &&
    bodyGap < TACTICAL_CLOSE_TEAMMATE_GAP - EPSILON &&
    Math.hypot(o1.vel.x, o1.vel.y) > TACTICAL_CLOSE_MOVING_SPEED + EPSILON &&
    Math.hypot(o5.vel.x, o5.vel.y) > TACTICAL_CLOSE_MOVING_SPEED + EPSILON;
  state.closeDualMovingTicks = closeDualMoving ? state.closeDualMovingTicks + 1 : 0;
  state.maximumCloseDualMovingTicks = Math.max(
    state.maximumCloseDualMovingTicks,
    state.closeDualMovingTicks,
  );
  const turnWindowOpen = semantic === "reset" ||
    (semantic === "chase" && bodyGap < TACTICAL_CLOSE_TEAMMATE_GAP - EPSILON);
  if (semantic && turnWindowOpen) {
    const relativeAngle = Math.atan2(o5.pos.y - o1.pos.y, o5.pos.x - o1.pos.x);
    if (state.previousTurnSemantic === semantic && state.previousTurnAngle !== null) {
      state.turnRadians[semantic] += angleDelta(state.previousTurnAngle, relativeAngle);
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
  if (launchTick !== null && state.pocketReleaseDistance === null && simulation.world.tick >= launchTick) {
    state.pocketReleaseDistance = Math.hypot(o1.pos.x - o5.pos.x, o1.pos.y - o5.pos.y);
  }
  if (
    launchTick !== null && simulation.world.tick >= launchTick &&
    (catchTick === null || simulation.world.tick < catchTick)
  ) {
    state.pocketFlightStatePassed = state.pocketFlightStatePassed &&
      simulation.world.ball.inFlight && simulation.world.ball.kind === "pocket_pass" &&
      simulation.world.ballOwner === null;
  }
}

function teammateChannelPassed(state: TeammateCoordinationState): boolean {
  return state.minimumBodyGap >= TACTICAL_TEAMMATE_CHANNEL_CLEARANCE - 1e-6 &&
    state.maximumNearZeroTicks <= TACTICAL_MAX_NEAR_ZERO_TEAMMATE_TICKS &&
    state.maximumCloseDualMovingTicks <= TACTICAL_MAX_CLOSE_DUAL_MOVING_TICKS &&
    state.maximumTurnRadians.reset <= TACTICAL_RESET_MAX_CLOSE_TURN_RADIANS + EPSILON &&
    state.maximumTurnRadians.chase <= TACTICAL_CHASE_MAX_CLOSE_TURN_RADIANS + EPSILON &&
    state.resetRollRouteSafe;
}

function pocketIntegrityPassed(
  simulation: PnrSimulation,
  state: TeammateCoordinationState,
): boolean {
  const launchTick = eventTick(simulation, "pocket_pass_launched");
  const catchTick = eventTick(simulation, "pocket_pass_caught");
  if (launchTick === null) {
    return catchTick === null && simulation.world.terminal?.reason !== "tactical_pocket_caught";
  }
  return catchTick !== null && catchTick - launchTick >= TACTICAL_POCKET_MIN_FLIGHT_TICKS &&
    state.pocketReleaseDistance !== null &&
    state.pocketReleaseDistance >= TACTICAL_POCKET_MIN_RELEASE_DISTANCE - EPSILON &&
    state.pocketFlightStatePassed && simulation.world.ballOwner === "O5" &&
    simulation.world.ball.outcome === "caught";
}

function planRoutesLegal(plan: TeamPlan): boolean {
  return !plan.route || Object.values(plan.route.tracks).every((track) =>
    !track || track.segments.every((segment) => segment.proof.legal && segment.proof.courtLegal));
}

function planOwnershipPassed(plan: TeamPlan): boolean {
  const playerIds = plan.team === "offense"
    ? new Set(["O1", "O5"])
    : new Set(["D1", "D5"]);
  const expectedOwner = `${plan.team}-planner`;
  const rolesPassed = Object.entries(plan.roles).every(([id, role]) =>
    !role || playerIds.has(id) && role.playerId === id && role.owner === expectedOwner);
  const routesPassed = !plan.route || Object.entries(plan.route.tracks).every(([id, track]) =>
    !track || playerIds.has(id) && track.playerId === id &&
      track.segments.every((segment) => playerIds.has(segment.advanceSubject)));
  const passTargetPassed = plan.team === "defense"
    ? plan.passTarget === undefined
    : plan.passTarget === undefined || playerIds.has(plan.passTarget);
  const privateSetupPassed = plan.team === "offense" || plan.autonomousSetup === undefined;
  return rolesPassed && routesPassed && passTargetPassed && privateSetupPassed;
}

function roleOwnershipPassed(simulation: PnrSimulation): boolean {
  const roles = simulation.getRoles();
  const completeRoles = roles.length === PLAYER_IDS.length &&
    new Set(roles.map((role) => role.playerId)).size === PLAYER_IDS.length &&
    roles.every((role) => role.owner ===
      (role.playerId.startsWith("O") ? "offense-planner" : "defense-planner"));
  return completeRoles && simulation.offensePlan.team === "offense" &&
    simulation.defensePlan.team === "defense" &&
    planOwnershipPassed(simulation.offensePlan) &&
    planOwnershipPassed(simulation.defensePlan);
}

export function integrationBallStatePassed(simulation: PnrSimulation): boolean {
  const owner = simulation.world.ballOwner;
  const ball = simulation.world.ball;
  const passMetadataPassed = ball.launchedAt !== null && Number.isFinite(ball.launchedAt) &&
    (ball.kind === "kick_out"
      ? ball.from === "O5" && ball.intendedReceiver === "O1"
      : (ball.kind === "lob_entry" || ball.kind === "slip_pass" || ball.kind === "pocket_pass") &&
        ball.from === "O1" && ball.intendedReceiver === "O5");
  if (ball.inFlight) {
    return owner === null && ball.target !== null && ball.outcome === "live" && passMetadataPassed;
  }
  if (ball.target !== null) return false;
  if (owner === null) return ball.outcome === "missed" && passMetadataPassed;
  const player = simulation.world.players[owner];
  if (!player) return false;
  const outcomePassed = owner === "D1" || owner === "D5"
    ? ball.outcome === "deflected" && passMetadataPassed
    : ball.outcome === "caught"
      ? ball.intendedReceiver === owner && passMetadataPassed
      : owner === "O1" && ball.outcome === "live" && ball.from === null &&
        ball.intendedReceiver === null && ball.kind === null && ball.launchedAt === null;
  return outcomePassed && Math.hypot(
    ball.pos.x - player.pos.x,
    ball.pos.y - player.pos.y,
  ) <= player.radius + ball.radius + 0.075 + EPSILON;
}

export function integrationWorldStatePassed(simulation: PnrSimulation): boolean {
  const world = simulation.world;
  if (![world.ball.pos.x, world.ball.pos.y, world.ball.vel.x, world.ball.vel.y]
    .every(Number.isFinite)) return false;
  if (world.ball.pos.x < -EPSILON || world.ball.pos.x > COURT.width + EPSILON ||
    world.ball.pos.y < -EPSILON || world.ball.pos.y > COURT.height + EPSILON) return false;
  for (const id of PLAYER_IDS) {
    const player = world.players[id];
    if (![player.pos.x, player.pos.y, player.vel.x, player.vel.y].every(Number.isFinite)) return false;
    if (player.pos.x < player.radius - EPSILON ||
      player.pos.x > COURT.width - player.radius + EPSILON ||
      player.pos.y < player.radius - EPSILON ||
      player.pos.y > COURT.height - player.radius + EPSILON) return false;
  }
  for (let firstIndex = 0; firstIndex < PLAYER_IDS.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < PLAYER_IDS.length; secondIndex += 1) {
      const first = world.players[PLAYER_IDS[firstIndex]];
      const second = world.players[PLAYER_IDS[secondIndex]];
      const gap = Math.hypot(first.pos.x - second.pos.x, first.pos.y - second.pos.y) -
        first.radius - second.radius;
      if (gap < -0.01 - EPSILON) return false;
    }
  }
  return true;
}

export function integrationLocalScreenCausalityPassed(
  simulation: PnrSimulation,
  previousScreenEffective: boolean,
): boolean {
  const facts = simulation.world.facts;
  const localCause = facts.contact || facts.routeExposure;
  return (!facts.impeded || localCause) &&
    (!facts.screenEffective || previousScreenEffective || localCause);
}

function identityFrame(simulation: PnrSimulation): IdentityFrame {
  return {
    simulation,
    world: simulation.world,
    players: simulation.world.players,
    playerObjects: PLAYER_IDS.map((id) => simulation.world.players[id]),
    ball: simulation.world.ball,
    strategies: simulation.config.strategies,
    offenseStrategy: simulation.config.strategies.offense,
    defenseStrategy: simulation.config.strategies.defense,
    offenseProfile: simulation.getStrategyProfile("offense"),
    defenseProfile: simulation.getStrategyProfile("defense"),
  };
}

function stepFrame(simulation: PnrSimulation): StepFrame {
  return {
    tick: simulation.world.tick,
    time: simulation.world.time,
    phase: simulation.world.formation.phase,
    players: Object.fromEntries(PLAYER_IDS.map((id) => [id, {
      pos: { ...simulation.world.players[id].pos },
      vel: { ...simulation.world.players[id].vel },
      maxSpeed: simulation.world.players[id].maxSpeed,
    }])),
    ballOwner: simulation.world.ballOwner,
    ball: {
      pos: { ...simulation.world.ball.pos },
      vel: { ...simulation.world.ball.vel },
      inFlight: simulation.world.ball.inFlight,
      kind: simulation.world.ball.kind,
      outcome: simulation.world.ball.outcome,
    },
  };
}

function identityPassed(simulation: PnrSimulation, identity: IdentityFrame): boolean {
  return simulation === identity.simulation &&
    simulation.world === identity.world &&
    simulation.world.players === identity.players &&
    simulation.world.ball === identity.ball &&
    PLAYER_IDS.every((id, index) => simulation.world.players[id] === identity.playerObjects[index]);
}

function strategyStatePassed(simulation: PnrSimulation, identity: IdentityFrame): boolean {
  return simulation.config.strategies === identity.strategies &&
    simulation.config.strategies.offense === identity.offenseStrategy &&
    simulation.config.strategies.defense === identity.defenseStrategy &&
    simulation.getStrategyProfile("offense") === identity.offenseProfile &&
    simulation.getStrategyProfile("defense") === identity.defenseProfile &&
    Object.isFrozen(identity.strategies) && Object.isFrozen(identity.offenseStrategy) &&
    Object.isFrozen(identity.defenseStrategy) && Object.isFrozen(identity.offenseProfile) &&
    Object.isFrozen(identity.defenseProfile);
}

function tacticalReadPresent(simulation: PnrSimulation): boolean {
  return simulation.world.tacticalVocabularyVersion !== undefined ||
    simulation.world.tacticalCoverage !== undefined ||
    TACTICAL_OFFENSE_READS.has(simulation.offensePlan.id) ||
    TACTICAL_DEFENSE_COVERAGES.has(simulation.defensePlan.id) ||
    simulation.planningLog.some((record) =>
      TACTICAL_OFFENSE_READS.has(record.chosen) ||
      TACTICAL_DEFENSE_COVERAGES.has(record.chosen) ||
      record.decisionPhase === "offense_drop_read" ||
      record.decisionPhase === "offense_chase_read"
    ) || simulation.eventLog.some((event) => TACTICAL_EVENTS.has(event.type));
}

function afterStepChecks(
  simulation: PnrSimulation,
  previous: StepFrame,
  checks: RuntimeChecks,
): void {
  checks.sameObject = checks.sameObject && identityPassed(simulation, checks.identity);
  checks.monotonic = checks.monotonic &&
    simulation.world.tick === previous.tick + 1 &&
    Math.abs(simulation.world.time - simulation.world.tick * FIXED_DT) <= 1e-6;
  for (const id of PLAYER_IDS) {
    const before = previous.players[id];
    const after = simulation.world.players[id];
    const displacement = Math.hypot(after.pos.x - before.pos.x, after.pos.y - before.pos.y);
    checks.playerContinuity = checks.playerContinuity &&
      Number.isFinite(displacement) && displacement <= after.maxSpeed * FIXED_DT + EPSILON &&
      Math.hypot(after.vel.x, after.vel.y) <= after.maxSpeed + EPSILON;
    if (previous.phase === "formation" && simulation.world.formation.phase === "pnr") {
      checks.playerContinuity = checks.playerContinuity &&
        Math.hypot(after.vel.x - before.vel.x, after.vel.y - before.vel.y) <=
          12.8 * FIXED_DT + EPSILON;
    }
  }
  const ball = simulation.world.ball;
  checks.ballContinuity = checks.ballContinuity &&
    [ball.pos.x, ball.pos.y, ball.vel.x, ball.vel.y].every(Number.isFinite) &&
    integrationBallStatePassed(simulation);
  if (previous.phase === "formation" && simulation.world.formation.phase === "pnr") {
    checks.ballContinuity = checks.ballContinuity &&
      previous.ballOwner === simulation.world.ballOwner &&
      previous.ball.inFlight === ball.inFlight && previous.ball.kind === ball.kind &&
      previous.ball.outcome === ball.outcome;
  }
  if (simulation.world.formation.phase === "formation") {
    checks.noTBefore = checks.noTBefore && !tacticalReadPresent(simulation);
  }
  checks.strategyStable = checks.strategyStable && strategyStatePassed(simulation, checks.identity);
  checks.strategyLocked = checks.strategyLocked && simulation.strategyLocked;
  checks.roleOwnership = checks.roleOwnership && roleOwnershipPassed(simulation);
  checks.routesLegal = checks.routesLegal && planRoutesLegal(simulation.offensePlan) &&
    planRoutesLegal(simulation.defensePlan);
  checks.ballState = checks.ballState && integrationBallStatePassed(simulation);
  checks.worldState = checks.worldState && integrationWorldStatePassed(simulation);
  checks.localScreenCausality = checks.localScreenCausality &&
    integrationLocalScreenCausalityPassed(simulation, checks.previousScreenEffective);
  checks.previousScreenEffective = simulation.world.facts.screenEffective;
  sampleTeammateCoordination(simulation, checks.teammate);
}

function deterministicFrame(simulation: PnrSimulation): string {
  const plan = (value: TeamPlan) => ({
    id: value.id,
    version: value.version,
    route: value.route
      ? Object.fromEntries(PLAYER_IDS.map((id) => [id, value.route?.tracks[id]
        ? {
            segmentIndex: value.route.tracks[id]?.segmentIndex,
            reachedAtTick: value.route.tracks[id]?.reachedAtTick,
          }
        : null]))
      : null,
  });
  return JSON.stringify({
    tick: simulation.world.tick,
    stateHash: simulation.world.stateHash,
    offense: plan(simulation.offensePlan),
    defense: plan(simulation.defensePlan),
    planning: simulation.planningLog.map((record) => ({
      tick: record.tick,
      team: record.team,
      phase: record.decisionPhase,
      chosen: record.chosen,
      triggerEventIds: record.triggerEventIds,
      strategy: record.strategy,
      candidates: record.candidates.map((candidate) => [
        candidate.id,
        candidate.feasible,
        candidate.baseScore,
        candidate.strategyAdjustment,
        candidate.effectiveScore,
        candidate.vetoes,
      ]),
    })),
    events: simulation.eventLog.map((event) => [event.tick, event.availableAtTick, event.type]),
    terminal: simulation.world.terminal?.reason ?? null,
  });
}

function newBehaviorTraceState(): BehaviorTraceState {
  return {
    first: 0x811c9dc5,
    second: 0x9e3779b9,
    frames: 0,
    planningCursor: 0,
    eventCursor: 0,
  };
}

function sampleBehaviorTrace(
  simulation: PnrSimulation,
  state: BehaviorTraceState,
): void {
  const planning = simulation.planningLog.slice(state.planningCursor).map((record) => ({
    tick: record.tick,
    team: record.team,
    phase: record.decisionPhase,
    triggerEventIds: record.triggerEventIds,
    chosen: record.chosen,
    chosenLabel: record.chosenLabel,
    candidates: record.candidates.map((candidate) => [
      candidate.id,
      candidate.label,
      candidate.feasible,
      candidate.baseScore,
      candidate.vetoes,
    ]),
  }));
  const events = simulation.eventLog.slice(state.eventCursor);
  const text = JSON.stringify({
    tick: simulation.world.tick,
    stateHash: simulation.world.stateHash,
    planning,
    events,
  });
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    state.first = Math.imul(state.first ^ code, 0x01000193) >>> 0;
    state.second = Math.imul(state.second ^ code, 0x85ebca6b) >>> 0;
  }
  state.first = Math.imul(state.first ^ 10, 0x01000193) >>> 0;
  state.second = Math.imul(state.second ^ 10, 0x85ebca6b) >>> 0;
  state.frames += 1;
  state.planningCursor = simulation.planningLog.length;
  state.eventCursor = simulation.eventLog.length;
}

function behaviorTraceSignature(state: BehaviorTraceState): string {
  return `${state.frames}:` +
    `${state.first.toString(16).padStart(8, "0")}` +
    `${state.second.toString(16).padStart(8, "0")}`;
}

function vectorError(first: Vec2, second: Vec2): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function comparePlanMirror(right: TeamPlan, left: TeamPlan): number {
  if (right.id !== left.id) return Number.POSITIVE_INFINITY;
  let maximum = 0;
  const comparePoint = (a?: Vec2, b?: Vec2) => {
    if (!a || !b) {
      if (a || b) maximum = Number.POSITIVE_INFINITY;
      return;
    }
    maximum = Math.max(maximum, vectorError(mirrorPointAcrossCenterline(a), b));
  };
  comparePoint(right.primaryTarget, left.primaryTarget);
  comparePoint(right.secondaryTarget, left.secondaryTarget);
  for (const id of PLAYER_IDS) {
    const a = right.route?.tracks[id];
    const b = left.route?.tracks[id];
    if (!a || !b) {
      if (a || b) return Number.POSITIVE_INFINITY;
      continue;
    }
    if (a.segmentIndex !== b.segmentIndex || a.segments.length !== b.segments.length) {
      return Number.POSITIVE_INFINITY;
    }
    a.segments.forEach((segment, index) => comparePoint(segment.target, b.segments[index]?.target));
  }
  const aSetup = right.autonomousSetup;
  const bSetup = left.autonomousSetup;
  if (aSetup || bSetup) {
    if (!aSetup || !bSetup || aSetup.anchorId !== bSetup.anchorId ||
      (aSetup.side === bSetup.side)) return Number.POSITIVE_INFINITY;
    comparePoint(aSetup.planningOrigin, bSetup.planningOrigin);
    for (const key of ["screenAnchor", "handlerWaitingPoint", "useGate", "rejectGate"] as const) {
      comparePoint(aSetup.landmarks[key], bSetup.landmarks[key]);
    }
  }
  return maximum;
}

function mirrorError(right: PnrSimulation, left: PnrSimulation): number {
  let maximum = Math.max(
    comparePlanMirror(right.offensePlan, left.offensePlan),
    comparePlanMirror(right.defensePlan, left.defensePlan),
    vectorError(mirrorPointAcrossCenterline(right.world.ball.pos), left.world.ball.pos),
    vectorError(mirrorVectorAcrossCenterline(right.world.ball.vel), left.world.ball.vel),
  );
  for (const id of PLAYER_IDS) {
    maximum = Math.max(maximum,
      vectorError(mirrorPointAcrossCenterline(right.world.players[id].pos), left.world.players[id].pos),
      vectorError(mirrorVectorAcrossCenterline(right.world.players[id].vel), left.world.players[id].vel));
  }
  return maximum;
}

function mirrorSemantics(right: PnrSimulation, left: PnrSimulation): boolean {
  const opposite = (side: ScreenSide | null) => side === "right" ? "left" : side === "left" ? "right" : null;
  return left.world.screenSide === opposite(right.world.screenSide) &&
    right.world.formation.phase === left.world.formation.phase &&
    left.world.formation.committedSide === opposite(right.world.formation.committedSide ?? null) &&
    right.world.branch === left.world.branch && right.world.ballOwner === left.world.ballOwner &&
    right.world.ball.kind === left.world.ball.kind && right.world.ball.outcome === left.world.ball.outcome &&
    right.world.terminal?.reason === left.world.terminal?.reason &&
    JSON.stringify(right.planningLog.map((r) => [
      r.tick, r.team, r.decisionPhase, r.chosen, r.strategy,
      r.candidates.map((candidate) => [
        candidate.id, candidate.feasible, candidate.baseScore,
        candidate.strategyAdjustment, candidate.effectiveScore,
      ]),
    ])) ===
      JSON.stringify(left.planningLog.map((r) => [
        r.tick, r.team, r.decisionPhase, r.chosen, r.strategy,
        r.candidates.map((candidate) => [
          candidate.id, candidate.feasible, candidate.baseScore,
          candidate.strategyAdjustment, candidate.effectiveScore,
        ]),
      ])) &&
    JSON.stringify(right.eventLog.map((e) => [e.tick, e.availableAtTick, e.type])) ===
      JSON.stringify(left.eventLog.map((e) => [e.tick, e.availableAtTick, e.type]));
}

function informationBoundaryPassed(simulation: PnrSimulation): boolean {
  const offense = createPlannerObservation(simulation.world, "offense") as unknown as Record<string, unknown>;
  const defense = createPlannerObservation(simulation.world, "defense") as unknown as Record<string, unknown>;
  const events = new Map(simulation.eventLog.map((event) => [event.id, event]));
  return !Object.hasOwn(offense, "defensePlan") && !Object.hasOwn(offense, "defenseStrategy") &&
    !Object.hasOwn(defense, "offensePlan") && !Object.hasOwn(defense, "offenseStrategy") &&
    simulation.planningLog.every((record) =>
      record.observationBoundary.includes("不含") && record.triggerEventIds.every((id) => {
        const event = events.get(id);
        return Boolean(event && event.availableAtTick <= record.tick);
      }));
}

function eventForRecord(
  simulation: PnrSimulation,
  record: PlanningRecord,
  types: ReadonlySet<string>,
): WorldEvent | undefined {
  return simulation.eventLog.find((event) =>
    record.triggerEventIds.includes(event.id) && types.has(event.type) && event.availableAtTick <= record.tick);
}

function sameStrategyReference(
  first: TeamStrategyReference,
  second: TeamStrategyReference,
): boolean {
  return first.id === second.id && first.version === second.version;
}

function strategyReferencesPassed(
  simulation: PnrSimulation,
  expected: TeamStrategySelection,
): boolean {
  return sameStrategyReference(simulation.config.strategies.offense, expected.offense) &&
    sameStrategyReference(simulation.config.strategies.defense, expected.defense) &&
    simulation.planningLog.every((record) => {
      const own = expected[record.team];
      const opponent = expected[record.team === "offense" ? "defense" : "offense"];
      return record.strategy.team === record.team &&
        sameStrategyReference(record.strategy, own) &&
        record.strategyBoundary.includes(`${own.id}@${own.version}`) &&
        !record.strategyBoundary.includes(opponent.id);
    });
}

function strategyPhaseCoveragePassed(
  simulation: PnrSimulation,
  expected: TeamStrategySelection,
): boolean {
  const hasOwnedPhase = (team: "offense" | "defense", phase: PlanningRecord["decisionPhase"]) =>
    simulation.planningLog.some((record) =>
      record.team === team && record.decisionPhase === phase &&
      sameStrategyReference(record.strategy, expected[team]));
  const ready = simulation.eventLog.some((event) => event.type === "formation_ready");
  const formationOwned = hasOwnedPhase("offense", "offense_formation") &&
    hasOwnedPhase("defense", "defense_formation");
  if (!ready) return formationOwned;
  return formationOwned && hasOwnedPhase("defense", "defense_initial_coverage") &&
    simulation.planningLog.some((record) =>
      record.team === "offense" &&
      (record.decisionPhase === "offense_drop_read" ||
        record.decisionPhase === "offense_chase_read") &&
      sameStrategyReference(record.strategy, expected.offense));
}

function hardVetoPriorityPassed(simulation: PnrSimulation): boolean {
  return simulation.planningLog.every((record) => {
    const chosen = record.candidates.find((candidate) =>
      candidate.id === record.chosen && candidate.label === record.chosenLabel);
    return Boolean(chosen?.feasible) && record.candidates.every((candidate) => {
      if (!candidate.feasible) {
        return (candidate.id !== record.chosen || candidate.label !== record.chosenLabel) &&
          candidate.baseScore === null &&
          candidate.strategyAdjustment === 0 && candidate.effectiveScore === null;
      }
      if (candidate.baseScore === null || candidate.effectiveScore === null) return false;
      return candidate.effectiveScore ===
        Math.round((candidate.baseScore + candidate.strategyAdjustment) * 1000) / 1000;
    });
  });
}

function initialPlanningSignature(
  simulation: PnrSimulation,
  team: "offense" | "defense",
): string {
  const record = simulation.planningLog.find((candidate) =>
    candidate.tick === 0 && candidate.team === team);
  if (!record) return "missing";
  return JSON.stringify({
    phase: record.decisionPhase,
    chosen: record.chosen,
    strategy: record.strategy,
    candidates: record.candidates.map((candidate) => [
      candidate.id,
      candidate.feasible,
      candidate.baseScore,
      candidate.strategyAdjustment,
      candidate.effectiveScore,
      candidate.strategyReason,
      candidate.vetoes,
    ]),
  });
}

function sideAudit(
  simulation: PnrSimulation,
  mirrored: boolean,
  checks: RuntimeChecks,
  expectedStrategies: TeamStrategySelection,
): I01SideAudit {
  const ready = simulation.eventLog.find((event) => event.type === "formation_ready");
  const handoffRecords = ready
    ? simulation.planningLog.filter((record) => record.triggerEventIds.includes(ready.id))
    : [];
  const handoffOffense = handoffRecords.find((record) => record.team === "offense");
  const handoffDefense = handoffRecords.find((record) => record.team === "defense");
  const offenseReadRecords = simulation.planningLog.filter((record) =>
    record.team === "offense" && TACTICAL_OFFENSE_READS.has(record.chosen));
  const defenseCoverages = [...new Set(simulation.planningLog
    .filter((record) => record.team === "defense" && TACTICAL_DEFENSE_COVERAGES.has(record.chosen))
    .map((record) => record.chosen))];
  const offenseReads = [...new Set(offenseReadRecords.map((record) => record.chosen))];
  const terminalReason = simulation.world.terminal?.reason ?? "unresolved";
  const formed = Boolean(ready);
  const nextBoundary = !formed || Boolean(
    ready && ready.availableAtTick === ready.tick + 1 &&
    handoffOffense?.tick === ready.availableAtTick && handoffDefense?.tick === ready.availableAtTick &&
    simulation.world.formation.enteredPnrAtTick === ready.availableAtTick &&
    handoffOffense.triggerEventIds.includes(ready.id) && handoffDefense.triggerEventIds.includes(ready.id) &&
    TACTICAL_DEFENSE_COVERAGES.has(handoffDefense.chosen));
  const secondaryReadCausal = !formed || Boolean(offenseReadRecords[0] &&
    offenseReadRecords[0].tick > (ready?.tick ?? -1) &&
    eventForRecord(simulation, offenseReadRecords[0], new Set(["drop_committed", "chase_over_committed"])));
  const formationSafeExit = !ready &&
    (terminalReason === "formation_aborted" || terminalReason === "formation_timeout") &&
    simulation.world.formation.phase === "formation" &&
    simulation.world.tacticalVocabularyVersion === undefined &&
    simulation.world.tacticalCoverage === undefined && offenseReads.length === 0 &&
    defenseCoverages.length === 0;
  const safeExit = terminalReason !== "formation_aborted" && terminalReason !== "formation_timeout" ||
    formationSafeExit;
  const tacticalResolution = ready
    ? terminalReason !== "unresolved" && terminalReason !== "formation_aborted" &&
      terminalReason !== "formation_timeout" && defenseCoverages.length > 0 &&
      offenseReads.length > 0 && handoffOffense !== undefined && handoffDefense !== undefined &&
      (handoffOffense.tick < (simulation.world.terminal ? simulation.world.tick : Number.POSITIVE_INFINITY))
    : formationSafeExit;
  const teammatePassed = teammateChannelPassed(checks.teammate);
  return {
    mirrored,
    selectedSide: simulation.world.screenSide,
    readyTick: ready?.tick ?? null,
    readyAvailableAtTick: ready?.availableAtTick ?? null,
    handoffTick: handoffOffense?.tick ?? handoffDefense?.tick ?? null,
    enteredPnrAtTick: simulation.world.formation.enteredPnrAtTick,
    handoffTeams: handoffRecords.map((record) => record.team),
    handoffOffensePlan: handoffOffense?.chosen ?? null,
    handoffDefensePlan: handoffDefense?.chosen ?? null,
    defenseCoverages,
    offenseReads,
    terminalReason,
    terminalTick: simulation.world.terminal ? simulation.world.tick : null,
    sameSimulationWorldIdentity: checks.sameObject,
    monotonicTickTime: checks.monotonic,
    playerContinuity: checks.playerContinuity,
    ballContinuity: checks.ballContinuity,
    noTacticalReadBeforeHandoff: checks.noTBefore,
    publicEventCausalityPassed: nextBoundary && secondaryReadCausal,
    informationBoundaryPassed: informationBoundaryPassed(simulation),
    zeroStrategyAdjustment: simulation.planningLog.every((record) =>
      record.candidates.every((candidate) => candidate.strategyAdjustment === 0)),
    strategyReferencesPassed: strategyReferencesPassed(simulation, expectedStrategies),
    strategyPhaseCoveragePassed: strategyPhaseCoveragePassed(simulation, expectedStrategies),
    strategyLocked: checks.strategyStable && checks.strategyLocked,
    hardVetoPriorityPassed: hardVetoPriorityPassed(simulation),
    roleOwnershipPassed: checks.roleOwnership,
    routesLegal: checks.routesLegal,
    ballStatePassed: checks.ballState,
    worldStatePassed: checks.worldState,
    localScreenCausalityPassed: checks.localScreenCausality,
    minimumTeammateBodyGap: checks.teammate.minimumBodyGap,
    maximumNearZeroTeammateTicks: checks.teammate.maximumNearZeroTicks,
    maximumCloseDualMovingTicks: checks.teammate.maximumCloseDualMovingTicks,
    maximumResetRelativeTurnDegrees:
      checks.teammate.maximumTurnRadians.reset * 180 / Math.PI,
    maximumChaseCloseTurnDegrees:
      checks.teammate.maximumTurnRadians.chase * 180 / Math.PI,
    resetRollRouteSafe: checks.teammate.resetRollRouteSafe,
    teammateChannelPassed: teammatePassed,
    pocketIntegrityPassed: pocketIntegrityPassed(simulation, checks.teammate),
    safeExitPassed: safeExit,
    tacticalResolutionPassed: tacticalResolution,
    allowedTerminal: terminalReason !== "unresolved" &&
      (I00_ALLOWED_TERMINALS as readonly string[]).includes(terminalReason),
  };
}

export interface IntegratedInputAuditResult {
  row: I01IntegrationRow;
  initialOffenseSignature: string;
  initialDefenseSignature: string;
}

export function auditIntegratedInput(
  input: I00IntegrationInput,
  expectedStrategies: TeamStrategySelection = I00_STRATEGY_CONTRACT,
): IntegratedInputAuditResult {
  const makeConfig = (
    mirrored = false,
    plannerEvaluationOrder: "offense-first" | "defense-first" = "offense-first",
  ): SimulationConfig => ({
    ...makeI01IntegrationConfig(input, mirrored, plannerEvaluationOrder),
    strategies: expectedStrategies,
  });
  const right = new PnrSimulation(makeConfig());
  const rightDuplicate = new PnrSimulation(makeConfig());
  const rightDefenseFirst = new PnrSimulation(makeConfig(false, "defense-first"));
  const left = new PnrSimulation(makeConfig(true));
  const leftDuplicate = new PnrSimulation(makeConfig(true));
  const leftDefenseFirst = new PnrSimulation(makeConfig(true, "defense-first"));
  const simulations = [right, rightDuplicate, rightDefenseFirst, left, leftDuplicate, leftDefenseFirst];
  const runtime = simulations.map((simulation): RuntimeChecks => {
    const identity = identityFrame(simulation);
    const teammate = newTeammateCoordinationState(simulation);
    sampleTeammateCoordination(simulation, teammate);
    return {
      identity,
      sameObject: true,
      monotonic: true,
      playerContinuity: true,
      ballContinuity: true,
      noTBefore: !tacticalReadPresent(simulation),
      strategyStable: strategyStatePassed(simulation, identity),
      strategyLocked: true,
      roleOwnership: roleOwnershipPassed(simulation),
      routesLegal: planRoutesLegal(simulation.offensePlan) && planRoutesLegal(simulation.defensePlan),
      ballState: integrationBallStatePassed(simulation),
      worldState: integrationWorldStatePassed(simulation),
      localScreenCausality: integrationLocalScreenCausalityPassed(simulation, false),
      previousScreenEffective: simulation.world.facts.screenEffective,
      teammate,
    };
  });
  const initialOffenseSignature = initialPlanningSignature(right, "offense");
  const initialDefenseSignature = initialPlanningSignature(right, "defense");
  const rightBehaviorTrace = newBehaviorTraceState();
  const leftBehaviorTrace = newBehaviorTraceState();
  const failures: string[] = [];
  let deterministic = true;
  let orderStable = true;
  let mirrored = true;
  let mirrorMaximumError = 0;
  for (let tick = 0; tick <= MAXIMUM_TICKS; tick += 1) {
    sampleBehaviorTrace(right, rightBehaviorTrace);
    sampleBehaviorTrace(left, leftBehaviorTrace);
    const frames = simulations.map(deterministicFrame);
    deterministic = deterministic && frames[0] === frames[1] && frames[3] === frames[4];
    orderStable = orderStable && frames[0] === frames[2] && frames[3] === frames[5];
    for (const [a, b] of [[right, left], [rightDuplicate, leftDuplicate], [rightDefenseFirst, leftDefenseFirst]] as const) {
      const error = mirrorError(a, b);
      mirrorMaximumError = Math.max(mirrorMaximumError, error);
      mirrored = mirrored && Number.isFinite(error) && error <= EPSILON && mirrorSemantics(a, b);
    }
    if (simulations.every((simulation) => simulation.world.terminal)) break;
    if (simulations.some((simulation) => simulation.world.terminal)) {
      if (!failures.some((failure) => failure.startsWith("TERMINAL_TICK_MISMATCH@"))) {
        failures.push(`TERMINAL_TICK_MISMATCH@${tick}`);
      }
    }
    if (tick === MAXIMUM_TICKS) break;
    const before = simulations.map(stepFrame);
    simulations.forEach((simulation, index) => {
      if (simulation.world.terminal) return;
      simulation.step();
      afterStepChecks(simulation, before[index], runtime[index]);
    });
  }
  const rightSummary = sideAudit(right, false, runtime[0], expectedStrategies);
  const leftSummary = sideAudit(left, true, runtime[3], expectedStrategies);
  const sides = [rightSummary, leftSummary];
  const everyRuntime = (pick: (check: RuntimeChecks) => boolean) => runtime.every(pick);
  const sameObject = everyRuntime((check) => check.sameObject);
  const monotonic = everyRuntime((check) => check.monotonic);
  const playerContinuity = everyRuntime((check) => check.playerContinuity);
  const ballContinuity = everyRuntime((check) => check.ballContinuity);
  const noTBefore = everyRuntime((check) => check.noTBefore);
  const formationReadyNextBoundary = sides.every((side) => side.publicEventCausalityPassed ||
    side.terminalReason === "formation_aborted" || side.terminalReason === "formation_timeout");
  const informationBoundary = simulations.every(informationBoundaryPassed);
  const zeroAdjustment = simulations.every((simulation) => simulation.planningLog.every((record) =>
    record.candidates.every((candidate) => candidate.strategyAdjustment === 0)));
  const requireZeroAdjustment = sameStrategyReference(
    expectedStrategies.offense,
    I00_STRATEGY_CONTRACT.offense,
  ) && sameStrategyReference(
    expectedStrategies.defense,
    I00_STRATEGY_CONTRACT.defense,
  );
  const strategyReferences = simulations.every((simulation) =>
    strategyReferencesPassed(simulation, expectedStrategies));
  const strategyPhaseCoverage = simulations.every((simulation) =>
    strategyPhaseCoveragePassed(simulation, expectedStrategies));
  const strategyLock = runtime.every((check) => check.strategyStable && check.strategyLocked);
  const hardVetoPriority = simulations.every(hardVetoPriorityPassed);
  const roleOwnership = runtime.every((check) => check.roleOwnership);
  const routesLegal = runtime.every((check) => check.routesLegal);
  const ballState = runtime.every((check) => check.ballState);
  const worldState = runtime.every((check) => check.worldState);
  const localScreenCausality = runtime.every((check) => check.localScreenCausality);
  const teammateChannel = runtime.every((check) => teammateChannelPassed(check.teammate));
  const pocketIntegrity = simulations.every((simulation, index) =>
    pocketIntegrityPassed(simulation, runtime[index].teammate));
  const minimumTeammateBodyGap = Math.min(
    ...runtime.map((check) => check.teammate.minimumBodyGap),
  );
  const safeExit = sides.every((side) => side.safeExitPassed);
  const tacticalResolution = sides.every((side) => side.tacticalResolutionPassed);
  const allowed = sides.every((side) => side.allowedTerminal);
  if (!deterministic) failures.push("NONDETERMINISTIC");
  if (!orderStable) failures.push("DEFENSE_FIRST_DIVERGED");
  if (!mirrored) failures.push("WORLD_MIRROR");
  if (!sameObject) failures.push("OBJECT_IDENTITY");
  if (!formationReadyNextBoundary) failures.push("FORMATION_READY_BOUNDARY");
  if (!monotonic) failures.push("TICK_TIME_MONOTONICITY");
  if (!playerContinuity) failures.push("PLAYER_CONTINUITY");
  if (!ballContinuity) failures.push("BALL_CONTINUITY");
  if (!noTBefore) failures.push("TACTICAL_READ_BEFORE_HANDOFF");
  if (!sides.every((side) => side.publicEventCausalityPassed)) failures.push("PUBLIC_EVENT_CAUSALITY");
  if (!informationBoundary) failures.push("INFORMATION_BOUNDARY");
  if (requireZeroAdjustment && !zeroAdjustment) failures.push("NONZERO_STRATEGY_ADJUSTMENT");
  if (!strategyReferences) failures.push("STRATEGY_REFERENCE");
  if (!strategyPhaseCoverage) failures.push("STRATEGY_PHASE_COVERAGE");
  if (!strategyLock) failures.push("STRATEGY_LOCK");
  if (!hardVetoPriority) failures.push("HARD_VETO_PRIORITY");
  if (!roleOwnership) failures.push("ROLE_OWNERSHIP");
  if (!routesLegal) failures.push("ROUTE_PROOF");
  if (!ballState) failures.push("BALL_STATE");
  if (!worldState) failures.push("WORLD_STATE");
  if (!localScreenCausality) failures.push("REMOTE_SCREEN");
  if (!teammateChannel) failures.push("TEAMMATE_CHANNEL");
  if (!pocketIntegrity) failures.push("POCKET_INTEGRITY");
  if (!safeExit) failures.push("FORMATION_SAFE_EXIT");
  if (!tacticalResolution) failures.push("TACTICAL_RESOLUTION");
  if (!allowed) failures.push("TERMINAL_NOT_ALLOWED");
  const row: I01IntegrationRow = {
    id: input.id,
    resolution: rightSummary.terminalReason,
    terminalTick: rightSummary.terminalTick,
    formed: rightSummary.readyTick !== null,
    readyTick: rightSummary.readyTick,
    handoffTick: rightSummary.handoffTick,
    handoffDefensePlan: rightSummary.handoffDefensePlan,
    offenseReads: rightSummary.offenseReads,
    right: rightSummary,
    left: leftSummary,
    deterministic,
    evaluationOrderStable: orderStable,
    defenseFirstEquivalent: orderStable,
    mirrored,
    mirrorMaximumError,
    sameSimulationWorldIdentity: sameObject,
    formationReadyNextBoundary,
    monotonicTickTime: monotonic,
    playerContinuity,
    ballContinuity,
    noTacticalReadBeforeHandoff: noTBefore,
    publicEventCausalityPassed: sides.every((side) => side.publicEventCausalityPassed),
    informationBoundaryPassed: informationBoundary,
    zeroStrategyAdjustment: zeroAdjustment,
    strategyReferencesPassed: strategyReferences,
    strategyPhaseCoveragePassed: strategyPhaseCoverage,
    strategyLocked: strategyLock,
    hardVetoPriorityPassed: hardVetoPriority,
    roleOwnershipPassed: roleOwnership,
    routesLegal,
    ballStatePassed: ballState,
    worldStatePassed: worldState,
    localScreenCausalityPassed: localScreenCausality,
    minimumTeammateBodyGap,
    teammateChannelPassed: teammateChannel,
    pocketIntegrityPassed: pocketIntegrity,
    safeExitPassed: safeExit,
    tacticalResolutionPassed: tacticalResolution,
    allowedTerminalsPassed: allowed,
    behaviorTraceSignature:
      `${behaviorTraceSignature(rightBehaviorTrace)}|${behaviorTraceSignature(leftBehaviorTrace)}`,
    failures,
    passed: failures.length === 0,
  };
  return { row, initialOffenseSignature, initialDefenseSignature };
}

function representativeReplays(rows: I01IntegrationRow[]): I01RepresentativeReplay[] {
  const formed = rows.find((row) => row.formed && row.passed) ?? rows.find((row) => row.formed);
  const chase = rows.find((row) => row.right.defenseCoverages.includes("CHASE_OVER")) ?? formed;
  const safe = rows.find((row) => row.resolution === "formation_aborted") ??
    rows.find((row) => row.resolution === "formation_timeout");
  if (!formed || !chase || !safe) return [];
  return [
    { id: "formed-handoff", inputId: formed.id, mirrored: false, side: formed.right.selectedSide,
      terminalReason: formed.right.terminalReason, note: `formation_ready 于 tick ${formed.readyTick} 发布并在 ${formed.handoffTick} 交接` },
    { id: "chase-read", inputId: chase.id, mirrored: false, side: chase.right.selectedSide,
      terminalReason: chase.right.terminalReason, note: "连续世界中由 DROP 进入 CHASE 与进攻二级读取" },
    { id: "mirrored-handoff", inputId: formed.id, mirrored: true, side: formed.left.selectedSide,
      terminalReason: formed.left.terminalReason, note: "同一冻结输入的真实世界镜像交接" },
    { id: "safe-exit", inputId: safe.id, mirrored: false, side: safe.right.selectedSide,
      terminalReason: safe.right.terminalReason, note: "Formation 真实安全退出且未提前启用 T" },
  ];
}

export function scanI01Integration(): I01IntegrationAudit {
  const rows = I00_INTEGRATION_INPUTS.map((input) => auditIntegratedInput(input).row);
  const replays = representativeReplays(rows);
  const firstFailureRow = rows.find((row) => !row.passed);
  const firstFailure = firstFailureRow
    ? { id: firstFailureRow.id, reason: firstFailureRow.failures[0] ?? "unknown" }
    : replays.length === 4 ? null : { id: "I01-REPLAYS", reason: "representative replay coverage missing" };
  const audit: Omit<I01IntegrationAudit, "passed" | "firstFailure"> = {
    manifestVersion: I00_INPUT_MANIFEST_VERSION,
    inputHash: I00_MANIFEST_HASH,
    inputCount: I00_INTEGRATION_INPUTS.length,
    worldCount: I00_INTEGRATION_INPUTS.length * 2,
    executionsPerWorld: 3,
    rows,
    formedWorlds: rows.filter((row) => row.formed).length * 2,
    safeExitWorlds: rows.filter((row) => !row.formed).length * 2,
    sameSimulationWorldIdentity: rows.every((row) => row.sameSimulationWorldIdentity),
    formationReadyNextBoundary: rows.every((row) => row.formationReadyNextBoundary),
    monotonicTickTime: rows.every((row) => row.monotonicTickTime),
    playerContinuity: rows.every((row) => row.playerContinuity),
    ballContinuity: rows.every((row) => row.ballContinuity),
    deterministic: rows.every((row) => row.deterministic),
    evaluationOrderStable: rows.every((row) => row.evaluationOrderStable),
    defenseFirstEquivalent: rows.every((row) => row.defenseFirstEquivalent),
    noTacticalReadBeforeHandoff: rows.every((row) => row.noTacticalReadBeforeHandoff),
    publicEventCausalityPassed: rows.every((row) => row.publicEventCausalityPassed),
    mirrored: rows.every((row) => row.mirrored),
    informationBoundaryPassed: rows.every((row) => row.informationBoundaryPassed),
    zeroStrategyAdjustment: rows.every((row) => row.zeroStrategyAdjustment),
    strategyReferencesPassed: rows.every((row) => row.strategyReferencesPassed),
    strategyPhaseCoveragePassed: rows.every((row) => row.strategyPhaseCoveragePassed),
    strategyLocked: rows.every((row) => row.strategyLocked),
    hardVetoPriorityPassed: rows.every((row) => row.hardVetoPriorityPassed),
    roleOwnershipPassed: rows.every((row) => row.roleOwnershipPassed),
    routesLegal: rows.every((row) => row.routesLegal),
    ballStatePassed: rows.every((row) => row.ballStatePassed),
    worldStatePassed: rows.every((row) => row.worldStatePassed),
    localScreenCausalityPassed: rows.every((row) => row.localScreenCausalityPassed),
    teammateChannelPassed: rows.every((row) => row.teammateChannelPassed),
    pocketIntegrityPassed: rows.every((row) => row.pocketIntegrityPassed),
    safeExitPassed: rows.every((row) => row.safeExitPassed),
    tacticalResolutionPassed: rows.every((row) => row.tacticalResolutionPassed),
    allowedTerminalsPassed: rows.every((row) => row.allowedTerminalsPassed),
    replays,
  };
  return { ...audit, passed: rows.every((row) => row.passed) && replays.length === 4, firstFailure };
}

export function makeI01RepresentativeReplayConfig(
  replay: I01RepresentativeReplay,
): SimulationConfig {
  const input = I00_INTEGRATION_INPUTS.find((candidate) => candidate.id === replay.inputId);
  if (!input) throw new Error(`Unknown I01 representative input: ${replay.inputId}`);
  return makeI01IntegrationConfig(input, replay.mirrored);
}

function opponentStrategyIsolationPassed(rows: I02StrategyAuditRow[]): boolean {
  return I00_INTEGRATION_INPUTS.every((input) => {
    const inputRows = rows.filter((row) => row.inputId === input.id);
    const offenseIds = new Set(inputRows.map((row) => row.offenseStrategy.id));
    const defenseIds = new Set(inputRows.map((row) => row.defenseStrategy.id));
    const offenseIsolated = [...offenseIds].every((offenseId) =>
      new Set(inputRows
        .filter((row) => row.offenseStrategy.id === offenseId)
        .map((row) => row.initialOffenseSignature)).size === 1);
    const defenseIsolated = [...defenseIds].every((defenseId) =>
      new Set(inputRows
        .filter((row) => row.defenseStrategy.id === defenseId)
        .map((row) => row.initialDefenseSignature)).size === 1);
    return offenseIsolated && defenseIsolated;
  });
}

export function scanI02StrategyIntegration(
  i01: I01IntegrationAudit = scanI01Integration(),
): I02StrategyMatrixAudit {
  const rawRows = I00_INTEGRATION_INPUTS.flatMap((input) =>
    I02_STRATEGY_MATRIX.map((matchup): I02StrategyAuditRow => {
      const result = auditIntegratedInput(input, matchup.strategies);
      return {
        id: `${input.id}/${matchup.id}`,
        inputId: input.id,
        matchupId: matchup.id,
        offenseStrategy: matchup.strategies.offense,
        defenseStrategy: matchup.strategies.defense,
        audit: result.row,
        initialOffenseSignature: result.initialOffenseSignature,
        initialDefenseSignature: result.initialDefenseSignature,
        behaviorSignature: result.row.behaviorTraceSignature,
        passed: result.row.passed,
        failures: [...result.row.failures],
      };
    }));
  const defaultMatchup = I02_STRATEGY_MATRIX.find((matchup) =>
    sameStrategyReference(matchup.strategies.offense, I00_STRATEGY_CONTRACT.offense) &&
    sameStrategyReference(matchup.strategies.defense, I00_STRATEGY_CONTRACT.defense));
  const defaultSignatures = new Map(I00_INTEGRATION_INPUTS.map((input) => [
    input.id,
    rawRows.find((row) =>
      row.inputId === input.id && row.matchupId === defaultMatchup?.id)?.behaviorSignature,
  ]));
  const rows = rawRows.map((row): I02StrategyAuditRow => {
    const unexplainedStrategyEffect = row.audit.zeroStrategyAdjustment &&
      row.behaviorSignature !== defaultSignatures.get(row.inputId);
    return unexplainedStrategyEffect
      ? {
          ...row,
          passed: false,
          failures: [...row.failures, "STRATEGY_EFFECT_WITHOUT_ADJUSTMENT"],
        }
      : row;
  });
  const opponentIsolation = opponentStrategyIsolationPassed(rows);
  const defaultBaselineUnchanged = Boolean(defaultMatchup) && I00_INTEGRATION_INPUTS.every((input) => {
    const baseline = i01.rows.find((row) => row.id === input.id);
    const matrix = rows.find((row) =>
      row.inputId === input.id && row.matchupId === defaultMatchup?.id);
    return Boolean(baseline && matrix &&
      baseline.behaviorTraceSignature === matrix.behaviorSignature);
  });
  const strategyEffectCausalityPassed = rows.every((row) =>
    !row.failures.includes("STRATEGY_EFFECT_WITHOUT_ADJUSTMENT"));
  const observedBehaviorDifferenceInputs = I00_INTEGRATION_INPUTS.filter((input) =>
    rows.some((row) => row.inputId === input.id &&
      row.behaviorSignature !== defaultSignatures.get(input.id))).length;
  const everyAudit = (pick: (audit: I01IntegrationRow) => boolean) =>
    rows.every((row) => pick(row.audit));
  const firstCellFailure = rows.find((row) => !row.passed);
  const aggregateFailure = !opponentIsolation
    ? { id: "I02-OPPONENT-STRATEGY", reason: "opponent strategy affected the initial team decision" }
    : !defaultBaselineUnchanged
      ? { id: "I02-DEFAULT-BASELINE", reason: "I00-I01 default behavior changed" }
      : null;
  const firstFailure = firstCellFailure
    ? { id: firstCellFailure.id, reason: firstCellFailure.failures[0] ?? "unknown" }
    : aggregateFailure;
  const audit: Omit<I02StrategyMatrixAudit, "passed" | "firstFailure"> = {
    version: I02_STRATEGY_MATRIX_VERSION,
    manifestVersion: I00_INPUT_MANIFEST_VERSION,
    inputHash: I00_MANIFEST_HASH,
    inputCount: I00_INTEGRATION_INPUTS.length,
    matchupCount: I02_STRATEGY_MATRIX.length,
    cellCount: rows.length,
    worldCount: rows.length * 2,
    executionsPerWorld: 3,
    rows,
    deterministic: everyAudit((row) => row.deterministic),
    defenseFirstEquivalent: everyAudit((row) => row.defenseFirstEquivalent),
    mirrored: everyAudit((row) => row.mirrored),
    sameSimulationWorldIdentity: everyAudit((row) => row.sameSimulationWorldIdentity),
    formationReadyNextBoundary: everyAudit((row) => row.formationReadyNextBoundary),
    monotonicTickTime: everyAudit((row) => row.monotonicTickTime),
    playerContinuity: everyAudit((row) => row.playerContinuity),
    ballContinuity: everyAudit((row) => row.ballContinuity),
    noTacticalReadBeforeHandoff: everyAudit((row) => row.noTacticalReadBeforeHandoff),
    publicEventCausalityPassed: everyAudit((row) => row.publicEventCausalityPassed),
    informationBoundaryPassed: everyAudit((row) => row.informationBoundaryPassed),
    opponentStrategyIsolationPassed: opponentIsolation,
    strategyReferencesPassed: everyAudit((row) => row.strategyReferencesPassed),
    strategyPhaseCoveragePassed: everyAudit((row) => row.strategyPhaseCoveragePassed),
    strategyLocked: everyAudit((row) => row.strategyLocked),
    hardVetoPriorityPassed: everyAudit((row) => row.hardVetoPriorityPassed),
    roleOwnershipPassed: everyAudit((row) => row.roleOwnershipPassed),
    routesLegal: everyAudit((row) => row.routesLegal),
    ballStatePassed: everyAudit((row) => row.ballStatePassed),
    worldStatePassed: everyAudit((row) => row.worldStatePassed),
    localScreenCausalityPassed: everyAudit((row) => row.localScreenCausalityPassed),
    teammateChannelPassed: everyAudit((row) => row.teammateChannelPassed),
    pocketIntegrityPassed: everyAudit((row) => row.pocketIntegrityPassed),
    safeExitPassed: everyAudit((row) => row.safeExitPassed),
    tacticalResolutionPassed: everyAudit((row) => row.tacticalResolutionPassed),
    allowedTerminalsPassed: everyAudit((row) => row.allowedTerminalsPassed),
    defaultBaselineUnchanged,
    strategyEffectCausalityPassed,
    observedBehaviorDifferenceInputs,
    allObservedAdjustmentsZero: everyAudit((row) => row.zeroStrategyAdjustment),
  };
  return {
    ...audit,
    passed: rows.every((row) => row.passed) && opponentIsolation && defaultBaselineUnchanged &&
      strategyEffectCausalityPassed,
    firstFailure,
  };
}

function i03RepresentativeReplays(
  i01: I01IntegrationAudit,
  i02: I02StrategyMatrixAudit,
): I03RepresentativeReplay[] {
  const defaultMatchup = I02_STRATEGY_MATRIX.find((matchup) => matchup.id === "OB-DB");
  const nonDefaultMatchup = I02_STRATEGY_MATRIX.find((matchup) => matchup.id === "OM-DE");
  const formed = i01.rows.find((row) => row.formed && row.passed);
  const defaultBehavior = (inputId: string) => i02.rows.find((row) =>
    row.inputId === inputId && row.matchupId === defaultMatchup?.id)?.behaviorSignature;
  const strategyCarry = i02.rows.find((row) =>
    row.matchupId !== defaultMatchup?.id && row.audit.formed && row.passed &&
    row.behaviorSignature !== defaultBehavior(row.inputId)) ??
    i02.rows.find((row) =>
    row.matchupId === nonDefaultMatchup?.id && row.audit.formed &&
    row.audit.right.defenseCoverages.includes("CHASE_OVER") && row.passed) ??
    i02.rows.find((row) => row.matchupId === nonDefaultMatchup?.id && row.audit.formed && row.passed);
  const safe = i02.rows.find((row) =>
    row.matchupId === nonDefaultMatchup?.id &&
    row.audit.resolution === "formation_aborted" && row.passed) ??
    i02.rows.find((row) =>
      row.matchupId === nonDefaultMatchup?.id && !row.audit.formed && row.passed);
  const strategyCarryMatchup = I02_STRATEGY_MATRIX.find((matchup) =>
    matchup.id === strategyCarry?.matchupId);
  const safeMatchup = I02_STRATEGY_MATRIX.find((matchup) => matchup.id === safe?.matchupId);
  if (!defaultMatchup || !nonDefaultMatchup || !formed || !strategyCarry || !safe ||
    !strategyCarryMatchup || !safeMatchup) return [];
  const strategyCarryDiffers = strategyCarry.behaviorSignature !==
    defaultBehavior(strategyCarry.inputId);
  return [
    {
      id: "formed-handoff",
      inputId: formed.id,
      matchupId: defaultMatchup.id,
      strategies: defaultMatchup.strategies,
      mirrored: false,
      side: formed.right.selectedSide,
      terminalReason: formed.right.terminalReason,
      note: `formation_ready@${formed.readyTick} → handoff@${formed.handoffTick}`,
    },
    {
      id: "strategy-carry",
      inputId: strategyCarry.inputId,
      matchupId: strategyCarry.matchupId,
      strategies: strategyCarryMatchup.strategies,
      mirrored: false,
      side: strategyCarry.audit.right.selectedSide,
      terminalReason: strategyCarry.audit.right.terminalReason,
      note: strategyCarryDiffers
        ? "复用既有非默认策略并展示审计到的真实差异"
        : `${strategyCarry.matchupId} 全程携带；本锁定 I 域与默认终局合法同轨`,
    },
    {
      id: "mirrored-handoff",
      inputId: formed.id,
      matchupId: defaultMatchup.id,
      strategies: defaultMatchup.strategies,
      mirrored: true,
      side: formed.left.selectedSide,
      terminalReason: formed.left.terminalReason,
      note: "同一输入、同一策略的真实世界镜像交接",
    },
    {
      id: "safe-exit",
      inputId: safe.inputId,
      matchupId: safe.matchupId,
      strategies: safeMatchup.strategies,
      mirrored: false,
      side: safe.audit.right.selectedSide,
      terminalReason: safe.audit.right.terminalReason,
      note: "非默认策略不越过 Formation 真实 abort/timeout",
    },
  ];
}

export function scanI03Integration(
  tactical: ReturnType<typeof scanTacticalVocabulary> = scanTacticalVocabulary(),
): I03IntegrationAudit {
  const i01 = scanI01Integration();
  const i02 = scanI02StrategyIntegration(i01);
  const replays = i03RepresentativeReplays(i01, i02);
  const inheritedTacticalTeammateCoordinationPassed =
    tactical.passed && tactical.teammateCoordinationPassed;
  const inheritedTacticalPocketFlightPassed = tactical.passed && tactical.pocketFlightPassed;
  const inheritedTacticalStageCoveragePassed = tactical.passed && tactical.stageCoveragePassed;
  const firstFailure = i01.firstFailure ?? i02.firstFailure ?? tactical.firstFailure ??
    (replays.length === 4 ? null : { id: "I03-REPLAYS", reason: "representative replay coverage missing" });
  return {
    i01,
    i02,
    inheritedTacticalTeammateCoordinationPassed,
    inheritedTacticalPocketFlightPassed,
    inheritedTacticalStageCoveragePassed,
    replays,
    passed: i01.passed && i02.passed && inheritedTacticalTeammateCoordinationPassed &&
      inheritedTacticalPocketFlightPassed && inheritedTacticalStageCoveragePassed &&
      replays.length === 4,
    firstFailure,
  };
}

export function makeI03RepresentativeReplayConfig(
  replay: I03RepresentativeReplay,
): SimulationConfig {
  const input = I00_INTEGRATION_INPUTS.find((candidate) => candidate.id === replay.inputId);
  if (!input) throw new Error(`Unknown I03 representative input: ${replay.inputId}`);
  const matchup = getI02StrategyMatchup(replay.matchupId);
  return makeI02IntegrationConfig(input, matchup, replay.mirrored);
}

export function createI03IntegrationReplay(replay: I03RepresentativeReplay): PnrSimulation {
  return new PnrSimulation(makeI03RepresentativeReplayConfig(replay));
}
