import {
  DEFAULT_TEAM_STRATEGY_SELECTION,
  copyTeamStrategySelection,
  resolveRegisteredTeamStrategy,
  scoreCandidateWithStrategy,
  type DecisionPhase,
  type TeamStrategyProfile,
  type TeamStrategyReference,
  type TeamStrategySelection,
} from "./pnr-strategy.ts";

export const FIXED_DT = 1 / 60;
export const FORMATION_TIMEOUT_SECONDS = 3.2;
export const FORMATION_HANDLER_READY_RADIUS = 0.12;
export const FORMATION_HANDLER_MAX_READY_SPEED = 0.32;
export const FORMATION_SCREENER_MAX_SET_SPEED = 0.28;
export const UNDER_PULLUP_MIN_BODY_CLEARANCE = 0.28;
export const UNDER_PULLUP_MAX_STOP_SPEED = 0.34;
export const UNDER_ROUTE_MIN_BODY_CLEARANCE = 0.04;
export const UNDER_NEAR_ZERO_BODY_GAP = 0.025;
export const UNDER_MAX_COLLISION_SUPPRESSION_SECONDS = 0.25;
export const UNDER_COLLISION_REPLAN_TRIGGER_SECONDS =
  UNDER_MAX_COLLISION_SUPPRESSION_SECONDS - FIXED_DT * 2;
export const UNDER_MAX_MATCHUP_INVERSION_AUDIT_SECONDS = 0.3;
export const UNDER_RECOVERY_MAX_BODY_GAP = 0.24;
export const UNDER_RECOVERY_IMMINENT_CLOSING_SPEED = 0.18;
export const UNDER_RECOVERY_MIN_REPLAN_TIME_TO_CONTACT = 0.5;
export const UNDER_DEEP_RETREAT_MAX_ROLLER_CLOSING_SPEED = 0.18;
export const UNDER_EXISTING_DEEP_RETREAT_HOLD_DISTANCE = 1.47;
export const UNDER_PULLUP_INNER_RIM_DISTANCE = 3;
export const UNDER_PULLUP_ARC_INSIDE_MARGIN = 0.12;
export const UNDER_PULLUP_TARGET_ARC_INSET = 0.32;
export const UNDER_PULLUP_MIN_RIMWARD_PROGRESS = 0.25;
export const UNDER_PULLUP_CLEAN_STOP_MIN_BODY_GAP = 0.08;
export const UNDER_PULLUP_MIN_APPROACH_SPEED = 0.55;

export const COURT = {
  width: 10,
  height: 8,
  centerlineX: 5,
  hoop: { x: 5, y: 0.68 },
  threePointArcRadius: 4.72,
  screenSpot: { x: 5.62, y: 5.62 },
  useGate: { x: 6.38, y: 4.72 },
  rejectGate: { x: 3.18, y: 4.82 },
} as const;

export const FORMATION_LANDMARK_OFFSETS = Object.freeze({
  screenAnchor: Object.freeze({ x: 1.27, y: -0.96 }),
  handlerWaitingPoint: Object.freeze({ x: 0.27, y: -0.6 }),
  useGate: Object.freeze({ x: 2.03, y: -1.86 }),
  rejectGate: Object.freeze({ x: -1.17, y: -1.76 }),
});

export const PLAYER_IDS = ["O1", "O5", "D1", "D5"] as const;
export type PlayerId = (typeof PLAYER_IDS)[number];
export type Team = "offense" | "defense";
export type ScreenSide = "right" | "left";
export type PnrStartMode = "preset_pnr" | "form_pnr";
export type SimulationPhase = "formation" | "pnr";
export type SimulationHorizon =
  | "pnr_resolution"
  | "formation_resolution"
  | "post_catch_finish"
  | "post_catch_kickout"
  | "post_catch_resolution"
  | "mismatch_attack"
  | "under_pullup"
  | "reject_slip";
export type OffensePlanId =
  | "FORM_SCREEN"
  | "USE_RIGHT_SCREEN"
  | "REJECT_LEFT"
  | "ATTACK_UNDER_GAP"
  | "TAKE_UNDER_PULLUP"
  | "RESET_UNDER"
  | "ATTACK_BIG"
  | "FEED_SEAL"
  | "RESET_MISMATCH"
  | "POST_FINISH"
  | "KICK_OUT"
  | "REJECT_SLIP_PASS";
export type DefensePlanId =
  | "TRACK_FORMATION"
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

export interface InitialPlayerPositions {
  O1: Vec2;
  O5: Vec2;
  D1: Vec2;
  D5: Vec2;
}

export interface TacticalLandmarks {
  screenAnchor: Vec2;
  handlerWaitingPoint: Vec2;
  useGate: Vec2;
  rejectGate: Vec2;
}

export interface FormationLandmarkOffsets {
  screenAnchor: Vec2;
  handlerWaitingPoint: Vec2;
  useGate: Vec2;
  rejectGate: Vec2;
}

export interface FormationState {
  mode: PnrStartMode;
  phase: SimulationPhase;
  screenSet: boolean;
  screenSetTick: number | null;
  jointReady: boolean;
  jointReadyTick: number | null;
  enteredPnrAtTick: number | null;
  deadlineAt: number | null;
  abortedReason: string | null;
}

export interface FormationReadiness {
  handlerInWaitingRegion: boolean;
  handlerSpeedReady: boolean;
  handlerOwnsBall: boolean;
  screenerSet: boolean;
  ready: boolean;
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
  | "formation_timeout"
  | "screen_set"
  | "formation_ready"
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
  | "under_recovery_blocked"
  | "under_drive_advantage"
  | "under_contained"
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
  formation_timeout: 18,
  screen_set: 20,
  formation_ready: 22,
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
  under_recovery_blocked: 77,
  under_drive_advantage: 80,
  under_contained: 80,
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
    | "formation_timeout"
    | "formation_aborted"
    | "mismatch_advantage"
    | "seal_catch_advantage"
    | "post_catch_finish_window"
    | "post_catch_kickout_caught"
    | "under_drive_advantage"
    | "under_pullup_window"
    | "under_contained"
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
  screenSide: ScreenSide;
  landmarks: TacticalLandmarks;
  tacticalLandmarks: TacticalLandmarks;
  formation: FormationState;
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

export interface RouteSegmentProof {
  snapshotTick: number;
  legal: boolean;
  courtLegal: boolean;
  minimumBodyClearance: number;
  blockerIds: PlayerId[];
  releasesExistingContactByBlocker?: PlayerId[];
}

export interface RoutePassageHalfPlane {
  normal: Vec2;
  offset: number;
  epsilon: number;
}

export interface TeamRouteSegment {
  phase: string;
  target: Vec2;
  maxSpeed: number;
  minimumCruiseSpeed?: number;
  arriveRadius: number;
  advanceSubject: PlayerId;
  passageHalfPlane: RoutePassageHalfPlane | null;
  proof: RouteSegmentProof;
}

export interface TeamRouteTrack {
  playerId: PlayerId;
  segments: TeamRouteSegment[];
  segmentIndex: number;
  reachedAtTick: Array<number | null>;
}

export interface TeamPlanRoute {
  routeVersion: number;
  boundary: "under_read" | "screen_cleared" | "under_blocked";
  kind:
    | "under_preclear_use"
    | "under_postclear_attack"
    | "under_postclear_pullup"
    | "under_postclear_reset"
    | "under_postclear_recovery"
    | "under_safe_hold";
  committedAtTick: number;
  minimumCommitUntilTick: number;
  tracks: Partial<Record<PlayerId, TeamRouteTrack>>;
  fallback: "hold_until_replan";
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
  /** Private to this team and the all-knowing UI; never copied into planner observations. */
  route?: TeamPlanRoute;
}

export interface CandidateEvaluation {
  id: PlanId;
  label: string;
  feasible: boolean;
  /** Backward-compatible alias of effectiveScore. */
  score: number | null;
  baseScore: number | null;
  strategyAdjustment: number;
  effectiveScore: number | null;
  strategyReason: string;
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
  decisionPhase: DecisionPhase;
  strategy: TeamStrategyReference & { team: Team };
  strategyBoundary: string;
  candidates: CandidateEvaluation[];
  observationBoundary: string;
}

export interface SimulationConfig {
  initialPositions: InitialPlayerPositions;
  screenSide: ScreenSide;
  startMode?: PnrStartMode;
  formationLandmarkOffsets?: FormationLandmarkOffsets;
  seed: number;
  maxTime: number;
  d1FrontReactionDelay: number;
  d1PostCatchRecoveryDelay: number;
  o1MaxSpeed: number;
  horizon: SimulationHorizon;
  strategies?: TeamStrategySelection;
  /** Audit-only execution order; plans must be identical for either value. */
  plannerEvaluationOrder?: "offense-first" | "defense-first";
}

export interface PublicObservation {
  tick: number;
  time: number;
  team: Team;
  screenSide: ScreenSide;
  landmarks: {
    screenAnchor: Vec2;
    handlerWaitingPoint?: Vec2;
    useGate?: Vec2;
    rejectGate?: Vec2;
  };
  formation: FormationState;
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
  minimumCruiseSpeed?: number;
  arriveRadius: number;
  screenNavigation?: "over" | "under" | "none";
}

export interface CollisionPairResolutionFact {
  pair: readonly [PlayerId, PlayerId];
  positionCorrection: number;
  velocityRemoved: Partial<Record<PlayerId, number>>;
}

export interface CollisionResolutionFacts {
  pairs: CollisionPairResolutionFact[];
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
  d5O5ClosingSpeed?: number;
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
  d5O5ClosingSpeed: number;
  pullupWindow: boolean;
  /** R2 facts are absent before UNDER activates so non-UNDER traces retain their old shape. */
  startedAt?: number;
  elapsed?: number;
  d5O1Distance?: number;
  d5BodyGap?: number;
  d5ContainLineDistance?: number;
  d5ContainsBall?: boolean;
  d5Contest?: boolean;
  d5DeepRetreat?: boolean;
  o5TethersD5?: boolean;
  o1Speed?: number;
  previousO1Speed?: number;
  d1RecoveryEta?: number;
  driveCommitted?: boolean;
  driveAdvantage?: boolean;
  pullupCommitted?: boolean;
  contained?: boolean;
  screenClearedAtTick?: number;
  o1PositionAtScreenClear?: Vec2;
  o1RimDistanceAtClear?: number;
  rimwardProgressAfterClear?: number;
  o1InsideMidrange?: boolean;
  d1O1StraightBodyCorridorClear?: boolean;
  d1O1BodyGap?: number;
  d1O5BodyGap?: number;
  d1O5ClosingSpeed?: number;
  recoveryMotionUnblocked?: boolean;
  d1O5CollisionSuppressedSeconds?: number;
  d1O5LastPositionCorrection?: number;
  d1O5LastVelocityRemoved?: number;
  o1CollisionSuppressedSeconds?: number;
  o1LastPositionCorrection?: number;
  o1LastVelocityRemoved?: number;
  postClearPeakO1Speed?: number;
  decelerationStartedAtTick?: number | null;
  decelerationCollisionFree?: boolean;
  cleanDeceleration?: boolean;
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

export function mirrorPointAcrossCenterline(point: Vec2): Vec2 {
  return {
    x: COURT.centerlineX * 2 - point.x,
    y: point.y,
  };
}

export function mirrorVectorAcrossCenterline(vector: Vec2): Vec2 {
  return { x: -vector.x, y: vector.y };
}

export function mirrorInitialPlayerPositions(
  positions: Readonly<InitialPlayerPositions>,
): InitialPlayerPositions {
  return Object.fromEntries(
    PLAYER_IDS.map((id) => [id, mirrorPointAcrossCenterline(positions[id])]),
  ) as unknown as InitialPlayerPositions;
}

function toTacticalPoint(point: Vec2, side: ScreenSide): Vec2 {
  return side === "right" ? point : mirrorPointAcrossCenterline(point);
}

function toTacticalVector(vector: Vec2, side: ScreenSide): Vec2 {
  return side === "right" ? vector : mirrorVectorAcrossCenterline(vector);
}

function mirrorRouteHalfPlane(
  halfPlane: RoutePassageHalfPlane | null,
): RoutePassageHalfPlane | null {
  if (!halfPlane) return null;
  return {
    normal: mirrorVectorAcrossCenterline(halfPlane.normal),
    offset: halfPlane.offset - COURT.width * halfPlane.normal.x,
    epsilon: halfPlane.epsilon,
  };
}

function transformRouteFrame(
  route: TeamPlanRoute | undefined,
  side: ScreenSide,
): TeamPlanRoute | undefined {
  if (!route || side === "right") return route;
  return {
    ...route,
    tracks: Object.fromEntries(
      Object.entries(route.tracks).map(([id, track]) => [
        id,
        track
          ? {
              ...track,
              reachedAtTick: [...track.reachedAtTick],
              segments: track.segments.map((segment) => ({
                ...segment,
                target: mirrorPointAcrossCenterline(segment.target),
                passageHalfPlane: mirrorRouteHalfPlane(segment.passageHalfPlane),
                proof: {
                  ...segment.proof,
                  blockerIds: [...segment.proof.blockerIds],
                  ...(segment.proof.releasesExistingContactByBlocker
                    ? {
                        releasesExistingContactByBlocker: [
                          ...segment.proof.releasesExistingContactByBlocker,
                        ],
                      }
                    : {}),
                },
              })),
            }
          : track,
      ]),
    ) as Partial<Record<PlayerId, TeamRouteTrack>>,
  };
}

function transformPlanFrame(plan: TeamPlan, side: ScreenSide): TeamPlan {
  if (side === "right") return plan;
  return {
    ...plan,
    primaryTarget: plan.primaryTarget
      ? mirrorPointAcrossCenterline(plan.primaryTarget)
      : undefined,
    secondaryTarget: plan.secondaryTarget
      ? mirrorPointAcrossCenterline(plan.secondaryTarget)
      : undefined,
    route: transformRouteFrame(plan.route, side),
  };
}

function transformIntentFrame<T extends PlayerId>(
  intents: Record<T, MotionIntent>,
  side: ScreenSide,
): Record<T, MotionIntent> {
  if (side === "right") return intents;
  return Object.fromEntries(
    Object.entries(intents).map(([id, intent]) => [
      id,
      {
        ...(intent as MotionIntent),
        target: mirrorPointAcrossCenterline((intent as MotionIntent).target),
      },
    ]),
  ) as Record<T, MotionIntent>;
}

function toTacticalWorld(world: WorldState): WorldState {
  if (world.screenSide === "right") return world;
  const players = {} as Record<PlayerId, PlayerState>;
  for (const id of PLAYER_IDS) {
    const player = world.players[id];
    players[id] = {
      ...player,
      pos: mirrorPointAcrossCenterline(player.pos),
      vel: mirrorVectorAcrossCenterline(player.vel),
    };
  }
  return {
    ...world,
    screenSide: "right",
    landmarks: copyTacticalLandmarks(world.tacticalLandmarks),
    tacticalLandmarks: copyTacticalLandmarks(world.tacticalLandmarks),
    players,
    ball: {
      ...world.ball,
      pos: mirrorPointAcrossCenterline(world.ball.pos),
      vel: mirrorVectorAcrossCenterline(world.ball.vel),
      target: world.ball.target
        ? mirrorPointAcrossCenterline(world.ball.target)
        : null,
    },
    under: {
      ...world.under,
      ...(world.under.o1PositionAtScreenClear
        ? {
            o1PositionAtScreenClear: mirrorPointAcrossCenterline(
              world.under.o1PositionAtScreenClear,
            ),
          }
        : {}),
    },
  };
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
  const arrivalSpeed = Math.min(
    intent.maxSpeed,
    Math.max(intent.minimumCruiseSpeed ?? 0.55, remaining * 3.2),
  );
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

export interface RouteProofBlocker {
  id: PlayerId;
  pos: Vec2;
  radius: number;
}

export interface StagedBodyRouteProof {
  legal: boolean;
  length: number;
  minimumBodyClearance: number;
  waypoints: Vec2[];
  segmentProofs: RouteSegmentProof[];
}

export interface TangentRouteCandidate extends StagedBodyRouteProof {
  side: "direct" | "left" | "right";
}

function segmentLength(points: Vec2[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distance(points[index - 1], points[index]);
  }
  return total;
}

/**
 * UNDER-only path proof. It is deliberately separate from bodyAwareRoute so
 * the sealed non-UNDER route length/ordering semantics remain untouched.
 */
export function proveStagedBodyRoute(
  start: Vec2,
  waypoints: readonly Vec2[],
  moverRadius: number,
  blockers: readonly RouteProofBlocker[],
  snapshotTick: number,
  minimumClearance = UNDER_ROUTE_MIN_BODY_CLEARANCE,
): StagedBodyRouteProof {
  const points = [start, ...waypoints];
  const segmentProofs: RouteSegmentProof[] = [];
  let minimumBodyClearance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const target = points[index];
    const courtLegal = playerPointInsideCourt(target, moverRadius);
    let segmentClearance = Number.POSITIVE_INFINITY;
    const releasesExistingContactByBlocker: PlayerId[] = [];
    let allBodiesLegal = true;
    for (const blocker of blockers) {
      const hit = pointSegmentDistance(blocker.pos, from, target);
      const clearance = hit.distance - moverRadius - blocker.radius;
      const fromClearance = distance(from, blocker.pos) - moverRadius - blocker.radius;
      const movingAway = dot(
        sub(target, from),
        sub(from, blocker.pos),
      ) > 1e-9;
      const releasesExistingContact =
        fromClearance >= -1e-6 &&
        fromClearance < minimumClearance - 1e-9 &&
        movingAway &&
        distance(target, blocker.pos) - moverRadius - blocker.radius >
          fromClearance + 0.004;
      if (releasesExistingContact) {
        releasesExistingContactByBlocker.push(blocker.id);
      } else if (clearance < minimumClearance - 1e-9) {
        allBodiesLegal = false;
      }
      segmentClearance = Math.min(segmentClearance, clearance);
    }
    if (blockers.length === 0) segmentClearance = COURT.width;
    minimumBodyClearance = Math.min(minimumBodyClearance, segmentClearance);
    segmentProofs.push({
      snapshotTick,
      legal: courtLegal && allBodiesLegal,
      courtLegal,
      minimumBodyClearance: round(segmentClearance, 6),
      blockerIds: blockers.map((blocker) => blocker.id),
      ...(releasesExistingContactByBlocker.length > 0
        ? { releasesExistingContactByBlocker }
        : {}),
    });
  }
  if (waypoints.length === 0) minimumBodyClearance = COURT.width;
  return {
    legal: segmentProofs.every((proof) => proof.legal),
    length: segmentLength(points),
    minimumBodyClearance: round(minimumBodyClearance, 6),
    waypoints: waypoints.map((point) => ({ ...point })),
    segmentProofs,
  };
}

/** Returns both deterministic sides; the calling team planner owns selection. */
export function buildTangentRouteProof(
  start: Vec2,
  target: Vec2,
  moverRadius: number,
  blocker: RouteProofBlocker,
  snapshotTick: number,
  minimumClearance = UNDER_ROUTE_MIN_BODY_CLEARANCE,
): TangentRouteCandidate[] {
  const direct = proveStagedBodyRoute(
    start,
    [target],
    moverRadius,
    [blocker],
    snapshotTick,
    minimumClearance,
  );
  if (direct.legal) return [{ side: "direct", ...direct }];

  const travel = normalize(sub(target, start));
  if (length(travel) < 1e-9) return [{ side: "direct", ...direct }];
  const leftNormal = v(-travel.y, travel.x);
  const minimumCenterDistance = moverRadius + blocker.radius + minimumClearance;
  const startRadius = distance(start, blocker.pos);
  const targetRadius = distance(target, blocker.pos);
  if (
    startRadius < minimumCenterDistance - 1e-9 ||
    targetRadius < minimumCenterDistance - 1e-9
  ) {
    return [{ side: "direct", ...direct }];
  }

  // Prove a real body-exterior polyline: tangent entry, sampled exterior arc,
  // tangent exit, target.  The small radial margin is bounded by the actual
  // start/target clearance, so a legal route is not rejected merely because a
  // player begins close to (but outside) the required body envelope.
  const availableMargin = Math.max(
    0,
    Math.min(startRadius, targetRadius) - minimumCenterDistance,
  );
  const routeRadius = minimumCenterDistance + Math.min(0.035, availableMargin * 0.38);
  const tangentAngles = (point: Vec2): [number, number] => {
    const relative = sub(point, blocker.pos);
    const pointRadius = length(relative);
    const base = Math.atan2(relative.y, relative.x);
    const alpha = Math.acos(clamp(routeRadius / pointRadius, -1, 1));
    return [base - alpha, base + alpha];
  };
  const wrapPositive = (angle: number) => {
    const tau = Math.PI * 2;
    return ((angle % tau) + tau) % tau;
  };
  const startAngles = tangentAngles(start);
  const targetAngles = tangentAngles(target);
  const legalBySide: Record<"left" | "right", TangentRouteCandidate[]> = {
    left: [],
    right: [],
  };

  for (const startAngle of startAngles) {
    for (const targetAngle of targetAngles) {
      for (const direction of [1, -1] as const) {
        const delta = direction === 1
          ? wrapPositive(targetAngle - startAngle)
          : -wrapPositive(startAngle - targetAngle);
        const arcSegments = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 12)));
        const exteriorPoints = Array.from({ length: arcSegments + 1 }, (_, index) => {
          const angle = startAngle + delta * (index / arcSegments);
          return add(
            blocker.pos,
            v(Math.cos(angle) * routeRadius, Math.sin(angle) * routeRadius),
          );
        });
        const waypoints = [...exteriorPoints, { ...target }];
        const proof = proveStagedBodyRoute(
          start,
          waypoints,
          moverRadius,
          [blocker],
          snapshotTick,
          minimumClearance,
        );
        if (!proof.legal) continue;
        const meanSide = exteriorPoints.reduce(
          (total, point) => total + dot(sub(point, blocker.pos), leftNormal),
          0,
        ) / exteriorPoints.length;
        const side = meanSide >= 0 ? "left" : "right";
        legalBySide[side].push({ side, ...proof });
      }
    }
  }

  const candidates = (["left", "right"] as const).flatMap((side) =>
    legalBySide[side]
      .sort(
        (first, second) =>
          first.length - second.length ||
          second.minimumBodyClearance - first.minimumBodyClearance,
      )
      .slice(0, 1)
  );
  return candidates.length > 0 ? candidates : [{ side: "direct", ...direct }];
}

/**
 * UNDER-only composite proof for a fixed public snapshot.  It first proves the
 * direct segment, then asks the team planner to compare deterministic tangent
 * routes around each actually intersecting body.  It never changes a route at
 * intent time and never changes the legacy bodyAwareRoute helper.
 */
export function proveUnderCompositeBodyRoute(
  start: Vec2,
  target: Vec2,
  moverRadius: number,
  blockers: readonly RouteProofBlocker[],
  snapshotTick: number,
  minimumClearance = UNDER_ROUTE_MIN_BODY_CLEARANCE,
): StagedBodyRouteProof | null {
  const direct = proveStagedBodyRoute(
    start,
    [target],
    moverRadius,
    blockers,
    snapshotTick,
    minimumClearance,
  );
  if (direct.legal) return direct;

  const intersecting = blockers
    .map((blocker) => ({
      blocker,
      clearance:
        pointSegmentDistance(blocker.pos, start, target).distance -
        moverRadius - blocker.radius,
    }))
    .filter(({ clearance }) => clearance < minimumClearance + 1e-9)
    .sort(
      (first, second) =>
        first.clearance - second.clearance ||
        first.blocker.id.localeCompare(second.blocker.id),
    );
  const candidates: StagedBodyRouteProof[] = [];
  for (const { blocker } of intersecting) {
    for (const tangent of buildTangentRouteProof(
      start,
      target,
      moverRadius,
      blocker,
      snapshotTick,
      minimumClearance,
    )) {
      if (!tangent.legal) continue;
      const allBodies = proveStagedBodyRoute(
        start,
        tangent.waypoints,
        moverRadius,
        blockers,
        snapshotTick,
        minimumClearance,
      );
      if (allBodies.legal) candidates.push(allBodies);
    }
  }
  return candidates.sort(
    (first, second) =>
      first.length - second.length ||
      second.minimumBodyClearance - first.minimumBodyClearance,
  )[0] ?? null;
}

function routePassageHalfPlane(from: Vec2, target: Vec2): RoutePassageHalfPlane | null {
  const direction = normalize(sub(target, from));
  if (length(direction) < 1e-9) return null;
  return {
    normal: direction,
    offset: dot(target, direction),
    // A staged body route must reach the proven segment boundary before the
    // cursor advances.  A broad early-crossing epsilon would cut the exterior
    // arc and make acceleration-limited motion enter the body envelope.
    epsilon: 0.002,
  };
}

function pointOnSegmentAt(a: Vec2, b: Vec2, t: number): Vec2 {
  return add(a, scale(sub(b, a), clamp(t, 0, 1)));
}

function segmentSegmentDistance(a0: Vec2, a1: Vec2, b0: Vec2, b1: Vec2): number {
  const candidates = [
    pointSegmentDistance(a0, b0, b1).distance,
    pointSegmentDistance(a1, b0, b1).distance,
    pointSegmentDistance(b0, a0, a1).distance,
    pointSegmentDistance(b1, a0, a1).distance,
  ];
  return Math.min(...candidates);
}

const UNDER_RECOVERY_TURN_COST = 0.26;
const UNDER_D5_TETHER_DISTANCE = 1.12;
const UNDER_D5_TETHER_CONTAIN_COST = 0.34;
const UNDER_HIP_LATERAL_CLEARANCE = 1.02;
const UNDER_HIP_GOAL_ADVANCE = 0.55;

type PublicPlayerGeometry = PublicObservation["players"][PlayerId];

interface UnderContestGeometry {
  distance: number;
  bodyGap: number;
  goalSideMargin: number;
  containLineDistance: number;
  containsBall: boolean;
  contest: boolean;
}

export interface UnderHipOption {
  side: "left" | "right";
  target: Vec2;
  targetFeasible: boolean;
  routeLegal: boolean;
  routeClearance: number;
  attackEta: number;
  d1RecoveryEta: number;
  d5ContainEta: number;
  timingMargin: number;
}

export interface UnderReadGeometry {
  screenCleared: boolean;
  preClearRouteLegal: boolean;
  postClearRouteLegal: boolean;
  d5O1Distance: number;
  d5BodyGap: number;
  d5O5Distance: number;
  d5GoalSideMargin: number;
  d5ContainLineDistance: number;
  d5ContainsBall: boolean;
  d5Contest: boolean;
  d5DeepRetreat: boolean;
  o5TethersD5: boolean;
  hipOptions: UnderHipOption[];
  bestHip: UnderHipOption | null;
  pullupPoint: Vec2;
  pullupRimDistance: number;
  rimwardVelocity: number;
  stoppingDistance: number;
  stoppingTime: number;
  canStopForPullup: boolean;
  pullupBodyGap: number;
  pullupContest: boolean;
  d1PullupRecoveryEta: number;
  d5PullupContestEta: number;
  attackFeasible: boolean;
  pullupFeasible: boolean;
}

function playerPointInsideCourt(point: Vec2, radius: number): boolean {
  return (
    point.x >= radius &&
    point.x <= COURT.width - radius &&
    point.y >= radius &&
    point.y <= COURT.height - radius
  );
}

function underContestGeometry(
  point: Vec2,
  handlerRadius: number,
  d5: PublicPlayerGeometry,
): UnderContestGeometry {
  const d5Distance = distance(d5.pos, point);
  const bodyGap = d5Distance - handlerRadius - d5.radius;
  const goalSideMargin = distance(point, COURT.hoop) - distance(d5.pos, COURT.hoop);
  const containLine = pointSegmentDistance(d5.pos, point, COURT.hoop);
  const containsBall =
    goalSideMargin >= 0.04 &&
    containLine.t > 0.015 &&
    containLine.t < 0.58 &&
    containLine.distance <= handlerRadius + d5.radius + 0.25 &&
    d5Distance <= 1.48;
  const contest =
    bodyGap < UNDER_PULLUP_MIN_BODY_CLEARANCE ||
    (containsBall && d5Distance <= 1.18);
  return {
    distance: d5Distance,
    bodyGap,
    goalSideMargin,
    containLineDistance: containLine.distance,
    containsBall,
    contest,
  };
}

/**
 * UNDER keeps D5's primary tether to O5 while allowing one bounded step toward
 * the public O1→rim line. It is a short contain, never a matchup exchange.
 */
export function underD5ContainPoint(o1: Vec2, o5: Vec2): Vec2 {
  const rollerGoalSide = underScreenPoint(o5, 0.76);
  const ballGoalSide = add(o1, scale(normalize(sub(COURT.hoop, o1)), 0.82));
  return movePointToward(rollerGoalSide, ballGoalSide, 0.56);
}

export function isInsideThreePointArc(point: Vec2): boolean {
  return distance(point, COURT.hoop) <= COURT.threePointArcRadius;
}

export function isInsideUnderPullupRegion(point: Vec2): boolean {
  const rimDistance = distance(point, COURT.hoop);
  return (
    rimDistance >= UNDER_PULLUP_INNER_RIM_DISTANCE &&
    rimDistance <=
      COURT.threePointArcRadius - UNDER_PULLUP_ARC_INSIDE_MARGIN + 1e-9
  );
}

function selectOuterUseRoute(
  candidates: readonly TangentRouteCandidate[],
  screenPosition: Vec2,
): TangentRouteCandidate | null {
  const awayFromHoop = normalize(sub(screenPosition, COURT.hoop));
  return [...candidates]
    .filter((candidate) => candidate.legal)
    .sort((first, second) => {
      const firstPoint = first.waypoints[0] ?? screenPosition;
      const secondPoint = second.waypoints[0] ?? screenPosition;
      return (
        dot(sub(secondPoint, screenPosition), awayFromHoop) -
          dot(sub(firstPoint, screenPosition), awayFromHoop) ||
        first.length - second.length ||
        first.side.localeCompare(second.side)
      );
    })[0] ?? null;
}

function selectHoopSideRecoveryRoute(
  candidates: readonly TangentRouteCandidate[],
  screenPosition: Vec2,
): TangentRouteCandidate | null {
  const towardHoop = normalize(sub(COURT.hoop, screenPosition));
  return [...candidates]
    .filter((candidate) => candidate.legal)
    .sort((first, second) => {
      const firstPoint = first.waypoints[0] ?? screenPosition;
      const secondPoint = second.waypoints[0] ?? screenPosition;
      return (
        dot(sub(secondPoint, screenPosition), towardHoop) -
          dot(sub(firstPoint, screenPosition), towardHoop) ||
        first.length - second.length ||
        first.side.localeCompare(second.side)
      );
    })[0] ?? null;
}

function underPreClearUseRouteProof(
  observation: PublicObservation,
): TangentRouteCandidate | null {
  const o1 = observation.players.O1;
  const o5 = observation.players.O5;
  const useGate = offenseLocalLandmark(observation, "useGate");
  return selectOuterUseRoute(
    buildTangentRouteProof(
      o1.pos,
      useGate,
      o1.radius,
      { id: "O5", pos: o5.pos, radius: o5.radius },
      observation.tick,
    ),
    o5.pos,
  );
}

function publicPullupPoint(observation: PublicObservation): Vec2 {
  const o1 = observation.players.O1;
  const clearPoint = observation.under.o1PositionAtScreenClear ?? o1.pos;
  const clearRimDistance = distance(clearPoint, COURT.hoop);
  const speed = length(o1.vel);
  const stoppingDistance = speed ** 2 / (2 * 12.8);
  const advance = Math.max(
    UNDER_PULLUP_MIN_RIMWARD_PROGRESS + 0.16,
    stoppingDistance + 0.18,
  );
  const targetRimDistance = clamp(
    clearRimDistance - advance,
    UNDER_PULLUP_INNER_RIM_DISTANCE,
    COURT.threePointArcRadius - UNDER_PULLUP_TARGET_ARC_INSET,
  );
  const fromHoop = normalize(sub(clearPoint, COURT.hoop));
  return add(COURT.hoop, scale(fromHoop, targetRimDistance));
}

function publicPullupRouteCandidates(
  observation: PublicObservation,
): Array<{ point: Vec2; proof: StagedBodyRouteProof; angularOffset: number }> {
  const o1 = observation.players.O1;
  const o5 = observation.players.O5;
  const d1 = observation.players.D1;
  const d5 = observation.players.D5;
  const basePoint = publicPullupPoint(observation);
  const targetRimDistance = distance(basePoint, COURT.hoop);
  const radial = normalize(sub(basePoint, COURT.hoop));
  const awayFromScreen = sub(basePoint, o5.pos);
  const tangentComponent = sub(
    awayFromScreen,
    scale(radial, dot(awayFromScreen, radial)),
  );
  const canonicalSide = observation.landmarks.screenAnchor.x >= COURT.centerlineX ? 1 : -1;
  const tangentAway = length(tangentComponent) > 1e-9
    ? normalize(tangentComponent)
    : scale(v(radial.y, -radial.x), canonicalSide);
  const offsets = [0, 0.08, 0.14, 0.2];
  const blockers: RouteProofBlocker[] = [
    { id: "O5", pos: o5.pos, radius: o5.radius },
    { id: "D1", pos: d1.pos, radius: d1.radius },
    { id: "D5", pos: d5.pos, radius: d5.radius },
  ];
  return offsets.flatMap((angularOffset) => {
    const direction = normalize(add(
      scale(radial, Math.cos(angularOffset)),
      scale(tangentAway, Math.sin(angularOffset)),
    ));
    const point = add(COURT.hoop, scale(direction, targetRimDistance));
    const proof = proveUnderCompositeBodyRoute(
      o1.pos,
      point,
      o1.radius,
      blockers,
      observation.tick,
    );
    return proof ? [{ point, proof, angularOffset }] : [];
  });
}

export function evaluateUnderReadGeometry(
  observation: PublicObservation,
): UnderReadGeometry {
  if (observation.team !== "offense") {
    throw new Error("UNDER read geometry belongs to the offense planner view");
  }
  const o1 = observation.players.O1;
  const o5 = observation.players.O5;
  const d1 = observation.players.D1;
  const d5 = observation.players.D5;
  const screenCleared = observation.facts.ballHandlerClearedScreen;
  const preClearRoute = screenCleared ? null : underPreClearUseRouteProof(observation);
  const currentContest = underContestGeometry(o1.pos, o1.radius, d5);
  const d5O5Distance = distance(d5.pos, o5.pos);
  const d5TowardO5 = normalize(sub(o5.pos, d5.pos));
  const d5O5ClosingSpeed = dot(d5.vel, d5TowardO5);
  const o5TethersD5 = d5O5Distance <= UNDER_D5_TETHER_DISTANCE;
  const d5DeepRetreat =
    currentContest.goalSideMargin >= 0.78 &&
    d5O5Distance >= UNDER_D5_TETHER_DISTANCE &&
    d5O5ClosingSpeed <= UNDER_DEEP_RETREAT_MAX_ROLLER_CLOSING_SPEED &&
    !currentContest.contest;

  const goalDirection = normalize(sub(COURT.hoop, d5.pos));
  const lateral = v(-goalDirection.y, goalDirection.x);
  const blockers: PublicPlayerGeometry[] = [d5, o5, d1];
  const hipOptions = ([
    ["left", -1],
    ["right", 1],
  ] as const).map(([side, sign]): UnderHipOption => {
    const target = add(
      add(d5.pos, scale(goalDirection, UNDER_HIP_GOAL_ADVANCE)),
      scale(lateral, sign * UNDER_HIP_LATERAL_CLEARANCE),
    );
    // Before screen_cleared the offense may choose only the high-level UNDER
    // read.  It must not pretend that the future clear point already proves a
    // post-clear body route.  The complete route is proved from the real clear
    // snapshot at the next planner boundary.
    const route = screenCleared
      ? proveUnderCompositeBodyRoute(
          o1.pos,
          target,
          o1.radius,
          [
            { id: "D5", pos: d5.pos, radius: d5.radius },
            { id: "O5", pos: o5.pos, radius: o5.radius },
            { id: "D1", pos: d1.pos, radius: d1.radius },
          ],
          observation.tick,
        )
      : null;
    const targetClearances = blockers.map(
      (blocker) => distance(target, blocker.pos) - o1.radius - blocker.radius,
    );
    const targetFeasible =
      playerPointInsideCourt(target, o1.radius) &&
      targetClearances.every((clearance) => clearance >= 0.035);
    const routeLegal = targetFeasible && Boolean(route?.legal);
    const routeLength = screenCleared && route ? route.length : distance(o1.pos, target);
    const attackEta = routeLength / Math.max(1.1, o1.maxSpeed * 0.94);
    const d1Route = bodyAwareRoute(d1.pos, target, {
      ...o5,
      id: "O5",
      team: "offense",
    } as PlayerState, d1.radius);
    const d1RecoveryEta =
      d1Route.length / Math.max(1.1, d1.maxSpeed * 0.94) +
      UNDER_RECOVERY_TURN_COST;
    const d5ContainEta =
      distance(d5.pos, target) / Math.max(1.1, d5.maxSpeed * 0.84) +
      (o5TethersD5 ? UNDER_D5_TETHER_CONTAIN_COST : 0);
    const timingMargin = Math.min(d1RecoveryEta, d5ContainEta) + 0.2 - attackEta;
    return {
      side,
      target,
      targetFeasible,
      routeLegal,
      routeClearance: Math.min(...targetClearances),
      attackEta,
      d1RecoveryEta,
      d5ContainEta,
      timingMargin,
    };
  });
  const bestHip = hipOptions
    .filter((option) => screenCleared ? option.routeLegal : option.targetFeasible)
    .sort(
      (first, second) =>
        second.timingMargin - first.timingMargin ||
        second.routeClearance - first.routeClearance ||
        first.side.localeCompare(second.side),
    )[0] ?? null;

  const o1Speed = length(o1.vel);
  const stoppingDistance = o1Speed ** 2 / (2 * 12.8);
  const stoppingTime = o1Speed / 12.8;
  const rimDirection = normalize(sub(COURT.hoop, o1.pos));
  const rimwardVelocity = dot(o1.vel, rimDirection);
  const pullupRouteChoice = screenCleared
    ? publicPullupRouteCandidates(observation).sort(
        (first, second) =>
          first.proof.length - second.proof.length ||
          second.proof.minimumBodyClearance - first.proof.minimumBodyClearance ||
          first.angularOffset - second.angularOffset,
      )[0] ?? null
    : null;
  const pullupPoint = pullupRouteChoice?.point ??
    (screenCleared ? publicPullupPoint(observation) : { ...o1.pos });
  const pullupRoute = pullupRouteChoice?.proof ?? null;
  const pullupContest = underContestGeometry(pullupPoint, o1.radius, d5);
  const d1PullupRecoveryEta =
    Math.max(
      0,
      distance(d1.pos, pullupPoint) - d1.radius - o1.radius - 0.16,
    ) / Math.max(1.1, d1.maxSpeed * 0.92) + UNDER_RECOVERY_TURN_COST;
  const d5PullupContestEta =
    Math.max(
      0,
      distance(d5.pos, pullupPoint) - d5.radius - o1.radius - 0.2,
    ) / Math.max(1.1, d5.maxSpeed * 0.9);
  const pullupRimDistance = distance(pullupPoint, COURT.hoop);
  const distanceToPullupPoint = distance(o1.pos, pullupPoint);
  const plannedDirection = normalize(sub(pullupPoint, o1.pos));
  const canStopForPullup = screenCleared
    ? stoppingDistance <= Math.max(0.55, distanceToPullupPoint + 0.12) &&
      playerPointInsideCourt(pullupPoint, o1.radius) &&
      isInsideUnderPullupRegion(pullupPoint) &&
      dot(plannedDirection, rimDirection) > 0.45 &&
      Boolean(pullupRoute?.legal)
    : Boolean(preClearRoute?.legal);
  const pullupFeasible =
    d5DeepRetreat &&
    canStopForPullup &&
    pullupContest.bodyGap >= UNDER_PULLUP_MIN_BODY_CLEARANCE &&
    !pullupContest.contest &&
    d1PullupRecoveryEta >= stoppingTime + 0.08 &&
    d5PullupContestEta >= stoppingTime + 0.08;

  return {
    screenCleared,
    preClearRouteLegal: screenCleared || Boolean(preClearRoute?.legal),
    postClearRouteLegal:
      screenCleared && Boolean((bestHip?.routeLegal ?? false) || pullupRoute?.legal),
    d5O1Distance: currentContest.distance,
    d5BodyGap: currentContest.bodyGap,
    d5O5Distance,
    d5O5ClosingSpeed,
    d5GoalSideMargin: currentContest.goalSideMargin,
    d5ContainLineDistance: currentContest.containLineDistance,
    d5ContainsBall: currentContest.containsBall,
    d5Contest: currentContest.contest,
    d5DeepRetreat,
    o5TethersD5,
    hipOptions,
    bestHip,
    pullupPoint,
    pullupRimDistance,
    rimwardVelocity,
    stoppingDistance,
    stoppingTime,
    canStopForPullup,
    pullupBodyGap: pullupContest.bodyGap,
    pullupContest: pullupContest.contest,
    d1PullupRecoveryEta,
    d5PullupContestEta,
    attackFeasible: Boolean(bestHip && bestHip.timingMargin >= 0),
    pullupFeasible,
  };
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
  pos: Vec2,
  maxSpeed: number,
): PlayerState {
  return {
    id,
    team,
    pos: { ...pos },
    vel: v(),
    radius: playerRadius(id),
    maxSpeed,
  };
}

function playerRadius(id: PlayerId): number {
  return id === "O5" || id === "D5" ? 0.37 : 0.34;
}

export const PRESET_PNR_TACTICAL_LANDMARKS = Object.freeze({
  screenAnchor: Object.freeze({ ...COURT.screenSpot }),
  handlerWaitingPoint: Object.freeze({ x: 4.62, y: 5.98 }),
  useGate: Object.freeze({ ...COURT.useGate }),
  rejectGate: Object.freeze({ ...COURT.rejectGate }),
}) satisfies Readonly<TacticalLandmarks>;

export function copyTacticalLandmarks(
  input: Readonly<TacticalLandmarks>,
): TacticalLandmarks {
  return {
    screenAnchor: { ...input.screenAnchor },
    handlerWaitingPoint: { ...input.handlerWaitingPoint },
    useGate: { ...input.useGate },
    rejectGate: { ...input.rejectGate },
  };
}

function copyFormationLandmarkOffsets(
  input: Readonly<FormationLandmarkOffsets>,
): FormationLandmarkOffsets {
  return {
    screenAnchor: { ...input.screenAnchor },
    handlerWaitingPoint: { ...input.handlerWaitingPoint },
    useGate: { ...input.useGate },
    rejectGate: { ...input.rejectGate },
  };
}

function validateFormationLandmarkOffsets(input: unknown): FormationLandmarkOffsets {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(
      "formationLandmarkOffsets must contain screenAnchor, handlerWaitingPoint, useGate, and rejectGate",
    );
  }
  const record = input as Partial<Record<keyof FormationLandmarkOffsets, unknown>>;
  const offsets = {} as FormationLandmarkOffsets;
  for (const name of [
    "screenAnchor",
    "handlerWaitingPoint",
    "useGate",
    "rejectGate",
  ] as const) {
    const candidate = record[name];
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error(`formationLandmarkOffsets.${name} must contain finite x/y coordinates`);
    }
    const point = candidate as Partial<Vec2>;
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new Error(`formationLandmarkOffsets.${name}.x and .y must be finite numbers`);
    }
    offsets[name] = { x: point.x as number, y: point.y as number };
  }
  return copyFormationLandmarkOffsets(offsets);
}

function assertLandmarkInsideCourt(name: string, point: Vec2, radius: number): void {
  if (
    point.x < radius ||
    point.x > COURT.width - radius ||
    point.y < radius ||
    point.y > COURT.height - radius
  ) {
    throw new Error(
      `formation landmark ${name} (${round(point.x, 3)}, ${round(point.y, 3)}) places the assigned body outside the court`,
    );
  }
}

function assertLandmarkClearance(
  firstName: string,
  first: Vec2,
  firstRadius: number,
  secondName: string,
  second: Vec2,
  secondRadius: number,
): void {
  const actual = distance(first, second);
  const minimum = firstRadius + secondRadius + 0.02;
  if (actual < minimum - 1e-9) {
    throw new Error(
      `formation landmarks ${firstName}/${secondName} lack body clearance: ${round(actual, 3)}m < ${round(minimum, 3)}m`,
    );
  }
}

function validateFormationRoutes(
  tacticalPositions: InitialPlayerPositions,
  landmarks: TacticalLandmarks,
): void {
  const o5Route = sub(landmarks.screenAnchor, tacticalPositions.O5);
  const o1Route = sub(landmarks.handlerWaitingPoint, tacticalPositions.O1);
  if (length(o5Route) < 0.35 || length(o1Route) < 0.2) {
    throw new Error("formation routes must contain visible, non-zero travel for O5 and O1");
  }

  for (const id of ["O1", "D1", "D5"] as const) {
    const crossing = pointSegmentDistance(
      tacticalPositions[id],
      tacticalPositions.O5,
      landmarks.screenAnchor,
    );
    const minimum = playerRadius("O5") + playerRadius(id) + 0.02;
    if (crossing.t > 0.02 && crossing.t < 0.98 && crossing.distance < minimum) {
      throw new Error(`formation route O5→screenAnchor crosses initial ${id} body space`);
    }
  }

  const teammateCrossing = pointSegmentDistance(
    tacticalPositions.O5,
    tacticalPositions.O1,
    landmarks.handlerWaitingPoint,
  );
  if (
    teammateCrossing.t > 0.02 &&
    teammateCrossing.t <= 1 &&
    teammateCrossing.distance < playerRadius("O1") + playerRadius("O5") + 0.02
  ) {
    throw new Error("formation route O1→handlerWaitingPoint crosses O5 body space");
  }
}

function validateF00LandmarkTopology(
  tacticalPositions: InitialPlayerPositions,
  landmarks: TacticalLandmarks,
): void {
  const origin = tacticalPositions.O1;
  if (
    landmarks.useGate.x <= origin.x + 0.2 ||
    landmarks.rejectGate.x >= origin.x - 0.2 ||
    landmarks.useGate.x <= landmarks.rejectGate.x
  ) {
    throw new Error(
      "formation landmark topology requires useGate on the screen side and rejectGate on the opposite side",
    );
  }
  assertLandmarkClearance(
    "handlerWaitingPoint",
    landmarks.handlerWaitingPoint,
    playerRadius("O1"),
    "initial O5",
    tacticalPositions.O5,
    playerRadius("O5"),
  );
}

function matchesApprovedF00Offsets(offsets: FormationLandmarkOffsets): boolean {
  return ([
    "screenAnchor",
    "handlerWaitingPoint",
    "useGate",
    "rejectGate",
  ] as const).every(
    (name) =>
      Math.abs(offsets[name].x - FORMATION_LANDMARK_OFFSETS[name].x) <= 1e-9 &&
      Math.abs(offsets[name].y - FORMATION_LANDMARK_OFFSETS[name].y) <= 1e-9,
  );
}

export function deriveTacticalLandmarks(
  startMode: PnrStartMode,
  initialPositions: Readonly<InitialPlayerPositions>,
  screenSide: ScreenSide,
  inputOffsets?: Readonly<FormationLandmarkOffsets>,
): TacticalLandmarks {
  if (startMode === "preset_pnr") {
    if (inputOffsets !== undefined) {
      throw new Error("formationLandmarkOffsets are only valid when startMode is form_pnr");
    }
    return copyTacticalLandmarks(PRESET_PNR_TACTICAL_LANDMARKS);
  }

  const offsets = validateFormationLandmarkOffsets(
    inputOffsets ?? FORMATION_LANDMARK_OFFSETS,
  );
  const tacticalPositions = Object.fromEntries(
    PLAYER_IDS.map((id) => [id, toTacticalPoint(initialPositions[id], screenSide)]),
  ) as unknown as InitialPlayerPositions;
  const origin = tacticalPositions.O1;
  const offsetPoint = (offset: Vec2): Vec2 => ({
    x: round(origin.x + offset.x, 6),
    y: round(origin.y + offset.y, 6),
  });
  const landmarks: TacticalLandmarks = {
    screenAnchor: offsetPoint(offsets.screenAnchor),
    handlerWaitingPoint: offsetPoint(offsets.handlerWaitingPoint),
    useGate: offsetPoint(offsets.useGate),
    rejectGate: offsetPoint(offsets.rejectGate),
  };

  assertLandmarkInsideCourt("screenAnchor", landmarks.screenAnchor, playerRadius("O5"));
  assertLandmarkInsideCourt(
    "handlerWaitingPoint",
    landmarks.handlerWaitingPoint,
    playerRadius("O1"),
  );
  assertLandmarkInsideCourt("useGate", landmarks.useGate, playerRadius("O1"));
  assertLandmarkInsideCourt("rejectGate", landmarks.rejectGate, playerRadius("O1"));
  assertLandmarkClearance(
    "screenAnchor",
    landmarks.screenAnchor,
    playerRadius("O5"),
    "handlerWaitingPoint",
    landmarks.handlerWaitingPoint,
    playerRadius("O1"),
  );
  assertLandmarkClearance(
    "screenAnchor",
    landmarks.screenAnchor,
    playerRadius("O5"),
    "useGate",
    landmarks.useGate,
    playerRadius("O1"),
  );
  assertLandmarkClearance(
    "screenAnchor",
    landmarks.screenAnchor,
    playerRadius("O5"),
    "rejectGate",
    landmarks.rejectGate,
    playerRadius("O1"),
  );
  for (const id of ["O1", "D1", "D5"] as const) {
    assertLandmarkClearance(
      "screenAnchor",
      landmarks.screenAnchor,
      playerRadius("O5"),
      `initial ${id}`,
      tacticalPositions[id],
      playerRadius(id),
    );
  }
  validateF00LandmarkTopology(tacticalPositions, landmarks);
  validateFormationRoutes(tacticalPositions, landmarks);
  if (!matchesApprovedF00Offsets(offsets)) {
    throw new Error(
      "form_pnr currently accepts only the approved F00 landmark template",
    );
  }
  return copyTacticalLandmarks(landmarks);
}

function landmarksToWorld(
  tacticalLandmarks: Readonly<TacticalLandmarks>,
  screenSide: ScreenSide,
): TacticalLandmarks {
  if (screenSide === "right") return copyTacticalLandmarks(tacticalLandmarks);
  return {
    screenAnchor: mirrorPointAcrossCenterline(tacticalLandmarks.screenAnchor),
    handlerWaitingPoint: mirrorPointAcrossCenterline(tacticalLandmarks.handlerWaitingPoint),
    useGate: mirrorPointAcrossCenterline(tacticalLandmarks.useGate),
    rejectGate: mirrorPointAcrossCenterline(tacticalLandmarks.rejectGate),
  };
}

export function copyInitialPlayerPositions(
  input: InitialPlayerPositions,
): InitialPlayerPositions {
  return {
    O1: { ...input.O1 },
    O5: { ...input.O5 },
    D1: { ...input.D1 },
    D5: { ...input.D5 },
  };
}

export function validateInitialPlayerPositions(input: unknown): InitialPlayerPositions {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("initialPositions must be an object containing O1, O5, D1, and D5");
  }

  const record = input as Partial<Record<PlayerId, unknown>>;
  const positions = {} as InitialPlayerPositions;
  for (const id of PLAYER_IDS) {
    const candidate = record[id];
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error(`initialPositions.${id} is required and must contain finite x/y coordinates`);
    }
    const point = candidate as Partial<Vec2>;
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new Error(`initialPositions.${id}.x and .y must be finite numbers`);
    }
    const pos = { x: point.x as number, y: point.y as number };
    const radius = playerRadius(id);
    if (
      pos.x < radius ||
      pos.x > COURT.width - radius ||
      pos.y < radius ||
      pos.y > COURT.height - radius
    ) {
      throw new Error(
        `initialPositions.${id} (${pos.x}, ${pos.y}) places the body outside the court`,
      );
    }
    positions[id] = pos;
  }

  for (let firstIndex = 0; firstIndex < PLAYER_IDS.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < PLAYER_IDS.length; secondIndex += 1) {
      const first = PLAYER_IDS[firstIndex];
      const second = PLAYER_IDS[secondIndex];
      const minimumDistance = playerRadius(first) + playerRadius(second);
      const actualDistance = distance(positions[first], positions[second]);
      if (actualDistance < minimumDistance - 1e-9) {
        throw new Error(
          `initialPositions ${first}/${second} overlap: ${round(actualDistance, 3)}m < ${round(minimumDistance, 3)}m`,
        );
      }
    }
  }

  return copyInitialPlayerPositions(positions);
}

interface WorldInitializationInput {
  initialPositions: InitialPlayerPositions;
  screenSide: ScreenSide;
  startMode: PnrStartMode;
  tacticalLandmarks: TacticalLandmarks;
  o1MaxSpeed: number;
  d1FrontReactionDelay: number;
  d1PostCatchRecoveryDelay: number;
}

function initialWorld(input: WorldInitializationInput): WorldState {
  const positions = input.initialPositions;
  return {
    tick: 0,
    time: 0,
    screenSide: input.screenSide,
    landmarks: landmarksToWorld(input.tacticalLandmarks, input.screenSide),
    tacticalLandmarks: copyTacticalLandmarks(input.tacticalLandmarks),
    formation: {
      mode: input.startMode,
      phase: input.startMode === "form_pnr" ? "formation" : "pnr",
      screenSet: false,
      screenSetTick: null,
      jointReady: false,
      jointReadyTick: null,
      enteredPnrAtTick: input.startMode === "form_pnr" ? null : 0,
      deadlineAt: input.startMode === "form_pnr" ? FORMATION_TIMEOUT_SECONDS : null,
      abortedReason: null,
    },
    players: {
      O1: makePlayer("O1", "offense", positions.O1, input.o1MaxSpeed),
      O5: makePlayer("O5", "offense", positions.O5, 2.92),
      D1: makePlayer("D1", "defense", positions.D1, 3.64),
      D5: makePlayer("D5", "defense", positions.D5, 3.22),
    },
    ballOwner: "O1",
    ball: {
      pos: { ...positions.O1 },
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
    seal: { ...EMPTY_SEAL, frontReactionDelay: input.d1FrontReactionDelay },
    postCatch: {
      ...EMPTY_POST_CATCH,
      d1RecoveryDelay: input.d1PostCatchRecoveryDelay,
      d1RecoveryReadyIn: input.d1PostCatchRecoveryDelay,
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
    screenSide: world.screenSide,
    landmarks: team === "offense"
      ? copyTacticalLandmarks(world.landmarks)
      : { screenAnchor: { ...world.landmarks.screenAnchor } },
    formation: { ...world.formation },
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

function offenseLocalLandmark(
  observation: PublicObservation,
  name: "handlerWaitingPoint" | "useGate" | "rejectGate",
): Vec2 {
  const point = observation.landmarks[name];
  if (observation.team !== "offense" || !point) {
    throw new Error(`offense planner landmark ${name} is unavailable outside the offense view`);
  }
  return point;
}

function defensePublicReadTargets(observation: PublicObservation): {
  use: Vec2;
  reject: Vec2;
} {
  const anchor = observation.landmarks.screenAnchor;
  return {
    use: {
      x: round(anchor.x + 0.76, 6),
      y: round(anchor.y - 0.9, 6),
    },
    reject: {
      x: round(anchor.x - 2.44, 6),
      y: round(anchor.y - 0.8, 6),
    },
  };
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
  const firstTarget = candidate === "USE_RIGHT_SCREEN"
    ? offenseLocalLandmark(observation, "useGate")
    : offenseLocalLandmark(observation, "rejectGate");
  let exposedSteps = 0;

  for (let i = 0; i < horizonSteps; i += 1) {
    ball = movePointToward(ball, firstTarget, 3.45 * step);
    screener = movePointToward(screener, observation.landmarks.screenAnchor, 2.75 * step);
    let defenderStep = scale(normalize(sub(ball, defender)), 3.48 * step);
    const screenReady = distance(screener, observation.landmarks.screenAnchor) < 0.18;
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

function offenseDecisionPhase(
  observation: PublicObservation,
  currentPlan: TeamPlan | null,
): DecisionPhase {
  if (observation.formation.phase === "formation") return "offense_formation";
  if (observation.ballOwner === "O5" || observation.postCatch.active) {
    return "offense_post_catch";
  }
  if (observation.facts.matchupExchange) return "offense_mismatch";
  const currentUnderRead =
    currentPlan?.id === "ATTACK_UNDER_GAP" ||
    currentPlan?.id === "TAKE_UNDER_PULLUP" ||
    currentPlan?.id === "RESET_UNDER";
  const deliveredUnderCommit = observation.triggerEvents.some(
    (event) => event.type === "under_committed",
  );
  if (observation.under.active && (currentUnderRead || deliveredUnderCommit)) {
    return "offense_under_read";
  }
  return "offense_initial_read";
}

function defenseDecisionPhase(observation: PublicObservation): DecisionPhase {
  if (observation.formation.phase === "formation") return "defense_formation";
  if (observation.ballOwner === "O5" || observation.postCatch.active) {
    return "defense_post_catch";
  }
  if (observation.facts.matchupExchange) return "defense_mismatch";
  return "defense_initial_coverage";
}

function evaluateOffenseCandidates(
  observation: PublicObservation,
  currentPlan: TeamPlan | null,
  strategy: TeamStrategyProfile,
  decisionPhase: DecisionPhase,
): CandidateEvaluation[] {
  if (decisionPhase === "offense_formation") {
    const baseScore = currentPlan?.id === "FORM_SCREEN" ? 1.2 : 1;
    const strategyScore = scoreCandidateWithStrategy(strategy, decisionPhase, {
      planId: "FORM_SCREEN",
      feasible: true,
      baseScore,
    });
    return [{
      id: "FORM_SCREEN",
      label: "从偏移起手形成掩护",
      feasible: true,
      score: strategyScore.effectiveScore,
      ...strategyScore,
      vetoes: [],
      evidence: [
        "公开 startMode=form_pnr：O1 到等待点，O5 连续移动到实例掩护锚点",
        "形成阶段不读取防守隐藏计划，也不提前选择 use/reject",
      ],
    }];
  }

  if (decisionPhase === "offense_under_read") {
    const geometry = evaluateUnderReadGeometry(observation);
    const candidates: OffensePlanId[] = [
      "ATTACK_UNDER_GAP",
      "TAKE_UNDER_PULLUP",
      "RESET_UNDER",
    ];
    return candidates.map((id) => {
      const vetoes: string[] = [];
      if (!observation.under.active) vetoes.push("D1 尚未公开完成走下方");
      if (observation.branch !== "use") vetoes.push("UNDER 二级读取只属于已使用掩护分支");
      if (observation.ballOwner !== "O1" || observation.ball.inFlight) {
        vetoes.push("O1 必须保持合法持球才能读取 UNDER 后空间");
      }
      if (id === "ATTACK_UNDER_GAP") {
        if (!geometry.bestHip) {
          vetoes.push("D5 两侧髋部都没有不穿过球员身体的合法路线");
        } else if (!geometry.attackFeasible) {
          vetoes.push(
            `O1 到优势点 ETA ${round(geometry.bestHip.attackEta, 3)}s 未领先 D1 恢复 / D5 contain`,
          );
        }
      }
      if (id === "TAKE_UNDER_PULLUP") {
        if (!geometry.d5DeepRetreat) {
          vetoes.push("D5 尚未真实深沉退；贴住 O5 或靠近持球线不能声明空位中投");
        }
        if (geometry.pullupBodyGap < UNDER_PULLUP_MIN_BODY_CLEARANCE) {
          vetoes.push(
            `D5–O1 预计身体净空 ${round(geometry.pullupBodyGap, 3)}m，不足以形成无干扰处理窗`,
          );
        }
        if (geometry.pullupContest) {
          vetoes.push("D5 已进入 O1→篮筐的合理投篮 contest 走廊");
        }
        if (!geometry.canStopForPullup) {
          vetoes.push("O1 无法在当前速度和场内距离内真实减速形成处理点");
        }
        if (
          geometry.d1PullupRecoveryEta < geometry.stoppingTime + 0.08 ||
          geometry.d5PullupContestEta < geometry.stoppingTime + 0.08
        ) {
          vetoes.push("O1 减速前 D1 可恢复或 D5 可形成真实干扰");
        }
      }

      const timingMargin = geometry.bestHip?.timingMargin ?? -1;
      const etaEdge = Math.min(
        geometry.d1PullupRecoveryEta,
        geometry.d5PullupContestEta,
      ) - geometry.stoppingTime;
      const base =
        id === "ATTACK_UNDER_GAP"
          ? 2.6 +
            timingMargin * 1.2 +
            (geometry.o5TethersD5 ? 0.65 : 0) -
            (geometry.d5DeepRetreat ? 0.65 : 0)
          : id === "TAKE_UNDER_PULLUP"
            ? 3.6 +
              clamp(geometry.pullupBodyGap, 0, 1.2) * 0.25 +
              clamp(etaEdge, 0, 1) * 0.4 +
              (geometry.d5DeepRetreat ? 0.8 : 0)
            : 1.15 + (geometry.d5Contest || geometry.d5ContainsBall ? 0.3 : 0);
      const hysteresis = currentPlan?.id === id ? 0.26 : 0;
      const baseScore = vetoes.length === 0 ? round(base + hysteresis) : null;
      const strategyScore = scoreCandidateWithStrategy(strategy, decisionPhase, {
        planId: id,
        feasible: vetoes.length === 0,
        baseScore,
      });
      const evidence = id === "ATTACK_UNDER_GAP"
        ? [
            geometry.bestHip
              ? `${geometry.bestHip.side === "left" ? "左" : "右"}髋路线净空 ${round(geometry.bestHip.routeClearance, 3)}m`
              : "两侧髋部均无合法路线",
            geometry.bestHip
              ? `O1 ETA ${round(geometry.bestHip.attackEta, 3)}s / D1 恢复 ${round(geometry.bestHip.d1RecoveryEta, 3)}s / D5 contain ${round(geometry.bestHip.d5ContainEta, 3)}s`
              : "无可比较的髋部 ETA",
            geometry.o5TethersD5
              ? `O5 真实牵制 D5：D5–O5 ${round(geometry.d5O5Distance, 2)}m`
              : `D5 已离开 O5 牵制半径：D5–O5 ${round(geometry.d5O5Distance, 2)}m`,
          ]
        : id === "TAKE_UNDER_PULLUP"
          ? [
              `预计停步距离 ${round(geometry.stoppingDistance, 3)}m / 时间 ${round(geometry.stoppingTime, 3)}s`,
              `预计 D5–O1 身体净空 ${round(geometry.pullupBodyGap, 3)}m`,
              `D1 恢复 ETA ${round(geometry.d1PullupRecoveryEta, 3)}s / D5 contest ETA ${round(geometry.d5PullupContestEta, 3)}s`,
              geometry.d5DeepRetreat
                ? "D5 已真实深沉退且未进入投篮 contest 走廊"
                : "D5 仍贴 O5 或靠近持球线，不构成空位中投证据",
            ]
          : [
              geometry.d5Contest
                ? "D5 已真实上提到持球 contest 位置，进攻先安全收住"
                : "突破与急停证据都不足，保留球权并安全收住",
              `D5 contain 线距离 ${round(geometry.d5ContainLineDistance, 3)}m`,
            ];
      return {
        id,
        label:
          id === "ATTACK_UNDER_GAP"
            ? "攻击 UNDER 缝隙"
            : id === "TAKE_UNDER_PULLUP"
              ? "急停读取中距离"
              : "安全收住 UNDER 回合",
        feasible: vetoes.length === 0,
        score: strategyScore.effectiveScore,
        ...strategyScore,
        vetoes,
        evidence,
      };
    });
  }

  const screenOnRight = observation.landmarks.screenAnchor.x > observation.players.O1.pos.x;
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
    const baseScore = vetoes.length === 0 ? round(rollout.score + hysteresis) : null;
    const strategyScore = scoreCandidateWithStrategy(strategy, decisionPhase, {
      planId: id,
      feasible: vetoes.length === 0,
      baseScore,
    });
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
      score: strategyScore.effectiveScore,
      ...strategyScore,
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
  const publicReadTargets = defensePublicReadTargets(observation);
  const inferredBallTarget = postSwitch
    ? observation.players.D5.pos.x >= observation.players.O1.pos.x
      ? v(5.12, 2.55)
      : v(6.58, 2.55)
    : isReject
      ? publicReadTargets.reject
      : publicReadTargets.use;

  for (let i = 0; i < horizonSteps; i += 1) {
    ball = movePointToward(ball, inferredBallTarget, 3.35 * step);
    const clearTarget =
      inferredBallTarget.x < 5.5 ? v(7.15, 2.35) : v(3.05, 2.35);
    screener = movePointToward(
      screener,
      postSwitch && visibleSealCut
        ? v(5.45, 3.55)
        : postSwitch
          ? clearTarget
          : observation.landmarks.screenAnchor,
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
        ? underAlignment
          ? underD5ContainPoint(ball, screener)
          : underScreenPoint(screener, 0.42)
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
  strategy: TeamStrategyProfile,
  decisionPhase: DecisionPhase,
): CandidateEvaluation[] {
  if (decisionPhase === "defense_formation") {
    const baseScore = currentPlan?.id === "TRACK_FORMATION" ? 1.2 : 1;
    const strategyScore = scoreCandidateWithStrategy(strategy, decisionPhase, {
      planId: "TRACK_FORMATION",
      feasible: true,
      baseScore,
    });
    return [{
      id: "TRACK_FORMATION",
      label: "保持原对位跟随形成",
      feasible: true,
      score: strategyScore.effectiveScore,
      ...strategyScore,
      vetoes: [],
      evidence: [
        "D1 保持 O1 责任，D5 跟随 O5；screen_set 前不接管持球人",
        "形成阶段不读取进攻隐藏计划，也不提前选择换防",
      ],
    }];
  }

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
    const baseScore = vetoes.length === 0 ? round(rollout.score + hysteresis) : null;
    const strategyScore = scoreCandidateWithStrategy(strategy, decisionPhase, {
      planId: id,
      feasible: vetoes.length === 0,
      baseScore,
    });
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
      score: strategyScore.effectiveScore,
      ...strategyScore,
      vetoes,
      evidence: [
        ...rollout.evidence,
        currentPlan?.id === id ? "保持队内承诺：滞回 +0.28" : "切换成本已计入",
      ],
    };
  });
}

function chooseCandidate(candidates: CandidateEvaluation[]): CandidateEvaluation {
  const feasible = candidates.filter(
    (candidate) => candidate.feasible && candidate.effectiveScore !== null,
  );
  if (feasible.length === 0) throw new Error("No feasible team plan");
  return [...feasible].sort(
    (a, b) => (b.effectiveScore ?? -Infinity) - (a.effectiveScore ?? -Infinity),
  )[0];
}

function routeTrackFromProof(
  playerId: PlayerId,
  start: Vec2,
  proof: StagedBodyRouteProof,
  phases: readonly string[],
  maxSpeeds: readonly number[],
  arriveRadii: readonly number[],
): TeamRouteTrack {
  let from = { ...start };
  const segments = proof.waypoints.map((target, index): TeamRouteSegment => {
    const segment = {
      phase: phases[index] ?? phases.at(-1) ?? "route_segment",
      target: { ...target },
      maxSpeed: maxSpeeds[index] ?? maxSpeeds.at(-1) ?? 0,
      ...(index < proof.waypoints.length - 1
        ? {
            minimumCruiseSpeed: Math.min(
              maxSpeeds[index] ?? maxSpeeds.at(-1) ?? 0,
              1.65,
            ),
          }
        : {}),
      arriveRadius: index < proof.waypoints.length - 1
        ? Math.min(arriveRadii[index] ?? 0.018, 0.018)
        : arriveRadii[index] ?? arriveRadii.at(-1) ?? 0.08,
      advanceSubject: playerId,
      passageHalfPlane: routePassageHalfPlane(from, target),
      proof: {
        ...proof.segmentProofs[index],
        blockerIds: [...(proof.segmentProofs[index]?.blockerIds ?? [])],
        ...(proof.segmentProofs[index]?.releasesExistingContactByBlocker
          ? {
              releasesExistingContactByBlocker: [
                ...proof.segmentProofs[index].releasesExistingContactByBlocker!,
              ],
            }
          : {}),
      },
    };
    from = { ...target };
    return segment;
  });
  return {
    playerId,
    segments,
    segmentIndex: 0,
    reachedAtTick: segments.map(() => null),
  };
}

function holdRouteTrack(
  playerId: PlayerId,
  point: Vec2,
  tick: number,
  phase: string,
): TeamRouteTrack {
  return {
    playerId,
    segments: [{
      phase,
      target: { ...point },
      maxSpeed: 0,
      arriveRadius: 0.04,
      advanceSubject: playerId,
      passageHalfPlane: null,
      proof: {
        snapshotTick: tick,
        legal: true,
        courtLegal: true,
        minimumBodyClearance: COURT.width,
        blockerIds: [],
      },
    }],
    segmentIndex: 0,
    reachedAtTick: [null],
  };
}

function makeUnderRoutePayload(
  version: number,
  world: WorldState,
  commitSeconds: number,
  boundary: TeamPlanRoute["boundary"],
  kind: TeamPlanRoute["kind"],
  tracks: TeamPlanRoute["tracks"],
): TeamPlanRoute {
  return {
    routeVersion: version,
    boundary,
    kind,
    committedAtTick: world.tick,
    minimumCommitUntilTick: world.tick + Math.ceil(commitSeconds / FIXED_DT),
    tracks,
    fallback: "hold_until_replan",
  };
}

function safeUnderRoute(
  team: Team,
  version: number,
  world: WorldState,
  commitSeconds: number,
  boundary: TeamPlanRoute["boundary"],
): TeamPlanRoute {
  const ids = team === "offense" ? OFFENSE_IDS : DEFENSE_IDS;
  return makeUnderRoutePayload(
    version,
    world,
    commitSeconds,
    boundary,
    "under_safe_hold",
    Object.fromEntries(
      ids.map((id) => [
        id,
        holdRouteTrack(id, world.players[id].pos, world.tick, "safe_hold"),
      ]),
    ) as Partial<Record<PlayerId, TeamRouteTrack>>,
  );
}

function buildUnderPreClearOffenseRoute(
  world: WorldState,
  version: number,
  commitSeconds: number,
): TeamPlanRoute {
  const observation = createPlannerObservation(world, "offense");
  const useRoute = underPreClearUseRouteProof(observation);
  if (!useRoute) {
    return safeUnderRoute("offense", version, world, commitSeconds, "under_read");
  }
  const o1Track = routeTrackFromProof(
    "O1",
    world.players.O1.pos,
    useRoute,
    useRoute.waypoints.map((_, index) =>
      index === useRoute.waypoints.length - 1 ? "clear_screen_exit" : "use_outer_tangent"
    ),
    useRoute.waypoints.map(() => 2.92),
    useRoute.waypoints.map((_, index) =>
      index === useRoute.waypoints.length - 1 ? 0.07 : 0.055
    ),
  );
  return makeUnderRoutePayload(
    version,
    world,
    commitSeconds,
    "under_read",
    "under_preclear_use",
    {
      O1: o1Track,
      O5: holdRouteTrack("O5", world.landmarks.screenAnchor, world.tick, "hold_screen"),
    },
  );
}

function buildUnderRollProof(
  world: WorldState,
  target: Vec2,
): StagedBodyRouteProof | null {
  const o5 = world.players.O5;
  const blockers: RouteProofBlocker[] = [
    { id: "O1", pos: world.players.O1.pos, radius: world.players.O1.radius },
    { id: "D1", pos: world.players.D1.pos, radius: world.players.D1.radius },
    { id: "D5", pos: world.players.D5.pos, radius: world.players.D5.radius },
  ];
  const direct = proveUnderCompositeBodyRoute(
    o5.pos,
    target,
    o5.radius,
    blockers,
    world.tick,
  );
  return direct;
}

function buildUnderPostClearOffenseRoute(
  chosenId: OffensePlanId,
  world: WorldState,
  version: number,
  commitSeconds: number,
): TeamPlanRoute {
  const boundary: TeamPlanRoute["boundary"] = "screen_cleared";
  if (chosenId === "RESET_UNDER") {
    const rollerTarget = movePointToward(world.players.O5.pos, COURT.hoop, 2.3);
    const rollProof = buildUnderRollProof(world, rollerTarget);
    if (!rollProof) {
      return safeUnderRoute("offense", version, world, commitSeconds, boundary);
    }
    return makeUnderRoutePayload(
      version,
      world,
      commitSeconds,
      boundary,
      "under_postclear_reset",
      {
        O1: holdRouteTrack("O1", world.players.O1.pos, world.tick, "controlled_reset"),
        O5: routeTrackFromProof(
          "O5",
          world.players.O5.pos,
          rollProof,
          rollProof.waypoints.map((_, index) =>
            index === rollProof.waypoints.length - 1 ? "roll_occupy" : "roll_tangent"
          ),
          rollProof.waypoints.map(() => 2.5),
          rollProof.waypoints.map((_, index) =>
            index === rollProof.waypoints.length - 1 ? 0.11 : 0.018
          ),
        ),
      },
    );
  }
  const geometry = evaluateUnderReadGeometry(createPlannerObservation(world, "offense"));
  const o1Target = chosenId === "ATTACK_UNDER_GAP"
    ? geometry.bestHip?.target
    : chosenId === "TAKE_UNDER_PULLUP"
      ? geometry.pullupPoint
      : undefined;
  if (!o1Target) {
    return safeUnderRoute("offense", version, world, commitSeconds, boundary);
  }
  const o1 = world.players.O1;
  const o5 = world.players.O5;
  const o1Proof = proveUnderCompositeBodyRoute(
    o1.pos,
    o1Target,
    o1.radius,
    [
      { id: "O5", pos: o5.pos, radius: o5.radius },
      { id: "D1", pos: world.players.D1.pos, radius: world.players.D1.radius },
      { id: "D5", pos: world.players.D5.pos, radius: world.players.D5.radius },
    ],
    world.tick,
  );
  if (!o1Proof) {
    return safeUnderRoute("offense", version, world, commitSeconds, boundary);
  }
  const rollerTarget = movePointToward(o5.pos, COURT.hoop, 2.3);
  const rollProof = buildUnderRollProof(world, rollerTarget);
  if (!rollProof) {
    return safeUnderRoute("offense", version, world, commitSeconds, boundary);
  }

  const o1Track = routeTrackFromProof(
    "O1",
    o1.pos,
    o1Proof,
    [chosenId === "TAKE_UNDER_PULLUP" ? "pullup_approach" : "attack_under_hip"],
    [chosenId === "TAKE_UNDER_PULLUP" ? Math.min(2.82, o1.maxSpeed) : o1.maxSpeed],
    [chosenId === "TAKE_UNDER_PULLUP" ? 0.07 : 0.09],
  );
  const rollTrack = routeTrackFromProof(
    "O5",
    o5.pos,
    rollProof,
    rollProof.waypoints.map((_, index) =>
      index === rollProof.waypoints.length - 1 ? "roll_occupy" : "roll_tangent"
    ),
    rollProof.waypoints.map(() => 2.82),
    rollProof.waypoints.map(() => 0.11),
  );

  const o1PathTarget = o1Proof.waypoints.at(-1) ?? o1.pos;
  const o5PathTarget = rollProof.waypoints.at(-1) ?? o5.pos;
  const corridorsOverlap =
    segmentSegmentDistance(o1.pos, o1PathTarget, o5.pos, o5PathTarget) <
    o1.radius + o5.radius + UNDER_ROUTE_MIN_BODY_CLEARANCE;
  if (corridorsOverlap && rollTrack.segments.length > 0) {
    const o1Direction = normalize(sub(o1PathTarget, o1.pos));
    const o1Length = Math.max(0.001, distance(o1.pos, o1PathTarget));
    const crossing = pointSegmentDistance(o5.pos, o1.pos, o1PathTarget);
    const releaseT = clamp(
      crossing.t + (o1.radius + o5.radius + UNDER_ROUTE_MIN_BODY_CLEARANCE) / o1Length,
      0,
      1,
    );
    const releasePoint = pointOnSegmentAt(o1.pos, o1PathTarget, releaseT);
    rollTrack.segments.unshift({
      phase: "hold_for_handler_corridor",
      target: { ...o5.pos },
      maxSpeed: 0,
      arriveRadius: 0.04,
      advanceSubject: "O1",
      passageHalfPlane: {
        normal: o1Direction,
        offset: dot(releasePoint, o1Direction),
        epsilon: 0.015,
      },
      proof: {
        snapshotTick: world.tick,
        legal: true,
        courtLegal: true,
        minimumBodyClearance: round(
          distance(o1.pos, o5.pos) - o1.radius - o5.radius,
          6,
        ),
        blockerIds: ["O1"],
      },
    });
    rollTrack.reachedAtTick.unshift(null);
  }

  return makeUnderRoutePayload(
    version,
    world,
    commitSeconds,
    boundary,
    chosenId === "TAKE_UNDER_PULLUP"
      ? "under_postclear_pullup"
      : "under_postclear_attack",
    { O1: o1Track, O5: rollTrack },
  );
}

function buildUnderPostClearRecoveryProof(
  world: WorldState,
  forceBodyExit: boolean,
): StagedBodyRouteProof | null {
  const d1 = world.players.D1;
  const d5 = world.players.D5;
  const o1 = world.players.O1;
  const o5 = world.players.O5;
  const leadO1 = add(o1.pos, scale(o1.vel, 0.13));
  leadO1.x = clamp(leadO1.x, o1.radius, COURT.width - o1.radius);
  leadO1.y = clamp(leadO1.y, o1.radius, COURT.height - o1.radius);
  const towardHoop = normalize(sub(COURT.hoop, leadO1));
  const lateral = v(-towardHoop.y, towardHoop.x);
  const awayFromO5 = normalize(sub(leadO1, o5.pos));
  const recoveryCenterDistance = d1.radius + o1.radius + 0.16;
  const directionCandidates = [
    awayFromO5,
    scale(towardHoop, -1),
    lateral,
    scale(lateral, -1),
    towardHoop,
  ].filter((direction) => length(direction) > 1e-9);
  const blockers: RouteProofBlocker[] = [
    { id: "O5", pos: o5.pos, radius: o5.radius },
    { id: "D5", pos: d5.pos, radius: d5.radius },
  ];
  let routeStart = d1.pos;
  let bodyExitProof: StagedBodyRouteProof | null = null;
  if (forceBodyExit) {
    const exitDirection = normalize(add(
      normalize(sub(d1.pos, o5.pos)),
      scale(normalize(sub(d1.pos, d5.pos)), 0.42),
    ));
    const bodyExit = add(d1.pos, scale(exitDirection, 0.34));
    bodyExit.x = clamp(bodyExit.x, d1.radius, COURT.width - d1.radius);
    bodyExit.y = clamp(bodyExit.y, d1.radius, COURT.height - d1.radius);
    const proof = proveStagedBodyRoute(
      d1.pos,
      [bodyExit],
      d1.radius,
      blockers,
      world.tick,
    );
    if (!proof.legal) return null;
    bodyExitProof = proof;
    routeStart = bodyExit;
  }
  const routeCandidates: Array<{
    proof: StagedBodyRouteProof;
    hoopSideExit: boolean;
    exitDepth: number;
    directionIndex: number;
  }> = [];

  directionCandidates.forEach((direction, directionIndex) => {
    const target = add(leadO1, scale(direction, recoveryCenterDistance));
    if (!playerPointInsideCourt(target, d1.radius)) return;
    if (
      blockers.some(
        (blocker) =>
          distance(target, blocker.pos) - d1.radius - blocker.radius <
          UNDER_ROUTE_MIN_BODY_CLEARANCE,
      )
    ) return;

    const direct = proveStagedBodyRoute(
      routeStart,
      [target],
      d1.radius,
      blockers,
      world.tick,
    );
    const rawRoutes: StagedBodyRouteProof[] = direct.legal ? [direct] : [];
    for (const blocker of blockers) {
      for (const tangent of buildTangentRouteProof(
        routeStart,
        target,
        d1.radius,
        blocker,
        world.tick,
      )) {
        if (!tangent.legal) continue;
        const allBodies = proveStagedBodyRoute(
          routeStart,
          tangent.waypoints,
          d1.radius,
          blockers,
          world.tick,
        );
        if (allBodies.legal) rawRoutes.push(allBodies);
      }
    }
    for (const proof of rawRoutes) {
      const committedProof = bodyExitProof
        ? {
            legal: true,
            length: bodyExitProof.length + proof.length,
            minimumBodyClearance: Math.min(
              bodyExitProof.minimumBodyClearance,
              proof.minimumBodyClearance,
            ),
            waypoints: [...bodyExitProof.waypoints, ...proof.waypoints],
            segmentProofs: [
              ...bodyExitProof.segmentProofs,
              ...proof.segmentProofs,
            ],
          }
        : proof;
      const exit = committedProof.waypoints[0] ?? target;
      const exitDepth = dot(sub(exit, o5.pos), normalize(sub(COURT.hoop, o5.pos)));
      routeCandidates.push({
        proof: committedProof,
        hoopSideExit: exitDepth >= -0.02,
        exitDepth,
        directionIndex,
      });
    }
  });

  return routeCandidates.sort(
    (first, second) =>
      Number(second.hoopSideExit) - Number(first.hoopSideExit) ||
      first.proof.length - second.proof.length ||
      second.exitDepth - first.exitDepth ||
      first.directionIndex - second.directionIndex,
  )[0]?.proof ?? null;
}

function buildUnderPreClearRollerResponsibilityProof(
  world: WorldState,
): StagedBodyRouteProof | null {
  const d5 = world.players.D5;
  const o5 = world.players.O5;
  const blockers: RouteProofBlocker[] = [
    { id: "O1", pos: world.players.O1.pos, radius: world.players.O1.radius },
    { id: "O5", pos: o5.pos, radius: o5.radius },
    { id: "D1", pos: world.players.D1.pos, radius: world.players.D1.radius },
  ];
  const proofClearance = 0.02;
  const touchingBlockers = blockers.filter(
    (blocker) =>
      blocker.id !== "O5" &&
      distance(d5.pos, blocker.pos) - d5.radius - blocker.radius <
        proofClearance,
  );
  const releaseDirection = normalize(
    touchingBlockers.reduce(
      (sum, blocker) => add(sum, normalize(sub(d5.pos, blocker.pos))),
      v(),
    ),
  );
  const releasePoint = touchingBlockers.length > 0 && length(releaseDirection) > 1e-9
    ? add(d5.pos, scale(releaseDirection, 0.04))
    : null;
  const releaseProof = releasePoint
    ? proveStagedBodyRoute(
        d5.pos,
        [releasePoint],
        d5.radius,
        blockers,
        world.tick,
        proofClearance,
      )
    : null;
  if (releaseProof && !releaseProof.legal) return null;
  const routeStart = releasePoint ?? d5.pos;
  const towardHoop = normalize(sub(COURT.hoop, o5.pos));
  const baseAngle = Math.atan2(towardHoop.y, towardHoop.x);
  const responsibilityRadius = d5.radius + o5.radius + UNDER_ROUTE_MIN_BODY_CLEARANCE;
  const angularOffsets = [0, 15, -15, 30, -30, 45, -45, 60, -60, 75, -75, 90, -90];
  const candidates = angularOffsets.flatMap((degrees, directionIndex) => {
    const angle = baseAngle + degrees * Math.PI / 180;
    const target = add(
      o5.pos,
      v(
        Math.cos(angle) * responsibilityRadius,
        Math.sin(angle) * responsibilityRadius,
      ),
    );
    const route = proveUnderCompositeBodyRoute(
      routeStart,
      target,
      d5.radius,
      blockers,
      world.tick,
      proofClearance,
    );
    if (!route) return [];
    const combined = releaseProof
      ? {
          legal: true,
          length: releaseProof.length + route.length,
          minimumBodyClearance: Math.min(
            releaseProof.minimumBodyClearance,
            route.minimumBodyClearance,
          ),
          waypoints: [...releaseProof.waypoints, ...route.waypoints],
          segmentProofs: [
            ...releaseProof.segmentProofs,
            ...route.segmentProofs,
          ],
        }
      : route;
    return [{
      proof: combined,
      goalSideDepth: dot(sub(target, o5.pos), towardHoop),
      directionIndex,
    }];
  });
  return candidates.sort(
    (first, second) =>
      second.goalSideDepth - first.goalSideDepth ||
      first.proof.length - second.proof.length ||
      first.directionIndex - second.directionIndex,
  )[0]?.proof ?? null;
}

function buildUnderDefenseRoute(
  world: WorldState,
  version: number,
  commitSeconds: number,
  boundary: TeamPlanRoute["boundary"],
): TeamPlanRoute {
  const d1 = world.players.D1;
  const d5 = world.players.D5;
  const o1 = world.players.O1;
  const o5 = world.players.O5;
  const postClear = world.facts.ballHandlerClearedScreen;
  const target = underScreenPoint(o5.pos);
  const selected = postClear
    ? buildUnderPostClearRecoveryProof(world, boundary === "under_blocked")
    : selectHoopSideRecoveryRoute(
        buildTangentRouteProof(
          d1.pos,
          target,
          d1.radius,
          { id: "O5", pos: o5.pos, radius: o5.radius },
          world.tick,
        ),
        o5.pos,
      );
  if (!selected) {
    return safeUnderRoute("defense", version, world, commitSeconds, boundary);
  }
  const d1Track = routeTrackFromProof(
    "D1",
    d1.pos,
    selected,
    selected.waypoints.map((_, index) =>
      index === selected.waypoints.length - 1
        ? postClear ? "recover_o1" : "under_waypoint"
        : "exit_o5_tangent"
    ),
    selected.waypoints.map(() => postClear ? 3.48 : 3.34),
    selected.waypoints.map((_, index) =>
      index === selected.waypoints.length - 1 ? 0.08 : 0.018
    ),
  );
  const d5Target = underD5ContainPoint(o1.pos, o5.pos);
  const d5CurrentContest = underContestGeometry(o1.pos, o1.radius, d5);
  const d5TowardO5 = normalize(sub(o5.pos, d5.pos));
  const d5O5ClosingSpeed = dot(d5.vel, d5TowardO5);
  const maintainExistingDeepRetreat =
    d5CurrentContest.goalSideMargin >= 0.78 &&
    distance(d5.pos, o5.pos) >= UNDER_EXISTING_DEEP_RETREAT_HOLD_DISTANCE &&
    d5O5ClosingSpeed <= UNDER_DEEP_RETREAT_MAX_ROLLER_CLOSING_SPEED &&
    !d5CurrentContest.contest;
  const d5Proof = proveStagedBodyRoute(
    d5.pos,
    [d5Target],
    d5.radius,
    [
      { id: "O1", pos: o1.pos, radius: o1.radius },
      { id: "O5", pos: o5.pos, radius: o5.radius },
    ],
    world.tick,
    0.02,
  );
  let d5RouteProof = d5Proof.legal ? d5Proof : null;
  let d5Phases = ["short_contain_o1"];
  if (!postClear) {
    d5RouteProof = buildUnderPreClearRollerResponsibilityProof(world);
    d5Phases = d5RouteProof?.waypoints.map(
      () => "establish_roller_responsibility",
    ) ?? [];
  }
  if (postClear && d5RouteProof) {
    const publicLeadO5 = add(o5.pos, scale(o5.vel, 0.22));
    publicLeadO5.x = clamp(publicLeadO5.x, o5.radius, COURT.width - o5.radius);
    publicLeadO5.y = clamp(publicLeadO5.y, o5.radius, COURT.height - o5.radius);
    const rollerDirection = normalize(sub(COURT.hoop, publicLeadO5));
    const rollerResponsibilityPoint = add(
      publicLeadO5,
      scale(rollerDirection, d5.radius + o5.radius + 0.12),
    );
    const returnStart = boundary === "under_blocked" ? d5.pos : d5Target;
    const returnProof = proveUnderCompositeBodyRoute(
      returnStart,
      rollerResponsibilityPoint,
      d5.radius,
      [
        { id: "O1", pos: o1.pos, radius: o1.radius },
        { id: "O5", pos: o5.pos, radius: o5.radius },
      ],
      world.tick,
      0.02,
    );
    if (returnProof) {
      if (boundary === "under_blocked") {
        d5RouteProof = returnProof;
        d5Phases = returnProof.waypoints.map(() => "recover_roller_responsibility");
      } else {
        d5RouteProof = {
          legal: true,
          length: d5Proof.length + returnProof.length,
          minimumBodyClearance: Math.min(
            d5Proof.minimumBodyClearance,
            returnProof.minimumBodyClearance,
          ),
          waypoints: [...d5Proof.waypoints, ...returnProof.waypoints],
          segmentProofs: [...d5Proof.segmentProofs, ...returnProof.segmentProofs],
        };
        d5Phases = d5RouteProof.waypoints.map((_, index) =>
          index === 0 ? "short_contain_o1" : "recover_roller_responsibility"
        );
      }
    }
  }
  const d5Track = maintainExistingDeepRetreat
    ? holdRouteTrack("D5", d5.pos, world.tick, "hold_roller_responsibility")
    : d5RouteProof
      ? routeTrackFromProof(
          "D5",
          d5.pos,
          d5RouteProof,
          d5Phases,
          d5RouteProof.waypoints.map(() => 2.96),
          d5RouteProof.waypoints.map((_, index) =>
            postClear && index === 0 ? 0.12 : 0.08
          ),
        )
      : holdRouteTrack("D5", d5.pos, world.tick, "hold_roller_responsibility");
  return makeUnderRoutePayload(
    version,
    world,
    commitSeconds,
    boundary,
    postClear ? "under_postclear_recovery" : "under_preclear_use",
    { D1: d1Track, D5: d5Track },
  );
}

function makeOffensePlan(
  chosen: CandidateEvaluation,
  world: WorldState,
  version: number,
): TeamPlan {
  if (chosen.id === "FORM_SCREEN") {
    return {
      team: "offense",
      id: chosen.id,
      label: chosen.label,
      version,
      startedAt: world.time,
      startedTick: world.tick,
      commitUntil: world.time + 0.72,
      watchdogAt: world.time + 1.18,
      chosenScore: chosen.score ?? 0,
      rationale:
        "公开输入要求先形成一次挡拆；O1 控速等待，O5 沿连续路线到实例掩护锚点并站定，screen_set 前不选择使用或拒绝。",
      roles: {
        O1: {
          playerId: "O1",
          roleCode: "setup_handler",
          roleLabel: "持球等待形成",
          intent: "移动到公开等待点 → 控制速度 → 等 O5 真实站定",
          owner: "offense-planner",
        },
        O5: {
          playerId: "O5",
          roleCode: "arrive_screen",
          roleLabel: "到位设掩护",
          intent: "沿合法连续路线到相对掩护点 → 减速 → 站定发布 screen_set",
          owner: "offense-planner",
        },
      },
      primaryTarget: { ...world.landmarks.handlerWaitingPoint },
      secondaryTarget: { ...world.landmarks.screenAnchor },
    };
  }

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
  let route: TeamPlanRoute | undefined;

  if (
    chosen.id === "ATTACK_UNDER_GAP" ||
    chosen.id === "TAKE_UNDER_PULLUP" ||
    chosen.id === "RESET_UNDER"
  ) {
    const underGeometry = evaluateUnderReadGeometry(
      createPlannerObservation(world, "offense"),
    );
    const rollerTarget = movePointToward(world.players.O5.pos, COURT.hoop, 2.3);
    if (chosen.id === "ATTACK_UNDER_GAP") {
      primaryTarget = underGeometry.bestHip?.target ?? { ...world.players.O1.pos };
      secondaryTarget = rollerTarget;
      roles = {
        O1: {
          playerId: "O1",
          roleCode: "attack_under_gap",
          roleLabel: "攻击走下方后的髋部缝隙",
          intent: "完成掩护肩位 → 读取 D5 两侧髋部 → 沿合法路线继续压向篮筐",
          owner: "offense-planner",
        },
        O5: {
          playerId: "O5",
          roleCode: "occupy_under_big",
          roleLabel: "顺下牵制 D5",
          intent: "离开掩护点顺下 → 占住 D5 主要责任 → 不堵住 O1 突破髋部",
          owner: "offense-planner",
        },
      };
      rationale =
        `D1 已公开走下方；${underGeometry.bestHip?.side === "left" ? "左" : "右"}髋路线合法，` +
        `O1 ETA ${round(underGeometry.bestHip?.attackEta ?? 0, 3)}s，O5 仍真实牵制 D5，因此继续突破而不是由世界直接宣布中投。`;
    } else if (chosen.id === "TAKE_UNDER_PULLUP") {
      primaryTarget = underGeometry.pullupPoint;
      secondaryTarget = rollerTarget;
      roles = {
        O1: {
          playerId: "O1",
          roleCode: "take_under_pullup",
          roleLabel: "真实减速读取中距离",
          intent: "确认 D5 深沉退且无 contest → 在速度限制下减速 → 停稳后形成处理窗",
          owner: "offense-planner",
        },
        O5: {
          playerId: "O5",
          roleCode: "roll_hold_drop",
          roleLabel: "顺下占住沉退内线",
          intent: "持续顺下 → 让 D5 必须守住篮筐与 O5 → 保留 O1 中距离净空",
          owner: "offense-planner",
        },
      };
      rationale =
        `D5 已真实深沉退，预计 O1–D5 身体净空 ${round(underGeometry.pullupBodyGap, 3)}m；` +
        "进攻选择减速处理，但窗口仍须由中立世界观察真实停步和 contest 净空。";
    } else {
      primaryTarget = { ...world.players.O1.pos };
      secondaryTarget = movePointToward(world.players.O5.pos, COURT.hoop, 1.05);
      roles = {
        O1: {
          playerId: "O1",
          roleCode: "reset_under_safe",
          roleLabel: "安全收住 UNDER 回合",
          intent: "D5 已真实 contain → 控制速度并保留球权 → 不把受干扰局面伪装成空位",
          owner: "offense-planner",
        },
        O5: {
          playerId: "O5",
          roleCode: "hold_under_spacing",
          roleLabel: "保持短顺下间距",
          intent: "保留 D5 的 O5 责任 → 不与 O1 重叠 → 等世界确认防守遏制",
          owner: "offense-planner",
        },
      };
      rationale =
        "D5 已进入真实 contain，或两种优势证据都不足；进攻安全收住，等待世界确认遏制，而不是免费获得投篮或突破。";
    }
  } else if (chosen.id === "ATTACK_BIG") {
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
    chosen.id === "ATTACK_UNDER_GAP" ||
    chosen.id === "TAKE_UNDER_PULLUP" ||
    chosen.id === "RESET_UNDER" ||
    chosen.id === "ATTACK_BIG" ||
    chosen.id === "FEED_SEAL" ||
    chosen.id === "RESET_MISMATCH" ||
    chosen.id === "POST_FINISH" ||
    chosen.id === "KICK_OUT" ||
    chosen.id === "REJECT_SLIP_PASS";
  const commitSeconds = postSwitch ? 0.52 : 0.64;
  if (
    chosen.id === "ATTACK_UNDER_GAP" ||
    chosen.id === "TAKE_UNDER_PULLUP" ||
    chosen.id === "RESET_UNDER"
  ) {
    route = world.facts.ballHandlerClearedScreen
      ? buildUnderPostClearOffenseRoute(chosen.id, world, version, commitSeconds)
      : buildUnderPreClearOffenseRoute(world, version, commitSeconds);
    primaryTarget = route.tracks.O1?.segments[0]?.target ?? primaryTarget;
    secondaryTarget = route.tracks.O5?.segments[0]?.target ?? secondaryTarget;
  }
  return {
    team: "offense",
    id: chosen.id,
    label: chosen.label,
    version,
    startedAt: world.time,
    startedTick: world.tick,
    commitUntil: world.time + commitSeconds,
    watchdogAt: world.time + (postSwitch ? 1 : 1.18),
    chosenScore: chosen.score ?? 0,
    rationale,
    roles,
    primaryTarget,
    secondaryTarget,
    passTarget,
    route,
  };
}

function makeDefensePlan(
  chosen: CandidateEvaluation,
  world: WorldState,
  version: number,
): TeamPlan {
  if (chosen.id === "TRACK_FORMATION") {
    return {
      team: "defense",
      id: chosen.id,
      label: chosen.label,
      version,
      startedAt: world.time,
      startedTick: world.tick,
      commitUntil: world.time + 0.68,
      watchdogAt: world.time + 1.12,
      chosenScore: chosen.score ?? 0,
      rationale:
        "形成阶段保持原对位：D1 继续守 O1，D5 跟随 O5；在公开 screen_set 与后续阅读边界前不提前换防。",
      roles: {
        D1: {
          playerId: "D1",
          roleCode: "contain_setup",
          roleLabel: "保持持球对位",
          intent: "跟随 O1 的等待移动 → 保持篮筐侧净空 → 不转守 O5",
          owner: "defense-planner",
        },
        D5: {
          playerId: "D5",
          roleCode: "track_screener",
          roleLabel: "跟随掩护人",
          intent: "跟随 O5 到掩护区域 → 保持合理净空 → 不提前接管 O1",
          owner: "defense-planner",
        },
      },
      primaryTarget: { ...world.landmarks.screenAnchor },
    };
  }

  let roles: Partial<Record<PlayerId, RoleAssignment>>;
  let rationale: string;
  let primaryTarget: Vec2 | undefined;
  let route: TeamPlanRoute | undefined;

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
        roleLabel: "留守 O5 并短 contain",
        intent: "保持 O5 主要责任 → 有界读取 O1–篮筐线 → 短暂 contain 但不换防",
        owner: "defense-planner",
      },
    };
    rationale =
      "D1 的公开起手深度已经位于掩护下方；防守保持原对位，D5 以 O5 为主要责任并对公开突破线做有界短 contain，不预先赠送中投或换防。";
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
  const commitSeconds =
    chosen.id === "DIG_POST"
      ? 1.12
      : chosen.id === "TAG_REJECT"
        ? 0.82
        : postSwitch
          ? 0.52
          : 0.56;
  if (chosen.id === "UNDER") {
    const routeBoundary: TeamPlanRoute["boundary"] =
      world.under.recoveryMotionUnblocked === false ||
      (world.under.d1O5CollisionSuppressedSeconds ?? 0) >=
        UNDER_COLLISION_REPLAN_TRIGGER_SECONDS
        ? "under_blocked"
        : world.facts.ballHandlerClearedScreen
          ? "screen_cleared"
          : "under_read";
    route = buildUnderDefenseRoute(
      world,
      version,
      commitSeconds,
      routeBoundary,
    );
    primaryTarget = route.tracks.D1?.segments[0]?.target;
  }

  return {
    team: "defense",
    id: chosen.id,
    label: chosen.label,
    version,
    startedAt: world.time,
    startedTick: world.tick,
    commitUntil: world.time + commitSeconds,
    watchdogAt:
      world.time +
      (chosen.id === "DIG_POST" ? 1.28 : chosen.id === "TAG_REJECT" ? 1.04 : postSwitch ? 1 : 1.08),
    roles,
    chosenScore: chosen.score ?? 0,
    rationale,
    primaryTarget,
    route,
  };
}

function activeRouteSegment(
  plan: TeamPlan,
  playerId: PlayerId,
): TeamRouteSegment | null {
  const track = plan.route?.tracks[playerId];
  if (!track) return null;
  return track.segments[track.segmentIndex] ?? null;
}

function committedRouteIntent(
  plan: TeamPlan,
  world: WorldState,
  playerId: PlayerId,
): MotionIntent {
  const segment = activeRouteSegment(plan, playerId);
  if (!segment) {
    return {
      target: { ...world.players[playerId].pos },
      maxSpeed: 0,
      arriveRadius: 0.04,
      screenNavigation: "none",
    };
  }
  return {
    target: { ...segment.target },
    maxSpeed: segment.maxSpeed,
    ...(segment.minimumCruiseSpeed !== undefined
      ? { minimumCruiseSpeed: segment.minimumCruiseSpeed }
      : {}),
    arriveRadius: segment.arriveRadius,
    screenNavigation: "none",
  };
}

function advanceTeamPlanRoute(plan: TeamPlan, world: WorldState): TeamPlan {
  if (!plan.route || plan.route.committedAtTick >= world.tick) return plan;
  let changed = false;
  const tracks = Object.fromEntries(
    Object.entries(plan.route.tracks).map(([id, existing]) => {
      if (!existing) return [id, existing];
      const track: TeamRouteTrack = {
        ...existing,
        reachedAtTick: [...existing.reachedAtTick],
        segments: existing.segments,
      };
      const segment = track.segments[track.segmentIndex];
      if (!segment) return [id, track];
      const subject = world.players[segment.advanceSubject];
      const crossedPlane = segment.passageHalfPlane
        ? dot(subject.pos, segment.passageHalfPlane.normal) +
            segment.passageHalfPlane.epsilon >=
          segment.passageHalfPlane.offset
        : false;
      const reachedOwnTarget =
        segment.advanceSubject === track.playerId &&
        distance(subject.pos, segment.target) <= segment.arriveRadius;
      if (crossedPlane || reachedOwnTarget) {
        track.reachedAtTick[track.segmentIndex] = world.tick;
        track.segmentIndex += 1;
        changed = true;
      }
      return [id, track];
    }),
  ) as Partial<Record<PlayerId, TeamRouteTrack>>;
  if (!changed) return plan;
  return {
    ...plan,
    route: {
      ...plan.route,
      tracks,
    },
  };
}

function committedRouteInProgress(plan: TeamPlan): boolean {
  return Boolean(
    plan.route &&
    Object.values(plan.route.tracks).some(
      (track) => track && track.segmentIndex < track.segments.length,
    ),
  );
}

function offensiveIntents(plan: TeamPlan, world: WorldState): Record<"O1" | "O5", MotionIntent> {
  const o1 = world.players.O1;
  if (plan.id === "FORM_SCREEN") {
    return {
      O1: {
        target: plan.primaryTarget ?? world.landmarks.handlerWaitingPoint,
        maxSpeed: 1.72,
        arriveRadius: 0.045,
      },
      O5: {
        target: plan.secondaryTarget ?? world.landmarks.screenAnchor,
        maxSpeed: 2.48,
        arriveRadius: 0.045,
      },
    };
  }

  if (
    plan.route &&
    (plan.id === "ATTACK_UNDER_GAP" ||
      plan.id === "TAKE_UNDER_PULLUP" ||
      plan.id === "RESET_UNDER")
  ) {
    return {
      O1: committedRouteIntent(plan, world, "O1"),
      O5: committedRouteIntent(plan, world, "O5"),
    };
  }

  if (plan.id === "TAKE_UNDER_PULLUP") {
    return {
      O1: {
        target: plan.primaryTarget ?? o1.pos,
        maxSpeed: 0.62,
        arriveRadius: 0.07,
      },
      O5: {
        target: world.facts.ballHandlerClearedScreen
          ? plan.secondaryTarget ?? movePointToward(world.players.O5.pos, COURT.hoop, 1.2)
          : world.landmarks.screenAnchor,
        maxSpeed: world.facts.ballHandlerClearedScreen ? 2.82 : 0.5,
        arriveRadius: world.facts.ballHandlerClearedScreen ? 0.11 : 0.055,
      },
    };
  }

  if (
    (plan.id === "ATTACK_UNDER_GAP" ||
      plan.id === "RESET_UNDER") &&
    world.facts.ballHandlerClearedScreen
  ) {
    const d5 = world.players.D5;
    const primaryTarget = plan.primaryTarget ?? o1.pos;
    const hipWon =
      distance(o1.pos, primaryTarget) <= 0.2 ||
      distance(o1.pos, COURT.hoop) + 0.12 < distance(d5.pos, COURT.hoop);
    return {
      O1: {
        target:
          plan.id === "ATTACK_UNDER_GAP" && hipWon
            ? v(5, 1.28)
            : primaryTarget,
        maxSpeed:
          plan.id === "ATTACK_UNDER_GAP"
            ? o1.maxSpeed
            : plan.id === "TAKE_UNDER_PULLUP"
              ? 0.62
              : 0.45,
        arriveRadius: plan.id === "ATTACK_UNDER_GAP" ? 0.08 : 0.07,
      },
      O5: {
        target: plan.secondaryTarget ?? movePointToward(world.players.O5.pos, COURT.hoop, 1.2),
        maxSpeed: plan.id === "RESET_UNDER" ? 1.2 : 2.82,
        arriveRadius: 0.11,
      },
    };
  }

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
    const rejectGateReached = o1.pos.y <= world.landmarks.rejectGate.y + 0.18;
    return {
      O1: {
        target: helpReadTarget && world.branch === "reject"
          ? helpReadTarget
          : world.branch === "undecided"
            ? v(3.24, 5.94)
            : !rejectGateReached
              ? world.landmarks.rejectGate
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
        target: world.branch === "reject" ? v(5.55, 3.18) : world.landmarks.screenAnchor,
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
  const useGateReached = o1.pos.y <= world.landmarks.useGate.y + 0.18;
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
      ? world.landmarks.useGate
      : shoulderAngle > (105 * Math.PI) / 180
      ? shoulderPoint(90)
      : shoulderAngle > (75 * Math.PI) / 180
        ? shoulderPoint(60)
        : shoulderAngle > (45 * Math.PI) / 180
          ? shoulderPoint(30)
          : shoulderAngle > (15 * Math.PI) / 180
            ? shoulderPoint(0)
            : world.landmarks.useGate;
  return {
    O1: {
      target: waitingForScreen
        ? world.landmarks.handlerWaitingPoint
        : world.facts.ballHandlerClearedScreen
          ? !useGateReached
            ? world.landmarks.useGate
            : v(5.72, 1.05)
          : arcTarget,
      maxSpeed: waitingForScreen ? 2.15 : world.facts.ballHandlerClearedScreen ? 3.66 : 2.92,
      arriveRadius: world.facts.ballHandlerClearedScreen ? 0.07 : 0.045,
    },
    O5: {
      target: world.facts.ballHandlerClearedScreen
        ? v(5.42, 2.25)
        : world.landmarks.screenAnchor,
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

  if (plan.id === "TRACK_FORMATION") {
    const o1ToHoop = normalize(sub(COURT.hoop, o1.pos));
    const nonScreenShade = { x: o1ToHoop.y, y: -o1ToHoop.x };
    const d1ContainPoint = add(
      add(o1.pos, scale(o1ToHoop, 0.68)),
      scale(nonScreenShade, 0.08),
    );
    const d5GoalSide = add(o5.pos, scale(normalize(sub(COURT.hoop, o5.pos)), 0.82));
    return {
      D1: {
        target: d1ContainPoint,
        maxSpeed: 3.08,
        arriveRadius: 0.08,
        screenNavigation: "none",
      },
      D5: {
        target: d5GoalSide,
        maxSpeed: 2.86,
        arriveRadius: 0.1,
        screenNavigation: "none",
      },
    };
  }

  if (plan.id === "UNDER") {
    if (plan.route) {
      return {
        D1: committedRouteIntent(plan, world, "D1"),
        D5: committedRouteIntent(plan, world, "D5"),
      };
    }
    const d1Target = world.facts.ballHandlerClearedScreen ? leadO1 : underScreenPoint(o5.pos);
    return {
      D1: {
        target: d1Target,
        maxSpeed: world.facts.ballHandlerClearedScreen ? 3.48 : 3.34,
        arriveRadius: world.facts.ballHandlerClearedScreen ? 0.46 : 0.08,
        screenNavigation: "none",
      },
      D5: {
        target: underD5ContainPoint(o1.pos, o5.pos),
        maxSpeed: 2.96,
        arriveRadius: 0.12,
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
  const maximumSetSpeed = world.formation.mode === "form_pnr"
    ? FORMATION_SCREENER_MAX_SET_SPEED
    : 0.42;
  return distance(o5.pos, world.landmarks.screenAnchor) <= 0.16 &&
    length(o5.vel) <= maximumSetSpeed;
}

export function formationReadiness(world: WorldState): FormationReadiness {
  const o1 = world.players.O1;
  const handlerInWaitingRegion =
    distance(o1.pos, world.landmarks.handlerWaitingPoint) <=
    FORMATION_HANDLER_READY_RADIUS;
  const handlerSpeedReady = length(o1.vel) <= FORMATION_HANDLER_MAX_READY_SPEED;
  const handlerOwnsBall = world.ballOwner === "O1" && !world.ball.inFlight;
  const screenerSet = screenPose(world);
  return {
    handlerInWaitingRegion,
    handlerSpeedReady,
    handlerOwnsBall,
    screenerSet,
    ready:
      handlerInWaitingRegion &&
      handlerSpeedReady &&
      handlerOwnsBall &&
      screenerSet,
  };
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

function privateRouteDeterminismFrame(route: TeamPlanRoute | undefined): unknown {
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
          target: segment.target,
          maxSpeed: segment.maxSpeed,
          minimumCruiseSpeed: segment.minimumCruiseSpeed ?? null,
          arriveRadius: segment.arriveRadius,
          advanceSubject: segment.advanceSubject,
          passageHalfPlane: segment.passageHalfPlane,
          proof: segment.proof,
        })),
      }];
    }),
  };
}

function clonePlayer(player: PlayerState): PlayerState {
  return { ...player, pos: { ...player.pos }, vel: { ...player.vel } };
}

export class PnrSimulation {
  readonly config: SimulationConfig & {
    strategies: TeamStrategySelection;
    startMode: PnrStartMode;
    tacticalLandmarks: TacticalLandmarks;
  };
  world: WorldState;
  offensePlan: TeamPlan;
  defensePlan: TeamPlan;
  readonly planningLog: PlanningRecord[] = [];
  readonly eventLog: WorldEvent[] = [];
  lastCollisionResolution: CollisionResolutionFacts = { pairs: [] };
  private offenseQueue: WorldEvent[] = [];
  private defenseQueue: WorldEvent[] = [];
  private offenseVersion = 0;
  private defenseVersion = 0;
  private readonly offenseStrategyProfile: TeamStrategyProfile;
  private readonly defenseStrategyProfile: TeamStrategyProfile;
  private readonly plannerEvaluationOrder: "offense-first" | "defense-first";
  private roundStarted = false;

  constructor(config: SimulationConfig) {
    const initialPositions = validateInitialPlayerPositions(config?.initialPositions);
    const screenSide = config?.screenSide;
    if (screenSide !== "right" && screenSide !== "left") {
      throw new Error(`screenSide must be "right" or "left"; received ${String(screenSide)}`);
    }
    const startMode = config.startMode ?? "preset_pnr";
    if (startMode !== "preset_pnr" && startMode !== "form_pnr") {
      throw new Error(
        `startMode must be "preset_pnr" or "form_pnr"; received ${String(startMode)}`,
      );
    }
    const formationLandmarkOffsets = startMode === "form_pnr"
      ? validateFormationLandmarkOffsets(
          config.formationLandmarkOffsets ?? FORMATION_LANDMARK_OFFSETS,
        )
      : config.formationLandmarkOffsets;
    const tacticalLandmarks = deriveTacticalLandmarks(
      startMode,
      initialPositions,
      screenSide,
      formationLandmarkOffsets,
    );
    const strategies = copyTeamStrategySelection(
      config.strategies ?? DEFAULT_TEAM_STRATEGY_SELECTION,
    );
    this.offenseStrategyProfile = resolveRegisteredTeamStrategy(
      strategies.offense,
      "offense",
    );
    this.defenseStrategyProfile = resolveRegisteredTeamStrategy(
      strategies.defense,
      "defense",
    );
    this.plannerEvaluationOrder = config.plannerEvaluationOrder ?? "offense-first";
    this.config = {
      initialPositions,
      screenSide,
      startMode,
      formationLandmarkOffsets: formationLandmarkOffsets
        ? copyFormationLandmarkOffsets(formationLandmarkOffsets)
        : undefined,
      tacticalLandmarks,
      seed: config.seed ?? 17,
      maxTime: config.maxTime ?? 7.4,
      d1FrontReactionDelay: clamp(config.d1FrontReactionDelay ?? 0, 0, 0.5),
      d1PostCatchRecoveryDelay: clamp(config.d1PostCatchRecoveryDelay ?? 0, 0, 0.6),
      o1MaxSpeed: clamp(config.o1MaxSpeed ?? 3.72, 3.4, 4.4),
      horizon: config.horizon ?? "pnr_resolution",
      strategies,
    };
    this.world = initialWorld({
      initialPositions: this.config.initialPositions,
      screenSide: this.config.screenSide,
      startMode: this.config.startMode,
      tacticalLandmarks: this.config.tacticalLandmarks,
      o1MaxSpeed: this.config.o1MaxSpeed,
      d1FrontReactionDelay: this.config.d1FrontReactionDelay,
      d1PostCatchRecoveryDelay: this.config.d1PostCatchRecoveryDelay,
    });
    this.offensePlan = this.replanOffense("初始边界", []);
    this.defensePlan = this.replanDefense("初始边界", []);
    this.world.stateHash = this.computeStateHash();
  }

  private replanOffense(
    trigger: string,
    triggerEvents: WorldEvent[],
    planningWorld: WorldState = this.world,
  ): TeamPlan {
    const tacticalWorld = toTacticalWorld(planningWorld);
    const observation = createPlannerObservation(tacticalWorld, "offense", triggerEvents);
    const current = this.offenseVersion > 0
      ? transformPlanFrame(this.offensePlan, this.config.screenSide)
      : null;
    const decisionPhase = offenseDecisionPhase(observation, current);
    const candidates = evaluateOffenseCandidates(
      observation,
      current,
      this.offenseStrategyProfile,
      decisionPhase,
    );
    const chosen = chooseCandidate(candidates);
    this.offenseVersion += 1;
    const tacticalPlan = makeOffensePlan(chosen, tacticalWorld, this.offenseVersion);
    const plan = transformPlanFrame(tacticalPlan, this.config.screenSide);
    this.planningLog.push({
      tick: planningWorld.tick,
      at: planningWorld.time,
      team: "offense",
      trigger,
      triggerEventIds: triggerEvents.map((event) => event.id),
      chosen: chosen.id,
      chosenLabel: chosen.label,
      decisionPhase,
      strategy: {
        id: this.offenseStrategyProfile.id,
        version: this.offenseStrategyProfile.version,
        team: "offense",
      },
      strategyBoundary: `只读取进攻策略 ${this.offenseStrategyProfile.id}@${this.offenseStrategyProfile.version}；不含防守策略`,
      candidates,
      observationBoundary: "公开世界事实 + 自队角色；不含防守隐藏计划/未来",
    });
    return plan;
  }

  private replanDefense(
    trigger: string,
    triggerEvents: WorldEvent[],
    planningWorld: WorldState = this.world,
  ): TeamPlan {
    const tacticalWorld = toTacticalWorld(planningWorld);
    const observation = createPlannerObservation(tacticalWorld, "defense", triggerEvents);
    const current = this.defenseVersion > 0
      ? transformPlanFrame(this.defensePlan, this.config.screenSide)
      : null;
    const decisionPhase = defenseDecisionPhase(observation);
    const candidates = evaluateDefenseCandidates(
      observation,
      current,
      this.defenseStrategyProfile,
      decisionPhase,
    );
    const chosen = chooseCandidate(candidates);
    this.defenseVersion += 1;
    const tacticalPlan = makeDefensePlan(chosen, tacticalWorld, this.defenseVersion);
    const plan = transformPlanFrame(tacticalPlan, this.config.screenSide);
    this.planningLog.push({
      tick: planningWorld.tick,
      at: planningWorld.time,
      team: "defense",
      trigger,
      triggerEventIds: triggerEvents.map((event) => event.id),
      chosen: chosen.id,
      chosenLabel: chosen.label,
      decisionPhase,
      strategy: {
        id: this.defenseStrategyProfile.id,
        version: this.defenseStrategyProfile.version,
        team: "defense",
      },
      strategyBoundary: `只读取防守策略 ${this.defenseStrategyProfile.id}@${this.defenseStrategyProfile.version}；不含进攻策略`,
      candidates,
      observationBoundary: "公开世界事实 + 自队角色；不含进攻隐藏计划/未来",
    });
    return plan;
  }

  private replanBothFromSameSnapshot(
    trigger: string,
    offenseEvents: WorldEvent[],
    defenseEvents: WorldEvent[],
  ): void {
    const planningWorld = this.world;
    const planningStart = this.planningLog.length;
    let nextOffense: TeamPlan;
    let nextDefense: TeamPlan;
    if (this.plannerEvaluationOrder === "defense-first") {
      nextDefense = this.replanDefense(trigger, defenseEvents, planningWorld);
      nextOffense = this.replanOffense(trigger, offenseEvents, planningWorld);
    } else {
      nextOffense = this.replanOffense(trigger, offenseEvents, planningWorld);
      nextDefense = this.replanDefense(trigger, defenseEvents, planningWorld);
    }
    const records = this.planningLog.splice(planningStart).sort(
      (first, second) =>
        (first.team === "offense" ? 0 : 1) -
        (second.team === "offense" ? 0 : 1),
    );
    this.planningLog.push(...records);
    this.offensePlan = nextOffense;
    this.defensePlan = nextDefense;
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
    const formationReadyEvent = this.config.startMode === "form_pnr" &&
      this.world.formation.phase === "formation" &&
      [...this.offenseQueue, ...this.defenseQueue].some(
        (event) => event.type === "formation_ready",
      );
    if (formationReadyEvent && formationReadiness(this.world).ready) {
      const offenseEvents = [...this.offenseQueue];
      const defenseEvents = [...this.defenseQueue];
      this.world.formation = {
        ...this.world.formation,
        phase: "pnr",
        enteredPnrAtTick: this.world.tick,
      };
      this.offenseQueue = [];
      this.defenseQueue = [];
      this.replanBothFromSameSnapshot(
        "显式联合就绪边界：" + eventNames(offenseEvents),
        offenseEvents,
        defenseEvents,
      );
      return;
    }

    const sharedScreenClearBoundary =
      this.world.under.active &&
      this.defensePlan.id === "UNDER" &&
      this.offenseQueue.some((event) => event.type === "screen_cleared") &&
      this.defenseQueue.some((event) => event.type === "screen_cleared");
    if (sharedScreenClearBoundary) {
      const offenseEvents = [...this.offenseQueue];
      const defenseEvents = [...this.defenseQueue];
      this.offenseQueue = [];
      this.defenseQueue = [];
      this.replanBothFromSameSnapshot(
        "显式清屏边界：" + eventNames(offenseEvents),
        offenseEvents,
        defenseEvents,
      );
      return;
    }

    const urgentOffenseBoundary = this.offenseQueue.some(
      (event) =>
        event.type === "switch_completed" ||
        event.type === "under_committed" ||
        (event.type === "screen_cleared" &&
          this.world.under.active &&
          this.defensePlan.id === "UNDER") ||
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
    } else if (
      this.world.time + 1e-9 >= this.offensePlan.watchdogAt &&
      !committedRouteInProgress(this.offensePlan)
    ) {
      this.offensePlan = this.replanOffense("有限看门狗", []);
      this.offenseQueue = [];
    }

    const urgentDefenseBoundary = this.defenseQueue.some(
      (event) =>
        event.type === "screen_cleared" ||
        event.type === "under_recovery_blocked" ||
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
    } else if (
      this.world.time + 1e-9 >= this.defensePlan.watchdogAt &&
      !committedRouteInProgress(this.defensePlan)
    ) {
      this.defensePlan = this.replanDefense("有限看门狗", []);
      this.defenseQueue = [];
    }
  }

  private integratePlayers(intents: Record<PlayerId, MotionIntent>): {
    rawDesiredD1: Vec2;
    progressLoss: number;
    collisions: CollisionResolutionFacts;
  } {
    const before = {} as Record<PlayerId, Vec2>;
    const rawDesired = {} as Record<PlayerId, Vec2>;
    for (const id of PLAYER_IDS) {
      before[id] = { ...this.world.players[id].pos };
      rawDesired[id] = desiredVelocity(this.world.players[id], intents[id]);
    }

    const actualPoseBefore = screenPose(this.world);
    const legalPoseBefore = this.world.formation.phase === "pnr" && actualPoseBefore;
    const tacticalWorld = toTacticalWorld(this.world);
    const tacticalDesiredD1 = toTacticalVector(rawDesired.D1, this.world.screenSide);
    const geometryBefore = screenGeometry({
      d1: tacticalWorld.players.D1,
      o5: tacticalWorld.players.O5,
      desiredD1Velocity: tacticalDesiredD1,
      screenLegalPose: legalPoseBefore,
    });
    const adjusted = { ...rawDesired, D1: { ...rawDesired.D1 } };

    if (geometryBefore.routeExposure && intents.D1.screenNavigation !== "none") {
      const forward = normalize(tacticalDesiredD1);
      const left = v(-forward.y, forward.x);
      const overDirection = left.y <= 0 ? left : scale(left, -1);
      const tangent = intents.D1.screenNavigation === "under" ? scale(overDirection, -1) : overDirection;
      let tacticalAdjusted = add(scale(tacticalDesiredD1, 0.67), scale(tangent, 1.42));
      const max = this.world.players.D1.maxSpeed;
      if (length(tacticalAdjusted) > max) {
        tacticalAdjusted = scale(normalize(tacticalAdjusted), max);
      }
      adjusted.D1 = toTacticalVector(tacticalAdjusted, this.world.screenSide);
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
    const collisionFacts = new Map<string, CollisionPairResolutionFact>();
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
        const aAnchored = aId === "O5" && actualPoseBefore;
        const bAnchored = bId === "O5" && actualPoseBefore;
        const aShare = aAnchored ? 0 : bAnchored ? 1 : 0.5;
        const bShare = bAnchored ? 0 : aAnchored ? 1 : 0.5;
        const key = `${aId}:${bId}`;
        const pairFact = collisionFacts.get(key) ?? {
          pair: [aId, bId] as const,
          positionCorrection: 0,
          velocityRemoved: {},
        };
        pairFact.positionCorrection += overlap;
        a.pos = add(a.pos, scale(normal, -overlap * aShare));
        b.pos = add(b.pos, scale(normal, overlap * bShare));
        const closingA = dot(a.vel, normal);
        const closingB = dot(b.vel, scale(normal, -1));
        if (closingA > 0) {
          pairFact.velocityRemoved[aId] =
            (pairFact.velocityRemoved[aId] ?? 0) + closingA;
          a.vel = sub(a.vel, scale(normal, closingA));
        }
        if (closingB > 0) {
          pairFact.velocityRemoved[bId] =
            (pairFact.velocityRemoved[bId] ?? 0) + closingB;
          b.vel = add(b.vel, scale(normal, closingB));
        }
        collisionFacts.set(key, pairFact);
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
      collisions: {
        pairs: [...collisionFacts.values()].map((fact) => ({
          pair: [...fact.pair] as [PlayerId, PlayerId],
          positionCorrection: round(fact.positionCorrection, 9),
          velocityRemoved: Object.fromEntries(
            Object.entries(fact.velocityRemoved).map(([id, value]) => [
              id,
              round(value ?? 0, 9),
            ]),
          ) as Partial<Record<PlayerId, number>>,
        })),
      },
    };
  }

  private resolveFacts(rawDesiredD1: Vec2, progressLoss: number): ScreenFacts {
    const tacticalWorld = toTacticalWorld(this.world);
    const o1 = tacticalWorld.players.O1;
    const o5 = tacticalWorld.players.O5;
    const d1 = tacticalWorld.players.D1;
    const d5 = tacticalWorld.players.D5;
    const tacticalDesiredD1 = toTacticalVector(rawDesiredD1, this.world.screenSide);
    const legalPose = screenPose(this.world);
    if (this.world.formation.phase === "formation") {
      const geometry = screenGeometry({
        d1,
        o5,
        desiredD1Velocity: tacticalDesiredD1,
        screenLegalPose: false,
      });
      return {
        ...EMPTY_FACTS,
        contact: geometry.contact,
        screenLegalPose: legalPose,
      };
    }
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
      (!this.world.under.active &&
        ballHandlerClearedScreen &&
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
      desiredD1Velocity: tacticalDesiredD1,
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
    const tacticalO1 = toTacticalPoint(o1.pos, this.world.screenSide);
    const o1Relocated = o1Spacing >= 2.62 && tacticalO1.x >= 7.55;
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

  private resolveUnder(
    previous: UnderFacts,
    collisions: CollisionResolutionFacts,
  ): UnderFacts {
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
    if (!active) {
      return {
        active: false,
        d1UnderScreen,
        d1Recovered: false,
        d1O1Distance: round(d1O1Distance),
        d5O5Distance: round(d5O5Distance),
        pullupWindow: false,
      };
    }
    const startedAt = previous.startedAt ?? this.world.time;
    const elapsed = Math.max(0, this.world.time - startedAt);
    const currentContest = underContestGeometry(o1.pos, o1.radius, d5);
    const d5TowardO5 = normalize(sub(o5.pos, d5.pos));
    const d5O5ClosingSpeed = dot(d5.vel, d5TowardO5);
    const d5DeepRetreat =
      currentContest.goalSideMargin >= 0.78 &&
      d5O5Distance >= UNDER_D5_TETHER_DISTANCE &&
      d5O5ClosingSpeed <= UNDER_DEEP_RETREAT_MAX_ROLLER_CLOSING_SPEED &&
      !currentContest.contest;
    const o5TethersD5 = d5O5Distance <= UNDER_D5_TETHER_DISTANCE;
    const o1Speed = length(o1.vel);
    const priorO1Speed = previous.o1Speed ?? o1Speed;
    const collisionForPair = (first: PlayerId, second: PlayerId) =>
      collisions.pairs.find(({ pair }) =>
        (pair[0] === first && pair[1] === second) ||
        (pair[0] === second && pair[1] === first)
      );
    const d1O5Collision = collisionForPair("D1", "O5");
    const d1O5LastPositionCorrection = d1O5Collision?.positionCorrection ?? 0;
    const d1O5LastVelocityRemoved = d1O5Collision?.velocityRemoved.D1 ?? 0;
    const d1O5Suppressed =
      d1O5LastPositionCorrection > 1e-8 || d1O5LastVelocityRemoved > 1e-8;
    const d1O5CollisionSuppressedSeconds = d1O5Suppressed
      ? (previous.d1O5CollisionSuppressedSeconds ?? 0) + FIXED_DT
      : 0;
    const o1Collisions = collisions.pairs.filter(({ pair }) => pair.includes("O1"));
    const o1LastPositionCorrection = o1Collisions.reduce(
      (total, fact) => total + fact.positionCorrection,
      0,
    );
    const o1LastVelocityRemoved = o1Collisions.reduce(
      (total, fact) => total + (fact.velocityRemoved.O1 ?? 0),
      0,
    );
    const o1Suppressed =
      o1LastPositionCorrection > 1e-8 || o1LastVelocityRemoved > 1e-8;
    const o1CollisionSuppressedSeconds = o1Suppressed
      ? (previous.o1CollisionSuppressedSeconds ?? 0) + FIXED_DT
      : 0;
    const d1O1BodyGap = d1O1Distance - d1.radius - o1.radius;
    const d1O5BodyGap = distance(d1.pos, o5.pos) - d1.radius - o5.radius;
    const d1TowardO5 = normalize(sub(o5.pos, d1.pos));
    const d1O5ClosingSpeed = dot(sub(d1.vel, o5.vel), d1TowardO5);
    const recoveryMotionUnblocked = !(
      this.world.facts.ballHandlerClearedScreen &&
      d1O5ClosingSpeed >= UNDER_RECOVERY_IMMINENT_CLOSING_SPEED &&
      d1O5BodyGap <=
        d1O5ClosingSpeed * UNDER_RECOVERY_MIN_REPLAN_TIME_TO_CONTACT
    );
    const straightCorridor = pointSegmentDistance(o5.pos, d1.pos, o1.pos);
    const d1O1StraightBodyCorridorClear = !(
      straightCorridor.t > 0.035 &&
      straightCorridor.t < 0.965 &&
      straightCorridor.distance <
        d1.radius + o5.radius + UNDER_ROUTE_MIN_BODY_CLEARANCE
    );
    const d1Recovered =
      this.world.facts.ballHandlerClearedScreen &&
      d1O1BodyGap <= UNDER_RECOVERY_MAX_BODY_GAP &&
      d1O1StraightBodyCorridorClear &&
      recoveryMotionUnblocked &&
      !d1O5Suppressed &&
      d1O5BodyGap > UNDER_NEAR_ZERO_BODY_GAP &&
      this.world.ballOwner === "O1";
    const screenClearedAtTick = previous.screenClearedAtTick ??
      (this.world.facts.ballHandlerClearedScreen ? this.world.tick : undefined);
    const o1PositionAtScreenClear = previous.o1PositionAtScreenClear ??
      (this.world.facts.ballHandlerClearedScreen ? { ...o1.pos } : undefined);
    const o1RimDistanceAtClear = previous.o1RimDistanceAtClear ??
      (this.world.facts.ballHandlerClearedScreen
        ? distance(o1.pos, COURT.hoop)
        : undefined);
    const d1RecoveryEta =
      Math.max(0, d1O1Distance - d1.radius - o1.radius - 0.16) /
        Math.max(1.1, d1.maxSpeed * 0.92) +
      UNDER_RECOVERY_TURN_COST;
    const rimDirection = normalize(sub(COURT.hoop, o1.pos));
    const visibleRimAttack =
      o1Speed >= 1.05 && dot(o1.vel, rimDirection) >= 0.42;
    const driveCommitted =
      Boolean(previous.driveCommitted) ||
      (this.world.facts.ballHandlerClearedScreen && visibleRimAttack);
    const o1RimDistance = distance(o1.pos, COURT.hoop);
    const rimwardProgressAfterClear = o1RimDistanceAtClear === undefined
      ? 0
      : o1RimDistanceAtClear - o1RimDistance;
    const o1InsideMidrange = isInsideUnderPullupRegion(o1.pos);
    const d5RimDistance = distance(d5.pos, COURT.hoop);
    const d5MissedDriveLine =
      pointSegmentDistance(d5.pos, o1.pos, COURT.hoop).distance >
      o1.radius + d5.radius + 0.22;
    const driveAdvantage =
      Boolean(previous.driveAdvantage) ||
      (driveCommitted &&
        this.world.facts.ballHandlerClearedScreen &&
        !d1Recovered &&
        recoveryMotionUnblocked &&
        d1O5BodyGap > UNDER_NEAR_ZERO_BODY_GAP &&
        d1O5CollisionSuppressedSeconds === 0 &&
        d1O1Distance >= 0.94 &&
        (o1RimDistance + 0.12 < d5RimDistance ||
          (o1RimDistance <= 3.8 &&
            d5MissedDriveLine &&
            currentContest.bodyGap >= 0.12)) &&
        this.world.ballOwner === "O1");
    const postClearPeakO1Speed = screenClearedAtTick === undefined
      ? 0
      : Math.max(previous.postClearPeakO1Speed ?? 0, o1Speed);
    const minimumO1BodyGap = Math.min(
      distance(o1.pos, o5.pos) - o1.radius - o5.radius,
      distance(o1.pos, d1.pos) - o1.radius - d1.radius,
      distance(o1.pos, d5.pos) - o1.radius - d5.radius,
    );
    const collisionFreeThisTick =
      !o1Suppressed &&
      minimumO1BodyGap >= UNDER_PULLUP_CLEAN_STOP_MIN_BODY_GAP;
    const visibleDecelerationStart =
      screenClearedAtTick !== undefined &&
      screenClearedAtTick < this.world.tick &&
      postClearPeakO1Speed >= UNDER_PULLUP_MIN_APPROACH_SPEED &&
      priorO1Speed - o1Speed >= 0.015;
    const accelerationRestarted =
      previous.decelerationStartedAtTick !== undefined &&
      previous.decelerationStartedAtTick !== null &&
      o1Speed > priorO1Speed + 0.04;
    const decelerationStartedAtTick = accelerationRestarted
      ? null
      : previous.decelerationStartedAtTick ??
        (visibleDecelerationStart ? this.world.tick : null);
    const decelerationCollisionFree = decelerationStartedAtTick === null
      ? false
      : previous.decelerationStartedAtTick === undefined ||
          previous.decelerationStartedAtTick === null
        ? collisionFreeThisTick
        : Boolean(previous.decelerationCollisionFree) && collisionFreeThisTick;
    const cleanDeceleration =
      decelerationStartedAtTick !== null &&
      decelerationCollisionFree &&
      postClearPeakO1Speed >= UNDER_PULLUP_MIN_APPROACH_SPEED &&
      o1Speed <= UNDER_PULLUP_MAX_STOP_SPEED;
    const pullupCommitted = Boolean(previous.pullupCommitted) || cleanDeceleration;
    const pullupWindow =
      Boolean(previous.pullupWindow) ||
      (pullupCommitted &&
        screenClearedAtTick !== undefined &&
        screenClearedAtTick < this.world.tick &&
        this.world.branch === "use" &&
        !this.world.facts.matchupExchange &&
        !d1Recovered &&
        o1InsideMidrange &&
        rimwardProgressAfterClear >= UNDER_PULLUP_MIN_RIMWARD_PROGRESS &&
        cleanDeceleration &&
        o1CollisionSuppressedSeconds === 0 &&
        currentContest.bodyGap >= UNDER_PULLUP_MIN_BODY_CLEARANCE &&
        !currentContest.contest &&
        d5DeepRetreat &&
        this.world.ballOwner === "O1");
    const contained =
      Boolean(previous.contained) ||
      (elapsed >= 0.68 &&
        this.world.facts.ballHandlerClearedScreen &&
        currentContest.contest &&
        d1Recovered &&
        o1Speed <= 0.45 &&
        !o1Suppressed &&
        o1CollisionSuppressedSeconds === 0 &&
        !driveAdvantage &&
        !pullupWindow &&
        this.world.ballOwner === "O1");

    return {
      active,
      d1UnderScreen,
      d1Recovered,
      d1O1Distance: round(d1O1Distance),
      d5O5Distance: round(d5O5Distance),
      d5O5ClosingSpeed: round(d5O5ClosingSpeed),
      pullupWindow,
      startedAt,
      elapsed: round(elapsed),
      d5O1Distance: round(currentContest.distance),
      d5BodyGap: round(currentContest.bodyGap),
      d5ContainLineDistance: round(currentContest.containLineDistance),
      d5ContainsBall: currentContest.containsBall,
      d5Contest: currentContest.contest,
      d5DeepRetreat,
      o5TethersD5,
      o1Speed: round(o1Speed),
      previousO1Speed: round(priorO1Speed),
      d1RecoveryEta: round(d1RecoveryEta),
      driveCommitted,
      driveAdvantage,
      pullupCommitted,
      contained,
      screenClearedAtTick,
      o1PositionAtScreenClear,
      o1RimDistanceAtClear: o1RimDistanceAtClear === undefined
        ? undefined
        : round(o1RimDistanceAtClear),
      rimwardProgressAfterClear: round(rimwardProgressAfterClear),
      o1InsideMidrange,
      d1O1StraightBodyCorridorClear,
      d1O1BodyGap: round(d1O1BodyGap),
      d1O5BodyGap: round(d1O5BodyGap),
      d1O5ClosingSpeed: round(d1O5ClosingSpeed),
      recoveryMotionUnblocked,
      d1O5CollisionSuppressedSeconds: round(d1O5CollisionSuppressedSeconds, 6),
      d1O5LastPositionCorrection: round(d1O5LastPositionCorrection, 9),
      d1O5LastVelocityRemoved: round(d1O5LastVelocityRemoved, 9),
      o1CollisionSuppressedSeconds: round(o1CollisionSuppressedSeconds, 6),
      o1LastPositionCorrection: round(o1LastPositionCorrection, 9),
      o1LastVelocityRemoved: round(o1LastVelocityRemoved, 9),
      postClearPeakO1Speed: round(postClearPeakO1Speed),
      decelerationStartedAtTick,
      decelerationCollisionFree,
      cleanDeceleration,
    };
  }

  private resolveReject(previous: RejectFacts): RejectFacts {
    if (this.world.branch !== "reject") return { ...EMPTY_REJECT };

    const o1 = this.world.players.O1;
    const o5 = this.world.players.O5;
    const d1 = this.world.players.D1;
    const d5 = this.world.players.D5;
    const tacticalO1 = toTacticalPoint(o1.pos, this.world.screenSide);
    const tacticalD1 = toTacticalPoint(d1.pos, this.world.screenSide);
    const helpEligible = previous.active
      ? previous.helpEligible
      : tacticalD1.x - tacticalO1.x >= 1.08;
    const d1BeatenNow =
      o1.pos.y <= 4.78 &&
      distance(o1.pos, d1.pos) >= 0.8 &&
      (distance(d1.pos, COURT.hoop) >= distance(o1.pos, COURT.hoop) + 0.08 ||
        tacticalD1.x >= tacticalO1.x + 0.34);
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
    if (this.world.formation.phase === "formation") return "undecided";
    const o1 = this.world.players.O1;
    const tacticalO1 = toTacticalPoint(o1.pos, this.world.screenSide);
    const tacticalVelocity = toTacticalVector(o1.vel, this.world.screenSide);
    const initialO1 = toTacticalPoint(this.config.initialPositions.O1, this.world.screenSide);
    if (tacticalO1.x <= initialO1.x - 0.17 && tacticalVelocity.x < -0.5) return "reject";
    if (
      this.world.facts.screenLegalPose &&
      tacticalO1.x >= initialO1.x + 0.3 &&
      tacticalVelocity.x > 0.5
    ) {
      return "use";
    }
    return "undecided";
  }

  private resolveEvents(
    previousFormation: FormationState,
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
      events.push(makeEvent(
        "screen_set",
        tick,
        at,
        "O5 掩护站定",
        this.config.startMode === "form_pnr"
          ? "O5 真实到达实例掩护锚点并降至合法静止速度；这只证明掩护人设稳，尚不代表 O1 已联合就绪。"
          : "O5 进入右侧掩护点并降至合法静止速度。",
      ));
    }
    if (
      this.config.startMode === "form_pnr" &&
      !previousFormation.jointReady &&
      this.world.formation.jointReady
    ) {
      events.push(makeEvent(
        "formation_ready",
        tick,
        at,
        "O1 / O5 联合就绪",
        "O1 已进入等待区域、降速并合法持球，O5 仍保持设稳；双方只能在下一规划边界进入挡拆阅读。",
      ));
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
    if (
      this.world.facts.ballHandlerClearedScreen &&
      previousUnder.recoveryMotionUnblocked !== false &&
      this.world.under.recoveryMotionUnblocked === false
    ) {
      events.push(
        makeEvent(
          "under_recovery_blocked",
          tick,
          at,
          "D1 恢复走廊即将受阻",
          "D1–O5 的实际身体净空正在以可测闭合速度缩小；世界在碰撞上限前发布物理阻塞，下一边界由防守 planner 重新选路。",
        ),
      );
    }
    if (
      this.world.facts.ballHandlerClearedScreen &&
      (previousUnder.d1O5CollisionSuppressedSeconds ?? 0) <
        UNDER_COLLISION_REPLAN_TRIGGER_SECONDS &&
      (this.world.under.d1O5CollisionSuppressedSeconds ?? 0) >=
        UNDER_COLLISION_REPLAN_TRIGGER_SECONDS
    ) {
      events.push(
        makeEvent(
          "under_recovery_blocked",
          tick,
          at,
          "D1 恢复路线持续受阻",
          "D1–O5 的真实碰撞修正或闭合速度移除已连续达到恢复路线看门狗；世界只发布物理阻塞，下一边界由防守 planner 重新选路。",
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
          "O1 已真实减速，D1 无法及时恢复，且 D5 与 O1 保持身体净空并未进入投篮 contest 走廊；不模拟投篮命中。",
        ),
      );
    }
    if (!previousUnder.driveAdvantage && this.world.under.driveAdvantage) {
      events.push(
        makeEvent(
          "under_drive_advantage",
          tick,
          at,
          "O1 攻下 UNDER 髋部",
          "O1 沿已选择的合法髋部路线继续推进；D1 尚未追回，D5 未能同时守住 O5 与持球攻筐线。",
        ),
      );
    }
    if (!previousUnder.contained && this.world.under.contained) {
      events.push(
        makeEvent(
          "under_contained",
          tick,
          at,
          "防守遏制 UNDER 二级读取",
          "D5 已真实进入持球 contest 位置，D1 同时恢复；O1 安全收住而非获得免费投篮或突破。",
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
      this.world.formation.phase === "formation" &&
      this.world.formation.deadlineAt !== null &&
      this.world.time + 1e-9 >= this.world.formation.deadlineAt
    ) {
      events.push(makeEvent(
        "formation_timeout",
        this.world.tick,
        this.world.time,
        "挡拆形成超时",
        "O1/O5 未在有限形成窗口内同时满足联合就绪；世界安全终止，不传送或静默修正。",
      ));
      terminal = {
        reason: "formation_timeout",
        label: "挡拆未在有限时间内合法形成",
        at: this.world.time,
      };
    } else if (
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
      (this.config.horizon === "under_pullup" ||
        this.config.horizon === "formation_resolution") &&
      this.world.under.driveAdvantage
    ) {
      terminal = {
        reason: "under_drive_advantage",
        label: "D1 走掩护下方后，O1 读取 D5 髋部并继续突破",
        at: this.world.time,
      };
    } else if (
      (this.config.horizon === "under_pullup" ||
        this.config.horizon === "formation_resolution") &&
      this.world.under.pullupWindow
    ) {
      terminal = {
        reason: "under_pullup_window",
        label: "D1 走掩护下方，O1 获得中距离处理窗口",
        at: this.world.time,
      };
    } else if (
      (this.config.horizon === "under_pullup" ||
        this.config.horizon === "formation_resolution") &&
      this.world.under.contained
    ) {
      terminal = {
        reason: "under_contained",
        label: "D5 真实 contain，D1 恢复，进攻安全收住 UNDER 回合",
        at: this.world.time,
      };
    } else if (
      (this.config.horizon === "post_catch_kickout" ||
        this.config.horizon === "post_catch_resolution") &&
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
      (this.config.horizon === "post_catch_finish" ||
        this.config.horizon === "post_catch_resolution") &&
      this.world.postCatch.finishWindow
    ) {
      terminal = {
        reason: "post_catch_finish_window",
        label: "O5 接球转身并形成近筐处理窗口",
        at: this.world.time,
      };
    } else if (
      (this.config.horizon === "pnr_resolution" ||
        this.config.horizon === "formation_resolution") &&
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
    } else if (
      this.world.formation.phase !== "formation" &&
      this.world.time >= this.config.maxTime
    ) {
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
      terminal.reason === "under_drive_advantage" ||
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
      screenSide: this.config.screenSide,
      initialPositions: PLAYER_IDS.map((id) => ({
        id,
        x: this.config.initialPositions[id].x,
        y: this.config.initialPositions[id].y,
      })),
      d1FrontReactionDelay: this.config.d1FrontReactionDelay,
      d1PostCatchRecoveryDelay: this.config.d1PostCatchRecoveryDelay,
      o1MaxSpeed: this.config.o1MaxSpeed,
      horizon: this.config.horizon,
      ...(this.config.startMode === "form_pnr"
        ? {
            startMode: this.config.startMode,
            tacticalLandmarks: this.config.tacticalLandmarks,
            formation: this.world.formation,
          }
        : {}),
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
      ...(this.offensePlan.route || this.defensePlan.route
        ? {
            privateUnderRoutes: {
              offense: privateRouteDeterminismFrame(this.offensePlan.route),
              defense: privateRouteDeterminismFrame(this.defensePlan.route),
            },
          }
        : {}),
      terminal: this.world.terminal?.reason ?? null,
    });
  }

  step(count = 1): void {
    if (count > 0 && !this.world.terminal) this.roundStarted = true;
    for (let iteration = 0; iteration < count; iteration += 1) {
      if (this.world.terminal) return;
      this.deliverEvents();
      this.maybeReplan();
      this.offensePlan = advanceTeamPlanRoute(this.offensePlan, this.world);
      this.defensePlan = advanceTeamPlanRoute(this.defensePlan, this.world);

      const tacticalWorld = toTacticalWorld(this.world);
      const tacticalOffensePlan = transformPlanFrame(
        this.offensePlan,
        this.config.screenSide,
      );
      const tacticalDefensePlan = transformPlanFrame(
        this.defensePlan,
        this.config.screenSide,
      );
      const offense = transformIntentFrame(
        offensiveIntents(tacticalOffensePlan, tacticalWorld),
        this.config.screenSide,
      );
      const passIntent = offensivePassIntent(this.offensePlan, this.world);
      const defense = transformIntentFrame(
        defensiveIntents(tacticalDefensePlan, tacticalWorld),
        this.config.screenSide,
      );
      const intents: Record<PlayerId, MotionIntent> = { ...offense, ...defense };
      const previousFacts = { ...this.world.facts };
      const previousFormation = { ...this.world.formation };
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
      this.lastCollisionResolution = integration.collisions;

      this.world.tick += 1;
      this.world.time = round(this.world.tick * FIXED_DT, 6);
      this.world.branch = this.resolveBranch();
      this.world.facts = this.resolveFacts(integration.rawDesiredD1, integration.progressLoss);
      if (this.world.facts.screenLegalPose && !this.world.formation.screenSet) {
        this.world.formation = {
          ...this.world.formation,
          screenSet: true,
          screenSetTick: this.world.tick,
        };
      }
      this.world.seal = this.resolveSeal(previousSeal);
      this.world.mismatch = this.resolveMismatch(previousMismatch);
      this.world.under = this.resolveUnder(previousUnder, integration.collisions);
      this.world.reject = this.resolveReject(previousReject);
      this.integrateBall(passIntent);
      if (
        this.config.startMode === "form_pnr" &&
        this.world.formation.phase === "formation"
      ) {
        const readiness = formationReadiness(this.world);
        this.world.formation = {
          ...this.world.formation,
          jointReady: readiness.ready,
          jointReadyTick: readiness.ready
            ? previousFormation.jointReady
              ? previousFormation.jointReadyTick
              : this.world.tick
            : null,
        };
      }
      this.world.postCatch = this.resolvePostCatch(previousPostCatch);
      const events = this.resolveEvents(
        previousFormation,
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

  get strategyLocked(): boolean {
    return this.roundStarted;
  }

  getStrategyProfile(team: Team): TeamStrategyProfile {
    return team === "offense" ? this.offenseStrategyProfile : this.defenseStrategyProfile;
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
