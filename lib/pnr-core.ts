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
export type DefensiveCue = "neutral" | "overplay_right";
export type OffensePlanId =
  | "USE_RIGHT_SCREEN"
  | "REJECT_LEFT"
  | "ATTACK_BIG"
  | "FEED_SEAL"
  | "RESET_MISMATCH";
export type DefensePlanId =
  | "SWITCH_READY"
  | "SWITCH"
  | "STAY_HOME"
  | "CONTAIN_MISMATCH"
  | "FRONT_SEAL"
  | "PRESSURE_MISMATCH";
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
  | "mismatch_attack"
  | "seal_established"
  | "seal_fronted"
  | "pass_window_open"
  | "pass_launched"
  | "pass_caught"
  | "pass_denied"
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
  mismatch_attack: 77,
  seal_established: 78,
  seal_fronted: 79,
  pass_window_open: 80,
  mismatch_advantage: 80,
  mismatch_contained: 80,
  pass_launched: 82,
  pass_caught: 84,
  pass_denied: 84,
  advantage_created: 85,
  terminal: 90,
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
    kind: "lob_entry" | null;
  };
  branch: Branch;
  facts: ScreenFacts;
  mismatch: MismatchFacts;
  seal: SealFacts;
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
  passLaneClear: boolean;
  laneClearance: number;
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
  kind: "lob_entry" | null;
  outcome: "live" | "caught" | "deflected" | "missed";
}

interface PassIntent {
  from: "O1";
  to: "O5";
  kind: "lob_entry";
}

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
  passLaneClear: false,
  laneClearance: 0,
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
  const d1Start = config.cue === "overplay_right" ? v(5.24, 5.86) : v(4.2, 5.76);
  return {
    tick: 0,
    time: 0,
    players: {
      O1: makePlayer("O1", "offense", INITIAL_O1.x, INITIAL_O1.y, 3.72),
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
    seal: { ...EMPTY_SEAL },
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
    court: COURT,
    triggerEvents: triggerEvents.map((event) => ({ ...event })),
  };

  return Object.freeze(observation);
}

function offenseRollout(
  candidate: OffensePlanId,
  observation: PublicObservation,
): { score: number; evidence: string[] } {
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
    continuity;

  return {
    score: round(score),
    evidence: [
      "24 步 / 0.8 秒确定性短推演",
      "入筐方向推进 " + round(rimProgress, 2) + "m",
      "预计持球分离 " + round(separation, 2) + "m",
      "D1 公开站位侧差 " + round(d1RelativeX, 2) + "m",
    ],
  };
}

function evaluateOffenseCandidates(
  observation: PublicObservation,
  currentPlan: TeamPlan | null,
): CandidateEvaluation[] {
  const screenOnRight = COURT.screenSpot.x > observation.players.O1.pos.x;
  const ownsBall = observation.ballOwner === "O1";
  const candidates: OffensePlanId[] = [
    "USE_RIGHT_SCREEN",
    "REJECT_LEFT",
    "ATTACK_BIG",
    "FEED_SEAL",
    "RESET_MISMATCH",
  ];

  return candidates.map((id) => {
    const vetoes: string[] = [];
    if (!ownsBall) vetoes.push("O1 不持球，挡拆发起不合法");
    const postSwitchCandidate =
      id === "ATTACK_BIG" || id === "FEED_SEAL" || id === "RESET_MISMATCH";
    if (observation.facts.matchupExchange && !postSwitchCandidate) {
      vetoes.push("换防已经完成，第一段挡拆计划必须终止");
    }
    if (!observation.facts.matchupExchange && postSwitchCandidate) {
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
                : "拉出重置回合",
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
      candidate === "PRESSURE_MISMATCH";
    const d1Target =
      candidate === "FRONT_SEAL"
        ? add(screener, scale(normalize(sub(ball, screener)), 0.72))
        : candidate === "SWITCH" || postSwitchDefense
          ? screener
          : ball;
    const d5Target =
      candidate === "SWITCH" || candidate === "PRESSURE_MISMATCH"
        ? ball
        : candidate === "CONTAIN_MISMATCH" || candidate === "FRONT_SEAL"
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
    candidate === "SWITCH" ||
    candidate === "CONTAIN_MISMATCH" ||
    candidate === "FRONT_SEAL" ||
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
    candidate === "CONTAIN_MISMATCH"
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
      isReject
        ? "公开速度/位置显示拒绝：保持原对位"
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
    "PRESSURE_MISMATCH",
  ];
  return ids.map((id) => {
    const vetoes: string[] = [];
    const postSwitchCandidate =
      id === "CONTAIN_MISMATCH" || id === "FRONT_SEAL" || id === "PRESSURE_MISMATCH";
    if (observation.facts.matchupExchange && !postSwitchCandidate) {
      vetoes.push("换防已完成，必须进入 D5 守球、D1 守 O5 的错位阶段");
    }
    if (!observation.facts.matchupExchange && postSwitchCandidate) {
      vetoes.push("对位交换尚未完成，禁止提前选择错位防守");
    }
    if (id === "SWITCH_READY" && observation.branch === "reject") {
      vetoes.push("O1 已公开拒绝掩护，禁止无事件换防");
    }
    if (id === "SWITCH_READY" && observation.facts.ballHandlerClearedScreen) {
      vetoes.push("O1 已越过 O5 肩位，准备阶段必须结束");
    }
    if (id === "SWITCH" && !observation.facts.ballHandlerClearedScreen) {
      vetoes.push("O1 尚未越肩，禁止提前交换对位");
    }
    if (id === "SWITCH" && observation.branch === "reject") {
      vetoes.push("拒绝分支没有换防交接窗口");
    }

    const rollout = defenseRollout(id, observation);
    const hysteresis = currentPlan?.id === id ? 0.28 : currentPlan ? -0.14 : 0;
    return {
      id,
      label:
        id === "SWITCH_READY"
          ? "预占出口，等待换防"
          : id === "SWITCH"
            ? "原子换防"
            : id === "STAY_HOME"
              ? "保持原对位"
              : id === "CONTAIN_MISMATCH"
                ? "后撤遏制 O1"
                : id === "FRONT_SEAL"
                  ? "D1 抢传球侧绕前"
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
  const attackTarget = d5.pos.x >= o1.pos.x ? v(5.12, 2.55) : v(6.58, 2.55);
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
    rationale = "D1 已公开踩上掩护侧；左侧拒绝在短推演中保留更直的攻筐线，也不会借用远端 O5。";
  }

  const postSwitch =
    chosen.id === "ATTACK_BIG" ||
    chosen.id === "FEED_SEAL" ||
    chosen.id === "RESET_MISMATCH";
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

  if (chosen.id === "SWITCH_READY") {
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
    chosen.id === "PRESSURE_MISMATCH";

  return {
    team: "defense",
    id: chosen.id,
    label: chosen.label,
    version,
    startedAt: world.time,
    startedTick: world.tick,
    commitUntil: world.time + (postSwitch ? 0.52 : 0.56),
    watchdogAt: world.time + (postSwitch ? 1 : 1.08),
    roles,
    chosenScore: chosen.score ?? 0,
    rationale,
  };
}

function offensiveIntents(plan: TeamPlan, world: WorldState): Record<"O1" | "O5", MotionIntent> {
  const o1 = world.players.O1;
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
    return {
      O1: {
        target: plan.primaryTarget ?? v(5.12, 2.55),
        maxSpeed: 3.7,
        arriveRadius: 0.07,
      },
      O5: {
        target: plan.secondaryTarget ?? v(7.15, 2.35),
        maxSpeed: 2.9,
        arriveRadius: 0.12,
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
    return {
      O1: {
        target:
          world.branch === "undecided"
            ? v(3.24, 5.94)
            : o1.y > 4.72
              ? COURT.rejectGate
              : v(4.46, 1.08),
        maxSpeed: world.branch === "undecided" ? 3.26 : o1.y > 4.72 ? 3.48 : 3.7,
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
          ? o1.y > 4.56
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
  return null;
}

function defensiveIntents(plan: TeamPlan, world: WorldState): Record<"D1" | "D5", MotionIntent> {
  const o1 = world.players.O1;
  const o5 = world.players.O5;
  const leadO1 = add(o1.pos, scale(o1.vel, 0.13));
  const leadO5 = add(o5.pos, scale(o5.vel, 0.1));

  if (plan.id === "FRONT_SEAL") {
    const ballSide = add(o5.pos, scale(normalize(sub(o1.pos, o5.pos)), 0.73));
    const goalSideO1 = add(o1.pos, scale(normalize(sub(COURT.hoop, o1.pos)), 0.74));
    return {
      D1: { target: ballSide, maxSpeed: 3.58, arriveRadius: 0.07, screenNavigation: "none" },
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
      (event) => event.type === "switch_completed" || event.type === "seal_fronted",
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
        event.type === "seal_established",
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
    if (!active) return { ...EMPTY_SEAL };

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
    const d1Fronting =
      established &&
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
      const receiver = this.world.players.O5;
      const receiverHit = pointSegmentDistance(receiver.pos, from, next);
      const interceptions = (["D1", "D5"] as const)
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
        this.world.ballOwner = "O5";
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

    if (
      intent &&
      this.world.ballOwner === intent.from &&
      intent.to === "O5" &&
      this.world.seal.passWindow
    ) {
      const passer = this.world.players.O1;
      const receiver = this.world.players.O5;
      const passSpeed = 9.2;
      const flightTime = clamp(distance(passer.pos, receiver.pos) / passSpeed, 0.16, 0.42);
      const target = add(receiver.pos, scale(receiver.vel, flightTime));
      target.x = clamp(target.x, receiver.radius, COURT.width - receiver.radius);
      target.y = clamp(target.y, receiver.radius, COURT.height - receiver.radius);
      ball.pos = { ...passer.pos };
      ball.vel = scale(normalize(sub(target, passer.pos)), passSpeed);
      ball.inFlight = true;
      ball.from = "O1";
      ball.intendedReceiver = "O5";
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
    previousBall: BallState,
    previousBranch: Branch,
  ): WorldEvent[] {
    const events: WorldEvent[] = [];
    const tick = this.world.tick;
    const at = this.world.time;
    const facts = this.world.facts;
    if (!previousFacts.screenLegalPose && facts.screenLegalPose) {
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
    if (!previousFacts.routeExposure && facts.routeExposure) {
      events.push(makeEvent("route_exposure_on", tick, at, "D1 路线暴露", "O5 进入 D1 当前追防意图的有限前向走廊。"));
    }
    if (previousFacts.routeExposure && !facts.routeExposure) {
      events.push(makeEvent("route_exposure_off", tick, at, "路线暴露结束", "O5 不再位于 D1 当前移动走廊。"));
    }
    if (!previousFacts.impeded && facts.impeded) {
      events.push(makeEvent("impeded_on", tick, at, "D1 发生真实延误", "相对无障碍前进量出现可测损失；因果门已通过。"));
    }
    if (previousFacts.impeded && !facts.impeded) {
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
    if (!previousSeal.established && this.world.seal.established) {
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
    if (!previousSeal.d1Fronting && this.world.seal.d1Fronting) {
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
    if (!previousSeal.passWindow && this.world.seal.passWindow) {
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
        makeEvent(
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
        makeEvent(
          "pass_caught",
          tick,
          at,
          "O5 深位接球",
          "球先进入 O5 的合法接球半径，球权从空中转移到 O5。",
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
          "内线传球被否决",
          this.world.ball.outcome === "deflected"
            ? "防守者先进入球的局部飞行线并取得球权。"
            : "球到达既定落点前没有进入 O5 的接球半径。",
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

    if (this.world.ball.outcome === "caught" && this.world.ballOwner === "O5") {
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
        label: "防守否决 O1 给 O5 的内线传球",
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
    } else if (this.world.branch === "reject" && o1.pos.y < 3.28) {
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
      this.integrateBall(passIntent);
      const events = this.resolveEvents(
        previousFacts,
        previousMismatch,
        previousSeal,
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
