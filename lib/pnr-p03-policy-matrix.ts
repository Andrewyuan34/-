import {
  COURT,
  EVENT_ORDER,
  FIXED_DT,
  PLAYER_IDS,
  PnrSimulation,
  copyInitialPlayerPositions,
  mirrorInitialPlayerPositions,
  mirrorPointAcrossCenterline,
  type CandidateEvaluation,
  type InitialPlayerPositions,
  type PlayerId,
  type PlanningRecord,
  type ScreenSide,
  type SimulationConfig,
  type TerminalState,
  type Vec2,
  type WorldEvent,
} from "./pnr-core.ts";
import { makeG03Config } from "./pnr-g03-generalization.ts";
import {
  P01_OFFENSE_STRATEGIES,
  type P01OffenseStrategyId,
} from "./pnr-p01-offense-strategy.ts";
import {
  P02_DEFENSE_STRATEGIES,
  withP02Strategies,
  type P02CandidateSnapshot,
  type P02DefenseStrategyId,
} from "./pnr-p02-defense-strategy.ts";
import {
  DEFENSE_BALANCED_COVERAGE,
  DEFENSE_EARLY_DIG,
  DEFENSE_MISMATCH_PRESSURE,
  OFFENSE_BALANCED_READ,
  OFFENSE_MISMATCH_PRESSURE,
} from "./pnr-strategy.ts";

export const P03_COMMON_INPUT = Object.freeze({
  cue: "neutral",
  seed: 17,
  o1MaxSpeed: 3.98,
  d1FrontReactionDelay: 0.12,
  d1PostCatchRecoveryDelay: 0.18,
  horizon: "post_catch_resolution",
  maxTime: 7.4,
  defaultSide: "right",
} as const);

export const P03_POLICY_MATCHUPS = Object.freeze([
  {
    id: "OB-DB",
    offenseStrategyId: OFFENSE_BALANCED_READ.id,
    defenseStrategyId: DEFENSE_BALANCED_COVERAGE.id,
  },
  {
    id: "OB-DM",
    offenseStrategyId: OFFENSE_BALANCED_READ.id,
    defenseStrategyId: DEFENSE_MISMATCH_PRESSURE.id,
  },
  {
    id: "OB-DE",
    offenseStrategyId: OFFENSE_BALANCED_READ.id,
    defenseStrategyId: DEFENSE_EARLY_DIG.id,
  },
  {
    id: "OM-DB",
    offenseStrategyId: OFFENSE_MISMATCH_PRESSURE.id,
    defenseStrategyId: DEFENSE_BALANCED_COVERAGE.id,
  },
  {
    id: "OM-DM",
    offenseStrategyId: OFFENSE_MISMATCH_PRESSURE.id,
    defenseStrategyId: DEFENSE_MISMATCH_PRESSURE.id,
  },
  {
    id: "OM-DE",
    offenseStrategyId: OFFENSE_MISMATCH_PRESSURE.id,
    defenseStrategyId: DEFENSE_EARLY_DIG.id,
  },
] as const);

export type P03MatchupId = (typeof P03_POLICY_MATCHUPS)[number]["id"];

export interface P03DecisionSummary {
  readonly tick: number;
  readonly team: "offense" | "defense";
  readonly phase: string;
  readonly chosen: string;
  readonly candidates: readonly P02CandidateSnapshot[];
}

export interface P03EventSummary {
  readonly tick: number;
  readonly type: string;
  readonly label: string;
}

export interface P03MatrixRow {
  readonly id: P03MatchupId;
  readonly side: ScreenSide;
  readonly offenseStrategyId: P01OffenseStrategyId;
  readonly offenseStrategyLabel: string;
  readonly defenseStrategyId: P02DefenseStrategyId;
  readonly defenseStrategyLabel: string;
  readonly deterministic: boolean;
  readonly branch: string;
  readonly terminal: TerminalState;
  readonly terminalTick: number;
  readonly decisions: readonly P03DecisionSummary[];
  readonly offensePlanSequence: readonly string[];
  readonly defensePlanSequence: readonly string[];
  readonly keyEvents: readonly P03EventSummary[];
  readonly offenseReplans: number;
  readonly defenseReplans: number;
  readonly watchdogReplans: number;
  readonly minimumBodyGap: number;
  readonly helpCommitted: boolean;
  readonly kickoutCaught: boolean;
  readonly invariantFailures: readonly string[];
}

export interface P03MirrorRow {
  readonly id: P03MatchupId;
  readonly deterministicRight: boolean;
  readonly deterministicLeft: boolean;
  readonly mirrored: boolean;
  readonly maximumMirrorError: number;
  readonly failureReasons: readonly string[];
}

export interface P03MatrixAuditResult {
  readonly id: "P03";
  readonly commonInput: typeof P03_COMMON_INPUT;
  readonly rows: readonly P03MatrixRow[];
  readonly leftRows: readonly P03MatrixRow[];
  readonly mirrors: readonly P03MirrorRow[];
  readonly deterministic: boolean;
  readonly invariantSafe: boolean;
  readonly mirrorSafe: boolean;
  readonly passed: boolean;
  readonly failureReasons: readonly string[];
}

interface P03RunResult {
  readonly row: Omit<P03MatrixRow, "deterministic">;
  readonly trace: readonly string[];
  readonly mirrorFrames: readonly P03MirrorFrame[];
}

interface P03MirrorFrame {
  readonly tick: number;
  readonly players: Readonly<Record<PlayerId, { pos: Vec2; vel: Vec2 }>>;
  readonly ball: {
    readonly pos: Vec2;
    readonly vel: Vec2;
    readonly target: Vec2 | null;
    readonly owner: PlayerId | null;
    readonly inFlight: boolean;
    readonly kind: string | null;
    readonly outcome: string;
  };
  readonly branch: string;
  readonly facts: object;
  readonly offensePlan: string;
  readonly defensePlan: string;
  readonly roles: readonly { playerId: PlayerId; roleCode: string; owner: string }[];
  readonly planning: readonly object[];
  readonly events: readonly object[];
  readonly terminal: TerminalState | null;
}

const PLAYER_PAIRS = [
  ["O1", "O5"],
  ["O1", "D1"],
  ["O1", "D5"],
  ["O5", "D1"],
  ["O5", "D5"],
  ["D1", "D5"],
] as const satisfies readonly (readonly [PlayerId, PlayerId])[];

const KEY_EVENT_TYPES = new Set([
  "branch_use",
  "branch_reject",
  "screen_effective",
  "switch_completed",
  "mismatch_attack",
  "seal_established",
  "pass_launched",
  "pass_caught",
  "post_catch_attack",
  "help_committed",
  "kickout_launched",
  "kickout_caught",
  "finish_window",
  "mismatch_advantage",
  "mismatch_contained",
  "pass_denied",
  "terminal",
]);

function findMatchup(id: P03MatchupId) {
  const matchup = P03_POLICY_MATCHUPS.find((candidate) => candidate.id === id);
  if (!matchup) throw new Error(`Unknown P03 policy matchup: ${id}`);
  return matchup;
}

export function findP03PolicyMatchupId(
  offenseStrategyId: P01OffenseStrategyId,
  defenseStrategyId: P02DefenseStrategyId,
): P03MatchupId {
  const matchup = P03_POLICY_MATCHUPS.find(
    (candidate) =>
      candidate.offenseStrategyId === offenseStrategyId &&
      candidate.defenseStrategyId === defenseStrategyId,
  );
  if (!matchup) {
    throw new Error(
      `P03 has no approved matchup for ${offenseStrategyId}/${defenseStrategyId}`,
    );
  }
  return matchup.id;
}

function strategyLabel(
  team: "offense" | "defense",
  id: P01OffenseStrategyId | P02DefenseStrategyId,
): string {
  const collection = team === "offense" ? P01_OFFENSE_STRATEGIES : P02_DEFENSE_STRATEGIES;
  return collection.find((profile) => profile.id === id)?.label ?? id;
}

export function makeP03PolicyConfig(
  id: P03MatchupId,
  side: ScreenSide = "right",
): SimulationConfig {
  const matchup = findMatchup(id);
  const base = makeG03Config(P03_COMMON_INPUT.d1PostCatchRecoveryDelay);
  const rightPositions = copyInitialPlayerPositions(base.initialPositions);
  const initialPositions = side === "right"
    ? rightPositions
    : mirrorInitialPlayerPositions(rightPositions);
  return withP02Strategies(
    {
      ...base,
      initialPositions,
      screenSide: side,
      seed: P03_COMMON_INPUT.seed,
      maxTime: P03_COMMON_INPUT.maxTime,
      o1MaxSpeed: P03_COMMON_INPUT.o1MaxSpeed,
      d1FrontReactionDelay: P03_COMMON_INPUT.d1FrontReactionDelay,
      d1PostCatchRecoveryDelay: P03_COMMON_INPUT.d1PostCatchRecoveryDelay,
      horizon: P03_COMMON_INPUT.horizon,
    },
    matchup.offenseStrategyId,
    matchup.defenseStrategyId,
  );
}

export function createP03PolicyReplay(
  id: P03MatchupId,
  side: ScreenSide = "right",
): PnrSimulation {
  return new PnrSimulation(makeP03PolicyConfig(id, side));
}

function cloneCandidate(candidate: CandidateEvaluation): P02CandidateSnapshot {
  return {
    id: candidate.id,
    feasible: candidate.feasible,
    baseScore: candidate.baseScore,
    strategyAdjustment: candidate.strategyAdjustment,
    effectiveScore: candidate.effectiveScore,
    strategyReason: candidate.strategyReason,
    vetoes: [...candidate.vetoes],
    evidence: [...candidate.evidence],
  };
}

function decisionSummary(record: PlanningRecord): P03DecisionSummary {
  return {
    tick: record.tick,
    team: record.team,
    phase: record.decisionPhase,
    chosen: record.chosen,
    candidates: record.candidates.map(cloneCandidate),
  };
}

function tracePlanning(record: PlanningRecord): object {
  return {
    tick: record.tick,
    team: record.team,
    trigger: record.trigger,
    triggerEventIds: record.triggerEventIds,
    chosen: record.chosen,
    phase: record.decisionPhase,
    strategy: record.strategy,
    candidates: record.candidates.map((candidate) => ({
      id: candidate.id,
      feasible: candidate.feasible,
      baseScore: candidate.baseScore,
      strategyAdjustment: candidate.strategyAdjustment,
      effectiveScore: candidate.effectiveScore,
      vetoes: candidate.vetoes,
      evidence: candidate.evidence,
    })),
  };
}

function mirrorPlanning(record: PlanningRecord): object {
  return {
    tick: record.tick,
    team: record.team,
    triggerEventIds: record.triggerEventIds,
    chosen: record.chosen,
    phase: record.decisionPhase,
    strategy: record.strategy,
    candidates: record.candidates.map((candidate) => ({
      id: candidate.id,
      feasible: candidate.feasible,
      baseScore: candidate.baseScore,
      strategyAdjustment: candidate.strategyAdjustment,
      effectiveScore: candidate.effectiveScore,
      vetoes: candidate.vetoes,
    })),
  };
}

function checkWorldInvariants(
  simulation: PnrSimulation,
  newEvents: readonly WorldEvent[],
  failures: Set<string>,
): number {
  const roles = simulation.getRoles();
  if (roles.length !== 4 || new Set(roles.map((role) => role.playerId)).size !== 4) {
    failures.add("role ownership conflict");
  }
  if (roles.some(
    (role) => role.owner !== (role.playerId.startsWith("O") ? "offense-planner" : "defense-planner"),
  )) {
    failures.add("role owned by wrong planner");
  }

  const world = simulation.world;
  if (world.ballOwner !== null && !PLAYER_IDS.includes(world.ballOwner)) {
    failures.add("illegal ball owner");
  }
  if (world.ball.inFlight !== (world.ballOwner === null)) {
    failures.add("possession and flight disagree");
  }
  if (world.time !== Math.round(world.tick * FIXED_DT * 1e6) / 1e6) {
    failures.add("fixed timestep drift");
  }
  if (world.lastStepMaxDisplacement > 0.15 + 1e-9) {
    failures.add("player path step too large");
  }
  if (
    world.ball.pos.x < -1e-9 ||
    world.ball.pos.x > COURT.width + 1e-9 ||
    world.ball.pos.y < -1e-9 ||
    world.ball.pos.y > COURT.height + 1e-9
  ) {
    failures.add("ball out of bounds");
  }
  for (const id of PLAYER_IDS) {
    const player = world.players[id];
    if (
      player.pos.x < player.radius - 1e-9 ||
      player.pos.x > COURT.width - player.radius + 1e-9 ||
      player.pos.y < player.radius - 1e-9 ||
      player.pos.y > COURT.height - player.radius + 1e-9
    ) {
      failures.add("player out of bounds");
    }
  }

  let minimumBodyGap = Number.POSITIVE_INFINITY;
  for (const [firstId, secondId] of PLAYER_PAIRS) {
    const first = world.players[firstId];
    const second = world.players[secondId];
    const gap = Math.hypot(first.pos.x - second.pos.x, first.pos.y - second.pos.y) -
      first.radius - second.radius;
    minimumBodyGap = Math.min(minimumBodyGap, gap);
    if (gap < -0.01) failures.add("body penetration");
  }
  if (world.facts.impeded && !world.facts.contact && !world.facts.routeExposure) {
    failures.add("remote screen impediment");
  }

  for (let index = 1; index < newEvents.length; index += 1) {
    const previous = newEvents[index - 1];
    const current = newEvents[index];
    if (previous.tick === current.tick && EVENT_ORDER[previous.type] > EVENT_ORDER[current.type]) {
      failures.add("event order changed");
    }
  }

  const touchOwners: Partial<Record<WorldEvent["type"], PlayerId>> = {
    pass_caught: "O5",
    kickout_caught: "O1",
    reject_pass_caught: "O5",
  };
  for (const event of newEvents) {
    if (event.type === "pass_denied" && world.ball.outcome === "missed") continue;
    const owner = event.type === "pass_denied" ? world.ballOwner : touchOwners[event.type];
    if (!owner) continue;
    if (event.type === "pass_denied" && owner !== "D1" && owner !== "D5") {
      failures.add("pass denial assigned to a non-defender");
      continue;
    }
    const player = world.players[owner];
    const localDistance = Math.hypot(
      world.ball.pos.x - player.pos.x,
      world.ball.pos.y - player.pos.y,
    );
    if (
      world.ballOwner !== owner ||
      localDistance >
        player.radius + world.ball.radius + (event.type === "pass_denied" ? 0.045 : 0.075) + 1e-9
    ) {
      failures.add("pass resolved without local touch");
    }
  }
  return minimumBodyGap;
}

function makeMirrorFrame(
  simulation: PnrSimulation,
  planning: readonly PlanningRecord[],
  events: readonly WorldEvent[],
): P03MirrorFrame {
  return {
    tick: simulation.world.tick,
    players: Object.fromEntries(PLAYER_IDS.map((id) => [id, {
      pos: { ...simulation.world.players[id].pos },
      vel: { ...simulation.world.players[id].vel },
    }])) as Record<PlayerId, { pos: Vec2; vel: Vec2 }>,
    ball: {
      pos: { ...simulation.world.ball.pos },
      vel: { ...simulation.world.ball.vel },
      target: simulation.world.ball.target ? { ...simulation.world.ball.target } : null,
      owner: simulation.world.ballOwner,
      inFlight: simulation.world.ball.inFlight,
      kind: simulation.world.ball.kind,
      outcome: simulation.world.ball.outcome,
    },
    branch: simulation.world.branch,
    facts: {
      screen: simulation.world.facts,
      mismatch: simulation.world.mismatch,
      seal: simulation.world.seal,
      postCatch: simulation.world.postCatch,
      under: simulation.world.under,
      reject: simulation.world.reject,
    },
    offensePlan: simulation.offensePlan.id,
    defensePlan: simulation.defensePlan.id,
    roles: simulation.getRoles().map(({ playerId, roleCode, owner }) => ({
      playerId,
      roleCode,
      owner,
    })),
    planning: planning.map(mirrorPlanning),
    events: events.map(({ tick, type, order, availableAtTick }) => ({
      tick,
      type,
      order,
      availableAtTick,
    })),
    terminal: simulation.world.terminal ? { ...simulation.world.terminal } : null,
  };
}

function runP03Case(id: P03MatchupId, side: ScreenSide): P03RunResult {
  const matchup = findMatchup(id);
  const simulation = createP03PolicyReplay(id, side);
  const trace: string[] = [];
  const mirrorFrames: P03MirrorFrame[] = [];
  const failures = new Set<string>();
  let minimumBodyGap = Number.POSITIVE_INFINITY;
  let planningStart = 0;
  let eventStart = 0;

  const capture = () => {
    const planning = simulation.planningLog.slice(planningStart);
    const events = simulation.eventLog.slice(eventStart);
    minimumBodyGap = Math.min(
      minimumBodyGap,
      checkWorldInvariants(simulation, events, failures),
    );
    trace.push(JSON.stringify({
      tick: simulation.world.tick,
      stateHash: simulation.world.stateHash,
      offensePlan: simulation.offensePlan,
      defensePlan: simulation.defensePlan,
      roles: simulation.getRoles(),
      planning: planning.map(tracePlanning),
      events,
      terminal: simulation.world.terminal,
    }));
    mirrorFrames.push(makeMirrorFrame(simulation, planning, events));
    planningStart = simulation.planningLog.length;
    eventStart = simulation.eventLog.length;
  };

  capture();
  for (let index = 0; index < 600 && !simulation.world.terminal; index += 1) {
    simulation.step();
    capture();
  }
  if (!simulation.world.terminal) failures.add("world did not reach a finite terminal");

  const eventsById = new Map(simulation.eventLog.map((event) => [event.id, event]));
  for (const record of simulation.planningLog) {
    for (const eventId of record.triggerEventIds) {
      const event = eventsById.get(eventId);
      if (!event || event.availableAtTick <= event.tick || record.tick < event.availableAtTick) {
        failures.add("planner consumed event before its public boundary");
      }
    }
  }

  if (!simulation.world.terminal) {
    throw new Error(`P03 ${id}/${side} did not reach a terminal`);
  }
  return {
    row: {
      id,
      side,
      offenseStrategyId: matchup.offenseStrategyId,
      offenseStrategyLabel: strategyLabel("offense", matchup.offenseStrategyId),
      defenseStrategyId: matchup.defenseStrategyId,
      defenseStrategyLabel: strategyLabel("defense", matchup.defenseStrategyId),
      branch: simulation.world.branch,
      terminal: { ...simulation.world.terminal },
      terminalTick: simulation.world.tick,
      decisions: simulation.planningLog.map(decisionSummary),
      offensePlanSequence: simulation.planningLog
        .filter((record) => record.team === "offense")
        .map((record) => `${record.tick}:${record.chosen}`),
      defensePlanSequence: simulation.planningLog
        .filter((record) => record.team === "defense")
        .map((record) => `${record.tick}:${record.chosen}`),
      keyEvents: simulation.eventLog
        .filter((event) => KEY_EVENT_TYPES.has(event.type))
        .map(({ tick, type, label }) => ({ tick, type, label })),
      offenseReplans: simulation.planningLog.filter((record) => record.team === "offense").length,
      defenseReplans: simulation.planningLog.filter((record) => record.team === "defense").length,
      watchdogReplans: simulation.planningLog.filter((record) => record.trigger === "有限看门狗").length,
      minimumBodyGap: Number(minimumBodyGap.toFixed(6)),
      helpCommitted: simulation.eventLog.some((event) => event.type === "help_committed"),
      kickoutCaught: simulation.eventLog.some((event) => event.type === "kickout_caught"),
      invariantFailures: [...failures],
    },
    trace,
    mirrorFrames,
  };
}

function vectorMirrorError(right: Vec2, left: Vec2, point: boolean): number {
  const expected = point ? mirrorPointAcrossCenterline(right) : { x: -right.x, y: right.y };
  return Math.max(Math.abs(left.x - expected.x), Math.abs(left.y - expected.y));
}

function compareMirrorScalars(
  right: unknown,
  left: unknown,
  path: string,
): { maximumError: number; mismatch: string | null } {
  if (typeof right === "number" && typeof left === "number") {
    const error = Math.abs(right - left);
    return {
      maximumError: error,
      mismatch: error > 1e-9 ? `${path} differs by ${error}` : null,
    };
  }
  if (right === left) return { maximumError: 0, mismatch: null };
  if (
    right === null ||
    left === null ||
    typeof right !== "object" ||
    typeof left !== "object"
  ) {
    return { maximumError: 0, mismatch: `${path} differs` };
  }
  const rightRecord = right as Record<string, unknown>;
  const leftRecord = left as Record<string, unknown>;
  const rightKeys = Object.keys(rightRecord);
  const leftKeys = Object.keys(leftRecord);
  if (JSON.stringify(rightKeys) !== JSON.stringify(leftKeys)) {
    return { maximumError: 0, mismatch: `${path} keys differ` };
  }
  let maximumError = 0;
  for (const key of rightKeys) {
    const comparison = compareMirrorScalars(
      rightRecord[key],
      leftRecord[key],
      `${path}.${key}`,
    );
    maximumError = Math.max(maximumError, comparison.maximumError);
    if (comparison.mismatch) return { maximumError, mismatch: comparison.mismatch };
  }
  return { maximumError, mismatch: null };
}

function compareMirrorRuns(
  id: P03MatchupId,
  right: P03RunResult,
  left: P03RunResult,
  deterministicRight: boolean,
  deterministicLeft: boolean,
): P03MirrorRow {
  const failures: string[] = [];
  let maximumMirrorError = 0;
  if (right.mirrorFrames.length !== left.mirrorFrames.length) {
    failures.push("right/left tick counts differ");
  }
  const frameCount = Math.min(right.mirrorFrames.length, left.mirrorFrames.length);
  for (let index = 0; index < frameCount; index += 1) {
    const rightFrame = right.mirrorFrames[index];
    const leftFrame = left.mirrorFrames[index];
    if (rightFrame.tick !== leftFrame.tick) failures.push(`tick mismatch at frame ${index}`);
    for (const playerId of PLAYER_IDS) {
      maximumMirrorError = Math.max(
        maximumMirrorError,
        vectorMirrorError(rightFrame.players[playerId].pos, leftFrame.players[playerId].pos, true),
        vectorMirrorError(rightFrame.players[playerId].vel, leftFrame.players[playerId].vel, false),
      );
    }
    maximumMirrorError = Math.max(
      maximumMirrorError,
      vectorMirrorError(rightFrame.ball.pos, leftFrame.ball.pos, true),
      vectorMirrorError(rightFrame.ball.vel, leftFrame.ball.vel, false),
    );
    if (rightFrame.ball.target && leftFrame.ball.target) {
      maximumMirrorError = Math.max(
        maximumMirrorError,
        vectorMirrorError(rightFrame.ball.target, leftFrame.ball.target, true),
      );
    } else if (rightFrame.ball.target !== leftFrame.ball.target) {
      failures.push(`ball target presence differs at tick ${rightFrame.tick}`);
    }
    const comparableRight = {
      ball: {
        owner: rightFrame.ball.owner,
        inFlight: rightFrame.ball.inFlight,
        kind: rightFrame.ball.kind,
        outcome: rightFrame.ball.outcome,
      },
      branch: rightFrame.branch,
      facts: rightFrame.facts,
      offensePlan: rightFrame.offensePlan,
      defensePlan: rightFrame.defensePlan,
      roles: rightFrame.roles,
      planning: rightFrame.planning,
      events: rightFrame.events,
      terminal: rightFrame.terminal,
    };
    const comparableLeft = {
      ball: {
        owner: leftFrame.ball.owner,
        inFlight: leftFrame.ball.inFlight,
        kind: leftFrame.ball.kind,
        outcome: leftFrame.ball.outcome,
      },
      branch: leftFrame.branch,
      facts: leftFrame.facts,
      offensePlan: leftFrame.offensePlan,
      defensePlan: leftFrame.defensePlan,
      roles: leftFrame.roles,
      planning: leftFrame.planning,
      events: leftFrame.events,
      terminal: leftFrame.terminal,
    };
    const scalarComparison = compareMirrorScalars(
      comparableRight,
      comparableLeft,
      `tick ${rightFrame.tick}`,
    );
    maximumMirrorError = Math.max(maximumMirrorError, scalarComparison.maximumError);
    if (scalarComparison.mismatch) {
      failures.push(`plan/fact/event mirror mismatch: ${scalarComparison.mismatch}`);
      break;
    }
  }
  if (maximumMirrorError > 1e-9) {
    failures.push(`maximum mirror error ${maximumMirrorError} exceeds 1e-9`);
  }
  return {
    id,
    deterministicRight,
    deterministicLeft,
    mirrored: failures.length === 0,
    maximumMirrorError,
    failureReasons: failures,
  };
}

function assertMirroredInitialPositions(
  right: InitialPlayerPositions,
  left: InitialPlayerPositions,
): number {
  let maximumError = 0;
  for (const playerId of PLAYER_IDS) {
    maximumError = Math.max(
      maximumError,
      vectorMirrorError(right[playerId], left[playerId], true),
    );
  }
  return maximumError;
}

export function scanP03PolicyMatrix(): P03MatrixAuditResult {
  const rows: P03MatrixRow[] = [];
  const leftRows: P03MatrixRow[] = [];
  const mirrors: P03MirrorRow[] = [];
  const failureReasons: string[] = [];

  for (const matchup of P03_POLICY_MATCHUPS) {
    const rightFirst = runP03Case(matchup.id, "right");
    const rightReplay = runP03Case(matchup.id, "right");
    const leftFirst = runP03Case(matchup.id, "left");
    const leftReplay = runP03Case(matchup.id, "left");
    const deterministicRight = JSON.stringify(rightFirst.trace) === JSON.stringify(rightReplay.trace);
    const deterministicLeft = JSON.stringify(leftFirst.trace) === JSON.stringify(leftReplay.trace);
    const mirror = compareMirrorRuns(
      matchup.id,
      rightFirst,
      leftFirst,
      deterministicRight,
      deterministicLeft,
    );
    const initialMirrorError = assertMirroredInitialPositions(
      makeP03PolicyConfig(matchup.id, "right").initialPositions,
      makeP03PolicyConfig(matchup.id, "left").initialPositions,
    );
    const mirrorWithInitial: P03MirrorRow = initialMirrorError > 1e-9
      ? {
          ...mirror,
          mirrored: false,
          maximumMirrorError: Math.max(mirror.maximumMirrorError, initialMirrorError),
          failureReasons: [
            ...mirror.failureReasons,
            `initial positions mirror error ${initialMirrorError}`,
          ],
        }
      : mirror;
    if (!deterministicRight) failureReasons.push(`${matchup.id}/right is not deterministic`);
    if (!deterministicLeft) failureReasons.push(`${matchup.id}/left is not deterministic`);
    if (rightFirst.row.invariantFailures.length > 0) {
      failureReasons.push(`${matchup.id}/right: ${rightFirst.row.invariantFailures.join(", ")}`);
    }
    if (leftFirst.row.invariantFailures.length > 0) {
      failureReasons.push(`${matchup.id}/left: ${leftFirst.row.invariantFailures.join(", ")}`);
    }
    if (mirrorWithInitial.failureReasons.length > 0) {
      failureReasons.push(
        `${matchup.id}/mirror: ${mirrorWithInitial.failureReasons.join(", ")}`,
      );
    }
    rows.push({ ...rightFirst.row, deterministic: deterministicRight });
    leftRows.push({ ...leftFirst.row, deterministic: deterministicLeft });
    mirrors.push(mirrorWithInitial);
  }

  const deterministic = rows.every((row) => row.deterministic) &&
    leftRows.every((row) => row.deterministic);
  const invariantSafe = [...rows, ...leftRows].every(
    (row) => row.invariantFailures.length === 0,
  );
  const mirrorSafe = mirrors.every((row) => row.mirrored && row.failureReasons.length === 0);
  return {
    id: "P03",
    commonInput: P03_COMMON_INPUT,
    rows,
    leftRows,
    mirrors,
    deterministic,
    invariantSafe,
    mirrorSafe,
    passed: deterministic && invariantSafe && mirrorSafe && failureReasons.length === 0,
    failureReasons,
  };
}
