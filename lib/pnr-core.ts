export const FIXED_DT = 1 / 60;

export const COURT = {
  width: 10,
  height: 8,
  hoop: { x: 5, y: 0.68 },
  screenSpot: { x: 5.62, y: 5.62 },
  useGate: { x: 6.38, y: 4.72 },
  rejectGate: { x: 3.18, y: 4.82 },
} as const;

export const PLAYER_IDS = ["O1", "O5", "D1", "D5"] as const;
export type PlayerId = (typeof PLAYER_IDS)[number];
export type Team = "offense" | "defense";
export type DefensiveCue =
  | "neutral"
  | "overplay_right"
  | "overplay_hard_right"
  | "under_gap";
export type SimulationHorizon =
  | "pnr_resolution"
  | "post_catch_finish"
  | "post_catch_kickout"
  | "mismatch_attack"
  | "under_pullup"
  | "reject_slip";
export type OffensePlanId =
  | "USE_RIGHT_SCREEN"
  | "REJECT_LEFT"
  | "ATTACK_BIG"
  | "FEED_SEAL"
  | "RESET_MISMATCH"
  | "POST_FINISH"
  | "KICK_OUT"
  | "REJECT_SLIP_PASS";
export type DefensePlanId =
  | "SWITCH_READY"
  | "SWITCH"
  | "STAY_HOME"
  | "CONTAIN_MISMATCH"
  | "FRONT_SEAL"
  | "BACKSIDE_CONTEST"
  | "STAY_HOME_POST"
  | "DIG_POST"
  | "PRESSURE_MISMATCH"
  | "UNDER"
  | "TAG_REJECT";
export type PlanId = OffensePlanId | DefensePlanId;
export type Branch = "undecided" | "use" | "reject";

export interface Vec2 {
  x: number;
  y: number;
}

export interface PlayerState {
  id: PlayerId;
  team: Team;
  pos: Vec2;
  vel: Vec2;
  radius: number;
  maxSpeed: number;
}

export interface ScreenFacts {
  contact: boolean;
  routeExposure: boolean;
  impeded: boolean;
  screenEffective: boolean;
  screenLegalPose: boolean;
  pnrLinked: boolean;
  ballHandlerClearedScreen: boolean;
  matchupExchange: boolean;
  progressLoss: number;
  accumulatedDelay: number;
}

export type EventType =
  | "screen_set"
  | "branch_use"
  | "branch_reject"
  | "contact_on"
  | "contact_off"
  | "route_exposure_on"
  | "route_exposure_off"
  | "impeded_on"
  | "impeded_off"
  | "screen_cleared"
  | "screen_effective"
  | "switch_completed"
  | "under_committed"
  | "pullup_window"
  | "reject_lane_gained"
  | "reject_help_committed"
  | "reject_pass_window_open"
  | "mismatch_attack"
  | "seal_established"
  | "seal_fronted"
  | "pass_window_open"
  | "pass_launched"
  | "pass_caught"
  | "pass_denied"
  | "post_catch_attack"
  | "help_committed"
  | "kickout_window_open"
  | "kickout_launched"
  | "kickout_caught"
  | "reject_pass_launched"
  | "reject_pass_caught"
  | "finish_window"
  | "mismatch_advantage"
  | "mismatch_contained"
  | "advantage_created"
  | "terminal";

export const EVENT_ORDER: Record<EventType, number> = {
  screen_set: 20,
  branch_use: 30,
  branch_reject: 30,
  contact_on: 40,
  contact_off: 40,
  route_exposure_on: 50,
  route_exposure_off: 50,
  impeded_on: 60,
  impeded_off: 60,
  screen_cleared: 65,
  screen_effective: 70,
  switch_completed: 75,
  under_committed: 76,
  reject_lane_gained: 77,
  mismatch_attack: 77,
  seal_established: 78,
  reject_help_committed: 79,
  seal_fronted: 79,
  pass_window_open: 80,
  pullup_window: 80,
  reject_pass_window_open: 80,
  mismatch_advantage: 80,
  mismatch_contained: 80,
  pass_launched: 82,
  reject_pass_launched: 82,
  pass_caught: 84,
  reject_pass_caught: 84,
  post_catch_attack: 86,
  help_committed: 87,
  kickout_window_open: 88,
  finish_window: 88,
  kickout_launched: 89,
  kickout_caught: 90,
  pass_denied: 92,
  advantage_created: 95,
  terminal: 100,
};

export interface WorldEvent {
  id: string;
  type: EventType;
  tick: number;
  at: number;
  order: number;
  availableAtTick: number;
  label: string;
  detail: string;
}

export interface TerminalState {
  reason:
    | "mismatch_advantage"
    | "seal_catch_advantage"
    | "post_catch_finish_window"
    | "post_catch_kickout_caught"
    | "under_pullup_window"
    | "reject_slip_caught"
    | "pass_denied"
    | "switch_contained"
    | "reject_advantage"
    | "defense_contained";
  label: string;
  at: number;
}

export interface WorldState {
  tick: number;
  time: number;
  players: Record<PlayerId, PlayerState>;
  ballOwner: PlayerId | null;
  ball: BallState;
  branch: Branch;
  facts: ScreenFacts;
  mismatch: MismatchFacts;
  seal: SealFacts;
  postCatch: PostCatchFacts;
  under: UnderFacts;
  reject: RejectFacts;
  terminal: TerminalState | null;
  pendingPlannerEvents: WorldEvent[];
  stateHash: string;
  lastStepMaxDisplacement: number;
}

export interface RoleAssignment {
  playerId: PlayerId;
  roleCode: string;
  roleLabel: string;
  intent: string;
  owner: "offense-planner" | "defense-planner";
}

export interface TeamPlan {
  team: Team;
  id: PlanId;
  label: string;
  version: number;
  startedAt: number;
  startedTick: number;
  commitUntil: number;
  watchdogAt: number;
  roles: Partial<Record<PlayerId, RoleAssignment>>;
  rationale: string;
  chosenScore: number;
  primaryTarget?: Vec2;
  secondaryTarget?: Vec2;
  passTarget?: PlayerId;
}

export interface CandidateEvaluation {
  id: PlanId;
  label: string;
  feasible: boolean;
  score: number | null;
  vetoes: string[];
  evidence: string[];
}

export interface PlanningRecord {
  tick: number;
  at: number;
  team: Team;
  trigger: string;
  triggerEventIds: string[];
  chosen: PlanId;
  chosenLabel: string;
  candidates: CandidateEvaluation[];
  observationBoundary: string;
}

export interface SimulationConfig {
  cue: DefensiveCue;
  seed: number;
  maxTime: number;
  d1FrontReactionDelay: number;
  d1PostCatchRecoveryDelay: number;
  o1MaxSpeed: number;
  horizon: SimulationHorizon;
}

export interface PublicObservation {
  tick: number;
  time: number;
  team: Team;
  ownPlayerIds: PlayerId[];
  opponentPlayerIds: PlayerId[];
  players: Record<PlayerId, { pos: Vec2; vel: Vec2; radius: number; maxSpeed: number }>;
  ballOwner: PlayerId | null;
  ball: {
    pos: Vec2;
    vel: Vec2;
    inFlight: boolean;
    kind: "lob_entry" | "kick_out" | "slip_pass" | null;
  };
  branch: Branch;
  facts: ScreenFacts;
  mismatch: MismatchFacts;
  seal: SealFacts;
  postCatch: PostCatchFacts;
  under: UnderFacts;
  reject: RejectFacts;
  court: typeof COURT;
  triggerEvents: WorldEvent[];
}

interface MotionIntent {
  target: Vec2;
  maxSpeed: number;
  arriveRadius: number;
  screenNavigation?: "over" | "under" | "none";
}

interface GeometryInput {
  d1: PlayerState;
  o5: PlayerState;
  desiredD1Velocity: Vec2;
  screenLegalPose: boolean;
}

interface ScreenEvaluationInput extends GeometryInput {
  progressLoss: number;
  priorDelay: number;
  pnrLinked: boolean;
  ballHandlerSeparation: number;
  ballHandlerClearedScreen?: boolean;
  matchupExchange?: boolean;
  previouslyEffective?: boolean;
}

export interface MismatchFacts {
  active: boolean;
  startedAt: number | null;
  elapsed: number;
  attackCommitted: boolean;
  o1D5Separation: number;
  d5GoalSide: boolean;
  advantage: boolean;
  contained: boolean;
}

export interface SealFacts {
  active: boolean;
  established: boolean;
  o5GoalSide: boolean;
  d1Fronting: boolean;
  frontReactionDelay: number;
  frontRouteLength: number;
  frontRouteLegal: boolean;
  frontRouteNeedsDetour: boolean;
  frontEta: number;
  entryFlightTime: number;
  frontFeasible: boolean;
  passLaneClear: boolean;
  laneClearance: number;
  passWindow: boolean;
  passWindowOpenedAtTick: number | null;
}

export interface PostCatchFacts {
  active: boolean;
  startedAt: number | null;
  elapsed: number;
  attackCommitted: boolean;
  o5RimDistance: number;
  d1Behind: boolean;
  d1BodyGap: number;
  d1RecoveryDelay: number;
  d1RecoveryReadyIn: number;
  d5AttachedToO1: boolean;
  d5O1Distance: number;
  d5O5Distance: number;
  d5HelpCommitted: boolean;
  o1Spacing: number;
  o1Relocated: boolean;
  kickoutLaneClearance: number;
  kickoutWindow: boolean;
  kickoutWindowOpenedAtTick: number | null;
  finishWindow: boolean;
}

export interface UnderFacts {
  active: boolean;
  d1UnderScreen: boolean;
  d1Recovered: boolean;
  d1O1Distance: number;
  d5O5Distance: number;
  pullupWindow: boolean;
}

export interface RejectFacts {
  active: boolean;
  helpEligible: boolean;
  d1Beaten: boolean;
  d5HelpCommitted: boolean;
  d5O1Distance: number;
  d5O5Distance: number;
  o5Slipped: boolean;
  passLaneClearance: number;
  passWindow: boolean;
  passWindowOpenedAtTick: number | null;
}

export interface BallState {
  pos: Vec2;
  vel: Vec2;
  radius: number;
  inFlight: boolean;
  from: PlayerId | null;
  intendedReceiver: PlayerId | null;
  target: Vec2 | null;
  launchedAt: number | null;
    kind: "lob_entry" | "kick_out" | "slip_pass" | null;
  outcome: "live" | "caught" | "deflected" | "missed";
}

type PassIntent =
  | { from: "O1"; to: "O5"; kind: "lob_entry" }
  | { from: "O5"; to: "O1"; kind: "kick_out" }
  | { from: "O1"; to: "O5"; kind: "slip_pass" };

const OFFENSE_IDS: PlayerId[] = ["O1", "O5"];
const DEFENSE_IDS: PlayerId[] = ["D1", "D5"];
const INITIAL_O1 = { x: 4.35, y: 6.58 };
const EMPTY_FACTS: ScreenFacts = {
  contact: false,
  routeExposure: false,
  impeded: false,
  screenEffective: false,
  screenLegalPose: false,
  pnrLinked: false,
  ballHandlerClearedScreen: false,
  matchupExchange: false,
  progressLoss: 0,
  accumulatedDelay: 0,
};
const EMPTY_MISMATCH: MismatchFacts = {
  active: false,
  startedAt: null,
  elapsed: 0,
  attackCommitted: false,
  o1D5Separation: 0,
  d5GoalSide: false,
  advantage: false,
  contained: false,
};
const EMPTY_SEAL: SealFacts = {
  active: false,
  established: false,
  o5GoalSide: false,
  d1Fronting: false,
  frontReactionDelay: 0,
  frontRouteLength: 0,
  frontRouteLegal: false,
  frontRouteNeedsDetour: false,
  frontEta: 0,
  entryFlightTime: 0,
  frontFeasible: false,
  passLaneClear: false,
  laneClearance: 0,
  passWindow: false,
  passWindowOpenedAtTick: null,
};
const EMPTY_POST_CATCH: PostCatchFacts = {
  active: false,
  startedAt: null,
  elapsed: 0,
  attackCommitted: false,
  o5RimDistance: 0,
  d1Behind: false,
  d1BodyGap: 0,
  d1RecoveryDelay: 0,
  d1RecoveryReadyIn: 0,
  d5AttachedToO1: false,
  d5O1Distance: 0,
  d5O5Distance: 0,
  d5HelpCommitted: false,
  o1Spacing: 0,
  o1Relocated: false,
  kickoutLaneClearance: 0,
  kickoutWindow: false,
  kickoutWindowOpenedAtTick: null,
  finishWindow: false,
};
const EMPTY_UNDER: UnderFacts = {
  active: false,
  d1UnderScreen: false,
  d1Recovered: false,
  d1O1Distance: 0,
  d5O5Distance: 0,
  pullupWindow: false,
};
const EMPTY_REJECT: RejectFacts = {
  active: false,
  helpEligible: false,
  d1Beaten: false,
  d5HelpCommitted: false,
  d5O1Distance: 0,
  d5O5Distance: 0,
  o5Slipped: false,
  passLaneClearance: 0,
  passWindow: false,
  passWindowOpenedAtTick: null,
};

function v(x = 0, y = 0): Vec2 {
  return { x, y };
}

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

function scale(a: Vec2, amount: number): Vec2 {
  return { x: a.x * amount, y: a.y * amount };
}

function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

function length(a: Vec2): number {
  return Math.hypot(a.x, a.y);
}

function normalize(a: Vec2): Vec2 {
  const magnitude = length(a);
  return magnitude > 1e-9 ? scale(a, 1 / magnitude) : v();
}

export function distance(a: Vec2, b: Vec2): number {
  return length(sub(a, b));
}

function lowSideDigPoint(o5: Vec2, o1: Vec2, offset = 0.82): Vec2 {
  const passDirection = normalize(sub(o1, o5));
  const sideA = v(passDirection.y, -passDirection.x);
  const sideB = scale(sideA, -1);
  const hoopDirection = normalize(sub(COURT.hoop, o5));
  const lowSide = dot(sideA, hoopDirection) >= dot(sideB, hoopDirection) ? sideA : sideB;
  return add(o5, scale(lowSide, offset));
}

function underScreenPoint(o5: Vec2, offset = 0.86): Vec2 {
  return add(o5, scale(normalize(sub(COURT.hoop, o5)), offset));
}

function rejectHelpPoint(o1: Vec2, offset = 1.02): Vec2 {
  return add(o1, scale(normalize(sub(COURT.hoop, o1)), offset));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, places = 3): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function movePointToward(from: Vec2, target: Vec2, maxDistance: number): Vec2 {
  const delta = sub(target, from);
  const magnitude = length(delta);
  if (magnitude <= maxDistance || magnitude < 1e-9) return { ...target };
  return add(from, scale(delta, maxDistance / magnitude));
}

function desiredVelocity(player: PlayerState, intent: MotionIntent): Vec2 {
  const delta = sub(intent.target, player.pos);
  const remaining = length(delta);
  if (remaining <= intent.arriveRadius) return v();
  const arrivalSpeed = Math.min(intent.maxSpeed, Math.max(0.55, remaining * 3.2));
  return scale(normalize(delta), arrivalSpeed);
}

function pointSegmentDistance(point: Vec2, a: Vec2, b: Vec2): { distance: number; t: number } {
  const ab = sub(b, a);
  const denominator = dot(ab, ab);
  if (denominator < 1e-9) return { distance: distance(point, a), t: 0 };
  const t = clamp(dot(sub(point, a), ab) / denominator, 0, 1);
  const closest = add(a, scale(ab, t));
  return { distance: distance(point, closest), t };
}

function bodyAwareRoute(
  start: Vec2,
  target: Vec2,
  blocker: PlayerState,
  moverRadius: number,
): { length: number; legal: boolean; needsDetour: boolean } {
  const straightLength = distance(start, target);
  const clearanceRadius = blocker.radius + moverRadius;
  const crossing = pointSegmentDistance(blocker.pos, start, target);
  const needsDetour =
    crossing.t > 1e-6 &&
    crossing.t < 1 - 1e-6 &&
    crossing.distance < clearanceRadius;
  if (!needsDetour) {
    return { length: straightLength, legal: true, needsDetour: false };
  }

  const startRadius = distance(start, blocker.pos);
  const targetRadius = distance(target, blocker.pos);
  const clearanceFitsCourt =
    blocker.pos.x - clearanceRadius >= 0 &&
    blocker.pos.x + clearanceRadius <= COURT.width &&
    blocker.pos.y - clearanceRadius >= 0 &&
    blocker.pos.y + clearanceRadius <= COURT.height;
  if (
    !clearanceFitsCourt ||
    startRadius <= clearanceRadius + 1e-6 ||
    targetRadius <= clearanceRadius + 1e-6
  ) {
    return { length: straightLength, legal: false, needsDetour: true };
  }

  const centerAngle = Math.acos(
    clamp(
      dot(
        normalize(sub(start, blocker.pos)),
        normalize(sub(target, blocker.pos)),
      ),
      -1,
      1,
    ),
  );
  const tangentFromStart = Math.acos(clamp(clearanceRadius / startRadius, -1, 1));
  const tangentFromTarget = Math.acos(clamp(clearanceRadius / targetRadius, -1, 1));
  const arcAngle = Math.max(0, centerAngle - tangentFromStart - tangentFromTarget);
  const detourLength =
    Math.sqrt(Math.max(0, startRadius ** 2 - clearanceRadius ** 2)) +
    Math.sqrt(Math.max(0, targetRadius ** 2 - clearanceRadius ** 2)) +
    clearanceRadius * arcAngle;
  return { length: detourLength, legal: true, needsDetour: true };
}

export function screenGeometry(input: GeometryInput): {
  contact: boolean;
  routeExposure: boolean;
  corridorDistance: number;
} {
  const bodyDistance = distance(input.d1.pos, input.o5.pos);
  const contact = bodyDistance <= input.d1.radius + input.o5.radius + 0.025;
  const speed = length(input.desiredD1Velocity);
  if (!input.screenLegalPose || speed < 0.35) {
    return { contact, routeExposure: false, corridorDistance: bodyDistance };
  }

  const lookAhead = clamp(speed * 0.48, 0.82, 1.55);
  const corridorEnd = add(input.d1.pos, scale(normalize(input.desiredD1Velocity), lookAhead));
  const corridor = pointSegmentDistance(input.o5.pos, input.d1.pos, corridorEnd);
  const corridorWidth = input.d1.radius + input.o5.radius + 0.2;
  const routeExposure = corridor.t > 0.06 && corridor.t < 0.98 && corridor.distance <= corridorWidth;
  return { contact, routeExposure, corridorDistance: corridor.distance };
}

export function evaluateScreenFacts(input: ScreenEvaluationInput): ScreenFacts {
  const geometry = screenGeometry(input);
  const causalGate = geometry.contact || geometry.routeExposure;
  const attributedScreenCause = input.pnrLinked && causalGate;
  const accumulatedDelay = attributedScreenCause
    ? clamp(input.priorDelay + Math.max(0, input.progressLoss), 0, 1.5)
    : Math.max(0, input.priorDelay - 0.018);
  const impeded =
    attributedScreenCause && (input.progressLoss > 0.006 || accumulatedDelay > 0.035);
  const newlyEffective =
    Boolean(input.ballHandlerClearedScreen) &&
    input.pnrLinked &&
    attributedScreenCause &&
    impeded &&
    accumulatedDelay >= 0.055 &&
    input.ballHandlerSeparation >= 0.9;

  return {
    contact: geometry.contact,
    routeExposure: geometry.routeExposure,
    impeded,
    screenEffective: Boolean(input.previouslyEffective || newlyEffective),
    screenLegalPose: input.screenLegalPose,
    pnrLinked: input.pnrLinked,
    ballHandlerClearedScreen: Boolean(input.ballHandlerClearedScreen),
    matchupExchange: Boolean(input.matchupExchange),
    progressLoss: attributedScreenCause ? Math.max(0, input.progressLoss) : 0,
    accumulatedDelay,
  };
}

function makePlayer(
  id: PlayerId,
  team: Team,
  x: number,
  y: number,
  maxSpeed: number,
): PlayerState {
  return {
    id,
    team,
    pos: v(x, y),
    vel: v(),
    radius: id === "O5" || id === "D5" ? 0.37 : 0.34,
    maxSpeed,
  };
}

function initialWorld(config: SimulationConfig): WorldState {
  const d1Start =
    config.cue === "overplay_right"
      ? v(5.24, 5.86)
      : config.cue === "overplay_hard_right"
        ? v(5.8, 5.72)
        : config.cue === "under_gap"
          ? v(4.5, 5)
          : v(4.2, 5.76);
  return {
    tick: 0,
    time: 0,
    players: {
      O1: makePlayer("O1", "offense", INITIAL_O1.x, INITIAL_O1.y, config.o1MaxSpeed),
      O5: makePlayer("O5", "offense", 6.62, 5.32, 2.92),
      D1: makePlayer("D1", "defense", d1Start.x, d1Start.y, 3.64),
      D5: makePlayer("D5", "defense", 6.25, 4.26, 3.22),
    },
    ballOwner: "O1",
    ball: {
      pos: { ...INITIAL_O1 },
      vel: v(),
      radius: 0.12,
      inFlight: false,
      from: null,
      intendedReceiver: null,
      target: null,
      launchedAt: null,
      kind: null,
      outcome: "live",
    },
    branch: "undecided",
    facts: { ...EMPTY_FACTS },
    mismatch: { ...EMPTY_MISMATCH },
    seal: { ...EMPTY_SEAL, frontReactionDelay: config.d1FrontReactionDelay },
    postCatch: {
      ...EMPTY_POST_CATCH,
      d1RecoveryDelay: config.d1PostCatchRecoveryDelay,
      d1RecoveryReadyIn: config.d1PostCatchRecoveryDelay,
    },
    under: { ...EMPTY_UNDER },
    reject: { ...EMPTY_REJECT },
    terminal: null,
    pendingPlannerEvents: [],
    stateHash: "00000000",
    lastStepMaxDisplacement: 0,
  };
}

export function createPlannerObservation(
  world: WorldState,
  team: Team,
  triggerEvents: WorldEvent[] = [],
): PublicObservation {
  const players = {} as PublicObservation["players"];
  for (const id of PLAYER_IDS) {
    const player = world.players[id];
    players[id] = {
      pos: { ...player.pos },
      vel: { ...player.vel },
      radius: player.radius,
      maxSpeed: player.maxSpeed,
    };
  }

  const observation: PublicObservation = {
    tick: world.tick,
    time: world.time,
    team,
    ownPlayerIds: [...(team === "offense" ? OFFENSE_IDS : DEFENSE_IDS)],
    opponentPlayerIds: [...(team === "offense" ? DEFENSE_IDS : OFFENSE_IDS)],
    players,
    ballOwner: world.ballOwner,
    ball: {
      pos: { ...world.ball.pos },
      vel: { ...world.ball.vel },
      inFlight: world.ball.inFlight,
      kind: world.ball.kind,
    },
    branch: world.branch,
    facts: { ...world.facts },
    mismatch: { ...world.mismatch },
    seal: { ...world.seal },
    postCatch: { ...world.postCatch },
    under: { ...world.under },
    reject: { ...world.reject },
    court: COURT,
    triggerEvents: triggerEvents.map((event) => ({ ...event })),
  };

  return Object.freeze(observation);
}

function offenseRollout(
  candidate: OffensePlanId,
  observation: PublicObservation,
): { score: number; evidence: string[] } {
  if (candidate === "POST_FINISH" || candidate === "KICK_OUT") {
    const step = 1 / 30;
    const horizonSteps = 24;
    let o5 = { ...observation.players.O5.pos };
    let o1 = { ...observation.players.O1.pos };
    let d1 = { ...observation.players.D1.pos };
    let d5 = { ...observation.players.D5.pos };
    const initialRimDistance = distance(o5, COURT.hoop);
    const finishTarget = v(5.12, 1.58);
    const relocateTarget = candidate === "KICK_OUT" ? v(8.58, 2.78) : v(8.18, 4.3);
    const helpCommitted = observation.postCatch.d5HelpCommitted;

    for (let i = 0; i < horizonSteps; i += 1) {
      o5 = movePointToward(
        o5,
        candidate === "POST_FINISH" ? finishTarget : o5,
        observation.players.O5.maxSpeed * 0.94 * step,
      );
      o1 = movePointToward(o1, relocateTarget, observation.players.O1.maxSpeed * 0.76 * step);
      const rearPoint = add(o5, scale(normalize(sub(o5, COURT.hoop)), 0.73));
      const recoveryReady = i * step >= observation.postCatch.d1RecoveryReadyIn;
      d1 = movePointToward(
        d1,
        rearPoint,
        observation.players.D1.maxSpeed * (recoveryReady ? 0.92 : 0.2) * step,
      );
      const d5Target =
        helpCommitted && candidate === "POST_FINISH"
          ? lowSideDigPoint(o5, o1)
          : add(o1, scale(normalize(sub(COURT.hoop, o1)), 0.72));
      d5 = movePointToward(
        d5,
        d5Target,
        observation.players.D5.maxSpeed * (helpCommitted && candidate === "KICK_OUT" ? 0.74 : 0.9) * step,
      );
    }

    const rimProgress = initialRimDistance - distance(o5, COURT.hoop);
    const d1GoalSideLeverage = distance(d1, COURT.hoop) - distance(o5, COURT.hoop);
    const o1D5Separation = distance(o1, d5);
    const o1Spacing = distance(o1, o5);
    const d5O5Distance = distance(d5, o5);
    const score =
      candidate === "POST_FINISH"
        ? rimProgress * 1.38 +
          Math.max(-0.4, d1GoalSideLeverage) * 1.08 +
          o1Spacing * 0.22 +
          0.84 -
          (helpCommitted ? clamp(2.05 - d5O5Distance, 0, 1.45) * 2.6 + 2.1 : 0)
        : o1D5Separation * 1.04 +
          o1Spacing * 0.16 +
          (observation.postCatch.d5AttachedToO1 ? -0.72 : 0.48) +
          (helpCommitted ? 2.7 : 0);
    return {
      score: round(score),
      evidence: [
        "24 步 / 0.8 秒接球后短推演",
        `预计 O5 入筐推进 ${round(rimProgress, 2)}m`,
        `预计 O5 对 D1 篮筐侧优势 ${round(d1GoalSideLeverage, 2)}m`,
        `预计 O1 / D5 分离 ${round(o1D5Separation, 2)}m`,
        `预计 O1–O5 拉开 ${round(o1Spacing, 2)}m`,
        helpCommitted
          ? `D5 已公开进入局部协防，预计距 O5 ${round(d5O5Distance, 2)}m`
          : "D5 尚未公开离开 O1",
      ],
    };
  }

  if (candidate === "REJECT_SLIP_PASS") {
    const step = 1 / 30;
    const horizonSteps = 21;
    let passer = { ...observation.players.O1.pos };
    let roller = { ...observation.players.O5.pos };
    let d1 = { ...observation.players.D1.pos };
    let d5 = { ...observation.players.D5.pos };
    const slipTarget = v(4.9, 1.75);
    const passStation = v(3.78, 3.45);
    const initialRimDistance = distance(roller, COURT.hoop);

    for (let i = 0; i < horizonSteps; i += 1) {
      passer = movePointToward(passer, passStation, observation.players.O1.maxSpeed * 0.42 * step);
      roller = movePointToward(roller, slipTarget, observation.players.O5.maxSpeed * 0.96 * step);
      d1 = movePointToward(d1, passer, observation.players.D1.maxSpeed * 0.92 * step);
      const helpPoint = add(passer, scale(normalize(sub(COURT.hoop, passer)), 0.78));
      d5 = movePointToward(d5, helpPoint, observation.players.D5.maxSpeed * 0.9 * step);
    }

    const rollerProgress = initialRimDistance - distance(roller, COURT.hoop);
    const d5O5Distance = distance(d5, roller);
    const d1Lane = pointSegmentDistance(d1, passer, roller);
    const d5Lane = pointSegmentDistance(d5, passer, roller);
    const laneClearance = Math.min(
      d1Lane.t > 0.06 && d1Lane.t < 0.95
        ? d1Lane.distance - observation.players.D1.radius - 0.12
        : 1.3,
      d5Lane.t > 0.06 && d5Lane.t < 0.95
        ? d5Lane.distance - observation.players.D5.radius - 0.12
        : 1.3,
    );
    const score =
      rollerProgress * 1.18 +
      clamp(laneClearance, -0.45, 1.2) * 0.82 +
      clamp(d5O5Distance - 0.7, -0.4, 1.7) * 0.58 +
      (observation.reject.d5HelpCommitted ? 2.72 : 0);
    return {
      score: round(score),
      evidence: [
        "21 步 / 0.7 秒拒绝后顺下短推演",
        `预计 O5 入筐推进 ${round(rollerProgress, 2)}m`,
        `预计传球走廊净空 ${round(laneClearance, 2)}m`,
        `预计 D5–O5 距离 ${round(d5O5Distance, 2)}m`,
        observation.reject.d5HelpCommitted
          ? "D5 已公开离开 O5 并进入拒绝侧协防"
          : "D5 尚未公开协防，不得预判顺下空位",
      ],
    };
  }

  if (candidate === "FEED_SEAL") {
    const step = 1 / 30;
    const horizonSteps = 27;
    let passer = { ...observation.players.O1.pos };
    let roller = { ...observation.players.O5.pos };
    let small = { ...observation.players.D1.pos };
    const sealTarget = v(5.45, 3.55);
    const passStation = v(7.35, 4.75);
    const initialRollerRimDistance = distance(roller, COURT.hoop);

    for (let i = 0; i < horizonSteps; i += 1) {
      passer = movePointToward(passer, passStation, observation.players.O1.maxSpeed * 0.7 * step);
      roller = movePointToward(roller, sealTarget, observation.players.O5.maxSpeed * 0.98 * step);
      const playBehindPoint = add(
        roller,
        scale(normalize(sub(roller, COURT.hoop)), 0.72),
      );
      small = movePointToward(small, playBehindPoint, observation.players.D1.maxSpeed * 0.94 * step);
    }

    const rollerProgress = initialRollerRimDistance - distance(roller, COURT.hoop);
    const currentDepth = clamp(5.2 - initialRollerRimDistance, 0, 2.5);
    const sealLeverage = distance(small, COURT.hoop) - distance(roller, COURT.hoop);
    const d1Lane = pointSegmentDistance(small, passer, roller);
    const d1Clearance =
      d1Lane.t > 0.08 && d1Lane.t < 0.94
        ? d1Lane.distance - observation.players.D1.radius - 0.12
        : 1.2;
    const laneClearance = d1Clearance;
    const score =
      rollerProgress * 1.18 +
      currentDepth * 0.92 +
      Math.max(-0.5, sealLeverage) * 1.48 +
      clamp(laneClearance, -0.5, 1.2) * 0.72 +
      (observation.seal.established ? 0.85 : 0) +
      1.56;

    return {
      score: round(score),
      evidence: [
        "27 步 / 0.9 秒卡位与传球短推演",
        "预计 O5 入筐推进 " + round(rollerProgress, 2) + "m",
        "O5 当前低位深度收益 " + round(currentDepth, 2),
        "预计 O5 对 D1 篮筐侧优势 " + round(sealLeverage, 2) + "m",
        "预计传球走廊净空 " + round(laneClearance, 2) + "m",
      ],
    };
  }

  if (candidate === "ATTACK_BIG" || candidate === "RESET_MISMATCH") {
    const step = 1 / 30;
    const horizonSteps = 27;
    let ball = { ...observation.players.O1.pos };
    let defender = { ...observation.players.D5.pos };
    const initialRimDistance = distance(ball, COURT.hoop);
    const attackTarget =
      observation.players.D5.pos.x >= observation.players.O1.pos.x
        ? v(5.12, 2.55)
        : v(6.58, 2.55);
    const target = candidate === "ATTACK_BIG" ? attackTarget : v(6.82, 5.72);

    for (let i = 0; i < horizonSteps; i += 1) {
      const ballSpeed =
        candidate === "ATTACK_BIG"
          ? observation.players.O1.maxSpeed * 0.98
          : observation.players.O1.maxSpeed * 0.72;
      ball = movePointToward(ball, target, ballSpeed * step);
      const containPoint =
        candidate === "ATTACK_BIG"
          ? add(ball, scale(normalize(sub(COURT.hoop, ball)), 0.72))
          : ball;
      defender = movePointToward(
        defender,
        containPoint,
        observation.players.D5.maxSpeed * 0.96 * step,
      );
    }

    const rimProgress = initialRimDistance - distance(ball, COURT.hoop);
    const separation = distance(ball, defender);
    const speedEdge = observation.players.O1.maxSpeed - observation.players.D5.maxSpeed;
    const score =
      candidate === "ATTACK_BIG"
        ? rimProgress * 1.08 + separation * 0.62 + speedEdge * 1.35 + 0.52
        : 1.18 + separation * 0.4 - Math.max(0, rimProgress) * 0.18;
    return {
      score: round(score),
      evidence: [
        "27 步 / 0.9 秒换防后短推演",
        "O1 对 D5 公开速度差 " + round(speedEdge, 2) + "m/s",
        "预计入筐推进 " + round(rimProgress, 2) + "m",
        "预计 O1 / D5 分离 " + round(separation, 2) + "m",
      ],
    };
  }

  const step = 1 / 30;
  const horizonSteps = 24;
  let ball = { ...observation.players.O1.pos };
  let screener = { ...observation.players.O5.pos };
  let defender = { ...observation.players.D1.pos };
  const initialRimDistance = distance(ball, COURT.hoop);
  const firstTarget = candidate === "USE_RIGHT_SCREEN" ? COURT.useGate : COURT.rejectGate;
  let exposedSteps = 0;

  for (let i = 0; i < horizonSteps; i += 1) {
    ball = movePointToward(ball, firstTarget, 3.45 * step);
    screener = movePointToward(screener, COURT.screenSpot, 2.75 * step);
    let defenderStep = scale(normalize(sub(ball, defender)), 3.48 * step);
    const screenReady = distance(screener, COURT.screenSpot) < 0.18;
    const route = pointSegmentDistance(screener, defender, add(defender, scale(normalize(defenderStep), 1.1)));
    if (
      candidate === "USE_RIGHT_SCREEN" &&
      screenReady &&
      route.t > 0.05 &&
      route.distance < 0.86
    ) {
      exposedSteps += 1;
      const tangent = normalize(v(-defenderStep.y, defenderStep.x));
      defenderStep = add(scale(defenderStep, 0.61), scale(tangent, 0.025));
    }
    defender = add(defender, defenderStep);
  }

  const rimProgress = initialRimDistance - distance(ball, COURT.hoop);
  const separation = distance(ball, defender);
  const d1RelativeX = observation.players.D1.pos.x - observation.players.O1.pos.x;
  const visibleSideLeverage = candidate === "USE_RIGHT_SCREEN" ? -d1RelativeX : d1RelativeX;
  const screenUtility = exposedSteps / horizonSteps;
  const underGap =
    candidate === "USE_RIGHT_SCREEN" &&
    observation.players.D1.pos.y <= observation.players.O5.pos.y - 0.1
      ? clamp((observation.players.O5.pos.y - observation.players.D1.pos.y) * 1.8, 0, 1.2)
      : 0;
  const continuity = observation.branch === "undecided"
    ? 0
    : observation.branch === "use" && candidate === "USE_RIGHT_SCREEN"
      ? 0.7
      : observation.branch === "reject" && candidate === "REJECT_LEFT"
        ? 0.7
        : -1.2;
  const score =
    rimProgress * 1.08 +
    separation * 0.82 +
    visibleSideLeverage * 1.42 +
    screenUtility * 1.15 +
    underGap * 1.65 +
    continuity;

  return {
    score: round(score),
    evidence: [
      "24 步 / 0.8 秒确定性短推演",
      "入筐方向推进 " + round(rimProgress, 2) + "m",
      "预计持球分离 " + round(separation, 2) + "m",
      "D1 公开站位侧差 " + round(d1RelativeX, 2) + "m",
      ...(underGap > 0 ? [`D1 下方深度收益 ${round(underGap, 2)}`] : []),
    ],
  };
}

function evaluateOffenseCandidates(
  observation: PublicObservation,
  currentPlan: TeamPlan | null,
): CandidateEvaluation[] {
  const screenOnRight = COURT.screenSpot.x > observation.players.O1.pos.x;
  const o1OwnsBall = observation.ballOwner === "O1";
  const o5OwnsBall = observation.ballOwner === "O5";
  const candidates: OffensePlanId[] = [
    "USE_RIGHT_SCREEN",
    "REJECT_LEFT",
    "ATTACK_BIG",
    "FEED_SEAL",
    "RESET_MISMATCH",
    "POST_FINISH",
    "KICK_OUT",
    "REJECT_SLIP_PASS",
  ];

  return candidates.map((id) => {
    const vetoes: string[] = [];
    const postCatchCandidate = id === "POST_FINISH" || id === "KICK_OUT";
    const postSwitchCandidate =
      id === "ATTACK_BIG" || id === "FEED_SEAL" || id === "RESET_MISMATCH";
    const o1BallCandidate = !postCatchCandidate;
    if (o1BallCandidate && !o1OwnsBall) vetoes.push("O1 已不持球，原挡拆计划必须结束");
    if (postCatchCandidate && !o5OwnsBall) vetoes.push("O5 尚未合法接球，禁止提前进入接球后处理");
    if (o5OwnsBall && !postCatchCandidate) vetoes.push("O5 已建立球权，只能进入接球后队级方案");
    if (observation.facts.matchupExchange && !postSwitchCandidate && !postCatchCandidate) {
      vetoes.push("换防已经完成，第一段挡拆计划必须终止");
    }
    if (!observation.facts.matchupExchange && (postSwitchCandidate || postCatchCandidate)) {
      vetoes.push("尚未完成 D1/D5 对位交换，禁止提前攻击错位");
    }
    if (id === "USE_RIGHT_SCREEN" && !screenOnRight && observation.branch === "undecided") {
      vetoes.push("O5 不在 O1 的右侧掩护半区");
    }
    if (observation.branch === "use" && id === "REJECT_LEFT") vetoes.push("已过右侧肩位，分支锁定，禁止瞬时反向");
    if (observation.branch === "reject" && id === "USE_RIGHT_SCREEN") vetoes.push("已公开拒绝掩护，禁止远程回吸到掩护侧");
    if (id === "FEED_SEAL" && observation.mismatch.attackCommitted) {
      vetoes.push("O1 已公开启动攻筐，禁止无事件突然改喂内线");
    }
    if (id === "FEED_SEAL" && observation.seal.d1Fronting) {
      vetoes.push("D1 已公开站上传球侧，当前直传走廊被否决");
    }
    if (id === "KICK_OUT" && !observation.postCatch.d5HelpCommitted) {
      vetoes.push("D5 尚未真实进入局部协防位置，禁止预判其隐藏方案");
    }
    if (id === "REJECT_SLIP_PASS" && observation.branch !== "reject") {
      vetoes.push("O1 尚未公开拒绝掩护，禁止提前进入顺下分球");
    }
    if (id === "REJECT_SLIP_PASS" && !observation.reject.d5HelpCommitted) {
      vetoes.push("D5 尚未真实离开 O5 协防拒绝侧，禁止预判顺下空位");
    }

    const rollout = offenseRollout(id, observation);
    const hysteresis = currentPlan?.id === id ? 0.34 : currentPlan ? -0.18 : 0;
    const score = vetoes.length === 0 ? round(rollout.score + hysteresis) : null;
    return {
      id,
      label:
        id === "USE_RIGHT_SCREEN"
          ? "使用右侧掩护"
          : id === "REJECT_LEFT"
            ? "拒绝并攻左缝"
            : id === "ATTACK_BIG"
              ? "攻击换防大个"
              : id === "FEED_SEAL"
                ? "喂 O5 卡位"
                : id === "RESET_MISMATCH"
                  ? "拉出重置回合"
                  : id === "POST_FINISH"
                    ? "O5 转身攻筐"
                    : id === "KICK_OUT"
                      ? "O5 分回 O1"
                      : "拒绝后分给 O5 顺下",
      feasible: vetoes.length === 0,
      score,
      vetoes,
      evidence: [
        ...rollout.evidence,
        currentPlan?.id === id ? "保留当前计划：滞回 +0.34" : "候选切换成本已计入",
      ],
    };
  });
}

function defenseRollout(
  candidate: DefensePlanId,
  observation: PublicObservation,
): { score: number; evidence: string[] } {
  const step = 1 / 30;
  const horizonSteps = 18;
  if (candidate === "STAY_HOME_POST" || candidate === "DIG_POST") {
    let o5 = { ...observation.players.O5.pos };
    let o1 = { ...observation.players.O1.pos };
    let d1 = { ...observation.players.D1.pos };
    let d5 = { ...observation.players.D5.pos };
    const finishTarget = v(5.12, 1.58);
    const relocateTarget = v(8.18, 4.3);
    const recoveryRisk = clamp(
      observation.postCatch.d1RecoveryReadyIn / 0.32 +
        Math.max(0, observation.postCatch.d1BodyGap - 0.18) * 0.8,
      0,
      1.4,
    );

    for (let i = 0; i < horizonSteps; i += 1) {
      o5 = movePointToward(o5, finishTarget, observation.players.O5.maxSpeed * 0.92 * step);
      o1 = movePointToward(o1, relocateTarget, observation.players.O1.maxSpeed * 0.72 * step);
      const rearPoint = add(o5, scale(normalize(sub(o5, COURT.hoop)), 0.73));
      const recoveryReady = i * step >= observation.postCatch.d1RecoveryReadyIn;
      d1 = movePointToward(
        d1,
        rearPoint,
        observation.players.D1.maxSpeed * (recoveryReady ? 0.92 : 0.2) * step,
      );
      const d5Target =
        candidate === "DIG_POST"
          ? lowSideDigPoint(o5, o1)
          : add(o1, scale(normalize(sub(COURT.hoop, o1)), 0.72));
      d5 = movePointToward(d5, d5Target, observation.players.D5.maxSpeed * 0.92 * step);
    }

    const rearBodyGap =
      distance(o5, d1) - observation.players.O5.radius - observation.players.D1.radius;
    const d5O1Distance = distance(d5, o1);
    const d5O5Distance = distance(d5, o5);
    const d1Behind = distance(d1, COURT.hoop) > distance(o5, COURT.hoop);
    const score =
      candidate === "STAY_HOME_POST"
        ? (d1Behind ? 1.12 : -0.8) +
          clamp(0.95 - rearBodyGap, -0.5, 1.1) * 0.84 +
          clamp(1.05 - d5O1Distance, -0.6, 0.9) * 1.08 +
          0.72 -
          recoveryRisk * 3.1
        : clamp(2.1 - d5O5Distance, -0.6, 1.5) * 0.82 +
          clamp(d5O1Distance - 0.7, -0.5, 1.5) * -0.92 +
          (d1Behind ? -0.22 : 0.82) +
          recoveryRisk * 3.6;
    return {
      score: round(score),
      evidence: [
        "18 步 / 0.6 秒接球后防守短推演",
        `预计 D1 身后身体间距 ${round(rearBodyGap, 2)}m`,
        `预计 D5–O1 距离 ${round(d5O1Distance, 2)}m`,
        `预计 D5–O5 协防距离 ${round(d5O5Distance, 2)}m`,
        `D1 身后恢复还需 ${round(observation.postCatch.d1RecoveryReadyIn, 2)}s`,
        d1Behind ? "D1 仍在 O5 身后可持续干扰" : "D1 已失去身后干扰位置",
      ],
    };
  }

  let ball = { ...observation.players.O1.pos };
  let screener = { ...observation.players.O5.pos };
  let d1 = { ...observation.players.D1.pos };
  let d5 = { ...observation.players.D5.pos };
  const publicBallVelocity = observation.players.O1.vel;
  const isReject = observation.branch === "reject" || publicBallVelocity.x < -0.55;
  const cleared = observation.facts.ballHandlerClearedScreen;
  const postSwitch = observation.facts.matchupExchange;
  const visibleSealCut =
    postSwitch &&
    (observation.seal.established ||
      dot(
        observation.players.O5.vel,
        normalize(sub(COURT.hoop, observation.players.O5.pos)),
      ) > 0.45);
  const underAlignment =
    observation.under.active ||
    (observation.players.D1.pos.y <= observation.players.O5.pos.y - 0.14 &&
      distance(observation.players.D1.pos, underScreenPoint(observation.players.O5.pos)) <= 2.25);
  const inferredBallTarget = postSwitch
    ? observation.players.D5.pos.x >= observation.players.O1.pos.x
      ? v(5.12, 2.55)
      : v(6.58, 2.55)
    : isReject
      ? COURT.rejectGate
      : COURT.useGate;

  for (let i = 0; i < horizonSteps; i += 1) {
    ball = movePointToward(ball, inferredBallTarget, 3.35 * step);
    const clearTarget =
      inferredBallTarget.x < 5.5 ? v(7.15, 2.35) : v(3.05, 2.35);
    screener = movePointToward(
      screener,
      postSwitch && visibleSealCut ? v(5.45, 3.55) : postSwitch ? clearTarget : COURT.screenSpot,
      2.55 * step,
    );
    const postSwitchDefense =
      candidate === "CONTAIN_MISMATCH" ||
      candidate === "FRONT_SEAL" ||
      candidate === "BACKSIDE_CONTEST" ||
      candidate === "PRESSURE_MISMATCH";
    const d1Target =
      candidate === "UNDER"
        ? cleared
          ? ball
          : underScreenPoint(screener)
        : candidate === "TAG_REJECT"
          ? ball
      : candidate === "FRONT_SEAL"
        ? add(screener, scale(normalize(sub(ball, screener)), 0.72))
        : candidate === "BACKSIDE_CONTEST"
          ? add(screener, scale(normalize(sub(screener, COURT.hoop)), 0.72))
        : candidate === "SWITCH" || postSwitchDefense
          ? screener
          : ball;
    const d5Target =
      candidate === "UNDER"
        ? underScreenPoint(screener, 0.42)
        : candidate === "TAG_REJECT"
          ? v(4.25, 3.35)
      : candidate === "SWITCH" || candidate === "PRESSURE_MISMATCH"
        ? ball
        : candidate === "CONTAIN_MISMATCH" ||
            candidate === "FRONT_SEAL" ||
            candidate === "BACKSIDE_CONTEST"
          ? add(ball, scale(normalize(sub(COURT.hoop, ball)), 0.74))
          : candidate === "SWITCH_READY"
            ? { x: screener.x + 0.72, y: screener.y - 0.52 }
            : screener;
    d1 = movePointToward(d1, d1Target, 3.45 * step);
    d5 = movePointToward(d5, d5Target, 3.08 * step);
  }

  const ballContainment = 2.6 - Math.min(distance(ball, d1), distance(ball, d5));
  const rimProtection = 2.5 - distance(d5, COURT.hoop) * 0.25;
  const assignmentFit =
    candidate === "UNDER"
      ? 2.3 - (distance(d1, ball) + distance(d5, screener)) * 0.46
      : candidate === "TAG_REJECT"
        ? 2.05 - (distance(d1, ball) + distance(d5, ball)) * 0.42
    : candidate === "SWITCH" ||
    candidate === "CONTAIN_MISMATCH" ||
    candidate === "FRONT_SEAL" ||
    candidate === "BACKSIDE_CONTEST" ||
    candidate === "PRESSURE_MISMATCH"
      ? 2.2 - (distance(d1, screener) + distance(d5, ball)) * 0.5
      : candidate === "STAY_HOME"
        ? 2.2 - (distance(d1, ball) + distance(d5, screener)) * 0.5
        : 1.7 - distance(d5, { x: screener.x + 0.72, y: screener.y - 0.52 }) * 0.35;
  const speedRisk =
    observation.players.O1.maxSpeed - observation.players.D5.maxSpeed;
  const sealThreat =
    observation.seal.established ||
    (postSwitch &&
      distance(observation.players.O5.pos, COURT.hoop) + 0.12 <
        distance(observation.players.D1.pos, COURT.hoop));
  const tacticFit =
    candidate === "UNDER"
      ? underAlignment && !isReject
        ? 2.36
        : -1.45
      : candidate === "TAG_REJECT"
        ? isReject && observation.reject.d1Beaten
          ? 2.58
          : -1.5
    : candidate === "CONTAIN_MISMATCH"
      ? postSwitch
        ? 1.22 + speedRisk * 0.42
        : -1.2
      : candidate === "PRESSURE_MISMATCH"
        ? postSwitch
          ? 0.56 - speedRisk * 0.48
          : -1.2
        : candidate === "FRONT_SEAL"
          ? observation.seal.established
            ? 2.36
            : sealThreat
              ? 0.72
              : -1.2
        : candidate === "BACKSIDE_CONTEST"
          ? observation.seal.established
            ? observation.seal.frontFeasible
              ? 0.18
              : 2.18
            : sealThreat
              ? 0.52
              : -1.2
        : candidate === "SWITCH_READY"
      ? !isReject && !cleared
        ? 1.08
        : -0.85
      : candidate === "SWITCH"
        ? cleared
          ? 1.38
          : -1.1
        : isReject
          ? 1.42
          : 0.06;
  const score = ballContainment * 0.78 + rimProtection * 0.24 + assignmentFit * 0.52 + tacticFit;

  return {
    score: round(score),
    evidence: [
      "18 步 / 0.6 秒确定性短推演",
      "最近持球对位距离 " + round(Math.min(distance(ball, d1), distance(ball, d5)), 2) + "m",
      ...(candidate === "FRONT_SEAL" || candidate === "BACKSIDE_CONTEST"
        ? [
            `合法绕前 ETA ${round(observation.seal.frontEta, 3)}s / 高吊到达 ${round(observation.seal.entryFlightTime, 3)}s`,
            observation.seal.frontRouteNeedsDetour
              ? `直线受 O5 身体占据，合法绕行路径 ${round(observation.seal.frontRouteLength, 2)}m`
              : `直线路径不穿过 O5，占位距离 ${round(observation.seal.frontRouteLength, 2)}m`,
          ]
        : []),
      isReject
        ? observation.reject.d1Beaten
          ? "D1 已公开落后拒绝路线：允许 D5 局部协防"
          : "公开速度/位置显示拒绝：保持原对位"
        : candidate === "UNDER" || observation.under.active
          ? "D1 已处于掩护下方：保持原对位并由 D5 短收"
        : postSwitch
          ? "换防已落地：D5 守球、D1 留在 O5"
        : cleared
          ? "O1 已公开越肩：进入原子换防窗口"
          : "右侧掩护形成：D5 预占换防出口",
    ],
  };
}

function evaluateDefenseCandidates(
  observation: PublicObservation,
  currentPlan: TeamPlan | null,
): CandidateEvaluation[] {
  const ids: DefensePlanId[] = [
    "SWITCH_READY",
    "SWITCH",
    "STAY_HOME",
    "CONTAIN_MISMATCH",
    "FRONT_SEAL",
    "BACKSIDE_CONTEST",
    "STAY_HOME_POST",
    "DIG_POST",
    "PRESSURE_MISMATCH",
    "UNDER",
    "TAG_REJECT",
  ];
  return ids.map((id) => {
    const vetoes: string[] = [];
    const underAligned =
      observation.under.active ||
      (observation.players.D1.pos.y <= observation.players.O5.pos.y - 0.14 &&
        distance(observation.players.D1.pos, underScreenPoint(observation.players.O5.pos)) <= 2.25);
    const postCatchCandidate = id === "STAY_HOME_POST" || id === "DIG_POST";
    const o5OwnsBall = observation.ballOwner === "O5";
    const postSwitchCandidate =
      id === "CONTAIN_MISMATCH" ||
      id === "FRONT_SEAL" ||
      id === "BACKSIDE_CONTEST" ||
      postCatchCandidate ||
      id === "PRESSURE_MISMATCH";
    if (observation.facts.matchupExchange && !postSwitchCandidate) {
      vetoes.push("换防已完成，必须进入 D5 守球、D1 守 O5 的错位阶段");
    }
    if (!observation.facts.matchupExchange && postSwitchCandidate) {
      vetoes.push("对位交换尚未完成，禁止提前选择错位防守");
    }
    if (o5OwnsBall && !postCatchCandidate) {
      vetoes.push("O5 已建立球权，防守必须进入接球后协防判断");
    }
    if (!o5OwnsBall && postCatchCandidate) {
      vetoes.push("O5 尚未合法接球，禁止提前下沉或声明留守");
    }
    if (id === "SWITCH_READY" && observation.branch === "reject") {
      vetoes.push("O1 已公开拒绝掩护，禁止无事件换防");
    }
    if (id === "SWITCH_READY" && observation.facts.ballHandlerClearedScreen) {
      vetoes.push("O1 已越过 O5 肩位，准备阶段必须结束");
    }
    if (id === "SWITCH_READY" && underAligned) {
      vetoes.push("D1 已公开处于掩护下方，当前没有预占换防出口的几何基础");
    }
    if (id === "SWITCH" && !observation.facts.ballHandlerClearedScreen) {
      vetoes.push("O1 尚未越肩，禁止提前交换对位");
    }
    if (id === "SWITCH" && observation.branch === "reject") {
      vetoes.push("拒绝分支没有换防交接窗口");
    }
    if (id === "SWITCH" && observation.under.active) {
      vetoes.push("D1 已公开走掩护下方且 D5 留守 O5，禁止凭空改成换防");
    }
    if (id === "UNDER" && observation.branch === "reject") {
      vetoes.push("O1 已拒绝掩护，不再存在走掩护下方的路线");
    }
    if (id === "UNDER" && !underAligned && currentPlan?.id !== "UNDER") {
      vetoes.push("D1 尚未处于 O5 与篮筐之间的下方通道");
    }
    if (id === "TAG_REJECT" && observation.branch !== "reject") {
      vetoes.push("拒绝分支尚未公开，D5 不能提前离开 O5");
    }
    if (id === "TAG_REJECT" && !observation.reject.helpEligible) {
      vetoes.push("D1 的公开起手横向落后不足以触发 D5 协防责任");
    }
    if (id === "TAG_REJECT" && !observation.reject.d1Beaten) {
      vetoes.push("D1 尚未真实落后拒绝路线，D5 必须继续留守 O5");
    }
    if (id === "FRONT_SEAL" && observation.seal.established) {
      if (!observation.seal.frontRouteLegal) {
        vetoes.push("D1 无法在不穿过 O5 占据空间的情况下到达传球侧");
      } else if (!observation.seal.frontFeasible) {
        vetoes.push(
          `合法绕前 ETA ${round(observation.seal.frontEta, 3)}s 晚于高吊到达 ${round(observation.seal.entryFlightTime, 3)}s`,
        );
      }
    }
    if (
      id === "BACKSIDE_CONTEST" &&
      observation.seal.established &&
      observation.seal.frontFeasible
    ) {
      vetoes.push("合法绕前窗口仍然充足，不提前退为身后干扰");
    }
    if (
      observation.mismatch.attackCommitted &&
      (id === "FRONT_SEAL" || id === "BACKSIDE_CONTEST")
    ) {
      vetoes.push("O1 已公开攻击 D5，D1 留守 O5 但不再以传球侧赌博替代持球遏制");
    }

    const rollout = defenseRollout(id, observation);
    const hysteresis = currentPlan?.id === id ? 0.28 : currentPlan ? -0.14 : 0;
    return {
      id,
      label:
        id === "UNDER"
          ? "D1 走下方，D5 短收"
          : id === "TAG_REJECT"
            ? "D5 协防拒绝，D1 追球"
        : id === "SWITCH_READY"
          ? "预占出口，等待换防"
          : id === "SWITCH"
            ? "原子换防"
            : id === "STAY_HOME"
              ? "保持原对位"
              : id === "CONTAIN_MISMATCH"
                ? "后撤遏制 O1"
                : id === "FRONT_SEAL"
                  ? "D1 抢传球侧绕前"
                  : id === "BACKSIDE_CONTEST"
                    ? "D1 留在身后干扰"
                    : id === "STAY_HOME_POST"
                      ? "D5 留守 O1"
                      : id === "DIG_POST"
                        ? "D5 下沉协防 O5"
                  : "贴身施压 O1",
      feasible: vetoes.length === 0,
      score: vetoes.length === 0 ? round(rollout.score + hysteresis) : null,
      vetoes,
      evidence: [
        ...rollout.evidence,
        currentPlan?.id === id ? "保持队内承诺：滞回 +0.28" : "切换成本已计入",
      ],
    };
  });
}

function chooseCandidate(candidates: CandidateEvaluation[]): CandidateEvaluation {
  const feasible = candidates.filter((candidate) => candidate.feasible && candidate.score !== null);
  if (feasible.length === 0) throw new Error("No feasible team plan");
  return [...feasible].sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity))[0];
}

function makeOffensePlan(
  chosen: CandidateEvaluation,
  world: WorldState,
  version: number,
): TeamPlan {
  const d5 = world.players.D5;
  const o1 = world.players.O1;
  const attackLeft = d5.pos.x >= o1.pos.x;
  const attackTarget = {
    x: clamp(d5.pos.x + (attackLeft ? -0.82 : 0.82), 3.7, 6.9),
    y: clamp(d5.pos.y - 0.92, 2.55, 4.45),
  };
  const clearTarget = attackTarget.x < 5.5 ? v(7.15, 2.35) : v(3.05, 2.35);
  let roles: Partial<Record<PlayerId, RoleAssignment>>;
  let rationale: string;
  let primaryTarget: Vec2 | undefined;
  let secondaryTarget: Vec2 | undefined;
  let passTarget: PlayerId | undefined;

  if (chosen.id === "ATTACK_BIG") {
    primaryTarget = attackTarget;
    secondaryTarget = clearTarget;
    roles = {
      O1: {
        playerId: "O1",
        roleCode: "attack_big",
        roleLabel: "攻击换防大个",
        intent: "读 D5 公开站位 → 攻击其外侧髋部 → 压向篮筐",
        owner: "offense-planner",
      },
      O5: {
        playerId: "O5",
        roleCode: "clear_lane",
        roleLabel: "清空突破侧",
        intent: "离开中路 → 去 O1 对侧短角 → 带走 D1",
        owner: "offense-planner",
      },
    };
    rationale =
      "换防已经公开落地；短推演显示 O1 对 D5 有速度差，因此攻击 D5 外侧，同时由 O5 清空对侧，避免二次堵住持球人。";
  } else if (chosen.id === "FEED_SEAL") {
    primaryTarget = v(7.35, 4.75);
    secondaryTarget = v(5.45, 3.55);
    passTarget = "O5";
    roles = {
      O1: {
        playerId: "O1",
        roleCode: "feed_seal",
        roleLabel: "卡位喂球者",
        intent: "横移拉出传球角 → 等 O5 压住 D1 → 走廊合法才传",
        owner: "offense-planner",
      },
      O5: {
        playerId: "O5",
        roleCode: "seal_small",
        roleLabel: "错位卡住小个",
        intent: "顺下到右侧低位 → 保持篮筐侧 → 给 O1 明确目标手",
        owner: "offense-planner",
      },
    };
    rationale =
      "换防后 O5 已位于 D1 的篮筐侧；短推演显示内线推进和传球净空优于 O1 直接打 D5，因此先建立卡位再喂球。";
  } else if (chosen.id === "RESET_MISMATCH") {
    primaryTarget = v(6.82, 5.72);
    secondaryTarget = v(4.2, 3.2);
    roles = {
      O1: {
        playerId: "O1",
        roleCode: "reset_mismatch",
        roleLabel: "拉出重置",
        intent: "保留 D5 错位 → 拉回弧顶侧翼 → 等待下一判断",
        owner: "offense-planner",
      },
      O5: {
        playerId: "O5",
        roleCode: "space_weakside",
        roleLabel: "弱侧拉开",
        intent: "退出持球走廊 → 保持 D1 远离 O1",
        owner: "offense-planner",
      },
    };
    rationale = "换防已经完成，但短推演未显示立即突破收益；拉出保留错位并保持队友间距。";
  } else if (chosen.id === "POST_FINISH") {
    primaryTarget = v(5.12, 1.58);
    secondaryTarget = v(8.18, 4.3);
    roles = {
      O1: {
        playerId: "O1",
        roleCode: "relocate_post_space",
        roleLabel: "接球后外移拉开",
        intent: "确认 O5 建立球权 → 向右侧外移 → 拉走 D5 并保留回传角度",
        owner: "offense-planner",
      },
      O5: {
        playerId: "O5",
        roleCode: "turn_finish",
        roleLabel: "转身攻击篮筐",
        intent: "护住接球 → 以 D1 在身后为依据转向篮筐 → 到近筐处理点停止",
        owner: "offense-planner",
      },
    };
    rationale =
      "O5 已合法接球且仍保持 D1 的篮筐侧；D5 公开位置仍贴近 O1，短推演选择 O5 转身推进，由 O1 外移清空。";
  } else if (chosen.id === "KICK_OUT") {
    primaryTarget = { ...world.players.O5.pos };
    secondaryTarget = v(8.58, 2.78);
    passTarget = "O1";
    roles = {
      O1: {
        playerId: "O1",
        roleCode: "relocate_receive",
        roleLabel: "外移准备回传",
        intent: "看到 D5 下沉 → 从原传球线漂向右侧出口 → 给 O5 明确回传窗口",
        owner: "offense-planner",
      },
      O5: {
        playerId: "O5",
        roleCode: "kick_out_post",
        roleLabel: "低位分球者",
        intent: "护住接球 → 读取 D5 下沉 → 走廊开放后分回 O1",
        owner: "offense-planner",
      },
    };
    rationale =
      "D5 已真实离开 O1 并进入 O5 附近的协防位置；公开回传走廊成立后，O5 停稳分回外移的 O1，不读取防守隐藏方案。";
  } else if (chosen.id === "REJECT_SLIP_PASS") {
    primaryTarget = { ...world.players.O1.pos };
    secondaryTarget = v(4.9, 1.75);
    passTarget = "O5";
    roles = {
      O1: {
        playerId: "O1",
        roleCode: "reject_slip_passer",
        roleLabel: "拒绝后顺下分球",
        intent: "确认 D5 已协防 → 收住拒绝突破 → 等 O5 顺下与走廊公开成立后传球",
        owner: "offense-planner",
      },
      O5: {
        playerId: "O5",
        roleCode: "reject_slip_receiver",
        roleLabel: "掩护人顺下接应",
        intent: "拒绝分支后离开掩护点 → 切入中路 → 给 O1 明确接球目标",
        owner: "offense-planner",
      },
    };
    rationale =
      "D1 已被拒绝路线甩在身后，且 D5 的公开移动已离开 O5；进攻只在观察到该协防后改选顺下分球。";
  } else if (chosen.id === "USE_RIGHT_SCREEN") {
    roles = {
      O1: {
        playerId: "O1",
        roleCode: "screen_user",
        roleLabel: "持球使用者",
        intent: "等待掩护站稳 → 沿 O5 外肩弧线通过 → 攻筐",
        owner: "offense-planner",
      },
      O5: {
        playerId: "O5",
        roleCode: "setter_roll",
        roleLabel: "掩护后顺下",
        intent: "右侧定点 → 保持合法掩护 → O1 越肩后顺下",
        owner: "offense-planner",
      },
    };
    rationale = "D1 的公开站位没有封死右侧肩位；短推演中 O5 的合法走廊影响带来更高分离。";
  } else {
    primaryTarget = world.reject.helpEligible ? v(3.92, 3.38) : undefined;
    roles = {
      O1: {
        playerId: "O1",
        roleCode: "reject_driver",
        roleLabel: "拒绝持球手",
        intent: "卖出右侧挡拆 → 攻左缝 → 回中路",
        owner: "offense-planner",
      },
      O5: {
        playerId: "O5",
        roleCode: "hold_then_slip",
        roleLabel: "诱饵掩护人",
        intent: "右侧站稳牵制 → 拒绝公开后顺下",
        owner: "offense-planner",
      },
    };
    rationale = world.reject.helpEligible
      ? "D1 已明显落后拒绝路线；O1 推进到局部协防读取点，等待 D5 是否真实离开 O5，而不是预判顺下结果。"
      : "D1 已公开踩上掩护侧；左侧拒绝在短推演中保留更直的攻筐线，也不会借用远端 O5。";
  }

  const postSwitch =
    chosen.id === "ATTACK_BIG" ||
    chosen.id === "FEED_SEAL" ||
    chosen.id === "RESET_MISMATCH" ||
    chosen.id === "POST_FINISH" ||
    chosen.id === "KICK_OUT" ||
    chosen.id === "REJECT_SLIP_PASS";
  return {
    team: "offense",
    id: chosen.id,
    label: chosen.label,
    version,
    startedAt: world.time,
    startedTick: world.tick,
    commitUntil: world.time + (postSwitch ? 0.52 : 0.64),
    watchdogAt: world.time + (postSwitch ? 1 : 1.18),
    chosenScore: chosen.score ?? 0,
    rationale,
    roles,
    primaryTarget,
    secondaryTarget,
    passTarget,
  };
}

function makeDefensePlan(
  chosen: CandidateEvaluation,
  world: WorldState,
  version: number,
): TeamPlan {
  let roles: Partial<Record<PlayerId, RoleAssignment>>;
  let rationale: string;
  let primaryTarget: Vec2 | undefined;

  if (chosen.id === "UNDER") {
    roles = {
      D1: {
        playerId: "D1",
        roleCode: "navigate_under",
        roleLabel: "走掩护下方再追球",
        intent: "从 O5 篮筐侧绕过 → 不穿过掩护人 → O1 越肩后重新追球",
        owner: "defense-planner",
      },
      D5: {
        playerId: "D5",
        roleCode: "under_hold_roller",
        roleLabel: "短收并留守 O5",
        intent: "站在 O5 与筐之间 → 给 D1 下方通道 → 不接管 O1",
        owner: "defense-planner",
      },
    };
    rationale =
      "D1 的公开起手深度已经位于掩护下方；防守保持原对位，由 D5 短收 O5，接受 O1 的中距离处理窗口。";
  } else if (chosen.id === "TAG_REJECT") {
    primaryTarget = v(4.25, 3.35);
    roles = {
      D1: {
        playerId: "D1",
        roleCode: "chase_reject",
        roleLabel: "身后追拒绝持球人",
        intent: "承认已落后拒绝路线 → 从身后追回 O1 → 不转守 O5",
        owner: "defense-planner",
      },
      D5: {
        playerId: "D5",
        roleCode: "tag_reject_drive",
        roleLabel: "离开 O5 协防拒绝",
        intent: "从 O5 内侧跨出一步 → 阻断 O1 左侧攻筐线 → 保留回位责任",
        owner: "defense-planner",
      },
    };
    rationale =
      "O1 已凭公开路线把 D1 留在身后；D5 必须从 O5 侧做一次局部协防，防守接受顺下接应风险。";
  } else if (chosen.id === "SWITCH_READY") {
    roles = {
          D1: {
            playerId: "D1",
            roleCode: "contain_until_exchange",
            roleLabel: "换防前守球",
            intent: "跟住 O1 → 不穿越 O5 → 越肩事件后交接",
            owner: "defense-planner",
          },
          D5: {
            playerId: "D5",
            roleCode: "switch_ready",
            roleLabel: "预占换防出口",
            intent: "保持 O5 一侧 → 提前占住 O1 出口 → 等公开交接",
            owner: "defense-planner",
          },
        };
    rationale = "公开阵型仍是右侧掩护威胁；D1 不再挤过，D5 先占 O1 的掩护出口。";
  } else if (chosen.id === "STAY_HOME") {
    roles = {
            D1: {
              playerId: "D1",
              roleCode: "stay_ball",
              roleLabel: "保持 O1 对位",
              intent: "拒绝分支不换防 → 继续封持球突破",
              owner: "defense-planner",
            },
            D5: {
              playerId: "D5",
              roleCode: "stay_screener",
              roleLabel: "保持 O5 对位",
              intent: "不追持球人 → 留在 O5 与筐之间",
              owner: "defense-planner",
            },
          };
    rationale = "O1 已公开拒绝掩护；D1 与 D5 保持原对位，不发生远程换防。";
  } else if (chosen.id === "CONTAIN_MISMATCH") {
    roles = {
      D1: {
        playerId: "D1",
        roleCode: "stay_roller",
        roleLabel: "留守 O5",
        intent: "换防后不追球 → 跟随 O5 清空 → 守住二次切入",
        owner: "defense-planner",
      },
      D5: {
        playerId: "D5",
        roleCode: "contain_ball",
        roleLabel: "后撤遏制持球",
        intent: "保持球与筐之间 → 给一步缓冲 → 压缩 O1 突破角度",
        owner: "defense-planner",
      },
    };
    rationale = "D5 已公开接管 O1；面对 O1 的速度优势，后撤保持篮筐侧比贴身赌博更稳，D1 则继续留在 O5。";
  } else if (chosen.id === "FRONT_SEAL") {
    roles = {
      D1: {
        playerId: "D1",
        roleCode: "front_seal",
        roleLabel: "抢传球侧绕前",
        intent: "从 O5 身后转到球侧 → 占住 O1–O5 直传线 → 不换回 O1",
        owner: "defense-planner",
      },
      D5: {
        playerId: "D5",
        roleCode: "contain_passer",
        roleLabel: "遏制传球人",
        intent: "保持 O1 与筐之间 → 不下沉替 D1 选结果 → 干扰传球角",
        owner: "defense-planner",
      },
    };
    rationale =
      "O5 已公开把 D1 压在篮筐外侧；D1 抢到球侧直传线，D5 继续守 O1，避免靠双人追球解决卡位。";
  } else if (chosen.id === "BACKSIDE_CONTEST") {
    roles = {
      D1: {
        playerId: "D1",
        roleCode: "backside_contest",
        roleLabel: "身后干扰接球",
        intent: "承认绕前窗口已失 → 留在 O5 身后保持接触距离 → 接球后再防，不穿越其身体",
        owner: "defense-planner",
      },
      D5: {
        playerId: "D5",
        roleCode: "contain_passer",
        roleLabel: "遏制传球人",
        intent: "继续负责 O1 → 不下沉替 D1 抢结果 → 保持球与筐之间",
        owner: "defense-planner",
      },
    };
    rationale =
      `合法绕前 ETA ${world.seal.frontEta.toFixed(3)}s 晚于高吊到达 ${world.seal.entryFlightTime.toFixed(3)}s；D1 不穿过 O5，退守身后干扰，D5 继续守 O1。`;
  } else if (chosen.id === "STAY_HOME_POST") {
    roles = {
      D1: {
        playerId: "D1",
        roleCode: "rear_contest_post",
        roleLabel: "身后持续干扰",
        intent: "保持在 O5 身后 → 不穿人抢前 → 压缩其转身空间",
        owner: "defense-planner",
      },
      D5: {
        playerId: "D5",
        roleCode: "stay_attached_o1",
        roleLabel: "留守外移 O1",
        intent: "跟随 O1 外移 → 保持内侧站位 → 不无故下沉形成空位回传",
        owner: "defense-planner",
      },
    };
    rationale =
      "O5 接球时 D1 仍保持紧密身后干扰；短推演认为 D5 离开 O1 的代价高于立即下沉收益，因此 D5 留守原责任。";
  } else if (chosen.id === "DIG_POST") {
    roles = {
      D1: {
        playerId: "D1",
        roleCode: "rear_contest_post",
        roleLabel: "身后持续干扰",
        intent: "保持在 O5 身后 → 把持球人推向协防侧",
        owner: "defense-planner",
      },
      D5: {
        playerId: "D5",
        roleCode: "dig_post",
        roleLabel: "下沉协防 O5",
        intent: "离开 O1 一步 → 到 O5 篮筐侧挖球 → 保留回位责任",
        owner: "defense-planner",
      },
    };
    rationale = "候选用于 D1 失位或 O5 直接进入深位时的下沉协防；当前仍需承担放开 O1 的代价。";
  } else if (chosen.id === "PRESSURE_MISMATCH") {
    roles = {
      D1: {
        playerId: "D1",
        roleCode: "stay_roller",
        roleLabel: "留守 O5",
        intent: "换防后不追球 → 跟随 O5 清空 → 守住二次切入",
        owner: "defense-planner",
      },
      D5: {
        playerId: "D5",
        roleCode: "pressure_ball",
        roleLabel: "贴身施压持球",
        intent: "缩短与 O1 距离 → 迫使横向运球 → 承担被过风险",
        owner: "defense-planner",
      },
    };
    rationale = "换防后主动压迫 O1 的公开运球空间；该方案收益更激进，也承担速度错位风险。";
  } else {
    roles = {
            D1: {
              playerId: "D1",
              roleCode: "take_roller",
              roleLabel: "换守顺下",
              intent: "交接 O1 → 接管 O5",
              owner: "defense-planner",
            },
            D5: {
              playerId: "D5",
              roleCode: "take_ball",
              roleLabel: "换守持球",
              intent: "喊换防 → 接管 O1 攻筐线",
              owner: "defense-planner",
            },
          };
    rationale = "O1 已越过 O5 外肩；D1→O5、D5→O1 在同一决策边界一次性交接。";
  }

  const postSwitch =
    chosen.id === "CONTAIN_MISMATCH" ||
    chosen.id === "FRONT_SEAL" ||
    chosen.id === "BACKSIDE_CONTEST" ||
    chosen.id === "STAY_HOME_POST" ||
    chosen.id === "DIG_POST" ||
    chosen.id === "PRESSURE_MISMATCH";

  return {
    team: "defense",
    id: chosen.id,
    label: chosen.label,
    version,
    startedAt: world.time,
    startedTick: world.tick,
    commitUntil:
      world.time +
      (chosen.id === "DIG_POST" ? 1.12 : chosen.id === "TAG_REJECT" ? 0.82 : postSwitch ? 0.52 : 0.56),
    watchdogAt:
      world.time +
      (chosen.id === "DIG_POST" ? 1.28 : chosen.id === "TAG_REJECT" ? 1.04 : postSwitch ? 1 : 1.08),
    roles,
    chosenScore: chosen.score ?? 0,
    rationale,
    primaryTarget,
  };
}

function offensiveIntents(plan: TeamPlan, world: WorldState): Record<"O1" | "O5", MotionIntent> {
  const o1 = world.players.O1;
  if (plan.id === "POST_FINISH" || plan.id === "KICK_OUT") {
    return {
      O1: {
        target: plan.secondaryTarget ?? v(8.18, 4.3),
        maxSpeed: 2.78,
        arriveRadius: 0.1,
      },
      O5: {
        target: plan.primaryTarget ?? (plan.id === "POST_FINISH" ? v(5.12, 1.58) : v(5.48, 3.82)),
        maxSpeed: plan.id === "POST_FINISH" ? 2.72 : 1.4,
        arriveRadius: 0.08,
      },
    };
  }

  if (plan.id === "FEED_SEAL") {
    return {
      O1: {
        target: plan.primaryTarget ?? v(7.35, 4.75),
        maxSpeed: 2.62,
        arriveRadius: 0.09,
      },
      O5: {
        target: plan.secondaryTarget ?? v(5.45, 3.55),
        maxSpeed: 2.9,
        arriveRadius: 0.08,
      },
    };
  }

  if (plan.id === "ATTACK_BIG") {
    const d5 = world.players.D5;
    const hipTarget = plan.primaryTarget ?? v(5.12, 3.15);
    const attackLeft = hipTarget.x < d5.pos.x;
    const hipWon =
      o1.pos.y <= d5.pos.y + 0.54 &&
      (attackLeft ? o1.pos.x <= d5.pos.x - 0.48 : o1.pos.x >= d5.pos.x + 0.48);
    return {
      O1: {
        target: hipWon ? v(5, 1.38) : hipTarget,
        maxSpeed: o1.maxSpeed,
        arriveRadius: 0.07,
      },
      O5: {
        target: plan.secondaryTarget ?? v(7.15, 2.35),
        maxSpeed: 2.9,
        arriveRadius: 0.12,
      },
    };
  }

  if (plan.id === "REJECT_SLIP_PASS") {
    return {
      O1: {
        target: plan.primaryTarget ?? o1.pos,
        maxSpeed: 0.82,
        arriveRadius: 0.1,
      },
      O5: {
        target: plan.secondaryTarget ?? v(4.9, 1.75),
        maxSpeed: 2.88,
        arriveRadius: 0.1,
      },
    };
  }

  if (plan.id === "RESET_MISMATCH") {
    return {
      O1: {
        target: plan.primaryTarget ?? v(6.82, 5.72),
        maxSpeed: 2.84,
        arriveRadius: 0.1,
      },
      O5: {
        target: plan.secondaryTarget ?? v(4.2, 3.2),
        maxSpeed: 2.66,
        arriveRadius: 0.12,
      },
    };
  }

  if (plan.id === "REJECT_LEFT") {
    const helpReadTarget = plan.primaryTarget;
    const rejectGateReached = o1.pos.y <= COURT.rejectGate.y + 0.18;
    return {
      O1: {
        target: helpReadTarget && world.branch === "reject"
          ? helpReadTarget
          : world.branch === "undecided"
            ? v(3.24, 5.94)
            : !rejectGateReached
              ? COURT.rejectGate
              : v(4.46, 1.08),
        maxSpeed: helpReadTarget && world.branch === "reject"
          ? 2.62
          : world.branch === "undecided"
            ? 3.26
            : !rejectGateReached
              ? 3.48
              : 3.7,
        arriveRadius: 0.08,
      },
      O5: {
        target: world.branch === "reject" ? v(5.55, 3.18) : COURT.screenSpot,
        maxSpeed: world.branch === "reject" ? 2.82 : 2.64,
        arriveRadius: world.branch === "reject" ? 0.12 : 0.06,
      },
    };
  }

  const waitingForScreen =
    world.branch === "undecided" &&
    !world.facts.screenLegalPose &&
    world.time - plan.startedAt < 1.2;
  const o5 = world.players.O5;
  const useGateReached = o1.pos.y <= COURT.useGate.y + 0.18;
  const shoulderRadius = o1.radius + o5.radius + 0.085;
  const relative = sub(o1.pos, o5.pos);
  let shoulderAngle = Math.atan2(relative.y, relative.x);
  if (shoulderAngle < 0) shoulderAngle += Math.PI * 2;
  const shoulderPoint = (degrees: number): Vec2 => {
    const radians = (degrees * Math.PI) / 180;
    return {
      x: o5.pos.x + Math.cos(radians) * shoulderRadius,
      y: o5.pos.y + Math.sin(radians) * shoulderRadius,
    };
  };
  const arcTarget =
    shoulderAngle > (330 * Math.PI) / 180 || shoulderAngle <= (15 * Math.PI) / 180
      ? COURT.useGate
      : shoulderAngle > (105 * Math.PI) / 180
      ? shoulderPoint(90)
      : shoulderAngle > (75 * Math.PI) / 180
        ? shoulderPoint(60)
        : shoulderAngle > (45 * Math.PI) / 180
          ? shoulderPoint(30)
          : shoulderAngle > (15 * Math.PI) / 180
            ? shoulderPoint(0)
            : COURT.useGate;
  return {
    O1: {
      target: waitingForScreen
        ? v(4.62, 5.98)
        : world.facts.ballHandlerClearedScreen
          ? !useGateReached
            ? COURT.useGate
            : v(5.72, 1.05)
          : arcTarget,
      maxSpeed: waitingForScreen ? 2.15 : world.facts.ballHandlerClearedScreen ? 3.66 : 2.92,
      arriveRadius: world.facts.ballHandlerClearedScreen ? 0.07 : 0.045,
    },
    O5: {
      target: world.facts.ballHandlerClearedScreen ? v(5.42, 2.25) : COURT.screenSpot,
      maxSpeed: world.facts.ballHandlerClearedScreen ? 2.92 : 2.62,
      arriveRadius: world.facts.ballHandlerClearedScreen ? 0.12 : 0.055,
    },
  };
}

function offensivePassIntent(plan: TeamPlan, world: WorldState): PassIntent | null {
  if (
    plan.id === "FEED_SEAL" &&
    plan.passTarget === "O5" &&
    world.ballOwner === "O1" &&
    !world.ball.inFlight &&
    world.seal.passWindow &&
    world.seal.passWindowOpenedAtTick !== null &&
    world.tick >= world.seal.passWindowOpenedAtTick + 1
  ) {
    return { from: "O1", to: "O5", kind: "lob_entry" };
  }
  if (
    plan.id === "KICK_OUT" &&
    plan.passTarget === "O1" &&
    world.ballOwner === "O5" &&
    !world.ball.inFlight &&
    world.postCatch.kickoutWindow &&
    world.postCatch.kickoutWindowOpenedAtTick !== null &&
    world.tick >= world.postCatch.kickoutWindowOpenedAtTick + 1
  ) {
    return { from: "O5", to: "O1", kind: "kick_out" };
  }
  if (
    plan.id === "REJECT_SLIP_PASS" &&
    plan.passTarget === "O5" &&
    world.ballOwner === "O1" &&
    !world.ball.inFlight &&
    world.reject.passWindow &&
    world.reject.passWindowOpenedAtTick !== null &&
    world.tick >= world.reject.passWindowOpenedAtTick + 1
  ) {
    return { from: "O1", to: "O5", kind: "slip_pass" };
  }
  return null;
}

function defensiveIntents(plan: TeamPlan, world: WorldState): Record<"D1" | "D5", MotionIntent> {
  const o1 = world.players.O1;
  const o5 = world.players.O5;
  const d5 = world.players.D5;
  const leadO1 = add(o1.pos, scale(o1.vel, 0.13));
  const leadO5 = add(o5.pos, scale(o5.vel, 0.1));

  if (plan.id === "UNDER") {
    const d1Target = world.facts.ballHandlerClearedScreen ? leadO1 : underScreenPoint(o5.pos);
    return {
      D1: {
        target: d1Target,
        maxSpeed: world.facts.ballHandlerClearedScreen ? 3.48 : 3.34,
        arriveRadius: world.facts.ballHandlerClearedScreen ? 0.46 : 0.08,
        screenNavigation: "none",
      },
      D5: {
        target: underScreenPoint(o5.pos, 0.42),
        maxSpeed: 2.96,
        arriveRadius: 0.42,
        screenNavigation: "none",
      },
    };
  }

  if (plan.id === "TAG_REJECT") {
    const aroundO5 = {
      x: clamp(o5.pos.x - 0.58, 0.5, COURT.width - 0.5),
      y: clamp(o5.pos.y + 0.78, 0.5, COURT.height - 0.5),
    };
    const hasClearedO5Shoulder = d5.pos.x <= o5.pos.x - 0.42;
    return {
      D1: { target: leadO1, maxSpeed: 3.5, arriveRadius: 0.46, screenNavigation: "none" },
      D5: {
        target: hasClearedO5Shoulder
          ? plan.primaryTarget ?? rejectHelpPoint(o1.pos)
          : aroundO5,
        maxSpeed: 3.2,
        arriveRadius: 0.09,
        screenNavigation: "none",
      },
    };
  }

  if (plan.id === "STAY_HOME_POST") {
    const behindO5 = add(o5.pos, scale(normalize(sub(o5.pos, COURT.hoop)), 0.73));
    const attachedO1 = add(o1.pos, scale(normalize(sub(COURT.hoop, o1.pos)), 0.72));
    return {
      D1: {
        target: behindO5,
        maxSpeed: world.postCatch.d1RecoveryReadyIn > 0 ? 0.72 : 3.36,
        arriveRadius: 0.08,
        screenNavigation: "none",
      },
      D5: { target: attachedO1, maxSpeed: 3.12, arriveRadius: 0.07, screenNavigation: "none" },
    };
  }

  if (plan.id === "DIG_POST") {
    const behindO5 = add(o5.pos, scale(normalize(sub(o5.pos, COURT.hoop)), 0.73));
    const digPoint = lowSideDigPoint(o5.pos, o1.pos);
    return {
      D1: {
        target: behindO5,
        maxSpeed: world.postCatch.d1RecoveryReadyIn > 0 ? 0.72 : 3.36,
        arriveRadius: 0.08,
        screenNavigation: "none",
      },
      D5: { target: digPoint, maxSpeed: 3.12, arriveRadius: 0.09, screenNavigation: "none" },
    };
  }

  if (plan.id === "FRONT_SEAL") {
    const ballSide = add(o5.pos, scale(normalize(sub(o1.pos, o5.pos)), 0.73));
    const goalSideO1 = add(o1.pos, scale(normalize(sub(COURT.hoop, o1.pos)), 0.74));
    return {
      D1: { target: ballSide, maxSpeed: 3.58, arriveRadius: 0.07, screenNavigation: "none" },
      D5: { target: goalSideO1, maxSpeed: 3.18, arriveRadius: 0.07, screenNavigation: "none" },
    };
  }

  if (plan.id === "BACKSIDE_CONTEST") {
    const behindO5 = add(o5.pos, scale(normalize(sub(o5.pos, COURT.hoop)), 0.73));
    const goalSideO1 = add(o1.pos, scale(normalize(sub(COURT.hoop, o1.pos)), 0.74));
    return {
      D1: { target: behindO5, maxSpeed: 3.36, arriveRadius: 0.08, screenNavigation: "none" },
      D5: { target: goalSideO1, maxSpeed: 3.18, arriveRadius: 0.07, screenNavigation: "none" },
    };
  }

  if (plan.id === "CONTAIN_MISMATCH") {
    const goalSide = add(o1.pos, scale(normalize(sub(COURT.hoop, o1.pos)), 0.74));
    return {
      D1: { target: leadO5, maxSpeed: 3.45, arriveRadius: 0.48, screenNavigation: "none" },
      D5: { target: goalSide, maxSpeed: 3.18, arriveRadius: 0.07, screenNavigation: "none" },
    };
  }

  if (plan.id === "PRESSURE_MISMATCH") {
    return {
      D1: { target: leadO5, maxSpeed: 3.45, arriveRadius: 0.48, screenNavigation: "none" },
      D5: { target: leadO1, maxSpeed: 3.2, arriveRadius: 0.48, screenNavigation: "none" },
    };
  }

  if (plan.id === "SWITCH") {
    return {
      D1: { target: leadO5, maxSpeed: 3.35, arriveRadius: 0.48, screenNavigation: "none" },
      D5: { target: leadO1, maxSpeed: 3.2, arriveRadius: 0.48, screenNavigation: "none" },
    };
  }

  if (plan.id === "STAY_HOME") {
    return {
      D1: { target: leadO1, maxSpeed: 3.52, arriveRadius: 0.46, screenNavigation: "none" },
      D5: { target: leadO5, maxSpeed: 3.05, arriveRadius: 0.5, screenNavigation: "none" },
    };
  }

  const readyPoint = {
    x: clamp(o5.pos.x + 0.72, 0.5, COURT.width - 0.5),
    y: clamp(o5.pos.y - 0.52, 0.5, COURT.height - 0.5),
  };
  return {
    D1: { target: leadO1, maxSpeed: 3.5, arriveRadius: 0.46, screenNavigation: "none" },
    D5: { target: readyPoint, maxSpeed: 3.04, arriveRadius: 0.4, screenNavigation: "none" },
  };
}

function accelerationLimited(current: Vec2, target: Vec2, maxDelta: number): Vec2 {
  const delta = sub(target, current);
  const magnitude = length(delta);
  if (magnitude <= maxDelta) return { ...target };
  return add(current, scale(delta, maxDelta / magnitude));
}

function screenPose(world: WorldState): boolean {
  const o5 = world.players.O5;
  return distance(o5.pos, COURT.screenSpot) <= 0.16 && length(o5.vel) <= 0.42;
}

function makeEvent(
  type: EventType,
  tick: number,
  at: number,
  label: string,
  detail: string,
): WorldEvent {
  return {
    id: type + "@" + tick,
    type,
    tick,
    at,
    order: EVENT_ORDER[type],
    availableAtTick: tick + 1,
    label,
    detail,
  };
}

function stableHash(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function clonePlayer(player: PlayerState): PlayerState {
  return { ...player, pos: { ...player.pos }, vel: { ...player.vel } };
}

export class PnrSimulation {
  readonly config: SimulationConfig;
  world: WorldState;
  offensePlan: TeamPlan;
  defensePlan: TeamPlan;
  readonly planningLog: PlanningRecord[] = [];
  readonly eventLog: WorldEvent[] = [];
  private offenseQueue: WorldEvent[] = [];
  private defenseQueue: WorldEvent[] = [];
  private offenseVersion = 0;
  private defenseVersion = 0;

  constructor(config: Partial<SimulationConfig> = {}) {
    this.config = {
      cue: config.cue ?? "neutral",
      seed: config.seed ?? 17,
      maxTime: config.maxTime ?? 7.4,
      d1FrontReactionDelay: clamp(config.d1FrontReactionDelay ?? 0, 0, 0.5),
      d1PostCatchRecoveryDelay: clamp(config.d1PostCatchRecoveryDelay ?? 0, 0, 0.6),
      o1MaxSpeed: clamp(config.o1MaxSpeed ?? 3.72, 3.4, 4.4),
      horizon: config.horizon ?? "pnr_resolution",
    };
    this.world = initialWorld(this.config);
    this.offensePlan = this.replanOffense("初始边界", []);
    this.defensePlan = this.replanDefense("初始边界", []);
    this.world.stateHash = this.computeStateHash();
  }

  private replanOffense(trigger: string, triggerEvents: WorldEvent[]): TeamPlan {
    const observation = createPlannerObservation(this.world, "offense", triggerEvents);
    const current = this.offenseVersion > 0 ? this.offensePlan : null;
    const candidates = evaluateOffenseCandidates(observation, current);
    const chosen = chooseCandidate(candidates);
    this.offenseVersion += 1;
    const plan = makeOffensePlan(chosen, this.world, this.offenseVersion);
    this.planningLog.push({
      tick: this.world.tick,
      at: this.world.time,
      team: "offense",
      trigger,
      triggerEventIds: triggerEvents.map((event) => event.id),
      chosen: chosen.id,
      chosenLabel: chosen.label,
      candidates,
      observationBoundary: "公开世界事实 + 自队角色；不含防守隐藏计划/未来",
    });
    return plan;
  }

  private replanDefense(trigger: string, triggerEvents: WorldEvent[]): TeamPlan {
    const observation = createPlannerObservation(this.world, "defense", triggerEvents);
    const current = this.defenseVersion > 0 ? this.defensePlan : null;
    const candidates = evaluateDefenseCandidates(observation, current);
    const chosen = chooseCandidate(candidates);
    this.defenseVersion += 1;
    const plan = makeDefensePlan(chosen, this.world, this.defenseVersion);
    this.planningLog.push({
      tick: this.world.tick,
      at: this.world.time,
      team: "defense",
      trigger,
      triggerEventIds: triggerEvents.map((event) => event.id),
      chosen: chosen.id,
      chosenLabel: chosen.label,
      candidates,
      observationBoundary: "公开世界事实 + 自队角色；不含进攻隐藏计划/未来",
    });
    return plan;
  }

  private deliverEvents(): void {
    const ready = this.world.pendingPlannerEvents.filter(
      (event) => event.availableAtTick <= this.world.tick,
    );
    this.world.pendingPlannerEvents = this.world.pendingPlannerEvents.filter(
      (event) => event.availableAtTick > this.world.tick,
    );
    this.offenseQueue.push(...ready);
    this.defenseQueue.push(...ready);
  }

  private maybeReplan(): void {
    if (this.world.terminal || this.world.ball.inFlight) return;
    const eventNames = (events: WorldEvent[]) => events.map((event) => event.label).join(" / ");

    const urgentOffenseBoundary = this.offenseQueue.some(
      (event) =>
        event.type === "switch_completed" ||
        event.type === "seal_fronted" ||
        event.type === "pass_caught" ||
        event.type === "help_committed" ||
        event.type === "kickout_window_open" ||
        event.type === "reject_lane_gained" ||
        event.type === "reject_help_committed" ||
        event.type === "reject_pass_window_open",
    );
    if (
      this.offenseQueue.length > 0 &&
      (urgentOffenseBoundary || this.world.time + 1e-9 >= this.offensePlan.commitUntil)
    ) {
      const events = [...this.offenseQueue];
      this.offenseQueue = [];
      this.offensePlan = this.replanOffense(
        (urgentOffenseBoundary ? "显式中断：" : "延迟事件：") + eventNames(events),
        events,
      );
    } else if (this.world.time + 1e-9 >= this.offensePlan.watchdogAt) {
      this.offensePlan = this.replanOffense("有限看门狗", []);
      this.offenseQueue = [];
    }

    const urgentDefenseBoundary = this.defenseQueue.some(
      (event) =>
        event.type === "screen_cleared" ||
        event.type === "branch_reject" ||
        event.type === "switch_completed" ||
        event.type === "seal_established" ||
        event.type === "pass_caught" ||
        event.type === "reject_lane_gained",
    );
    if (
      this.defenseQueue.length > 0 &&
      (urgentDefenseBoundary || this.world.time + 1e-9 >= this.defensePlan.commitUntil)
    ) {
      const events = [...this.defenseQueue];
      this.defenseQueue = [];
      this.defensePlan = this.replanDefense(
        (urgentDefenseBoundary ? "显式中断：" : "延迟事件：") + eventNames(events),
        events,
      );
    } else if (this.world.time + 1e-9 >= this.defensePlan.watchdogAt) {
      this.defensePlan = this.replanDefense("有限看门狗", []);
      this.defenseQueue = [];
    }
  }

  private integratePlayers(intents: Record<PlayerId, MotionIntent>): {
    rawDesiredD1: Vec2;
    progressLoss: number;
  } {
    const before = {} as Record<PlayerId, Vec2>;
    const rawDesired = {} as Record<PlayerId, Vec2>;
    for (const id of PLAYER_IDS) {
      before[id] = { ...this.world.players[id].pos };
      rawDesired[id] = desiredVelocity(this.world.players[id], intents[id]);
    }

    const legalPoseBefore = screenPose(this.world);
    const geometryBefore = screenGeometry({
      d1: this.world.players.D1,
      o5: this.world.players.O5,
      desiredD1Velocity: rawDesired.D1,
      screenLegalPose: legalPoseBefore,
    });
    const adjusted = { ...rawDesired, D1: { ...rawDesired.D1 } };

    if (geometryBefore.routeExposure && intents.D1.screenNavigation !== "none") {
      const forward = normalize(rawDesired.D1);
      const left = v(-forward.y, forward.x);
      const overDirection = left.y <= 0 ? left : scale(left, -1);
      const tangent = intents.D1.screenNavigation === "under" ? scale(overDirection, -1) : overDirection;
      adjusted.D1 = add(scale(rawDesired.D1, 0.67), scale(tangent, 1.42));
      const max = this.world.players.D1.maxSpeed;
      if (length(adjusted.D1) > max) adjusted.D1 = scale(normalize(adjusted.D1), max);
    }

    for (const id of PLAYER_IDS) {
      const player = this.world.players[id];
      const nextVelocity = accelerationLimited(player.vel, adjusted[id], 12.8 * FIXED_DT);
      player.vel = length(nextVelocity) > player.maxSpeed
        ? scale(normalize(nextVelocity), player.maxSpeed)
        : nextVelocity;
      player.pos = add(player.pos, scale(player.vel, FIXED_DT));
    }

    const pairs: Array<[PlayerId, PlayerId]> = [
      ["O1", "O5"],
      ["O1", "D1"],
      ["O1", "D5"],
      ["O5", "D1"],
      ["O5", "D5"],
      ["D1", "D5"],
    ];
    for (let collisionPass = 0; collisionPass < 3; collisionPass += 1) {
      for (const [aId, bId] of pairs) {
        const a = this.world.players[aId];
        const b = this.world.players[bId];
        const delta = sub(b.pos, a.pos);
        const currentDistance = length(delta);
        const minimumDistance = a.radius + b.radius;
        if (currentDistance >= minimumDistance || currentDistance < 1e-8) continue;
        const normal = scale(delta, 1 / currentDistance);
        const overlap = minimumDistance - currentDistance;
        const aAnchored = aId === "O5" && legalPoseBefore;
        const bAnchored = bId === "O5" && legalPoseBefore;
        const aShare = aAnchored ? 0 : bAnchored ? 1 : 0.5;
        const bShare = bAnchored ? 0 : aAnchored ? 1 : 0.5;
        a.pos = add(a.pos, scale(normal, -overlap * aShare));
        b.pos = add(b.pos, scale(normal, overlap * bShare));
        const closingA = dot(a.vel, normal);
        const closingB = dot(b.vel, scale(normal, -1));
        if (closingA > 0) a.vel = sub(a.vel, scale(normal, closingA));
        if (closingB > 0) b.vel = add(b.vel, scale(normal, closingB));
      }
    }

    let maxDisplacement = 0;
    for (const id of PLAYER_IDS) {
      const player = this.world.players[id];
      player.pos.x = clamp(player.pos.x, player.radius, COURT.width - player.radius);
      player.pos.y = clamp(player.pos.y, player.radius, COURT.height - player.radius);
      maxDisplacement = Math.max(maxDisplacement, distance(before[id], player.pos));
    }
    this.world.lastStepMaxDisplacement = maxDisplacement;

    const desiredDirection = normalize(rawDesired.D1);
    const expectedProgress = length(rawDesired.D1) * FIXED_DT;
    const actualProgress = Math.max(0, dot(sub(this.world.players.D1.pos, before.D1), desiredDirection));
    return {
      rawDesiredD1: rawDesired.D1,
      progressLoss: Math.max(0, expectedProgress - actualProgress),
    };
  }

  private resolveFacts(rawDesiredD1: Vec2, progressLoss: number): ScreenFacts {
    const o1 = this.world.players.O1;
    const o5 = this.world.players.O5;
    const d1 = this.world.players.D1;
    const d5 = this.world.players.D5;
    const legalPose = screenPose(this.world);
    const teammateBodyDistance = o1.radius + o5.radius;
    const relativeToScreen = sub(o1.pos, o5.pos);
    const ballHandlerClearedScreen =
      this.world.facts.ballHandlerClearedScreen ||
      (this.world.branch === "use" &&
        relativeToScreen.x >= teammateBodyDistance * 0.9 &&
        relativeToScreen.y <= 0.24 &&
        distance(o1.pos, o5.pos) >= teammateBodyDistance - 0.006);
    const d1ClosingO5 = dot(d1.vel, normalize(sub(o5.pos, d1.pos)));
    const d5ClosingO1 = dot(d5.vel, normalize(sub(o1.pos, d5.pos)));
    const matchupExchange =
      this.world.facts.matchupExchange ||
      (ballHandlerClearedScreen &&
        distance(d1.pos, o5.pos) <= 1.05 &&
        distance(d5.pos, o1.pos) <= 1.08 &&
        d1ClosingO5 > 0.28 &&
        d5ClosingO1 > 0.28);
    const pnrLinked =
      legalPose &&
      this.world.ballOwner === "O1" &&
      this.world.branch !== "reject" &&
      distance(o1.pos, o5.pos) <= 1.92 &&
      o1.pos.x >= o5.pos.x - 1.05;
    return evaluateScreenFacts({
      d1,
      o5,
      desiredD1Velocity: rawDesiredD1,
      screenLegalPose: legalPose,
      progressLoss,
      priorDelay: this.world.facts.accumulatedDelay,
      pnrLinked,
      ballHandlerSeparation: Math.min(distance(o1.pos, d1.pos), distance(o1.pos, d5.pos)),
      ballHandlerClearedScreen,
      matchupExchange,
      previouslyEffective: this.world.facts.screenEffective,
    });
  }

  private resolveSeal(previous: SealFacts): SealFacts {
    const active = this.world.facts.matchupExchange;
    if (!active) {
      return {
        ...EMPTY_SEAL,
        frontReactionDelay: this.config.d1FrontReactionDelay,
      };
    }

    const o1 = this.world.players.O1;
    const o5 = this.world.players.O5;
    const d1 = this.world.players.D1;
    const d5 = this.world.players.D5;
    const o5GoalSide = distance(o5.pos, COURT.hoop) + 0.12 < distance(d1.pos, COURT.hoop);
    const engaged = distance(o5.pos, d1.pos) <= 1.02;
    const d1Lane = pointSegmentDistance(d1.pos, o1.pos, o5.pos);
    const d1Relevant = d1Lane.t > 0.1 && d1Lane.t < 0.96;
    const d1Clearance = d1Relevant
      ? d1Lane.distance - d1.radius - this.world.ball.radius
      : 1.5;
    const laneClearance = d1Clearance;
    const releaseLegal =
      distance(o1.pos, d5.pos) >= o1.radius + d5.radius - 0.006;
    const established = active && o5.pos.y < 4.15 && engaged && o5GoalSide;
    const frontTarget = add(o5.pos, scale(normalize(sub(o1.pos, o5.pos)), 0.73));
    const frontRoute = bodyAwareRoute(d1.pos, frontTarget, o5, d1.radius);
    const entryFlightTime = established
      ? clamp(distance(o1.pos, o5.pos) / 9.2, 0.16, 0.42)
      : 0;
    const frontEta = established
      ? this.config.d1FrontReactionDelay + frontRoute.length / d1.maxSpeed
      : 0;
    const frontFeasible =
      established &&
      frontRoute.legal &&
      frontEta + 0.004 <= entryFlightTime;
    const d1Fronting =
      established &&
      (previous.d1Fronting || frontFeasible) &&
      d1Relevant &&
      d1Lane.t > 0.52 &&
      d1Lane.distance <= d1.radius + this.world.ball.radius + 0.11;
    const passLaneClear = laneClearance > 0.06 && releaseLegal;
    const passWindow =
      established &&
      !d1Fronting &&
      passLaneClear &&
      distance(o1.pos, o5.pos) <= 4.8;
    const passWindowOpenedAtTick = passWindow
      ? previous.passWindow
        ? previous.passWindowOpenedAtTick
        : this.world.tick
      : null;

    return {
      active,
      established,
      o5GoalSide,
      d1Fronting,
      frontReactionDelay: this.config.d1FrontReactionDelay,
      frontRouteLength: established ? round(frontRoute.length) : 0,
      frontRouteLegal: established && frontRoute.legal,
      frontRouteNeedsDetour: established && frontRoute.needsDetour,
      frontEta: round(frontEta),
      entryFlightTime: round(entryFlightTime),
      frontFeasible,
      passLaneClear,
      laneClearance: round(laneClearance),
      passWindow,
      passWindowOpenedAtTick,
    };
  }

  private integrateBall(intent: PassIntent | null): void {
    const ball = this.world.ball;
    if (ball.inFlight) {
      const from = { ...ball.pos };
      const target = ball.target ?? add(from, ball.vel);
      const remaining = distance(from, target);
      const stepDistance = length(ball.vel) * FIXED_DT;
      const next = remaining <= stepDistance
        ? { ...target }
        : add(from, scale(normalize(ball.vel), stepDistance));
      const receiverId = ball.intendedReceiver;
      if (!receiverId) throw new Error("In-flight ball is missing an intended receiver");
      const receiver = this.world.players[receiverId];
      const receiverHit = pointSegmentDistance(receiver.pos, from, next);
      const interceptions = (DEFENSE_IDS as Array<"D1" | "D5">)
        .map((id) => {
          const defender = this.world.players[id];
          const hit = pointSegmentDistance(defender.pos, from, next);
          return { id, defender, hit };
        })
        .filter(
          ({ id, defender, hit }) =>
            !(ball.kind === "lob_entry" && id === "D5") &&
            hit.t > 0.035 &&
            hit.distance <= defender.radius + ball.radius + 0.045,
        )
        .sort((a, b) => a.hit.t - b.hit.t || a.id.localeCompare(b.id));
      const firstDefender = interceptions[0];
      const receiverCanCatch =
        receiverHit.distance <= receiver.radius + ball.radius + 0.075;

      if (firstDefender && (!receiverCanCatch || firstDefender.hit.t <= receiverHit.t)) {
        this.world.ballOwner = firstDefender.id;
        ball.pos = next;
        ball.vel = { ...firstDefender.defender.vel };
        ball.inFlight = false;
        ball.target = null;
        ball.outcome = "deflected";
        return;
      }
      if (receiverCanCatch) {
        this.world.ballOwner = receiverId;
        ball.pos = next;
        ball.vel = { ...receiver.vel };
        ball.inFlight = false;
        ball.target = null;
        ball.outcome = "caught";
        return;
      }

      ball.pos = next;
      if (remaining <= stepDistance + 1e-9) {
        this.world.ballOwner = null;
        ball.vel = v();
        ball.inFlight = false;
        ball.target = null;
        ball.outcome = "missed";
      }
      return;
    }

    const launchWindowOpen =
      intent?.kind === "lob_entry"
        ? this.world.seal.passWindow
        : intent?.kind === "kick_out"
          ? this.world.postCatch.kickoutWindow
          : intent?.kind === "slip_pass"
            ? this.world.reject.passWindow
          : false;
    if (intent && this.world.ballOwner === intent.from && launchWindowOpen) {
      const passer = this.world.players[intent.from];
      const receiver = this.world.players[intent.to];
      const passSpeed = intent.kind === "lob_entry" ? 9.2 : intent.kind === "kick_out" ? 13.6 : 11.4;
      const minimumFlight = intent.kind === "lob_entry" ? 0.16 : 0.12;
      const maximumFlight = intent.kind === "lob_entry" ? 0.42 : intent.kind === "kick_out" ? 0.4 : 0.36;
      const flightTime = clamp(
        distance(passer.pos, receiver.pos) / passSpeed,
        minimumFlight,
        maximumFlight,
      );
      const target = add(receiver.pos, scale(receiver.vel, flightTime));
      target.x = clamp(target.x, receiver.radius, COURT.width - receiver.radius);
      target.y = clamp(target.y, receiver.radius, COURT.height - receiver.radius);
      ball.pos = { ...passer.pos };
      ball.vel = scale(normalize(sub(target, passer.pos)), passSpeed);
      ball.inFlight = true;
      ball.from = intent.from;
      ball.intendedReceiver = intent.to;
      ball.target = target;
      ball.launchedAt = this.world.time;
      ball.kind = intent.kind;
      ball.outcome = "live";
      this.world.ballOwner = null;
      return;
    }

    if (this.world.ballOwner) {
      const owner = this.world.players[this.world.ballOwner];
      ball.pos = { ...owner.pos };
      ball.vel = { ...owner.vel };
    }
  }

  private resolveMismatch(previous: MismatchFacts): MismatchFacts {
    const active = this.world.facts.matchupExchange;
    if (!active) return { ...EMPTY_MISMATCH };

    const o1 = this.world.players.O1;
    const d5 = this.world.players.D5;
    const startedAt = previous.startedAt ?? this.world.time;
    const elapsed = Math.max(0, this.world.time - startedAt);
    const rimDirection = normalize(sub(COURT.hoop, o1.pos));
    const visibleRimAttack =
      length(o1.vel) > 1 && dot(normalize(o1.vel), rimDirection) > 0.62;
    const attackCommitted =
      previous.attackCommitted ||
      (previous.active && elapsed >= 0.18 && visibleRimAttack);
    const o1D5Separation = distance(o1.pos, d5.pos);
    const d5GoalSide = distance(d5.pos, COURT.hoop) + 0.04 < distance(o1.pos, COURT.hoop);
    const advantage =
      attackCommitted &&
      o1.pos.y < 2.9 &&
      ((!d5GoalSide && o1D5Separation > 0.76) || o1D5Separation > 1.16);
    const contained =
      !advantage &&
      attackCommitted &&
      elapsed >= 1.9 &&
      d5GoalSide &&
      o1D5Separation <= 1.06;

    return {
      active,
      startedAt,
      elapsed: round(elapsed),
      attackCommitted,
      o1D5Separation: round(o1D5Separation),
      d5GoalSide,
      advantage,
      contained,
    };
  }

  private resolvePostCatch(previous: PostCatchFacts): PostCatchFacts {
    const active =
      previous.active ||
      (this.world.ballOwner === "O5" &&
        this.world.ball.kind === "lob_entry" &&
        this.world.ball.outcome === "caught");
    if (!active) {
      return {
        ...EMPTY_POST_CATCH,
        d1RecoveryDelay: this.config.d1PostCatchRecoveryDelay,
        d1RecoveryReadyIn: this.config.d1PostCatchRecoveryDelay,
      };
    }

    const o1 = this.world.players.O1;
    const o5 = this.world.players.O5;
    const d1 = this.world.players.D1;
    const d5 = this.world.players.D5;
    const startedAt = previous.startedAt ?? this.world.time;
    const elapsed = Math.max(0, this.world.time - startedAt);
    const o5RimDistance = distance(o5.pos, COURT.hoop);
    const d1RimDistance = distance(d1.pos, COURT.hoop);
    const d1Behind = d1RimDistance >= o5RimDistance + 0.08;
    const d1BodyGap = distance(o5.pos, d1.pos) - o5.radius - d1.radius;
    const d1RecoveryDelay = this.config.d1PostCatchRecoveryDelay;
    const d1RecoveryReadyIn = Math.max(0, d1RecoveryDelay - elapsed);
    const d5O1Distance = distance(d5.pos, o1.pos);
    const d5O5Distance = distance(d5.pos, o5.pos);
    const d5AttachedToO1 = d5O1Distance <= 0.94;
    const d5HelpCommitted =
      previous.d5HelpCommitted ||
      (previous.active && d5O5Distance <= 1.12 && d5O1Distance >= 1.28);
    const o1Spacing = distance(o1.pos, o5.pos);
    const o1Relocated = o1Spacing >= 2.62 && o1.pos.x >= 7.55;
    const kickoutClearances = (["D1", "D5"] as const).map((id) => {
      const defender = this.world.players[id];
      const lane = pointSegmentDistance(defender.pos, o5.pos, o1.pos);
      return lane.t > 0.055 && lane.t < 0.96
        ? lane.distance - defender.radius - this.world.ball.radius
        : 1.4;
    });
    const kickoutLaneClearance = Math.min(...kickoutClearances);
    const kickoutWindowNow =
      d5HelpCommitted &&
      o1Relocated &&
      kickoutLaneClearance > 0.1 &&
      this.world.ballOwner === "O5" &&
      !this.world.ball.inFlight;
    const kickoutWindow = previous.kickoutWindow || kickoutWindowNow;
    const kickoutWindowOpenedAtTick = kickoutWindow
      ? previous.kickoutWindow
        ? previous.kickoutWindowOpenedAtTick
        : this.world.tick
      : null;
    const rimDirection = normalize(sub(COURT.hoop, o5.pos));
    const visibleRimTurn =
      length(o5.vel) > 0.78 && dot(normalize(o5.vel), rimDirection) > 0.66;
    const attackCommitted =
      previous.attackCommitted ||
      (previous.active && elapsed >= 0.08 && visibleRimTurn);
    const finishWindow =
      attackCommitted &&
      o5RimDistance <= 1.72 &&
      d1Behind &&
      d1BodyGap >= -0.01 &&
      d5AttachedToO1 &&
      o1Relocated &&
      this.world.ballOwner === "O5";

    return {
      active,
      startedAt,
      elapsed: round(elapsed),
      attackCommitted,
      o5RimDistance: round(o5RimDistance),
      d1Behind,
      d1BodyGap: round(d1BodyGap),
      d1RecoveryDelay,
      d1RecoveryReadyIn: round(d1RecoveryReadyIn),
      d5AttachedToO1,
      d5O1Distance: round(d5O1Distance),
      d5O5Distance: round(d5O5Distance),
      d5HelpCommitted,
      o1Spacing: round(o1Spacing),
      o1Relocated,
      kickoutLaneClearance: round(kickoutLaneClearance),
      kickoutWindow,
      kickoutWindowOpenedAtTick,
      finishWindow,
    };
  }

  private resolveUnder(previous: UnderFacts): UnderFacts {
    const o1 = this.world.players.O1;
    const o5 = this.world.players.O5;
    const d1 = this.world.players.D1;
    const d5 = this.world.players.D5;
    const d1O1Distance = distance(d1.pos, o1.pos);
    const d5O5Distance = distance(d5.pos, o5.pos);
    const underPoint = underScreenPoint(o5.pos);
    const d1UnderScreen =
      !this.world.facts.matchupExchange &&
      d1.pos.y <= o5.pos.y - 0.14 &&
      distance(d1.pos, underPoint) <= 0.74;
    const active =
      previous.active ||
      (this.world.branch === "use" && this.world.facts.screenLegalPose && d1UnderScreen);
    const d1Recovered =
      active &&
      this.world.facts.ballHandlerClearedScreen &&
      d1O1Distance <= 0.92;
    const pullupWindow =
      active &&
      this.world.facts.ballHandlerClearedScreen &&
      !this.world.facts.matchupExchange &&
      !d1Recovered &&
      d1O1Distance >= 1.08 &&
      d5O5Distance <= 1.02 &&
      o1.pos.y <= 5.08 &&
      o1.pos.y >= 3.18 &&
      this.world.ballOwner === "O1";

    return {
      active,
      d1UnderScreen,
      d1Recovered,
      d1O1Distance: round(d1O1Distance),
      d5O5Distance: round(d5O5Distance),
      pullupWindow,
    };
  }

  private resolveReject(previous: RejectFacts): RejectFacts {
    if (this.world.branch !== "reject") return { ...EMPTY_REJECT };

    const o1 = this.world.players.O1;
    const o5 = this.world.players.O5;
    const d1 = this.world.players.D1;
    const d5 = this.world.players.D5;
    const helpEligible = previous.active
      ? previous.helpEligible
      : d1.pos.x - o1.pos.x >= 1.08;
    const d1BeatenNow =
      o1.pos.y <= 4.78 &&
      distance(o1.pos, d1.pos) >= 0.8 &&
      (distance(d1.pos, COURT.hoop) >= distance(o1.pos, COURT.hoop) + 0.08 ||
        d1.pos.x >= o1.pos.x + 0.34);
    const d1Beaten = previous.d1Beaten || d1BeatenNow;
    const d5O1Distance = distance(d5.pos, o1.pos);
    const d5O5Distance = distance(d5.pos, o5.pos);
    const d5HelpCommitted =
      previous.d5HelpCommitted ||
      (previous.active &&
        helpEligible &&
        d1Beaten &&
        d5O1Distance <= 1.5 &&
        d5O5Distance >= 1);
    const o5Slipped = o5.pos.y <= 3.46;
    const passClearances = (DEFENSE_IDS as Array<"D1" | "D5">).map((id) => {
      const defender = this.world.players[id];
      const lane = pointSegmentDistance(defender.pos, o1.pos, o5.pos);
      return lane.t > 0.055 && lane.t < 0.96
        ? lane.distance - defender.radius - this.world.ball.radius
        : 1.35;
    });
    const passLaneClearance = Math.min(...passClearances);
    const passWindowNow =
      d5HelpCommitted &&
      o5Slipped &&
      passLaneClearance > 0.08 &&
      this.world.ballOwner === "O1" &&
      !this.world.ball.inFlight;
    const passWindow = previous.passWindow || passWindowNow;
    const passWindowOpenedAtTick = passWindow
      ? previous.passWindow
        ? previous.passWindowOpenedAtTick
        : this.world.tick
      : null;

    return {
      active: true,
      helpEligible,
      d1Beaten,
      d5HelpCommitted,
      d5O1Distance: round(d5O1Distance),
      d5O5Distance: round(d5O5Distance),
      o5Slipped,
      passLaneClearance: round(passLaneClearance),
      passWindow,
      passWindowOpenedAtTick,
    };
  }

  private resolveBranch(): Branch {
    if (this.world.branch !== "undecided") return this.world.branch;
    const o1 = this.world.players.O1;
    if (o1.pos.x <= INITIAL_O1.x - 0.17 && o1.vel.x < -0.5) return "reject";
    if (
      this.world.facts.screenLegalPose &&
      o1.pos.x >= INITIAL_O1.x + 0.3 &&
      o1.vel.x > 0.5
    ) {
      return "use";
    }
    return "undecided";
  }

  private resolveEvents(
    previousFacts: ScreenFacts,
    previousMismatch: MismatchFacts,
    previousSeal: SealFacts,
    previousPostCatch: PostCatchFacts,
    previousUnder: UnderFacts,
    previousReject: RejectFacts,
    previousBall: BallState,
    previousBranch: Branch,
  ): WorldEvent[] {
    const events: WorldEvent[] = [];
    const tick = this.world.tick;
    const at = this.world.time;
    const facts = this.world.facts;
    const underNavigationSettled = previousUnder.active || this.world.under.active;
    if (!underNavigationSettled && !previousFacts.screenLegalPose && facts.screenLegalPose) {
      events.push(makeEvent("screen_set", tick, at, "O5 掩护站定", "O5 进入右侧掩护点并降至合法静止速度。"));
    }
    if (previousBranch !== this.world.branch && this.world.branch === "use") {
      events.push(makeEvent("branch_use", tick, at, "O1 使用掩护", "O1 的公开轨迹进入 O5 外肩弧线，分支锁定。"));
    }
    if (previousBranch !== this.world.branch && this.world.branch === "reject") {
      events.push(makeEvent("branch_reject", tick, at, "O1 拒绝掩护", "O1 的公开轨迹进入左侧突破缝，分支锁定。"));
    }
    if (!previousFacts.contact && facts.contact) {
      events.push(makeEvent("contact_on", tick, at, "D1 / O5 身体接触", "仅记录几何接触；尚不等于被阻碍或掩护有效。"));
    }
    if (previousFacts.contact && !facts.contact) {
      events.push(makeEvent("contact_off", tick, at, "身体接触结束", "D1 与 O5 已分离。"));
    }
    if (!underNavigationSettled && !previousFacts.routeExposure && facts.routeExposure) {
      events.push(makeEvent("route_exposure_on", tick, at, "D1 路线暴露", "O5 进入 D1 当前追防意图的有限前向走廊。"));
    }
    if (!underNavigationSettled && previousFacts.routeExposure && !facts.routeExposure) {
      events.push(makeEvent("route_exposure_off", tick, at, "路线暴露结束", "O5 不再位于 D1 当前移动走廊。"));
    }
    if (!underNavigationSettled && !previousFacts.impeded && facts.impeded) {
      events.push(makeEvent("impeded_on", tick, at, "D1 发生真实延误", "相对无障碍前进量出现可测损失；因果门已通过。"));
    }
    if (!underNavigationSettled && previousFacts.impeded && !facts.impeded) {
      events.push(makeEvent("impeded_off", tick, at, "D1 延误结束", "当前步没有继续发生由 O5 导致的进度损失。"));
    }
    if (!previousFacts.ballHandlerClearedScreen && facts.ballHandlerClearedScreen) {
      events.push(makeEvent("screen_cleared", tick, at, "O1 已越过掩护肩位", "O1 与 O5 保持队友净空并完成外肩弧线；防守进入换防交接边界。"));
    }
    if (!previousFacts.screenEffective && facts.screenEffective) {
      events.push(makeEvent("screen_effective", tick, at, "掩护有效", "合法挡拆归属、路线/接触、真实延误与持球优势同时成立。"));
    }
    if (!previousFacts.matchupExchange && facts.matchupExchange) {
      events.push(makeEvent("switch_completed", tick, at, "防守换防完成", "公开运动显示 D1 接管 O5、D5 接管 O1；角色交换已落地。"));
    }
    if (!previousUnder.active && this.world.under.active) {
      events.push(
        makeEvent(
          "under_committed",
          tick,
          at,
          "D1 走掩护下方",
          "D1 已从 O5 与篮筐之间的合法通道通过，D5 保持 O5 责任；没有发生换防。",
        ),
      );
    }
    if (!previousUnder.pullupWindow && this.world.under.pullupWindow) {
      events.push(
        makeEvent(
          "pullup_window",
          tick,
          at,
          "O1 获得中距离处理窗",
          "D1 尚未追回、D5 仍贴近 O5；这里只确认急停处理空间，不模拟投篮。",
        ),
      );
    }
    if (!previousReject.d1Beaten && this.world.reject.d1Beaten) {
      events.push(
        makeEvent(
          "reject_lane_gained",
          tick,
          at,
          "O1 拒绝后甩开 D1",
          "公开坐标与速度显示 D1 已落后左侧拒绝路线；防守此后才能评估 D5 协防。",
        ),
      );
    }
    if (!previousReject.d5HelpCommitted && this.world.reject.d5HelpCommitted) {
      events.push(
        makeEvent(
          "reject_help_committed",
          tick,
          at,
          "D5 真实协防拒绝突破",
          "D5 已进入 O1 的局部攻筐线并离开 O5；进攻此后才能读取顺下接应。",
        ),
      );
    }
    if (!previousReject.passWindow && this.world.reject.passWindow) {
      events.push(
        makeEvent(
          "reject_pass_window_open",
          tick,
          at,
          "拒绝后顺下传球窗打开",
          "D5 已协防、O5 已顺下且局部走廊净空；这里只开放传球，不指定接球结果。",
        ),
      );
    }
    if (!previousMismatch.attackCommitted && this.world.mismatch.attackCommitted) {
      events.push(
        makeEvent(
          "mismatch_attack",
          tick,
          at,
          "O1 开始攻击 D5",
          "公开速度矢量已经持续指向篮筐；错位攻击从换防结果中正式接续。",
        ),
      );
    }
    if (
      !this.world.postCatch.active &&
      !previousSeal.established &&
      this.world.seal.established
    ) {
      events.push(
        makeEvent(
          "seal_established",
          tick,
          at,
          "O5 卡住 D1",
          "O5 已进入低位并保持篮筐侧，D1 仍在身体外侧；卡位事实成立。",
        ),
      );
    }
    if (
      !this.world.postCatch.active &&
      !previousSeal.d1Fronting &&
      this.world.seal.d1Fronting
    ) {
      events.push(
        makeEvent(
          "seal_fronted",
          tick,
          at,
          "D1 抢到传球侧",
          "D1 的公开位置进入 O1–O5 直传走廊；进攻不能把原卡位计划当作仍然畅通。",
        ),
      );
    }
    if (
      !this.world.postCatch.active &&
      !previousSeal.passWindow &&
      this.world.seal.passWindow
    ) {
      events.push(
        makeEvent(
          "pass_window_open",
          tick,
          at,
          "O1–O5 传球窗打开",
          "O5 卡位、篮筐侧与局部传球净空同时成立；这里只开放传球，不保证接球。",
        ),
      );
    }
    if (!previousBall.inFlight && this.world.ball.inFlight) {
      events.push(
        this.world.ball.kind === "kick_out"
          ? makeEvent(
              "kickout_launched",
              tick,
              at,
              "O5 分回 O1",
              "O5 在公开回传窗内出球；飞行期间球权为空，防守仍可按真实局部触球顺序破坏。",
            )
          : this.world.ball.kind === "slip_pass"
            ? makeEvent(
                "reject_pass_launched",
                tick,
                at,
                "O1 分给顺下 O5",
                "O1 在公开顺下窗内出球；飞行期间球权为空，D1/D5 仍可按局部触球顺序破坏。",
              )
          : makeEvent(
              "pass_launched",
              tick,
              at,
              "O1 传向 O5",
              "高吊球以固定速度离手并越过近身 D5；此刻球权为空，D1 与 O5 的先触球顺序仍由后续几何解析。",
            ),
      );
    }
    if (previousBall.outcome !== "caught" && this.world.ball.outcome === "caught") {
      events.push(
        this.world.ball.kind === "kick_out" && this.world.ballOwner === "O1"
          ? makeEvent(
              "kickout_caught",
              tick,
              at,
              "O1 接到分球",
              "球先进入外移 O1 的合法接球半径；球权从空中转回 O1，只确认接球空间，不模拟投篮。",
            )
          : this.world.ball.kind === "slip_pass" && this.world.ballOwner === "O5"
            ? makeEvent(
                "reject_pass_caught",
                tick,
                at,
                "O5 接到拒绝后分球",
                "球先进入顺下 O5 的合法接球半径；球权从空中转到 O5，本场景不继续模拟终结。",
              )
          : makeEvent(
              "pass_caught",
              tick,
              at,
              "O5 深位接球",
              "球先进入 O5 的合法接球半径，球权从空中转移到 O5。",
            ),
      );
    }
    if (!previousPostCatch.attackCommitted && this.world.postCatch.attackCommitted) {
      events.push(
        makeEvent(
          "post_catch_attack",
          tick,
          at,
          "O5 转身攻击篮筐",
          "O5 已护住接球并持续向篮筐推进；O1 同步外移，接球后队级方案正式落地。",
        ),
      );
    }
    if (!previousPostCatch.d5HelpCommitted && this.world.postCatch.d5HelpCommitted) {
      events.push(
        makeEvent(
          "help_committed",
          tick,
          at,
          "D5 真实下沉协防",
          "D5 已离开 O1 并进入 O5 的局部协防半径；进攻此后才能读取该公开移动，不能预知防守隐藏方案。",
        ),
      );
    }
    if (!previousPostCatch.kickoutWindow && this.world.postCatch.kickoutWindow) {
      events.push(
        makeEvent(
          "kickout_window_open",
          tick,
          at,
          "O5–O1 回传窗打开",
          "D5 已下沉、O1 已外移且局部传球走廊合法；这里只开放分球，不指定接球结果。",
        ),
      );
    }
    if (!previousPostCatch.finishWindow && this.world.postCatch.finishWindow) {
      events.push(
        makeEvent(
          "finish_window",
          tick,
          at,
          "O5 形成近筐处理窗口",
          "O5 保持 D1 的篮筐侧，D5 仍留守 O1；这里只确认处理窗口，不模拟投篮结果。",
        ),
      );
    }
    if (
      previousBall.outcome !== this.world.ball.outcome &&
      (this.world.ball.outcome === "deflected" || this.world.ball.outcome === "missed")
    ) {
      events.push(
        makeEvent(
          "pass_denied",
          tick,
          at,
          this.world.ball.kind === "kick_out"
            ? "外传被否决"
            : this.world.ball.kind === "slip_pass"
              ? "拒绝后顺下传球被否决"
              : "内线传球被否决",
          this.world.ball.outcome === "deflected"
            ? "防守者先进入球的局部飞行线并取得球权。"
            : `球到达既定落点前没有进入${this.world.ball.kind === "kick_out" ? " O1" : " O5"} 的接球半径。`,
        ),
      );
    }
    if (!previousMismatch.advantage && this.world.mismatch.advantage) {
      events.push(
        makeEvent(
          "mismatch_advantage",
          tick,
          at,
          "O1 突破错位防线",
          "O1 已进入近筐区，且 D5 失去篮筐侧或被拉开到无法遏制的距离。",
        ),
      );
    }
    if (!previousMismatch.contained && this.world.mismatch.contained) {
      events.push(
        makeEvent(
          "mismatch_contained",
          tick,
          at,
          "D5 遏制错位突破",
          "有限错位窗口结束时，D5 仍处于球与筐之间，且与 O1 保持可防守距离。",
        ),
      );
    }
    return events.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  }

  private maybeResolveTerminal(events: WorldEvent[]): void {
    const o1 = this.world.players.O1;
    const closestDefender = Math.min(
      distance(o1.pos, this.world.players.D1.pos),
      distance(o1.pos, this.world.players.D5.pos),
    );
    let terminal: TerminalState | null = null;

    if (
      this.config.horizon === "reject_slip" &&
      this.world.ball.kind === "slip_pass" &&
      this.world.ball.outcome === "caught" &&
      this.world.ballOwner === "O5"
    ) {
      terminal = {
        reason: "reject_slip_caught",
        label: "D5 协防拒绝突破后，O1 分给顺下 O5 并完成合法接球",
        at: this.world.time,
      };
    } else if (
      this.config.horizon === "under_pullup" &&
      this.world.under.pullupWindow
    ) {
      terminal = {
        reason: "under_pullup_window",
        label: "D1 走掩护下方，O1 获得中距离处理窗口",
        at: this.world.time,
      };
    } else if (
      this.config.horizon === "post_catch_kickout" &&
      this.world.ball.kind === "kick_out" &&
      this.world.ball.outcome === "caught" &&
      this.world.ballOwner === "O1"
    ) {
      terminal = {
        reason: "post_catch_kickout_caught",
        label: "D5 下沉后，O5 分回外移 O1 并完成合法接球",
        at: this.world.time,
      };
    } else if (
      this.config.horizon === "post_catch_finish" &&
      this.world.postCatch.finishWindow
    ) {
      terminal = {
        reason: "post_catch_finish_window",
        label: "O5 接球转身并形成近筐处理窗口",
        at: this.world.time,
      };
    } else if (
      this.config.horizon === "pnr_resolution" &&
      this.world.ball.outcome === "caught" &&
      this.world.ballOwner === "O5"
    ) {
      terminal = {
        reason: "seal_catch_advantage",
        label: "O5 卡住 D1 并在深位合法接球",
        at: this.world.time,
      };
    } else if (
      this.world.ball.outcome === "deflected" ||
      this.world.ball.outcome === "missed"
    ) {
      terminal = {
        reason: "pass_denied",
        label:
          this.world.ball.kind === "kick_out"
            ? "防守否决 O5 分回 O1 的外传"
            : this.world.ball.kind === "slip_pass"
              ? "防守否决 O1 给顺下 O5 的分球"
            : "防守否决 O1 给 O5 的内线传球",
        at: this.world.time,
      };
    } else if (this.world.mismatch.advantage) {
      terminal = {
        reason: "mismatch_advantage",
        label: "O1 利用速度错位突破 D5 的遏制线",
        at: this.world.time,
      };
    } else if (this.world.mismatch.contained) {
      terminal = {
        reason: "switch_contained",
        label: "D5 保持篮筐侧并遏制 O1 的错位突破",
        at: this.world.time,
      };
    } else if (
      this.config.horizon !== "reject_slip" &&
      this.world.branch === "reject" &&
      o1.pos.y < 3.28
    ) {
      terminal = {
        reason: "reject_advantage",
        label: closestDefender > 0.74 ? "拒绝掩护制造左侧优势" : "拒绝后进入协防判断点",
        at: this.world.time,
      };
    } else if (this.world.time >= this.config.maxTime) {
      terminal = {
        reason: "defense_contained",
        label: "看门狗终止：防守保持在位",
        at: this.world.time,
      };
    }

    if (!terminal) return;
    this.world.terminal = terminal;
    if (
      terminal.reason === "mismatch_advantage" ||
      terminal.reason === "seal_catch_advantage" ||
      terminal.reason === "post_catch_finish_window" ||
      terminal.reason === "post_catch_kickout_caught" ||
      terminal.reason === "under_pullup_window" ||
      terminal.reason === "reject_slip_caught" ||
      terminal.reason === "reject_advantage"
    ) {
      events.push(
        makeEvent("advantage_created", this.world.tick, this.world.time, "闭环结果", terminal.label),
      );
    }
    events.push(
      makeEvent("terminal", this.world.tick, this.world.time, "本回合终止", "冻结世界；等待重放，不自动扩展到投篮或更多战术。"),
    );
    events.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  }

  private computeStateHash(): string {
    return stableHash({
      seed: this.config.seed,
      cue: this.config.cue,
      d1FrontReactionDelay: this.config.d1FrontReactionDelay,
      d1PostCatchRecoveryDelay: this.config.d1PostCatchRecoveryDelay,
      o1MaxSpeed: this.config.o1MaxSpeed,
      horizon: this.config.horizon,
      tick: this.world.tick,
      ballOwner: this.world.ballOwner,
      branch: this.world.branch,
      players: PLAYER_IDS.map((id) => ({
        id,
        x: round(this.world.players[id].pos.x, 5),
        y: round(this.world.players[id].pos.y, 5),
        vx: round(this.world.players[id].vel.x, 5),
        vy: round(this.world.players[id].vel.y, 5),
      })),
      facts: this.world.facts,
      mismatch: this.world.mismatch,
      seal: this.world.seal,
      postCatch: this.world.postCatch,
      under: this.world.under,
      reject: this.world.reject,
      ball: {
        owner: this.world.ballOwner,
        pos: this.world.ball.pos,
        vel: this.world.ball.vel,
        inFlight: this.world.ball.inFlight,
        kind: this.world.ball.kind,
        outcome: this.world.ball.outcome,
      },
      offensePlan: this.offensePlan.id,
      defensePlan: this.defensePlan.id,
      terminal: this.world.terminal?.reason ?? null,
    });
  }

  step(count = 1): void {
    for (let iteration = 0; iteration < count; iteration += 1) {
      if (this.world.terminal) return;
      this.deliverEvents();
      this.maybeReplan();

      const offense = offensiveIntents(this.offensePlan, this.world);
      const passIntent = offensivePassIntent(this.offensePlan, this.world);
      const defense = defensiveIntents(this.defensePlan, this.world);
      const intents: Record<PlayerId, MotionIntent> = { ...offense, ...defense };
      const previousFacts = { ...this.world.facts };
      const previousMismatch = { ...this.world.mismatch };
      const previousSeal = { ...this.world.seal };
      const previousPostCatch = { ...this.world.postCatch };
      const previousUnder = { ...this.world.under };
      const previousReject = { ...this.world.reject };
      const previousBall: BallState = {
        ...this.world.ball,
        pos: { ...this.world.ball.pos },
        vel: { ...this.world.ball.vel },
        target: this.world.ball.target ? { ...this.world.ball.target } : null,
      };
      const previousBranch = this.world.branch;
      const integration = this.integratePlayers(intents);

      this.world.tick += 1;
      this.world.time = round(this.world.tick * FIXED_DT, 6);
      this.world.branch = this.resolveBranch();
      this.world.facts = this.resolveFacts(integration.rawDesiredD1, integration.progressLoss);
      this.world.seal = this.resolveSeal(previousSeal);
      this.world.mismatch = this.resolveMismatch(previousMismatch);
      this.world.under = this.resolveUnder(previousUnder);
      this.world.reject = this.resolveReject(previousReject);
      this.integrateBall(passIntent);
      this.world.postCatch = this.resolvePostCatch(previousPostCatch);
      const events = this.resolveEvents(
        previousFacts,
        previousMismatch,
        previousSeal,
        previousPostCatch,
        previousUnder,
        previousReject,
        previousBall,
        previousBranch,
      );
      this.maybeResolveTerminal(events);
      this.eventLog.push(...events);
      this.world.pendingPlannerEvents.push(...events);
      this.world.stateHash = this.computeStateHash();
    }
  }

  getRoles(): RoleAssignment[] {
    return [
      ...(Object.values(this.offensePlan.roles) as RoleAssignment[]),
      ...(Object.values(this.defensePlan.roles) as RoleAssignment[]),
    ];
  }

  getPlayerCopies(): Record<PlayerId, PlayerState> {
    return {
      O1: clonePlayer(this.world.players.O1),
      O5: clonePlayer(this.world.players.O5),
      D1: clonePlayer(this.world.players.D1),
      D5: clonePlayer(this.world.players.D5),
    };
  }
}
