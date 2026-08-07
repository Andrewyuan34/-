import {
  COURT,
  FIXED_DT,
  PLAYER_IDS,
  PnrSimulation,
  copyInitialPlayerPositions,
  createPlannerObservation,
  distance,
  type CandidateEvaluation,
  type EventType,
  type InitialPlayerPositions,
  type PlanId,
  type PlayerId,
  type PlanningRecord,
  type RoleAssignment,
  type ScreenSide,
  type SimulationConfig,
  type Team,
  type TeamPlan,
  type TerminalState,
  type Vec2,
  type WorldEvent,
} from "./pnr-core.ts";
import {
  G08_FROZEN_CORE_COMMIT,
  G08_HELDOUT_MANIFEST,
  G08_MANIFEST_HASH,
  type G08ManifestItem,
  type G08ManifestSource,
} from "./pnr-g08-heldout-manifest.ts";

export const G08_MANIFEST_COMMIT =
  "b994d2d7520f00069e011e629ccb54f90ba8c5d5" as const;

export interface G08CandidateAudit {
  id: PlanId;
  label: string;
  feasible: boolean;
  score: number | null;
  vetoes: string[];
  evidence: string[];
}

export interface G08PlanningAudit {
  tick: number;
  at: number;
  team: Team;
  trigger: string;
  triggerEventIds: string[];
  chosen: PlanId;
  candidates: G08CandidateAudit[];
  commitUntil: number;
  watchdogAt: number;
  commitmentSeconds: number;
}

export interface G08RoleStep {
  tick: number;
  roles: Array<Pick<RoleAssignment, "playerId" | "roleCode" | "roleLabel" | "owner">>;
}

export interface G08EventAudit {
  id: string;
  type: EventType;
  tick: number;
  at: number;
  order: number;
  availableAtTick: number;
  label: string;
  detail: string;
}

export interface G08TouchAudit {
  eventType: EventType;
  tick: number;
  toucher: PlayerId | null;
  distance: number | null;
  localThreshold: number | null;
  local: boolean;
}

export type G08OutcomeCategory =
  | "defensive-stop"
  | "handler-advantage"
  | "interior-window"
  | "kickout-catch";

export interface G08DecisionBoundary {
  margin: number;
  tick: number;
  team: Team;
  chosen: PlanId;
  runnerUp: PlanId;
}

export interface G08CaseRow {
  id: string;
  manifestHash: string;
  side: ScreenSide;
  source: G08ManifestSource;
  initialPositions: InitialPlayerPositions;
  o1MaxSpeed: number;
  d1FrontReactionDelay: number;
  d1PostCatchRecoveryDelay: number;
  horizon: SimulationConfig["horizon"];
  firstOffense: G08PlanningAudit;
  firstDefense: G08PlanningAudit;
  planning: G08PlanningAudit[];
  roleSequence: G08RoleStep[];
  events: G08EventAudit[];
  branch: "undecided" | "use" | "reject";
  terminalReason: TerminalState["reason"];
  terminalLabel: string;
  terminalTick: number;
  terminalTime: number;
  outcomeCategory: G08OutcomeCategory;
  defenseContained: boolean;
  offenseReplans: number;
  defenseReplans: number;
  watchdogReplans: number;
  urgentCommitInterrupts: number;
  minimumCommitmentSeconds: number;
  positionPerturbationMagnitude: number;
  closestDecisionBoundary: G08DecisionBoundary | null;
  minimumBodyGap: number;
  maxStepDisplacement: number;
  maxBallStep: number;
  finalBallOwner: PlayerId | null;
  finalBallOutcome: "live" | "caught" | "deflected" | "missed";
  passLaunches: number;
  passResolutions: number;
  touches: G08TouchAudit[];
  firstToucher: PlayerId | null;
  contactSeen: boolean;
  contactFirstTick: number | null;
  routeExposureSeen: boolean;
  routeExposureFirstTick: number | null;
  impededSeen: boolean;
  impededFirstTick: number | null;
  screenEffectiveSeen: boolean;
  screenEffectiveFirstTick: number | null;
  deterministic: boolean;
  earliestDivergenceTick: number | null;
  maxReplayNumericError: number;
  informationBoundaryPassed: boolean;
  explainable: boolean;
  invariantFailures: string[];
}

export interface G08SideSummary {
  side: ScreenSide;
  count: number;
  maxReplayNumericError: number;
  minimumBodyGap: number;
  maxStepDisplacement: number;
  maxBallStep: number;
  longestTerminalTick: number;
}

export interface G08ReplaySelection {
  id: "closest-boundary" | "largest-displacement" | "longest-run" | "diverse-fourth";
  manifestId: string;
  label: string;
  note: string;
}

export interface G08AuditResult {
  id: "G08";
  label: string;
  frozenCoreCommit: string;
  manifestCommit: string;
  manifestHash: string;
  manifestCount: number;
  executedCount: number;
  rows: G08CaseRow[];
  rightSummary: G08SideSummary;
  leftSummary: G08SideSummary;
  terminalCounts: Record<string, number>;
  outcomeCounts: Record<G08OutcomeCategory, number>;
  deterministic: boolean;
  informationBoundaryPassed: boolean;
  invariantsPassed: boolean;
  explainable: boolean;
  passed: boolean;
  failedCaseIds: string[];
  failureReasons: string[];
  replays: G08ReplaySelection[];
}

const PLAYER_PAIRS = (() => {
  const pairs: Array<[PlayerId, PlayerId]> = [];
  for (let first = 0; first < PLAYER_IDS.length; first += 1) {
    for (let second = first + 1; second < PLAYER_IDS.length; second += 1) {
      pairs.push([PLAYER_IDS[first], PLAYER_IDS[second]]);
    }
  }
  return pairs;
})();

const TOUCH_EVENTS = new Set<EventType>([
  "pass_caught",
  "pass_denied",
  "kickout_caught",
  "reject_pass_caught",
]);

const PASS_LAUNCH_EVENTS = new Set<EventType>([
  "pass_launched",
  "kickout_launched",
  "reject_pass_launched",
]);

function getManifestItem(id: string): G08ManifestItem {
  const item = G08_HELDOUT_MANIFEST.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Unknown G08 held-out case: ${id}`);
  return item;
}

export function makeG08Config(id: string): SimulationConfig {
  const item = getManifestItem(id);
  return {
    ...item.input,
    initialPositions: copyInitialPlayerPositions(item.input.initialPositions),
  };
}

export function createG08Replay(id: string): PnrSimulation {
  return new PnrSimulation(makeG08Config(id));
}

function cloneCandidate(candidate: CandidateEvaluation): G08CandidateAudit {
  return {
    id: candidate.id,
    label: candidate.label,
    feasible: candidate.feasible,
    score: candidate.score,
    vetoes: [...candidate.vetoes],
    evidence: [...candidate.evidence],
  };
}

function clonePlanning(record: PlanningRecord, plan: TeamPlan): G08PlanningAudit {
  return {
    tick: record.tick,
    at: record.at,
    team: record.team,
    trigger: record.trigger,
    triggerEventIds: [...record.triggerEventIds],
    chosen: record.chosen,
    candidates: record.candidates.map(cloneCandidate),
    commitUntil: plan.commitUntil,
    watchdogAt: plan.watchdogAt,
    commitmentSeconds: plan.commitUntil - plan.startedAt,
  };
}

function cloneRoles(roles: RoleAssignment[]): G08RoleStep["roles"] {
  return roles.map(({ playerId, roleCode, roleLabel, owner }) => ({
    playerId,
    roleCode,
    roleLabel,
    owner,
  }));
}

function cloneEvent(event: WorldEvent): G08EventAudit {
  return {
    id: event.id,
    type: event.type,
    tick: event.tick,
    at: event.at,
    order: event.order,
    availableAtTick: event.availableAtTick,
    label: event.label,
    detail: event.detail,
  };
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

function observationBoundaryIsLegal(simulation: PnrSimulation): boolean {
  return (["offense", "defense"] as const).every((team) => {
    const observation = createPlannerObservation(simulation.world, team);
    const serialized = JSON.stringify(observation);
    return (
      observation.screenSide === simulation.config.screenSide &&
      observation.ownPlayerIds.every((id) => id.startsWith(team === "offense" ? "O" : "D")) &&
      !serialized.includes("offensePlan") &&
      !serialized.includes("defensePlan") &&
      !serialized.includes("hiddenPlan") &&
      !serialized.includes("strategy")
    );
  });
}

function planningIsExplainable(planning: G08PlanningAudit[]): boolean {
  return planning.every((record) => {
    const chosen = record.candidates.find((candidate) => candidate.id === record.chosen);
    return Boolean(
      chosen?.feasible &&
        !record.chosen.includes("G08") &&
        !record.chosen.startsWith("USE_LEFT_"),
    );
  });
}

function eventOrderIsLegal(events: WorldEvent[]): boolean {
  return events.every((event, index) => {
    if (index === 0) return true;
    const previous = events[index - 1];
    return event.tick > previous.tick || (event.tick === previous.tick && event.order >= previous.order);
  });
}

function eventDeliveryIsLegal(simulation: PnrSimulation): boolean {
  const events = new Map(simulation.eventLog.map((event) => [event.id, event]));
  return simulation.planningLog.every((record) =>
    record.triggerEventIds.every((id) => {
      const event = events.get(id);
      return Boolean(event && record.tick >= event.availableAtTick);
    }),
  );
}

function structuredNumericError(first: unknown, second: unknown): number {
  if (typeof first === "number" && typeof second === "number") {
    return Math.abs(first - second);
  }
  if (first === second) return 0;
  if (Array.isArray(first) && Array.isArray(second) && first.length === second.length) {
    return Math.max(0, ...first.map((value, index) => structuredNumericError(value, second[index])));
  }
  if (first && second && typeof first === "object" && typeof second === "object") {
    const firstRecord = first as Record<string, unknown>;
    const secondRecord = second as Record<string, unknown>;
    const firstKeys = Object.keys(firstRecord).sort();
    const secondKeys = Object.keys(secondRecord).sort();
    if (JSON.stringify(firstKeys) !== JSON.stringify(secondKeys)) return Number.POSITIVE_INFINITY;
    return Math.max(
      0,
      ...firstKeys.map((key) => structuredNumericError(firstRecord[key], secondRecord[key])),
    );
  }
  return Number.POSITIVE_INFINITY;
}

function determinismFrame(
  simulation: PnrSimulation,
  planning: PlanningRecord[],
  events: WorldEvent[],
): object {
  return {
    world: simulation.world,
    offensePlan: simulation.offensePlan,
    defensePlan: simulation.defensePlan,
    roles: simulation.getRoles(),
    planning,
    events,
  };
}

function recordPlanning(
  simulation: PnrSimulation,
  records: PlanningRecord[],
): G08PlanningAudit[] {
  return records.map((record) =>
    clonePlanning(
      record,
      record.team === "offense" ? simulation.offensePlan : simulation.defensePlan,
    ),
  );
}

function bodyGap(simulation: PnrSimulation): number {
  return Math.min(
    ...PLAYER_PAIRS.map(([first, second]) => {
      const firstPlayer = simulation.world.players[first];
      const secondPlayer = simulation.world.players[second];
      return distance(firstPlayer.pos, secondPlayer.pos) - firstPlayer.radius - secondPlayer.radius;
    }),
  );
}

function addWorldFailures(
  simulation: PnrSimulation,
  failures: Set<string>,
  previousBall: { pos: Vec2; inFlight: boolean },
): void {
  if (simulation.world.time !== Math.round(simulation.world.tick * FIXED_DT * 1e6) / 1e6) {
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
  if (
    previousBall.inFlight &&
    distance(previousBall.pos, simulation.world.ball.pos) > 14 * FIXED_DT + 0.007
  ) {
    failures.add("BALL_STEP_TOO_LARGE");
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
  if (bodyGap(simulation) < -0.01) failures.add("BODY_OVERLAP_DURING_RUN");
  if (!observationBoundaryIsLegal(simulation)) failures.add("INFORMATION_BOUNDARY_LEAK");
}

function touchAudit(simulation: PnrSimulation, event: WorldEvent): G08TouchAudit {
  const toucher = simulation.world.ballOwner;
  if (event.type === "pass_denied" && simulation.world.ball.outcome === "missed") {
    return {
      eventType: event.type,
      tick: event.tick,
      toucher: null,
      distance: null,
      localThreshold: null,
      local: true,
    };
  }
  if (!toucher) {
    return {
      eventType: event.type,
      tick: event.tick,
      toucher: null,
      distance: null,
      localThreshold: null,
      local: false,
    };
  }
  const player = simulation.world.players[toucher];
  const actualDistance = distance(simulation.world.ball.pos, player.pos);
  const localThreshold =
    player.radius + simulation.world.ball.radius + (event.type === "pass_denied" ? 0.045 : 0.075);
  return {
    eventType: event.type,
    tick: event.tick,
    toucher,
    distance: actualDistance,
    localThreshold,
    local: actualDistance <= localThreshold + 1e-9,
  };
}

function closestDecisionBoundary(planning: G08PlanningAudit[]): G08DecisionBoundary | null {
  let closest: G08DecisionBoundary | null = null;
  for (const record of planning) {
    const feasible = record.candidates
      .filter((candidate) => candidate.feasible && candidate.score !== null)
      .sort((first, second) => (second.score ?? 0) - (first.score ?? 0));
    if (feasible.length < 2) continue;
    const margin = Math.abs((feasible[0].score ?? 0) - (feasible[1].score ?? 0));
    if (!closest || margin < closest.margin) {
      closest = {
        margin,
        tick: record.tick,
        team: record.team,
        chosen: record.chosen,
        runnerUp: feasible[0].id === record.chosen ? feasible[1].id : feasible[0].id,
      };
    }
  }
  return closest;
}

function outcomeCategory(reason: TerminalState["reason"]): G08OutcomeCategory {
  if (
    reason === "pass_denied" ||
    reason === "switch_contained" ||
    reason === "defense_contained"
  ) {
    return "defensive-stop";
  }
  if (reason === "post_catch_kickout_caught") return "kickout-catch";
  if (
    reason === "seal_catch_advantage" ||
    reason === "post_catch_finish_window" ||
    reason === "reject_slip_caught"
  ) {
    return "interior-window";
  }
  return "handler-advantage";
}

function runHeldoutCase(item: G08ManifestItem): G08CaseRow {
  const first = createG08Replay(item.id);
  const second = createG08Replay(item.id);
  const failures = new Set<string>();
  const planning = recordPlanning(first, [...first.planningLog]);
  const roleSequence: G08RoleStep[] = [{ tick: 0, roles: cloneRoles(first.getRoles()) }];
  const touches: G08TouchAudit[] = [];
  let priorRoleSignature = JSON.stringify(roleSequence[0].roles);
  let minimumBodyGap = Math.min(bodyGap(first), bodyGap(second));
  let maxStepDisplacement = 0;
  let maxBallStep = 0;
  let maxReplayNumericError = 0;
  let earliestDivergenceTick: number | null = null;
  let informationBoundaryPassed = observationBoundaryIsLegal(first) && observationBoundaryIsLegal(second);
  let previousFirstBall = { pos: { ...first.world.ball.pos }, inFlight: first.world.ball.inFlight };
  let previousSecondBall = { pos: { ...second.world.ball.pos }, inFlight: second.world.ball.inFlight };
  const firstTrueTick: Record<"contact" | "routeExposure" | "impeded" | "screenEffective", number | null> = {
    contact: null,
    routeExposure: null,
    impeded: null,
    screenEffective: null,
  };

  const compareCurrent = (firstPlanning: PlanningRecord[], firstEvents: WorldEvent[], secondPlanning: PlanningRecord[], secondEvents: WorldEvent[]): void => {
    const firstFrame = determinismFrame(first, firstPlanning, firstEvents);
    const secondFrame = determinismFrame(second, secondPlanning, secondEvents);
    const numericError = structuredNumericError(firstFrame, secondFrame);
    maxReplayNumericError = Math.max(maxReplayNumericError, numericError);
    if (JSON.stringify(firstFrame) !== JSON.stringify(secondFrame) && earliestDivergenceTick === null) {
      earliestDivergenceTick = Math.min(first.world.tick, second.world.tick);
    }
  };

  compareCurrent([...first.planningLog], [], [...second.planningLog], []);
  addWorldFailures(first, failures, previousFirstBall);
  addWorldFailures(second, failures, previousSecondBall);

  for (let index = 0; index < 600; index += 1) {
    if (first.world.terminal && second.world.terminal) break;
    const firstPlanningStart = first.planningLog.length;
    const secondPlanningStart = second.planningLog.length;
    const firstEventStart = first.eventLog.length;
    const secondEventStart = second.eventLog.length;
    first.step();
    second.step();
    const firstPlanning = first.planningLog.slice(firstPlanningStart);
    const secondPlanning = second.planningLog.slice(secondPlanningStart);
    const firstEvents = first.eventLog.slice(firstEventStart);
    const secondEvents = second.eventLog.slice(secondEventStart);
    compareCurrent(firstPlanning, firstEvents, secondPlanning, secondEvents);
    planning.push(...recordPlanning(first, firstPlanning));

    const roles = cloneRoles(first.getRoles());
    const roleSignature = JSON.stringify(roles);
    if (roleSignature !== priorRoleSignature) {
      roleSequence.push({ tick: first.world.tick, roles });
      priorRoleSignature = roleSignature;
    }

    for (const key of Object.keys(firstTrueTick) as Array<keyof typeof firstTrueTick>) {
      if (firstTrueTick[key] === null && first.world.facts[key]) firstTrueTick[key] = first.world.tick;
    }
    for (const event of firstEvents) {
      if (TOUCH_EVENTS.has(event.type)) touches.push(touchAudit(first, event));
    }

    addWorldFailures(first, failures, previousFirstBall);
    addWorldFailures(second, failures, previousSecondBall);
    informationBoundaryPassed &&=
      observationBoundaryIsLegal(first) && observationBoundaryIsLegal(second);
    minimumBodyGap = Math.min(minimumBodyGap, bodyGap(first), bodyGap(second));
    maxStepDisplacement = Math.max(
      maxStepDisplacement,
      first.world.lastStepMaxDisplacement,
      second.world.lastStepMaxDisplacement,
    );
    if (previousFirstBall.inFlight) {
      maxBallStep = Math.max(maxBallStep, distance(previousFirstBall.pos, first.world.ball.pos));
    }
    if (previousSecondBall.inFlight) {
      maxBallStep = Math.max(maxBallStep, distance(previousSecondBall.pos, second.world.ball.pos));
    }
    previousFirstBall = { pos: { ...first.world.ball.pos }, inFlight: first.world.ball.inFlight };
    previousSecondBall = { pos: { ...second.world.ball.pos }, inFlight: second.world.ball.inFlight };
  }

  const deterministic = earliestDivergenceTick === null;
  if (!deterministic) failures.add("NON_DETERMINISTIC_REPLAY");
  if (!first.world.terminal || !second.world.terminal) failures.add("NO_EXPLICIT_TERMINAL");
  if (!informationBoundaryPassed) failures.add("INFORMATION_BOUNDARY_LEAK");
  if (!eventOrderIsLegal(first.eventLog) || !eventOrderIsLegal(second.eventLog)) {
    failures.add("EVENT_ORDER_VIOLATION");
  }
  if (!eventDeliveryIsLegal(first) || !eventDeliveryIsLegal(second)) {
    failures.add("EVENT_DELIVERY_VIOLATION");
  }
  if (!planningIsExplainable(planning)) failures.add("UNEXPLAINABLE_PLAN");
  if (touches.some((touch) => !touch.local)) failures.add("NON_LOCAL_TOUCH");
  if (first.world.ball.inFlight || second.world.ball.inFlight) failures.add("TERMINAL_DURING_PASS");

  const passLaunches = first.eventLog.filter((event) => PASS_LAUNCH_EVENTS.has(event.type)).length;
  const passResolutions = first.eventLog.filter((event) => TOUCH_EVENTS.has(event.type)).length;
  if (passLaunches !== passResolutions) failures.add("INCOMPLETE_PASS_PATH");
  if (planning.length > 40) failures.add("UNBOUNDED_REPLAN_LOOP");

  let urgentCommitInterrupts = 0;
  for (const team of ["offense", "defense"] as const) {
    const teamPlanning = planning.filter((record) => record.team === team);
    for (let index = 1; index < teamPlanning.length; index += 1) {
      const previous = teamPlanning[index - 1];
      const current = teamPlanning[index];
      if (current.at + 1e-9 < previous.commitUntil) {
        if (current.trigger.startsWith("显式中断：") && current.triggerEventIds.length > 0) {
          urgentCommitInterrupts += 1;
        } else {
          failures.add("COMMITMENT_BROKEN_WITHOUT_URGENT_EVENT");
        }
      }
    }
  }

  if (!first.world.terminal) {
    throw new Error(`G08 ${item.id} did not reach an explicit terminal within 600 ticks`);
  }
  const defenseContained = first.world.terminal.reason === "defense_contained";
  if (defenseContained && first.world.time + FIXED_DT < first.config.maxTime) {
    failures.add("EARLY_DEFENSE_CONTAINED");
  }

  const firstOffense = planning.find((record) => record.team === "offense");
  const firstDefense = planning.find((record) => record.team === "defense");
  if (!firstOffense || !firstDefense) {
    throw new Error(`G08 ${item.id} is missing an initial team plan`);
  }

  const offsets = item.source.offsets;
  const positionPerturbationMagnitude = Math.sqrt(
    offsets.formation.x ** 2 +
      offsets.formation.y ** 2 +
      offsets.O5.x ** 2 +
      offsets.O5.y ** 2 +
      offsets.D1.x ** 2 +
      offsets.D1.y ** 2 +
      offsets.D5.x ** 2 +
      offsets.D5.y ** 2,
  );
  const watchdogReplans = planning.filter((record) => record.trigger === "有限看门狗").length;
  if (defenseContained && watchdogReplans > 20) failures.add("UNBOUNDED_WATCHDOG_LOOP");

  return {
    id: item.id,
    manifestHash: G08_MANIFEST_HASH,
    side: item.side,
    source: item.source,
    initialPositions: copyInitialPlayerPositions(item.input.initialPositions),
    o1MaxSpeed: item.input.o1MaxSpeed,
    d1FrontReactionDelay: item.input.d1FrontReactionDelay,
    d1PostCatchRecoveryDelay: item.input.d1PostCatchRecoveryDelay,
    horizon: item.input.horizon,
    firstOffense,
    firstDefense,
    planning,
    roleSequence,
    events: first.eventLog.map(cloneEvent),
    branch: first.world.branch,
    terminalReason: first.world.terminal.reason,
    terminalLabel: first.world.terminal.label,
    terminalTick: first.world.tick,
    terminalTime: first.world.time,
    outcomeCategory: outcomeCategory(first.world.terminal.reason),
    defenseContained,
    offenseReplans: planning.filter((record) => record.team === "offense").length,
    defenseReplans: planning.filter((record) => record.team === "defense").length,
    watchdogReplans,
    urgentCommitInterrupts,
    minimumCommitmentSeconds: Math.min(...planning.map((record) => record.commitmentSeconds)),
    positionPerturbationMagnitude,
    closestDecisionBoundary: closestDecisionBoundary(planning),
    minimumBodyGap,
    maxStepDisplacement,
    maxBallStep,
    finalBallOwner: first.world.ballOwner,
    finalBallOutcome: first.world.ball.outcome,
    passLaunches,
    passResolutions,
    touches,
    firstToucher: touches[0]?.toucher ?? null,
    contactSeen: firstTrueTick.contact !== null,
    contactFirstTick: firstTrueTick.contact,
    routeExposureSeen: firstTrueTick.routeExposure !== null,
    routeExposureFirstTick: firstTrueTick.routeExposure,
    impededSeen: firstTrueTick.impeded !== null,
    impededFirstTick: firstTrueTick.impeded,
    screenEffectiveSeen: firstTrueTick.screenEffective !== null,
    screenEffectiveFirstTick: firstTrueTick.screenEffective,
    deterministic,
    earliestDivergenceTick,
    maxReplayNumericError,
    informationBoundaryPassed,
    explainable: planningIsExplainable(planning),
    invariantFailures: [...failures],
  };
}

function emptySideSummary(side: ScreenSide): G08SideSummary {
  return {
    side,
    count: 0,
    maxReplayNumericError: 0,
    minimumBodyGap: Number.POSITIVE_INFINITY,
    maxStepDisplacement: 0,
    maxBallStep: 0,
    longestTerminalTick: 0,
  };
}

function summarizeSide(rows: G08CaseRow[], side: ScreenSide): G08SideSummary {
  const selected = rows.filter((row) => row.side === side);
  if (selected.length === 0) return emptySideSummary(side);
  return {
    side,
    count: selected.length,
    maxReplayNumericError: Math.max(...selected.map((row) => row.maxReplayNumericError)),
    minimumBodyGap: Math.min(...selected.map((row) => row.minimumBodyGap)),
    maxStepDisplacement: Math.max(...selected.map((row) => row.maxStepDisplacement)),
    maxBallStep: Math.max(...selected.map((row) => row.maxBallStep)),
    longestTerminalTick: Math.max(...selected.map((row) => row.terminalTick)),
  };
}

function selectReplays(rows: G08CaseRow[]): G08ReplaySelection[] {
  if (rows.length < 4) return [];
  const selected: G08CaseRow[] = [];
  const add = (row: G08CaseRow | undefined): void => {
    if (row && !selected.some((candidate) => candidate.id === row.id)) selected.push(row);
  };

  add(
    rows
      .filter((row) => row.closestDecisionBoundary)
      .sort(
        (first, second) =>
          (first.closestDecisionBoundary?.margin ?? Number.POSITIVE_INFINITY) -
            (second.closestDecisionBoundary?.margin ?? Number.POSITIVE_INFINITY) ||
          first.id.localeCompare(second.id),
      )[0],
  );
  add(
    rows
      .filter((row) => !selected.some((candidate) => candidate.id === row.id))
      .sort(
        (first, second) =>
          second.positionPerturbationMagnitude - first.positionPerturbationMagnitude ||
          first.id.localeCompare(second.id),
      )[0],
  );
  add(
    rows
      .filter((row) => !selected.some((candidate) => candidate.id === row.id))
      .sort(
        (first, second) =>
          second.offenseReplans + second.defenseReplans -
            (first.offenseReplans + first.defenseReplans) ||
          second.terminalTick - first.terminalTick ||
          first.id.localeCompare(second.id),
      )[0],
  );

  const representedSides = new Set(selected.map((row) => row.side));
  const representedOutcomes = new Set(selected.map((row) => row.outcomeCategory));
  add(
    rows
      .filter((row) => !selected.some((candidate) => candidate.id === row.id))
      .sort((first, second) => {
        const firstNovelty =
          Number(!representedSides.has(first.side)) +
          Number(!representedOutcomes.has(first.outcomeCategory));
        const secondNovelty =
          Number(!representedSides.has(second.side)) +
          Number(!representedOutcomes.has(second.outcomeCategory));
        return secondNovelty - firstNovelty || second.terminalTick - first.terminalTick || first.id.localeCompare(second.id);
      })[0],
  );

  const [closest, displaced, longest, diverse] = selected;
  return [
    {
      id: "closest-boundary",
      manifestId: closest.id,
      label: "候选分数最接近",
      note: `${closest.closestDecisionBoundary?.team ?? "team"}@${closest.closestDecisionBoundary?.tick ?? 0} · margin ${(closest.closestDecisionBoundary?.margin ?? 0).toFixed(3)}`,
    },
    {
      id: "largest-displacement",
      manifestId: displaced.id,
      label: "综合位置扰动最大",
      note: `扰动范数 ${displaced.positionPerturbationMagnitude.toFixed(3)}m · ${displaced.side}`,
    },
    {
      id: "longest-run",
      manifestId: longest.id,
      label: "重规划最多 / 运行最长",
      note: `${longest.offenseReplans + longest.defenseReplans} 次计划 · tick ${longest.terminalTick}`,
    },
    {
      id: "diverse-fourth",
      manifestId: diverse.id,
      label: "不同侧 / 结果类别",
      note: `${diverse.side} · ${diverse.outcomeCategory} · ${diverse.terminalReason}`,
    },
  ];
}

export function scanG08Heldout(): G08AuditResult {
  const rows: G08CaseRow[] = [];
  const failureReasons: string[] = [];
  const failedCaseIds: string[] = [];

  for (const item of G08_HELDOUT_MANIFEST) {
    const row = runHeldoutCase(item);
    rows.push(row);
    if (row.invariantFailures.length > 0) {
      failedCaseIds.push(row.id);
      failureReasons.push(...row.invariantFailures.map((failure) => `${row.id}: ${failure}`));
      break;
    }
  }

  const terminalCounts: Record<string, number> = {};
  const outcomeCounts: Record<G08OutcomeCategory, number> = {
    "defensive-stop": 0,
    "handler-advantage": 0,
    "interior-window": 0,
    "kickout-catch": 0,
  };
  for (const row of rows) {
    terminalCounts[row.terminalReason] = (terminalCounts[row.terminalReason] ?? 0) + 1;
    outcomeCounts[row.outcomeCategory] += 1;
  }

  const deterministic = rows.every((row) => row.deterministic);
  const informationBoundaryPassed = rows.every((row) => row.informationBoundaryPassed);
  const invariantsPassed = rows.every((row) => row.invariantFailures.length === 0);
  const explainable = rows.every((row) => row.explainable);
  const passed =
    rows.length === G08_HELDOUT_MANIFEST.length &&
    deterministic &&
    informationBoundaryPassed &&
    invariantsPassed &&
    explainable &&
    failureReasons.length === 0;

  return {
    id: "G08",
    label: "锁定 held-out 泛化检查点",
    frozenCoreCommit: G08_FROZEN_CORE_COMMIT,
    manifestCommit: G08_MANIFEST_COMMIT,
    manifestHash: G08_MANIFEST_HASH,
    manifestCount: G08_HELDOUT_MANIFEST.length,
    executedCount: rows.length,
    rows,
    rightSummary: summarizeSide(rows, "right"),
    leftSummary: summarizeSide(rows, "left"),
    terminalCounts,
    outcomeCounts,
    deterministic,
    informationBoundaryPassed,
    invariantsPassed,
    explainable,
    passed,
    failedCaseIds,
    failureReasons,
    replays: passed ? selectReplays(rows) : [],
  };
}
