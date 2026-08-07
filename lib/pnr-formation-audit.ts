import {
  COURT,
  EVENT_ORDER,
  FIXED_DT,
  FORMATION_LANDMARK_OFFSETS,
  PLAYER_IDS,
  PnrSimulation,
  copyInitialPlayerPositions,
  createPlannerObservation,
  distance,
  formationReadiness,
  mirrorInitialPlayerPositions,
  mirrorPointAcrossCenterline,
  mirrorVectorAcrossCenterline,
  type InitialPlayerPositions,
  type PlayerId,
  type PlanningRecord,
  type ScreenSide,
  type SimulationConfig,
  type Team,
  type TeamPlan,
  type TeamPlanRoute,
  type TerminalState,
  type Vec2,
  type WorldEvent,
} from "./pnr-core.ts";
import {
  F01_CANONICAL_STARTS,
  copyFormationDomainPositions,
  measureFormationInputParameters,
  type F01CanonicalStart,
  type FormationDomainPositions,
  type FormationInputParameters,
} from "./pnr-formation-domain.ts";
import { F02_FORMATION_SAMPLES } from "./pnr-f02-formation-samples.ts";
import {
  DEFAULT_TEAM_STRATEGY_SELECTION,
  copyTeamStrategySelection,
} from "./pnr-strategy.ts";

export const FORMATION_GENERALIZATION_SIMULATION_SEED = 17 as const;
export const FORMATION_GENERALIZATION_MAX_TIME = 8 as const;

export interface FormationAuditSpec {
  id: string;
  label: string;
  stage: "F01" | "F02" | "F03";
  tacticalPositions: FormationDomainPositions;
  source: Readonly<Record<string, unknown>>;
}

export interface FormationRouteSegmentSummary {
  playerId: PlayerId;
  segmentIndex: number;
  phase: string;
  target: Vec2;
  legal: boolean;
  minimumBodyClearance: number;
}

export interface FormationObserverPlanSummary {
  tick: number;
  team: Team;
  planId: string;
  roles: Array<{ playerId: PlayerId; roleCode: string; owner: string }>;
  routeKind: string | null;
  segments: FormationRouteSegmentSummary[];
}

export interface FormationEventTicks {
  screenSet: number | null;
  jointReady: number | null;
  branch: number | null;
  screenCleared: number | null;
  terminal: number | null;
}

export interface FormationFailureTrace {
  tick: number;
  failures: string[];
  players: Record<PlayerId, { pos: Vec2; vel: Vec2 }>;
  offensePlan: FormationObserverPlanSummary;
  defensePlan: FormationObserverPlanSummary;
  planning: Array<{
    team: Team;
    chosen: string;
    candidates: Array<{ id: string; feasible: boolean; vetoes: string[] }>;
  }>;
  events: Array<{ type: string; tick: number }>;
}

export interface FormationSideAudit {
  side: ScreenSide;
  deterministic: boolean;
  terminalReason: TerminalState["reason"] | null;
  terminalTick: number | null;
  branch: "undecided" | "use" | "reject";
  eventTicks: FormationEventTicks;
  initialMinimumBodyGap: number;
  minimumBodyGap: number;
  maximumPlayerStep: number;
  maximumAllowedPlayerStep: number;
  formationTimeSeconds: number;
  offenseReplans: number;
  defenseReplans: number;
  safeExitReason: string | null;
  observerPlans: FormationObserverPlanSummary[];
  events: Array<Pick<WorldEvent, "type" | "tick" | "availableAtTick" | "label">>;
  failures: string[];
  failureTrace: FormationFailureTrace | null;
  passed: boolean;
}

export interface FormationPairAudit {
  id: string;
  label: string;
  stage: FormationAuditSpec["stage"];
  source: Readonly<Record<string, unknown>>;
  tacticalPositions: FormationDomainPositions;
  parameters: FormationInputParameters;
  o5ArrivalDistance: number;
  right: FormationSideAudit;
  left: FormationSideAudit;
  mirrorMaximumError: number;
  mirrorSemanticMatch: boolean;
  mirrorPassed: boolean;
  passed: boolean;
}

export interface FormationStageAudit {
  stage: FormationAuditSpec["stage"];
  canonicalInputCount: number;
  worldCount: number;
  executionsPerWorld: number;
  rows: FormationPairAudit[];
  successfulFormationWorlds: number;
  safeExitWorlds: number;
  deterministic: boolean;
  mirrored: boolean;
  invariantsPassed: boolean;
  passed: boolean;
  failedCaseIds: string[];
  failureReasons: string[];
}

interface SideRunState {
  simulation: PnrSimulation;
  failures: Set<string>;
  failureTrace: FormationFailureTrace | null;
  previousPositions: Record<PlayerId, Vec2>;
  previousBall: { pos: Vec2; inFlight: boolean };
  initialMinimumBodyGap: number;
  minimumBodyGap: number;
  maximumPlayerStep: number;
  maximumAllowedPlayerStep: number;
  observerPlans: FormationObserverPlanSummary[];
  observerPlanSignatures: Set<string>;
  handoffChecked: boolean;
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

function copyOffsets(): SimulationConfig["formationLandmarkOffsets"] {
  return {
    screenAnchor: { ...FORMATION_LANDMARK_OFFSETS.screenAnchor },
    handlerWaitingPoint: { ...FORMATION_LANDMARK_OFFSETS.handlerWaitingPoint },
    useGate: { ...FORMATION_LANDMARK_OFFSETS.useGate },
    rejectGate: { ...FORMATION_LANDMARK_OFFSETS.rejectGate },
  };
}

export function makeFormationAuditConfig(
  tacticalPositions: FormationDomainPositions,
  side: ScreenSide,
  seed = FORMATION_GENERALIZATION_SIMULATION_SEED,
): SimulationConfig {
  const canonical = copyFormationDomainPositions(tacticalPositions) as InitialPlayerPositions;
  return {
    startMode: "form_pnr",
    formationLandmarkOffsets: copyOffsets(),
    initialPositions:
      side === "right"
        ? copyInitialPlayerPositions(canonical)
        : mirrorInitialPlayerPositions(canonical),
    screenSide: side,
    seed,
    maxTime: FORMATION_GENERALIZATION_MAX_TIME,
    d1FrontReactionDelay: 0.12,
    d1PostCatchRecoveryDelay: 0,
    o1MaxSpeed: 3.72,
    horizon: "formation_resolution",
    strategies: copyTeamStrategySelection(DEFAULT_TEAM_STRATEGY_SELECTION),
  };
}

function findF01Start(id: string): F01CanonicalStart {
  const start = F01_CANONICAL_STARTS.find((candidate) => candidate.id === id);
  if (!start) throw new Error(`Unknown F01 Formation start: ${id}`);
  return start;
}

export function makeF01Config(id: string, side: ScreenSide): SimulationConfig {
  const start = findF01Start(id);
  return makeFormationAuditConfig(start.tacticalPositions, side);
}

export function createF01Replay(id: string, side: ScreenSide): PnrSimulation {
  return new PnrSimulation(makeF01Config(id, side));
}

export function makeF02Config(id: string, side: ScreenSide): SimulationConfig {
  const sample = F02_FORMATION_SAMPLES.find((candidate) => candidate.id === id);
  if (!sample) throw new Error(`Unknown F02 Formation sample: ${id}`);
  return makeFormationAuditConfig(sample.tacticalPositions, side);
}

export function createF02Replay(id: string, side: ScreenSide): PnrSimulation {
  return new PnrSimulation(makeF02Config(id, side));
}

function bodyGap(simulation: PnrSimulation): number {
  return Math.min(
    ...PLAYER_PAIRS.map(([firstId, secondId]) => {
      const first = simulation.world.players[firstId];
      const second = simulation.world.players[secondId];
      return distance(first.pos, second.pos) - first.radius - second.radius;
    }),
  );
}

function planningFrame(records: PlanningRecord[]): object[] {
  return records.map(
    ({ tick, at, team, trigger, triggerEventIds, chosen, candidates, decisionPhase }) => ({
      tick,
      at,
      team,
      trigger,
      triggerEventIds,
      chosen,
      decisionPhase,
      candidates: candidates.map(
        ({ id, feasible, score, baseScore, strategyAdjustment, vetoes, evidence }) => ({
          id,
          feasible,
          score,
          baseScore,
          strategyAdjustment,
          vetoes,
          evidence,
        }),
      ),
    }),
  );
}

function eventFrame(events: WorldEvent[]): object[] {
  return events.map(({ type, tick, order, availableAtTick }) => ({
    type,
    tick,
    order,
    availableAtTick,
  }));
}

function deterministicFrame(
  simulation: PnrSimulation,
  planning: PlanningRecord[],
  events: WorldEvent[],
): string {
  return JSON.stringify({
    world: simulation.world,
    offensePlan: simulation.offensePlan,
    defensePlan: simulation.defensePlan,
    roles: simulation.getRoles(),
    planning: planningFrame(planning),
    events: eventFrame(events),
    collisions: simulation.lastCollisionResolution,
  });
}

function routeStructure(route: TeamPlanRoute | undefined): unknown {
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
  right: TeamPlanRoute | undefined,
  left: TeamPlanRoute | undefined,
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

function planScalarFrame(simulation: PnrSimulation): object {
  const scalar = (plan: TeamPlan): object => ({
    id: plan.id,
    version: plan.version,
    startedAt: plan.startedAt,
    startedTick: plan.startedTick,
    commitUntil: plan.commitUntil,
    watchdogAt: plan.watchdogAt,
    chosenScore: plan.chosenScore,
    passTarget: plan.passTarget ?? null,
    roles: plan.roles,
    route: routeStructure(plan.route),
  });
  return {
    offense: scalar(simulation.offensePlan),
    defense: scalar(simulation.defensePlan),
    roles: simulation.getRoles(),
  };
}

function factsFrame(simulation: PnrSimulation): object {
  const under = {
    ...simulation.world.under,
    ...(simulation.world.under.o1PositionAtScreenClear
      ? {
          o1PositionAtScreenClear:
            simulation.world.screenSide === "right"
              ? simulation.world.under.o1PositionAtScreenClear
              : mirrorPointAcrossCenterline(
                  simulation.world.under.o1PositionAtScreenClear,
                ),
        }
      : {}),
  };
  return {
    formation: simulation.world.formation,
    branch: simulation.world.branch,
    facts: simulation.world.facts,
    mismatch: simulation.world.mismatch,
    seal: simulation.world.seal,
    postCatch: simulation.world.postCatch,
    under,
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

function structuredNumericError(right: unknown, left: unknown): number {
  if (typeof right === "number" && typeof left === "number") {
    return Math.abs(right - left);
  }
  if (right === left) return 0;
  if (Array.isArray(right) && Array.isArray(left) && right.length === left.length) {
    return Math.max(
      0,
      ...right.map((value, index) => structuredNumericError(value, left[index])),
    );
  }
  if (right && left && typeof right === "object" && typeof left === "object") {
    const rightRecord = right as Record<string, unknown>;
    const leftRecord = left as Record<string, unknown>;
    const rightKeys = Object.keys(rightRecord).sort();
    const leftKeys = Object.keys(leftRecord).sort();
    if (JSON.stringify(rightKeys) !== JSON.stringify(leftKeys)) {
      return Number.POSITIVE_INFINITY;
    }
    return Math.max(
      0,
      ...rightKeys.map((key) =>
        structuredNumericError(rightRecord[key], leftRecord[key])
      ),
    );
  }
  return Number.POSITIVE_INFINITY;
}

function pointMirrorError(right: Vec2, left: Vec2): number {
  const expected = mirrorPointAcrossCenterline(right);
  return Math.max(Math.abs(expected.x - left.x), Math.abs(expected.y - left.y));
}

function vectorMirrorError(right: Vec2, left: Vec2): number {
  const expected = mirrorVectorAcrossCenterline(right);
  return Math.max(Math.abs(expected.x - left.x), Math.abs(expected.y - left.y));
}

function planPointError(right: TeamPlan, left: TeamPlan): number {
  let error = 0;
  for (const key of ["primaryTarget", "secondaryTarget"] as const) {
    const rightTarget = right[key];
    const leftTarget = left[key];
    if (rightTarget && leftTarget) {
      error = Math.max(error, pointMirrorError(rightTarget, leftTarget));
    } else if (rightTarget !== leftTarget) {
      return Number.POSITIVE_INFINITY;
    }
  }
  return Math.max(error, mirroredRouteNumericError(right.route, left.route));
}

function observerPlanSummary(
  simulation: PnrSimulation,
  team: Team,
): FormationObserverPlanSummary {
  const plan = team === "offense" ? simulation.offensePlan : simulation.defensePlan;
  const segments = PLAYER_IDS.flatMap((playerId) => {
    const track = plan.route?.tracks[playerId];
    if (!track) return [];
    return track.segments.map((segment, segmentIndex) => ({
      playerId,
      segmentIndex,
      phase: segment.phase,
      target: { ...segment.target },
      legal: segment.proof.legal,
      minimumBodyClearance: segment.proof.minimumBodyClearance,
    }));
  });
  return {
    tick: simulation.world.tick,
    team,
    planId: plan.id,
    roles: Object.values(plan.roles).flatMap((role) =>
      role
        ? [{ playerId: role.playerId, roleCode: role.roleCode, owner: role.owner }]
        : []
    ),
    routeKind: plan.route?.kind ?? null,
    segments,
  };
}

function addObserverPlan(state: SideRunState, team: Team): void {
  const summary = observerPlanSummary(state.simulation, team);
  const signature = JSON.stringify({
    team: summary.team,
    planId: summary.planId,
    roles: summary.roles,
    routeKind: summary.routeKind,
    segments: summary.segments,
  });
  if (state.observerPlanSignatures.has(signature)) return;
  state.observerPlanSignatures.add(signature);
  state.observerPlans.push(summary);
}

function makeFailureTrace(
  simulation: PnrSimulation,
  failures: Set<string>,
  planning: PlanningRecord[],
  events: WorldEvent[],
): FormationFailureTrace {
  return {
    tick: simulation.world.tick,
    failures: [...failures],
    players: Object.fromEntries(
      PLAYER_IDS.map((id) => [id, {
        pos: { ...simulation.world.players[id].pos },
        vel: { ...simulation.world.players[id].vel },
      }]),
    ) as Record<PlayerId, { pos: Vec2; vel: Vec2 }>,
    offensePlan: observerPlanSummary(simulation, "offense"),
    defensePlan: observerPlanSummary(simulation, "defense"),
    planning: planning.map((record) => ({
      team: record.team,
      chosen: record.chosen,
      candidates: record.candidates.map((candidate) => ({
        id: candidate.id,
        feasible: candidate.feasible,
        vetoes: [...candidate.vetoes],
      })),
    })),
    events: events.map((event) => ({ type: event.type, tick: event.tick })),
  };
}

function rolesAreLegal(simulation: PnrSimulation): boolean {
  const roles = simulation.getRoles();
  return roles.length === PLAYER_IDS.length &&
    new Set(roles.map((role) => role.playerId)).size === PLAYER_IDS.length &&
    roles.every(
      (role) =>
        role.owner ===
        (role.playerId.startsWith("O") ? "offense-planner" : "defense-planner"),
    );
}

function observationBoundaryIsLegal(simulation: PnrSimulation): boolean {
  return (["offense", "defense"] as const).every((team) => {
    const observation = createPlannerObservation(simulation.world, team);
    const serialized = JSON.stringify(observation);
    return observation.screenSide === simulation.config.screenSide &&
      !/offensePlan|defensePlan|hiddenPlan|strateg(?:y|ies)/i.test(serialized) &&
      (team === "offense" ||
        (!Object.hasOwn(observation.landmarks, "handlerWaitingPoint") &&
          !Object.hasOwn(observation.landmarks, "useGate") &&
          !Object.hasOwn(observation.landmarks, "rejectGate")));
  });
}

function addWorldFailures(
  state: SideRunState,
  planning: PlanningRecord[],
  events: WorldEvent[],
): void {
  const simulation = state.simulation;
  const before = state.failures.size;
  const fail = (code: string): void => {
    state.failures.add(code);
  };
  if (simulation.world.time !== Math.round(simulation.world.tick * FIXED_DT * 1e6) / 1e6) {
    fail("FIXED_TIMESTEP_VIOLATION");
  }
  if (simulation.world.ball.inFlight !== (simulation.world.ballOwner === null)) {
    fail("ILLEGAL_POSSESSION");
  }
  if (
    simulation.world.facts.impeded &&
    !simulation.world.facts.contact &&
    !simulation.world.facts.routeExposure
  ) {
    fail("REMOTE_IMPEDED");
  }
  if (!rolesAreLegal(simulation)) fail("ROLE_OWNERSHIP_CONFLICT");
  if (!observationBoundaryIsLegal(simulation)) fail("INFORMATION_BOUNDARY_LEAK");

  if (simulation.world.formation.phase === "formation") {
    if (simulation.offensePlan.id !== "FORM_SCREEN") fail("FORMATION_OFFENSE_PLAN_JITTER");
    if (simulation.defensePlan.id !== "TRACK_FORMATION") fail("FORMATION_DEFENSE_PLAN_JITTER");
    if (simulation.world.branch !== "undecided") fail("BRANCH_DURING_FORMATION");
    if (simulation.world.facts.screenEffective) fail("SCREEN_EFFECTIVE_DURING_FORMATION");
    if (simulation.world.facts.impeded) fail("IMPEDED_DURING_FORMATION");
    const roles = new Map(simulation.getRoles().map((role) => [role.playerId, role.roleCode]));
    if (
      roles.get("O1") !== "setup_handler" ||
      roles.get("O5") !== "arrive_screen" ||
      roles.get("D1") !== "contain_setup" ||
      roles.get("D5") !== "track_screener"
    ) {
      fail("FORMATION_ROLE_JITTER");
    }
  }

  for (const record of planning) {
    const chosen = record.candidates.find((candidate) => candidate.id === record.chosen);
    if (!chosen?.feasible) fail("CHOSEN_CANDIDATE_NOT_FEASIBLE");
    if (
      (record.decisionPhase === "offense_formation" ||
        record.decisionPhase === "defense_formation") &&
      record.candidates.some((candidate) => candidate.strategyAdjustment !== 0)
    ) {
      fail("FORMATION_STRATEGY_ADJUSTMENT");
    }
  }

  for (const id of PLAYER_IDS) {
    const player = simulation.world.players[id];
    const step = distance(state.previousPositions[id], player.pos);
    const allowed = player.maxSpeed * FIXED_DT + 0.007;
    state.maximumPlayerStep = Math.max(state.maximumPlayerStep, step);
    state.maximumAllowedPlayerStep = Math.max(state.maximumAllowedPlayerStep, allowed);
    if (step > allowed + 1e-9) fail(`TELEPORT_${id}`);
    state.previousPositions[id] = { ...player.pos };
    if (
      player.pos.x < player.radius - 1e-9 ||
      player.pos.x > COURT.width - player.radius + 1e-9 ||
      player.pos.y < player.radius - 1e-9 ||
      player.pos.y > COURT.height - player.radius + 1e-9
    ) {
      fail(`PLAYER_OUT_OF_BOUNDS_${id}`);
    }
  }

  const currentBodyGap = bodyGap(simulation);
  state.minimumBodyGap = Math.min(state.minimumBodyGap, currentBodyGap);
  if (currentBodyGap < -0.01) fail("BODY_PENETRATION");
  if (
    state.previousBall.inFlight &&
    distance(state.previousBall.pos, simulation.world.ball.pos) > 14 * FIXED_DT + 0.007
  ) {
    fail("BALL_STEP_TOO_LARGE");
  }
  state.previousBall = {
    pos: { ...simulation.world.ball.pos },
    inFlight: simulation.world.ball.inFlight,
  };

  for (const event of events) {
    if (
      event.type === "pass_caught" ||
      event.type === "pass_denied" ||
      event.type === "kickout_caught" ||
      event.type === "reject_pass_caught"
    ) {
      const owner = simulation.world.ballOwner;
      if (!owner) {
        fail("TOUCH_WITHOUT_OWNER");
        continue;
      }
      const toucher = simulation.world.players[owner];
      const threshold =
        toucher.radius +
        simulation.world.ball.radius +
        (event.type === "pass_denied" ? 0.045 : 0.075);
      if (distance(simulation.world.ball.pos, toucher.pos) > threshold + 1e-9) {
        fail("NON_LOCAL_TOUCH");
      }
    }
    if (event.type === "formation_ready" && !state.handoffChecked) {
      state.handoffChecked = true;
      const readiness = formationReadiness(simulation.world);
      if (!readiness.ready) fail("FORMATION_READY_WITHOUT_JOINT_FACTS");
      const roles = new Map(simulation.getRoles().map((role) => [role.playerId, role.roleCode]));
      if (
        roles.get("D1") !== "contain_setup" ||
        roles.get("D5") !== "track_screener"
      ) {
        fail("FORMATION_HANDOFF_RESPONSIBILITY");
      }
      const o1 = simulation.world.players.O1;
      const o5 = simulation.world.players.O5;
      const d1 = simulation.world.players.D1;
      if (distance(o1.pos, COURT.hoop) - distance(d1.pos, COURT.hoop) <= 0) {
        fail("D1_NOT_GOAL_SIDE_AT_HANDOFF");
      }
      if (distance(d1.pos, o1.pos) >= distance(o5.pos, o1.pos)) {
        fail("D1_NOT_CLOSEST_O1_DEFENDER_AT_HANDOFF");
      }
    }
  }

  if (state.failures.size > before && !state.failureTrace) {
    state.failureTrace = makeFailureTrace(simulation, state.failures, planning, events);
  }
}

function makeSideRunState(simulation: PnrSimulation): SideRunState {
  const initialMinimumBodyGap = bodyGap(simulation);
  return {
    simulation,
    failures: new Set<string>(),
    failureTrace: null,
    previousPositions: Object.fromEntries(
      PLAYER_IDS.map((id) => [id, { ...simulation.world.players[id].pos }]),
    ) as Record<PlayerId, Vec2>,
    previousBall: {
      pos: { ...simulation.world.ball.pos },
      inFlight: simulation.world.ball.inFlight,
    },
    initialMinimumBodyGap,
    minimumBodyGap: initialMinimumBodyGap,
    maximumPlayerStep: 0,
    maximumAllowedPlayerStep: 0,
    observerPlans: [],
    observerPlanSignatures: new Set<string>(),
    handoffChecked: false,
  };
}

function eventOrderIsLegal(events: WorldEvent[]): boolean {
  return events.every((event, index) => {
    if (index === 0) return true;
    const previous = events[index - 1];
    return event.tick > previous.tick ||
      (event.tick === previous.tick && EVENT_ORDER[previous.type] <= EVENT_ORDER[event.type]);
  });
}

function eventDeliveryIsLegal(simulation: PnrSimulation): boolean {
  const byId = new Map(simulation.eventLog.map((event) => [event.id, event]));
  return simulation.planningLog.every((record) =>
    record.triggerEventIds.every((id) => {
      const event = byId.get(id);
      return Boolean(
        event &&
          event.availableAtTick > event.tick &&
          record.tick >= event.availableAtTick,
      );
    })
  );
}

function eventTicks(simulation: PnrSimulation): FormationEventTicks {
  const find = (...types: WorldEvent["type"][]): number | null =>
    simulation.eventLog.find((event) => types.includes(event.type))?.tick ?? null;
  return {
    screenSet: find("screen_set"),
    jointReady: find("formation_ready"),
    branch: find("branch_use", "branch_reject"),
    screenCleared: find("screen_cleared"),
    terminal: find("terminal"),
  };
}

function addCausalFailures(state: SideRunState): void {
  const simulation = state.simulation;
  const events = eventTicks(simulation);
  const terminalReason = simulation.world.terminal?.reason ?? null;
  const safeExit =
    terminalReason === "formation_timeout" || terminalReason === "formation_aborted";
  const fail = (code: string): void => {
    state.failures.add(code);
  };

  if (!simulation.world.terminal) fail("MISSING_FINITE_TERMINAL");
  if (!eventOrderIsLegal(simulation.eventLog)) fail("EVENT_ORDER_VIOLATION");
  if (!eventDeliveryIsLegal(simulation)) fail("EVENT_DELIVERY_VIOLATION");

  if (safeExit) {
    if (terminalReason === "formation_timeout" && !simulation.eventLog.some(
      (event) => event.type === "formation_timeout",
    )) {
      fail("TIMEOUT_WITHOUT_FORMATION_TIMEOUT_EVENT");
    }
    if (events.jointReady !== null || events.branch !== null) {
      fail("SAFE_EXIT_AFTER_ILLEGAL_PNR_ENTRY");
    }
  } else {
    if (events.screenSet === null) fail("MISSING_SCREEN_SET");
    if (events.jointReady === null) fail("MISSING_JOINT_READY");
    if (events.branch === null) fail("MISSING_BRANCH");
    if (
      events.screenSet !== null &&
      events.jointReady !== null &&
      events.screenSet > events.jointReady
    ) {
      fail("JOINT_READY_BEFORE_SCREEN_SET");
    }
    if (
      events.jointReady !== null &&
      events.branch !== null &&
      events.branch <= events.jointReady
    ) {
      fail("BRANCH_NOT_AFTER_JOINT_READY");
    }
    if (
      events.branch !== null &&
      events.screenCleared !== null &&
      events.screenCleared <= events.branch
    ) {
      fail("SCREEN_CLEAR_NOT_AFTER_BRANCH");
    }
    if (
      events.branch !== null &&
      events.terminal !== null &&
      events.terminal <= events.branch
    ) {
      fail("TERMINAL_NOT_AFTER_BRANCH");
    }
    const readyEvent = simulation.eventLog.find((event) => event.type === "formation_ready");
    const firstOffense = simulation.planningLog.find(
      (record) => record.decisionPhase === "offense_initial_read",
    );
    const firstDefense = simulation.planningLog.find(
      (record) => record.decisionPhase === "defense_initial_coverage",
    );
    if (
      !readyEvent ||
      firstOffense?.tick !== readyEvent.availableAtTick ||
      firstDefense?.tick !== readyEvent.availableAtTick
    ) {
      fail("PNR_NOT_ENTERED_ON_NEXT_JOINT_READY_BOUNDARY");
    }
  }

  for (const team of ["offense", "defense"] as const) {
    const formationRecords = simulation.planningLog.filter(
      (record) =>
        record.team === team &&
        (record.decisionPhase === "offense_formation" ||
          record.decisionPhase === "defense_formation"),
    );
    for (let index = 1; index < formationRecords.length; index += 1) {
      if (formationRecords[index].tick - formationRecords[index - 1].tick <= 1) {
        fail(`FORMATION_PLAN_FRAME_JITTER_${team.toUpperCase()}`);
      }
    }
  }

  if (state.failures.size > 0 && !state.failureTrace) {
    state.failureTrace = makeFailureTrace(
      simulation,
      state.failures,
      simulation.planningLog.slice(-2),
      simulation.eventLog.slice(-4),
    );
  }
}

function toSideAudit(state: SideRunState, deterministic: boolean): FormationSideAudit {
  addCausalFailures(state);
  if (!deterministic) state.failures.add("NON_DETERMINISTIC_REPLAY");
  const simulation = state.simulation;
  const ticks = eventTicks(simulation);
  const terminalReason = simulation.world.terminal?.reason ?? null;
  const safeExitReason =
    terminalReason === "formation_timeout" || terminalReason === "formation_aborted"
      ? terminalReason
      : null;
  const formationTick = ticks.jointReady ?? ticks.terminal ?? simulation.world.tick;
  return {
    side: simulation.config.screenSide,
    deterministic,
    terminalReason,
    terminalTick: ticks.terminal,
    branch: simulation.world.branch,
    eventTicks: ticks,
    initialMinimumBodyGap: state.initialMinimumBodyGap,
    minimumBodyGap: state.minimumBodyGap,
    maximumPlayerStep: state.maximumPlayerStep,
    maximumAllowedPlayerStep: state.maximumAllowedPlayerStep,
    formationTimeSeconds: formationTick * FIXED_DT,
    offenseReplans: simulation.planningLog.filter((record) => record.team === "offense").length,
    defenseReplans: simulation.planningLog.filter((record) => record.team === "defense").length,
    safeExitReason,
    observerPlans: state.observerPlans,
    events: simulation.eventLog.map(({ type, tick, availableAtTick, label }) => ({
      type,
      tick,
      availableAtTick,
      label,
    })),
    failures: [...state.failures],
    failureTrace: state.failureTrace,
    passed: state.failures.size === 0,
  };
}

export function auditFormationPair(spec: FormationAuditSpec): FormationPairAudit {
  const right = makeSideRunState(
    new PnrSimulation(makeFormationAuditConfig(spec.tacticalPositions, "right")),
  );
  const rightReplay = makeSideRunState(
    new PnrSimulation(makeFormationAuditConfig(spec.tacticalPositions, "right")),
  );
  const left = makeSideRunState(
    new PnrSimulation(makeFormationAuditConfig(spec.tacticalPositions, "left")),
  );
  const leftReplay = makeSideRunState(
    new PnrSimulation(makeFormationAuditConfig(spec.tacticalPositions, "left")),
  );
  const states = [right, rightReplay, left, leftReplay];
  for (const state of states) {
    addObserverPlan(state, "offense");
    addObserverPlan(state, "defense");
    addWorldFailures(state, [...state.simulation.planningLog], []);
  }

  let rightDeterministic =
    deterministicFrame(right.simulation, [...right.simulation.planningLog], []) ===
    deterministicFrame(rightReplay.simulation, [...rightReplay.simulation.planningLog], []);
  let leftDeterministic =
    deterministicFrame(left.simulation, [...left.simulation.planningLog], []) ===
    deterministicFrame(leftReplay.simulation, [...leftReplay.simulation.planningLog], []);
  let mirrorMaximumError = 0;
  let mirrorSemanticMatch = true;

  const compareMirror = (
    rightPlanning: PlanningRecord[],
    leftPlanning: PlanningRecord[],
    rightEvents: WorldEvent[],
    leftEvents: WorldEvent[],
  ): void => {
    for (const id of PLAYER_IDS) {
      mirrorMaximumError = Math.max(
        mirrorMaximumError,
        pointMirrorError(
          right.simulation.world.players[id].pos,
          left.simulation.world.players[id].pos,
        ),
        vectorMirrorError(
          right.simulation.world.players[id].vel,
          left.simulation.world.players[id].vel,
        ),
      );
    }
    mirrorMaximumError = Math.max(
      mirrorMaximumError,
      pointMirrorError(right.simulation.world.ball.pos, left.simulation.world.ball.pos),
      vectorMirrorError(right.simulation.world.ball.vel, left.simulation.world.ball.vel),
      right.simulation.world.ball.target && left.simulation.world.ball.target
        ? pointMirrorError(
            right.simulation.world.ball.target,
            left.simulation.world.ball.target,
          )
        : right.simulation.world.ball.target === left.simulation.world.ball.target
          ? 0
          : Number.POSITIVE_INFINITY,
      planPointError(right.simulation.offensePlan, left.simulation.offensePlan),
      planPointError(right.simulation.defensePlan, left.simulation.defensePlan),
      structuredNumericError(factsFrame(right.simulation), factsFrame(left.simulation)),
    );
    if (
      JSON.stringify(planScalarFrame(right.simulation)) !==
        JSON.stringify(planScalarFrame(left.simulation)) ||
      JSON.stringify(planningFrame(rightPlanning)) !==
        JSON.stringify(planningFrame(leftPlanning)) ||
      JSON.stringify(eventFrame(rightEvents)) !== JSON.stringify(eventFrame(leftEvents))
    ) {
      mirrorSemanticMatch = false;
    }
  };

  compareMirror(
    [...right.simulation.planningLog],
    [...left.simulation.planningLog],
    [],
    [],
  );

  for (let index = 0; index < 720; index += 1) {
    if (states.every((state) => state.simulation.world.terminal)) break;
    const slices = states.map((state) => ({
      planning: state.simulation.planningLog.length,
      events: state.simulation.eventLog.length,
    }));
    for (const state of states) {
      if (!state.simulation.world.terminal) state.simulation.step();
    }
    const newPlanning = states.map((state, stateIndex) =>
      state.simulation.planningLog.slice(slices[stateIndex].planning)
    );
    const newEvents = states.map((state, stateIndex) =>
      state.simulation.eventLog.slice(slices[stateIndex].events)
    );

    rightDeterministic &&=
      deterministicFrame(right.simulation, newPlanning[0], newEvents[0]) ===
      deterministicFrame(rightReplay.simulation, newPlanning[1], newEvents[1]);
    leftDeterministic &&=
      deterministicFrame(left.simulation, newPlanning[2], newEvents[2]) ===
      deterministicFrame(leftReplay.simulation, newPlanning[3], newEvents[3]);
    compareMirror(newPlanning[0], newPlanning[2], newEvents[0], newEvents[2]);

    states.forEach((state, stateIndex) => {
      if (newPlanning[stateIndex].some((record) => record.team === "offense")) {
        addObserverPlan(state, "offense");
      }
      if (newPlanning[stateIndex].some((record) => record.team === "defense")) {
        addObserverPlan(state, "defense");
      }
      addWorldFailures(state, newPlanning[stateIndex], newEvents[stateIndex]);
    });
  }

  if (!right.simulation.world.terminal) right.failures.add("MISSING_FINITE_TERMINAL");
  if (!rightReplay.simulation.world.terminal) {
    rightReplay.failures.add("MISSING_FINITE_TERMINAL");
  }
  if (!left.simulation.world.terminal) left.failures.add("MISSING_FINITE_TERMINAL");
  if (!leftReplay.simulation.world.terminal) {
    leftReplay.failures.add("MISSING_FINITE_TERMINAL");
  }
  if (rightReplay.failures.size > 0) {
    for (const failure of rightReplay.failures) right.failures.add(`REPLAY_${failure}`);
  }
  if (leftReplay.failures.size > 0) {
    for (const failure of leftReplay.failures) left.failures.add(`REPLAY_${failure}`);
  }

  const rightAudit = toSideAudit(right, rightDeterministic);
  const leftAudit = toSideAudit(left, leftDeterministic);
  const mirrorPassed =
    Number.isFinite(mirrorMaximumError) &&
    mirrorMaximumError <= 1e-9 &&
    mirrorSemanticMatch &&
    rightAudit.terminalTick === leftAudit.terminalTick &&
    rightAudit.terminalReason === leftAudit.terminalReason;
  const parameters = measureFormationInputParameters(spec.tacticalPositions);
  return {
    id: spec.id,
    label: spec.label,
    stage: spec.stage,
    source: spec.source,
    tacticalPositions: copyFormationDomainPositions(spec.tacticalPositions),
    parameters,
    o5ArrivalDistance: parameters.screenerApproachDistance,
    right: rightAudit,
    left: leftAudit,
    mirrorMaximumError,
    mirrorSemanticMatch,
    mirrorPassed,
    passed: rightAudit.passed && leftAudit.passed && mirrorPassed,
  };
}

export function auditFormationStage(
  stage: FormationAuditSpec["stage"],
  specs: readonly FormationAuditSpec[],
): FormationStageAudit {
  const rows: FormationPairAudit[] = [];
  const failureReasons: string[] = [];
  const failedCaseIds: string[] = [];
  for (const spec of specs) {
    const row = auditFormationPair(spec);
    rows.push(row);
    if (!row.passed) {
      failedCaseIds.push(row.id);
      failureReasons.push(
        ...row.right.failures.map((failure) => `${row.id}/right: ${failure}`),
        ...row.left.failures.map((failure) => `${row.id}/left: ${failure}`),
        ...(!row.mirrorPassed ? [`${row.id}: MIRROR_DIVERGENCE`] : []),
      );
      break;
    }
  }
  const sides = rows.flatMap((row) => [row.right, row.left]);
  const deterministic = sides.every((side) => side.deterministic);
  const mirrored = rows.every((row) => row.mirrorPassed);
  const invariantsPassed = sides.every((side) => side.failures.length === 0);
  return {
    stage,
    canonicalInputCount: specs.length,
    worldCount: specs.length * 2,
    executionsPerWorld: 2,
    rows,
    successfulFormationWorlds: sides.filter((side) => !side.safeExitReason).length,
    safeExitWorlds: sides.filter((side) => side.safeExitReason).length,
    deterministic,
    mirrored,
    invariantsPassed,
    passed:
      rows.length === specs.length &&
      deterministic &&
      mirrored &&
      invariantsPassed &&
      failureReasons.length === 0,
    failedCaseIds,
    failureReasons,
  };
}

export const F01_FORMATION_SPECS = Object.freeze(
  F01_CANONICAL_STARTS.map((start) => Object.freeze({
    id: start.id,
    label: start.label,
    stage: "F01" as const,
    tacticalPositions: start.tacticalPositions,
    source: Object.freeze({
      kind: "canonical" as const,
      focus: start.focus,
    }),
  })),
);

export function scanF01Formation(): FormationStageAudit {
  return auditFormationStage("F01", F01_FORMATION_SPECS);
}

export const F02_FORMATION_SPECS = Object.freeze(
  F02_FORMATION_SAMPLES.map((sample) => Object.freeze({
    id: sample.id,
    label: `bounded sample ${sample.id.slice(-2)}`,
    stage: "F02" as const,
    tacticalPositions: sample.tacticalPositions,
    source: sample.source as Readonly<Record<string, unknown>>,
  })),
);

export function scanF02Formation(): FormationStageAudit {
  return auditFormationStage("F02", F02_FORMATION_SPECS);
}
