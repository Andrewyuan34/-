import {
  COURT,
  FIXED_DT,
  PLAYER_IDS,
  PnrSimulation,
  distance,
  validateInitialPlayerPositions,
  type Branch,
  type CandidateEvaluation,
  type EventType,
  type InitialPlayerPositions,
  type PlanId,
  type PlayerId,
  type PlanningRecord,
  type SimulationConfig,
  type TerminalState,
  type WorldEvent,
} from "./pnr-core.ts";
import {
  DEFAULT_TEAM_STRATEGY_SELECTION,
  copyTeamStrategySelection,
} from "./pnr-strategy.ts";
import { makeInitialPositionsForCue } from "./pnr-scenarios.ts";

export type G05Coordinate = "x" | "y";
export type G05Axis = `${PlayerId}.${G05Coordinate}`;
export type G05CandidateStatus = "SIMULATED" | "EXPECTED_INVALID_INITIAL_OVERLAP";
export type G05ReplayId = "baseline" | "screen-shift" | "d1-impact";

export interface G05AxisSpec {
  playerId: PlayerId;
  coordinate: G05Coordinate;
  axis: G05Axis;
}

export interface G05CandidateSpec {
  id: string;
  playerId: PlayerId | null;
  coordinate: G05Coordinate | null;
  axis: G05Axis | "baseline";
  offset: number;
}

export interface G05CandidateAudit {
  id: PlanId;
  feasible: boolean;
  score: number | null;
  vetoes: string[];
  evidence: string[];
}

export interface G05InitialPlanAudit {
  chosen: PlanId;
  candidates: G05CandidateAudit[];
}

export interface G05PlanStep {
  tick: number;
  chosen: PlanId;
  trigger: string;
}

export interface G05EventAudit {
  type: EventType;
  tick: number;
  order: number;
  availableAtTick: number;
}

export interface G05SimulatedRow extends G05CandidateSpec {
  status: "SIMULATED";
  initialPositions: InitialPlayerPositions;
  deterministic: boolean;
  initialApplied: boolean;
  initialOffense: G05InitialPlanAudit;
  initialDefense: G05InitialPlanAudit;
  offensePlans: G05PlanStep[];
  defensePlans: G05PlanStep[];
  branch: Branch;
  events: G05EventAudit[];
  eventTicks: Partial<Record<EventType, number>>;
  contactSeen: boolean;
  routeExposureSeen: boolean;
  impededSeen: boolean;
  screenEffectiveSeen: boolean;
  switchCompleted: boolean;
  underCommitted: boolean;
  sealFronted: boolean;
  passLaunched: boolean;
  actualFirstToucher: "D1" | "O5" | null;
  ballOutcome: "live" | "caught" | "deflected" | "missed";
  terminalReason: TerminalState["reason"];
  terminalLabel: string;
  terminalTick: number;
  offenseReplans: number;
  defenseReplans: number;
  watchdogReplans: number;
  minimumBodyGap: number;
  maxStepDisplacement: number;
  ballFlightSteps: number;
  maxBallStep: number;
  localTouch: boolean;
  invariantFailures: string[];
}

export interface G05RejectedRow extends G05CandidateSpec {
  status: "EXPECTED_INVALID_INITIAL_OVERLAP";
  initialPositions: InitialPlayerPositions;
  error: string;
  overlapDistance: number;
  minimumDistance: number;
}

export type G05AuditRow = G05SimulatedRow | G05RejectedRow;

export interface G05AxisFailure {
  axis: G05Axis;
  fromOffset: number;
  toOffset: number;
  field: "offensePlan" | "defensePlan" | "branch";
  reason: string;
}

export interface G05AxisSummary {
  axis: G05Axis;
  ordered: Array<{
    id: string;
    offset: number;
    status: G05CandidateStatus;
    offensePlan: PlanId | null;
    defensePlan: PlanId | null;
    branch: Branch | null;
    terminalReason: TerminalState["reason"] | null;
  }>;
}

export interface G05ReplaySample {
  id: G05ReplayId;
  sampleId: string;
  label: string;
  note: string;
}

export interface G05AuditResult {
  id: "G04-G05";
  label: string;
  rows: G05AuditRow[];
  simulatedRows: G05SimulatedRow[];
  rejectedRows: G05RejectedRow[];
  candidateCount: number;
  simulatedCount: number;
  expectedRejectedCount: number;
  deterministic: boolean;
  invariantsPassed: boolean;
  monotonic: boolean;
  passed: boolean;
  axisSummaries: G05AxisSummary[];
  axisFailures: G05AxisFailure[];
  failureReasons: string[];
  replays: G05ReplaySample[];
}

interface G05AuditRun {
  row: Omit<G05SimulatedRow, "deterministic">;
  tickTrace: string[];
}

export const G05_OFFSETS = Object.freeze([-0.24, -0.12, 0, 0.12, 0.24]);

export const G05_AXES = Object.freeze(
  PLAYER_IDS.flatMap((playerId) =>
    (["x", "y"] as const).map((coordinate) => ({
      playerId,
      coordinate,
      axis: `${playerId}.${coordinate}` as G05Axis,
    })),
  ),
);

function sampleId(playerId: PlayerId, coordinate: G05Coordinate, offset: number): string {
  return `${playerId}.${coordinate}/${offset > 0 ? "+" : ""}${offset.toFixed(2)}`;
}

export const G05_CANDIDATES = Object.freeze([
  {
    id: "baseline",
    playerId: null,
    coordinate: null,
    axis: "baseline",
    offset: 0,
  },
  ...G05_AXES.flatMap(({ playerId, coordinate, axis }) =>
    G05_OFFSETS.filter((offset) => offset !== 0).map((offset) => ({
      id: sampleId(playerId, coordinate, offset),
      playerId,
      coordinate,
      axis,
      offset,
    })),
  ),
] satisfies G05CandidateSpec[]);

export const G05_BASE_CONFIG = Object.freeze({
  strategies: DEFAULT_TEAM_STRATEGY_SELECTION,
  initialPositions: makeInitialPositionsForCue("neutral"),
  screenSide: "right",
  seed: 17,
  maxTime: 7.4,
  d1FrontReactionDelay: 0.12,
  d1PostCatchRecoveryDelay: 0,
  o1MaxSpeed: 3.72,
  horizon: "pnr_resolution",
} satisfies SimulationConfig);

const EXPECTED_REJECTIONS = new Map<string, string>([
  ["O1.y/-0.24", "initialPositions O1/D1 overlap: 0.599m < 0.68m"],
  ["D1.y/+0.24", "initialPositions O1/D1 overlap: 0.599m < 0.68m"],
]);

function getCandidateSpec(id: string): G05CandidateSpec {
  const candidate = G05_CANDIDATES.find((item) => item.id === id);
  if (!candidate) throw new Error(`Unknown G05 sample: ${id}`);
  return candidate;
}

function makePositions(spec: G05CandidateSpec): InitialPlayerPositions {
  const positions = makeInitialPositionsForCue("neutral");
  if (spec.playerId && spec.coordinate) {
    positions[spec.playerId][spec.coordinate] += spec.offset;
  }
  return positions;
}

export function makeG05Config(id: string): SimulationConfig {
  const spec = getCandidateSpec(id);
  return {
    ...G05_BASE_CONFIG,
    strategies: copyTeamStrategySelection(G05_BASE_CONFIG.strategies),
    initialPositions: makePositions(spec),
  };
}

export function createG05Replay(id: string): PnrSimulation {
  return new PnrSimulation(makeG05Config(id));
}

function cloneCandidate(candidate: CandidateEvaluation): G05CandidateAudit {
  return {
    id: candidate.id,
    feasible: candidate.feasible,
    score: candidate.score,
    vetoes: [...candidate.vetoes],
    evidence: [...candidate.evidence],
  };
}

function cloneInitialPlan(record: PlanningRecord): G05InitialPlanAudit {
  return {
    chosen: record.chosen,
    candidates: record.candidates.map(cloneCandidate),
  };
}

function planningTrace(record: PlanningRecord): object {
  return {
    tick: record.tick,
    team: record.team,
    trigger: record.trigger,
    triggerEventIds: record.triggerEventIds,
    chosen: record.chosen,
    candidates: record.candidates.map(cloneCandidate),
  };
}

function captureTick(simulation: PnrSimulation, newPlanning: PlanningRecord[]): string {
  return JSON.stringify({
    tick: simulation.world.tick,
    stateHash: simulation.world.stateHash,
    offensePlan: {
      id: simulation.offensePlan.id,
      version: simulation.offensePlan.version,
      startedTick: simulation.offensePlan.startedTick,
    },
    defensePlan: {
      id: simulation.defensePlan.id,
      version: simulation.defensePlan.version,
      startedTick: simulation.defensePlan.startedTick,
    },
    roles: simulation.getRoles().map(({ playerId, roleCode, owner }) => ({
      playerId,
      roleCode,
      owner,
    })),
    events: simulation.eventLog
      .filter((event) => event.tick === simulation.world.tick)
      .map(({ id, type, order, availableAtTick, detail }) => ({
        id,
        type,
        order,
        availableAtTick,
        detail,
      })),
    planning: newPlanning.map(planningTrace),
  });
}

function addFailure(failures: Set<string>, condition: boolean, label: string): void {
  if (condition) failures.add(label);
}

function playerPairs(): Array<[PlayerId, PlayerId]> {
  const pairs: Array<[PlayerId, PlayerId]> = [];
  for (let first = 0; first < PLAYER_IDS.length; first += 1) {
    for (let second = first + 1; second < PLAYER_IDS.length; second += 1) {
      pairs.push([PLAYER_IDS[first], PLAYER_IDS[second]]);
    }
  }
  return pairs;
}

function roleStateIsLegal(simulation: PnrSimulation): boolean {
  const roles = simulation.getRoles();
  if (roles.length !== PLAYER_IDS.length) return false;
  if (new Set(roles.map((role) => role.playerId)).size !== PLAYER_IDS.length) return false;
  return roles.every(
    (role) =>
      role.owner ===
      (role.playerId.startsWith("O") ? "offense-planner" : "defense-planner"),
  );
}

function positionsMatch(
  simulation: PnrSimulation,
  positions: InitialPlayerPositions,
): boolean {
  return PLAYER_IDS.every((id) => {
    const actual = simulation.world.players[id].pos;
    return actual.x === positions[id].x && actual.y === positions[id].y;
  });
}

function eventOrderIsLegal(events: WorldEvent[]): boolean {
  for (let index = 1; index < events.length; index += 1) {
    const previous = events[index - 1];
    const current = events[index];
    if (current.tick < previous.tick) return false;
    if (current.tick === previous.tick && current.order < previous.order) return false;
  }
  return true;
}

function eventDeliveryIsLegal(simulation: PnrSimulation): boolean {
  const byId = new Map(simulation.eventLog.map((event) => [event.id, event]));
  return simulation.planningLog.every((record) =>
    record.triggerEventIds.every((id) => {
      const event = byId.get(id);
      return Boolean(event && record.tick >= event.availableAtTick);
    }),
  );
}

function runAuditSample(spec: G05CandidateSpec): G05AuditRun {
  const initialPositions = makePositions(spec);
  const simulation = new PnrSimulation({
    ...G05_BASE_CONFIG,
    initialPositions,
  });
  const tickTrace = [captureTick(simulation, [...simulation.planningLog])];
  const failures = new Set<string>();
  const seen = {
    contact: simulation.world.facts.contact,
    routeExposure: simulation.world.facts.routeExposure,
    impeded: simulation.world.facts.impeded,
    screenEffective: simulation.world.facts.screenEffective,
  };
  let minimumBodyGap = Number.POSITIVE_INFINITY;
  let maxStepDisplacement = 0;
  let ballFlightSteps = 0;
  let maxBallStep = 0;
  let touchDistance = Number.POSITIVE_INFINITY;
  let touchThreshold = 0;
  let previousBall = {
    pos: { ...simulation.world.ball.pos },
    inFlight: simulation.world.ball.inFlight,
    outcome: simulation.world.ball.outcome,
  };
  const initialApplied =
    positionsMatch(simulation, initialPositions) &&
    simulation.world.ballOwner === "O1" &&
    distance(simulation.world.ball.pos, initialPositions.O1) <= 1e-9;

  for (const [first, second] of playerPairs()) {
    const firstPlayer = simulation.world.players[first];
    const secondPlayer = simulation.world.players[second];
    minimumBodyGap = Math.min(
      minimumBodyGap,
      distance(firstPlayer.pos, secondPlayer.pos) - firstPlayer.radius - secondPlayer.radius,
    );
  }

  for (let index = 0; index < 600 && !simulation.world.terminal; index += 1) {
    addFailure(failures, !roleStateIsLegal(simulation), "ROLE_OWNERSHIP_CONFLICT");
    const planningStart = simulation.planningLog.length;
    simulation.step();
    const newPlanning = simulation.planningLog.slice(planningStart);
    tickTrace.push(captureTick(simulation, newPlanning));

    seen.contact ||= simulation.world.facts.contact;
    seen.routeExposure ||= simulation.world.facts.routeExposure;
    seen.impeded ||= simulation.world.facts.impeded;
    seen.screenEffective ||= simulation.world.facts.screenEffective;
    maxStepDisplacement = Math.max(
      maxStepDisplacement,
      simulation.world.lastStepMaxDisplacement,
    );
    addFailure(
      failures,
      simulation.world.time !==
        Math.round(simulation.world.tick * FIXED_DT * 1e6) / 1e6,
      "FIXED_TIMESTEP_VIOLATION",
    );
    addFailure(
      failures,
      simulation.world.ball.inFlight !== (simulation.world.ballOwner === null),
      "ILLEGAL_POSSESSION",
    );
    addFailure(
      failures,
      simulation.world.facts.impeded &&
        !simulation.world.facts.contact &&
        !simulation.world.facts.routeExposure,
      "REMOTE_IMPEDED",
    );
    addFailure(
      failures,
      simulation.world.lastStepMaxDisplacement > 0.15,
      "MAX_DISPLACEMENT_EXCEEDED",
    );
    addFailure(failures, !roleStateIsLegal(simulation), "ROLE_OWNERSHIP_CONFLICT");

    for (const id of PLAYER_IDS) {
      const player = simulation.world.players[id];
      addFailure(
        failures,
        player.pos.x < player.radius - 1e-9 ||
          player.pos.x > COURT.width - player.radius + 1e-9 ||
          player.pos.y < player.radius - 1e-9 ||
          player.pos.y > COURT.height - player.radius + 1e-9,
        "PLAYER_OUT_OF_BOUNDS",
      );
    }
    for (const [first, second] of playerPairs()) {
      const firstPlayer = simulation.world.players[first];
      const secondPlayer = simulation.world.players[second];
      minimumBodyGap = Math.min(
        minimumBodyGap,
        distance(firstPlayer.pos, secondPlayer.pos) - firstPlayer.radius - secondPlayer.radius,
      );
    }

    const ballStep = distance(previousBall.pos, simulation.world.ball.pos);
    if (previousBall.inFlight) {
      ballFlightSteps += 1;
      maxBallStep = Math.max(maxBallStep, ballStep);
    }
    if (
      previousBall.outcome === "live" &&
      (simulation.world.ball.outcome === "caught" ||
        simulation.world.ball.outcome === "deflected") &&
      simulation.world.ballOwner
    ) {
      const toucher = simulation.world.players[simulation.world.ballOwner];
      touchDistance = distance(simulation.world.ball.pos, toucher.pos);
      touchThreshold =
        toucher.radius +
        simulation.world.ball.radius +
        (simulation.world.ball.outcome === "caught" ? 0.075 : 0.045);
    }
    previousBall = {
      pos: { ...simulation.world.ball.pos },
      inFlight: simulation.world.ball.inFlight,
      outcome: simulation.world.ball.outcome,
    };
  }

  addFailure(failures, !initialApplied, "INITIAL_POSITION_NOT_APPLIED");
  addFailure(failures, minimumBodyGap < -1e-6, "BODY_OVERLAP_DURING_RUN");
  addFailure(failures, !simulation.world.terminal, "NO_EXPLAINABLE_TERMINAL");
  addFailure(failures, simulation.world.branch === "undecided", "UNRESOLVED_BRANCH");
  addFailure(failures, !eventOrderIsLegal(simulation.eventLog), "EVENT_ORDER_VIOLATION");
  addFailure(failures, !eventDeliveryIsLegal(simulation), "EVENT_DELIVERY_VIOLATION");

  const passLaunched = simulation.eventLog.some((event) => event.type === "pass_launched");
  const localTouch = touchDistance <= touchThreshold + 1e-9;
  if (passLaunched) {
    addFailure(failures, ballFlightSteps < 1, "PASS_DID_NOT_FLY");
    addFailure(failures, maxBallStep > 9.2 * FIXED_DT + 0.007, "PASS_STEP_TOO_LARGE");
    addFailure(failures, !localTouch, "NON_LOCAL_FIRST_TOUCH");
  }

  const firstOffense = simulation.planningLog.find(
    (record) => record.tick === 0 && record.team === "offense",
  );
  const firstDefense = simulation.planningLog.find(
    (record) => record.tick === 0 && record.team === "defense",
  );
  if (!firstOffense || !firstDefense || !simulation.world.terminal) {
    throw new Error(`G05 ${spec.id} missing initial plans or terminal`);
  }

  const eventTicks: Partial<Record<EventType, number>> = {};
  for (const event of simulation.eventLog) {
    eventTicks[event.type] ??= event.tick;
  }
  const owner = simulation.world.ballOwner;
  const actualFirstToucher = owner === "D1" || owner === "O5" ? owner : null;

  return {
    row: {
      ...spec,
      status: "SIMULATED",
      initialPositions,
      initialApplied,
      initialOffense: cloneInitialPlan(firstOffense),
      initialDefense: cloneInitialPlan(firstDefense),
      offensePlans: simulation.planningLog
        .filter((record) => record.team === "offense")
        .map(({ tick, chosen, trigger }) => ({ tick, chosen, trigger })),
      defensePlans: simulation.planningLog
        .filter((record) => record.team === "defense")
        .map(({ tick, chosen, trigger }) => ({ tick, chosen, trigger })),
      branch: simulation.world.branch,
      events: simulation.eventLog.map(({ type, tick, order, availableAtTick }) => ({
        type,
        tick,
        order,
        availableAtTick,
      })),
      eventTicks,
      contactSeen: seen.contact,
      routeExposureSeen: seen.routeExposure,
      impededSeen: seen.impeded,
      screenEffectiveSeen: seen.screenEffective,
      switchCompleted: simulation.eventLog.some((event) => event.type === "switch_completed"),
      underCommitted: simulation.eventLog.some((event) => event.type === "under_committed"),
      sealFronted: simulation.eventLog.some((event) => event.type === "seal_fronted"),
      passLaunched,
      actualFirstToucher,
      ballOutcome: simulation.world.ball.outcome,
      terminalReason: simulation.world.terminal.reason,
      terminalLabel: simulation.world.terminal.label,
      terminalTick: simulation.world.tick,
      offenseReplans: simulation.planningLog.filter((record) => record.team === "offense").length,
      defenseReplans: simulation.planningLog.filter((record) => record.team === "defense").length,
      watchdogReplans: simulation.planningLog.filter(
        (record) => record.trigger === "有限看门狗",
      ).length,
      minimumBodyGap: Number(minimumBodyGap.toFixed(6)),
      maxStepDisplacement: Number(maxStepDisplacement.toFixed(6)),
      ballFlightSteps,
      maxBallStep: Number(maxBallStep.toFixed(6)),
      localTouch,
      invariantFailures: [...failures],
    },
    tickTrace,
  };
}

function sameTrace(first: string[], second: string[]): boolean {
  return first.length === second.length && first.every((frame, index) => frame === second[index]);
}

function parseOverlap(error: string): { overlapDistance: number; minimumDistance: number } {
  const match = error.match(/overlap: ([0-9.]+)m < ([0-9.]+)m/);
  return {
    overlapDistance: match ? Number(match[1]) : Number.NaN,
    minimumDistance: match ? Number(match[2]) : Number.NaN,
  };
}

function hasReturn<T>(values: T[]): boolean {
  for (let first = 0; first < values.length - 2; first += 1) {
    for (let middle = first + 1; middle < values.length - 1; middle += 1) {
      for (let last = middle + 1; last < values.length; last += 1) {
        if (values[first] === values[last] && values[first] !== values[middle]) return true;
      }
    }
  }
  return false;
}

function candidateScore(row: G05SimulatedRow, id: PlanId): number | null {
  return row.initialOffense.candidates.find((candidate) => candidate.id === id)?.score ?? null;
}

export function scanG05SpatialBoundary(): G05AuditResult {
  const rows: G05AuditRow[] = [];
  const simulatedRows: G05SimulatedRow[] = [];
  const rejectedRows: G05RejectedRow[] = [];
  const failureReasons: string[] = [];

  for (const spec of G05_CANDIDATES) {
    const positions = makePositions(spec);
    try {
      validateInitialPlayerPositions(positions);
    } catch (caught) {
      const error = caught instanceof Error ? caught.message : String(caught);
      if (EXPECTED_REJECTIONS.get(spec.id) !== error) {
        failureReasons.push(`${spec.id}: unexpected initial-position rejection: ${error}`);
      }
      const overlap = parseOverlap(error);
      const rejected: G05RejectedRow = {
        ...spec,
        status: "EXPECTED_INVALID_INITIAL_OVERLAP",
        initialPositions: positions,
        error,
        ...overlap,
      };
      rejectedRows.push(rejected);
      rows.push(rejected);
      continue;
    }

    if (EXPECTED_REJECTIONS.has(spec.id)) {
      failureReasons.push(`${spec.id}: expected G04 rejection but input was accepted`);
    }
    const first = runAuditSample(spec);
    const replay = runAuditSample(spec);
    const row: G05SimulatedRow = {
      ...first.row,
      deterministic: sameTrace(first.tickTrace, replay.tickTrace),
    };
    simulatedRows.push(row);
    rows.push(row);
  }

  const axisSummaries: G05AxisSummary[] = G05_AXES.map(({ axis }) => {
    const axisRows = rows
      .filter((row) => row.axis === axis)
      .concat(rows.find((row) => row.id === "baseline") ?? [])
      .sort((first, second) => first.offset - second.offset);
    return {
      axis,
      ordered: axisRows.map((row) => ({
        id: row.id,
        offset: row.offset,
        status: row.status,
        offensePlan: row.status === "SIMULATED" ? row.initialOffense.chosen : null,
        defensePlan: row.status === "SIMULATED" ? row.initialDefense.chosen : null,
        branch: row.status === "SIMULATED" ? row.branch : null,
        terminalReason: row.status === "SIMULATED" ? row.terminalReason : null,
      })),
    };
  });

  const axisFailures: G05AxisFailure[] = [];
  for (const summary of axisSummaries) {
    const simulated = summary.ordered.filter(
      (item): item is typeof item & {
        offensePlan: PlanId;
        defensePlan: PlanId;
        branch: Branch;
      } => item.status === "SIMULATED",
    );
    const fields = [
      ["offensePlan", simulated.map((item) => item.offensePlan)],
      ["defensePlan", simulated.map((item) => item.defensePlan)],
      ["branch", simulated.map((item) => item.branch)],
    ] as const;
    for (const [field, values] of fields) {
      if (hasReturn([...values])) {
        axisFailures.push({
          axis: summary.axis,
          fromOffset: simulated[0].offset,
          toOffset: simulated[simulated.length - 1].offset,
          field,
          reason: `${field} 在有序位置输入中发生无解释回跳`,
        });
      }
    }
  }

  const baseline = simulatedRows.find((row) => row.id === "baseline");
  if (!baseline) failureReasons.push("baseline was not simulated");
  const screenShift = baseline
    ? simulatedRows
        .filter((row) => row.playerId === "O5" && Math.abs(row.offset) === 0.24)
        .sort(
          (first, second) =>
            Math.abs(second.terminalTick - baseline.terminalTick) -
              Math.abs(first.terminalTick - baseline.terminalTick) ||
            first.id.localeCompare(second.id),
        )[0]
    : null;
  const d1Impact = simulatedRows
    .filter((row) => row.playerId === "D1")
    .sort((first, second) => {
      const firstMargin = Math.abs(
        (candidateScore(first, "USE_RIGHT_SCREEN") ?? 0) -
          (candidateScore(first, "REJECT_LEFT") ?? 0),
      );
      const secondMargin = Math.abs(
        (candidateScore(second, "USE_RIGHT_SCREEN") ?? 0) -
          (candidateScore(second, "REJECT_LEFT") ?? 0),
      );
      return firstMargin - secondMargin || first.id.localeCompare(second.id);
    })[0];

  const replays: G05ReplaySample[] = [];
  if (baseline) {
    replays.push({
      id: "baseline",
      sampleId: baseline.id,
      label: "neutral baseline",
      note: "G04 重构后的原始中性起手对照",
    });
  }
  if (screenShift) {
    replays.push({
      id: "screen-shift",
      sampleId: screenShift.id,
      label: "O5 掩护位置极值",
      note: `合法 O5 极值中终止时机相对 baseline 变化最大：tick ${screenShift.terminalTick}`,
    });
  }
  if (d1Impact) {
    replays.push({
      id: "d1-impact",
      sampleId: d1Impact.id,
      label: "D1 判断影响最明显",
      note: "合法 D1 样本中 USE/REJECT 初始分差最小",
    });
  }

  const deterministic = simulatedRows.every((row) => row.deterministic);
  const invariantsPassed = simulatedRows.every(
    (row) => row.invariantFailures.length === 0,
  );
  const monotonic = axisFailures.length === 0;
  const expectedIds = [...EXPECTED_REJECTIONS.keys()];
  const rejectedIds = rejectedRows.map((row) => row.id);
  const expectedRejected =
    rejectedIds.length === expectedIds.length &&
    expectedIds.every((id) => rejectedIds.includes(id));
  const passed =
    rows.length === 33 &&
    simulatedRows.length === 31 &&
    rejectedRows.length === 2 &&
    expectedRejected &&
    deterministic &&
    invariantsPassed &&
    monotonic &&
    failureReasons.length === 0;

  return {
    id: "G04-G05",
    label: "显式初始位置与局部空间泛化探针",
    rows,
    simulatedRows,
    rejectedRows,
    candidateCount: rows.length,
    simulatedCount: simulatedRows.length,
    expectedRejectedCount: rejectedRows.length,
    deterministic,
    invariantsPassed,
    monotonic,
    passed,
    axisSummaries,
    axisFailures,
    failureReasons,
    replays,
  };
}
