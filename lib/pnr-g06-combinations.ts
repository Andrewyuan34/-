import {
  COURT,
  FIXED_DT,
  PLAYER_IDS,
  PnrSimulation,
  distance,
  mirrorInitialPlayerPositions,
  type Branch,
  type CandidateEvaluation,
  type EventType,
  type InitialPlayerPositions,
  type PlanId,
  type PlayerId,
  type PlanningRecord,
  type ScreenSide,
  type SimulationConfig,
  type Team,
  type TerminalState,
  type WorldEvent,
} from "./pnr-core.ts";
import { makeG05Config } from "./pnr-g05-spatial-generalization.ts";

export type G06Matrix = "A" | "B";
export type G06PositionId = "baseline" | "O5.x/-0.24" | "D1.x/+0.24";

export interface G06Spec {
  id: string;
  matrix: G06Matrix;
  positionId: G06PositionId;
  o1MaxSpeed: number;
  d1FrontReactionDelay: number;
  d1PostCatchRecoveryDelay: number;
  horizon: SimulationConfig["horizon"];
}

export interface G06CandidateAudit {
  id: PlanId;
  feasible: boolean;
  score: number | null;
  vetoes: string[];
  evidence: string[];
}

export interface G06PlanningAudit {
  tick: number;
  team: Team;
  trigger: string;
  chosen: PlanId;
  candidates: G06CandidateAudit[];
}

export interface G06RoleStep {
  tick: number;
  roles: Array<{
    playerId: PlayerId;
    roleCode: string;
    owner: string;
  }>;
}

export interface G06EventAudit {
  type: EventType;
  tick: number;
  order: number;
  availableAtTick: number;
}

export interface G06Row extends G06Spec {
  publicInput: SimulationConfig;
  initialPositions: InitialPlayerPositions;
  initialOffense: G06PlanningAudit;
  initialDefense: G06PlanningAudit;
  planning: G06PlanningAudit[];
  roleSequence: G06RoleStep[];
  events: G06EventAudit[];
  eventTicks: Partial<Record<EventType, number>>;
  branch: Branch;
  firstMismatchOffense: PlanId | null;
  firstPostCatchOffense: PlanId | null;
  firstPostCatchDefense: PlanId | null;
  terminalReason: TerminalState["reason"];
  terminalLabel: string;
  terminalTick: number;
  ballOwner: PlayerId | null;
  ballOutcome: "live" | "caught" | "deflected" | "missed";
  passLaunched: boolean;
  kickoutLaunched: boolean;
  actualTouchers: PlayerId[];
  offenseReplans: number;
  defenseReplans: number;
  watchdogReplans: number;
  minimumBodyGap: number;
  maxStepDisplacement: number;
  maxBallStep: number;
  contactSeen: boolean;
  routeExposureSeen: boolean;
  impededSeen: boolean;
  screenEffectiveSeen: boolean;
  deterministic: boolean;
  explainable: boolean;
  invariantFailures: string[];
}

export interface G06ReplaySample {
  id: string;
  sampleId: string;
  label: string;
  note: string;
}

export interface G06AuditResult {
  id: "G06";
  label: string;
  matrixA: G06Row[];
  matrixB: G06Row[];
  rows: G06Row[];
  sampleCount: number;
  deterministic: boolean;
  invariantsPassed: boolean;
  stageCausalityPassed: boolean;
  attackNoLobPassed: boolean;
  explainable: boolean;
  passed: boolean;
  failureReasons: string[];
  replays: G06ReplaySample[];
}

interface AuditRun {
  row: Omit<G06Row, "deterministic">;
  fullTrace: string[];
  behaviorTrace: string[];
  prefixTrace: string[];
  ballTrace: string[];
}

export const G06_POSITION_IDS = Object.freeze([
  "baseline",
  "O5.x/-0.24",
  "D1.x/+0.24",
] as const);

export const G06_MATRIX_A_SPEEDS = Object.freeze([3.98, 4] as const);
export const G06_MATRIX_A_FRONT_DELAYS = Object.freeze([0.01, 0.02] as const);
export const G06_MATRIX_B_RECOVERY_DELAYS = Object.freeze([0.18, 0.21, 0.36] as const);

function numberId(value: number): string {
  return value.toFixed(2);
}

export const G06_SPECS = Object.freeze([
  ...G06_POSITION_IDS.flatMap((positionId) =>
    G06_MATRIX_A_SPEEDS.flatMap((o1MaxSpeed) =>
      G06_MATRIX_A_FRONT_DELAYS.map((d1FrontReactionDelay) => ({
        id: `A/${positionId}/speed-${numberId(o1MaxSpeed)}/front-${numberId(d1FrontReactionDelay)}`,
        matrix: "A" as const,
        positionId,
        o1MaxSpeed,
        d1FrontReactionDelay,
        d1PostCatchRecoveryDelay: 0,
        horizon: "pnr_resolution" as const,
      })),
    ),
  ),
  ...G06_POSITION_IDS.flatMap((positionId) =>
    G06_MATRIX_B_RECOVERY_DELAYS.map((d1PostCatchRecoveryDelay) => ({
      id: `B/${positionId}/recovery-${numberId(d1PostCatchRecoveryDelay)}`,
      matrix: "B" as const,
      positionId,
      o1MaxSpeed: 3.72,
      d1FrontReactionDelay: 0.12,
      d1PostCatchRecoveryDelay,
      horizon: "post_catch_resolution" as const,
    })),
  ),
] satisfies G06Spec[]);

function getSpec(id: string): G06Spec {
  const spec = G06_SPECS.find((candidate) => candidate.id === id);
  if (!spec) throw new Error(`Unknown G06 sample: ${id}`);
  return spec;
}

export function makeG06Config(
  id: string,
  screenSide: ScreenSide = "right",
): SimulationConfig {
  const spec = getSpec(id);
  const positionConfig = makeG05Config(spec.positionId);
  return {
    ...positionConfig,
    screenSide,
    initialPositions:
      screenSide === "right"
        ? positionConfig.initialPositions
        : mirrorInitialPlayerPositions(positionConfig.initialPositions),
    o1MaxSpeed: spec.o1MaxSpeed,
    d1FrontReactionDelay: spec.d1FrontReactionDelay,
    d1PostCatchRecoveryDelay: spec.d1PostCatchRecoveryDelay,
    horizon: spec.horizon,
  };
}

export function createG06Replay(id: string, screenSide: ScreenSide = "right"): PnrSimulation {
  return new PnrSimulation(makeG06Config(id, screenSide));
}

function cloneCandidate(candidate: CandidateEvaluation): G06CandidateAudit {
  return {
    id: candidate.id,
    feasible: candidate.feasible,
    score: candidate.score,
    vetoes: [...candidate.vetoes],
    evidence: [...candidate.evidence],
  };
}

function clonePlanning(record: PlanningRecord): G06PlanningAudit {
  return {
    tick: record.tick,
    team: record.team,
    trigger: record.trigger,
    chosen: record.chosen,
    candidates: record.candidates.map(cloneCandidate),
  };
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

function roleSnapshot(simulation: PnrSimulation): G06RoleStep["roles"] {
  return simulation.getRoles().map(({ playerId, roleCode, owner }) => ({
    playerId,
    roleCode,
    owner,
  }));
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

function eventOrderIsLegal(events: WorldEvent[]): boolean {
  return events.every((event, index) => {
    if (index === 0) return true;
    const previous = events[index - 1];
    return event.tick > previous.tick || (event.tick === previous.tick && event.order >= previous.order);
  });
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

function planningIsExplainable(records: PlanningRecord[]): boolean {
  return records.every((record) => {
    const chosen = record.candidates.find((candidate) => candidate.id === record.chosen);
    return Boolean(chosen?.feasible);
  });
}

function newEventsAtTick(simulation: PnrSimulation): Array<Pick<WorldEvent, "type" | "tick" | "order">> {
  return simulation.eventLog
    .filter((event) => event.tick === simulation.world.tick)
    .map(({ type, tick, order }) => ({ type, tick, order }));
}

function behaviorFrame(simulation: PnrSimulation): string {
  return JSON.stringify({
    tick: simulation.world.tick,
    time: simulation.world.time,
    branch: simulation.world.branch,
    players: Object.fromEntries(
      PLAYER_IDS.map((id) => {
        const player = simulation.world.players[id];
        return [id, { pos: player.pos, vel: player.vel }];
      }),
    ),
    ballOwner: simulation.world.ballOwner,
    ball: simulation.world.ball,
    facts: simulation.world.facts,
    mismatch: simulation.world.mismatch,
    seal: simulation.world.seal,
    postCatch: simulation.world.postCatch,
    under: simulation.world.under,
    reject: simulation.world.reject,
    offensePlan: simulation.offensePlan.id,
    defensePlan: simulation.defensePlan.id,
    roles: roleSnapshot(simulation),
    events: newEventsAtTick(simulation),
    terminal: simulation.world.terminal,
  });
}

function fullFrame(simulation: PnrSimulation, newPlanning: PlanningRecord[]): string {
  return JSON.stringify({
    behavior: JSON.parse(behaviorFrame(simulation)),
    stateHash: simulation.world.stateHash,
    plans: {
      offense: simulation.offensePlan,
      defense: simulation.defensePlan,
    },
    planning: newPlanning.map(clonePlanning),
  });
}

function prefixFrame(simulation: PnrSimulation): string {
  return JSON.stringify({
    tick: simulation.world.tick,
    time: simulation.world.time,
    branch: simulation.world.branch,
    players: Object.fromEntries(
      PLAYER_IDS.map((id) => {
        const player = simulation.world.players[id];
        return [id, { pos: player.pos, vel: player.vel }];
      }),
    ),
    ballOwner: simulation.world.ballOwner,
    ball: simulation.world.ball,
    facts: simulation.world.facts,
    offensePlan: simulation.offensePlan.id,
    defensePlan: simulation.defensePlan.id,
    roles: roleSnapshot(simulation),
    events: newEventsAtTick(simulation),
    terminal: simulation.world.terminal,
  });
}

function ballFrame(simulation: PnrSimulation): string {
  return JSON.stringify({
    tick: simulation.world.tick,
    owner: simulation.world.ballOwner,
    ball: simulation.world.ball,
  });
}

function addFailure(failures: Set<string>, condition: boolean, label: string): void {
  if (condition) failures.add(label);
}

function sameTrace(first: string[], second: string[]): boolean {
  return first.length === second.length && first.every((frame, index) => frame === second[index]);
}

function firstChosen(records: PlanningRecord[], team: Team, ids: PlanId[]): PlanId | null {
  return records.find((record) => record.team === team && ids.includes(record.chosen))?.chosen ?? null;
}

function runSpec(spec: G06Spec): AuditRun {
  const config = makeG06Config(spec.id);
  const simulation = new PnrSimulation(config);
  const fullTrace = [fullFrame(simulation, [...simulation.planningLog])];
  const behaviorTrace = [behaviorFrame(simulation)];
  const prefixTrace = [prefixFrame(simulation)];
  const ballTrace = [ballFrame(simulation)];
  const failures = new Set<string>();
  const roleSequence: G06RoleStep[] = [{ tick: 0, roles: roleSnapshot(simulation) }];
  let previousRoles = JSON.stringify(roleSequence[0].roles);
  let minimumBodyGap = Number.POSITIVE_INFINITY;
  let maxStepDisplacement = 0;
  let maxBallStep = 0;
  let previousBall = {
    pos: { ...simulation.world.ball.pos },
    inFlight: simulation.world.ball.inFlight,
  };
  const actualTouchers: PlayerId[] = [];
  const seen = {
    contact: simulation.world.facts.contact,
    routeExposure: simulation.world.facts.routeExposure,
    impeded: simulation.world.facts.impeded,
    screenEffective: simulation.world.facts.screenEffective,
  };

  for (const [first, second] of playerPairs()) {
    const firstPlayer = simulation.world.players[first];
    const secondPlayer = simulation.world.players[second];
    minimumBodyGap = Math.min(
      minimumBodyGap,
      distance(firstPlayer.pos, secondPlayer.pos) - firstPlayer.radius - secondPlayer.radius,
    );
  }

  for (let index = 0; index < 600 && !simulation.world.terminal; index += 1) {
    const planningStart = simulation.planningLog.length;
    const eventStart = simulation.eventLog.length;
    simulation.step();
    const newPlanning = simulation.planningLog.slice(planningStart);
    const newEvents = simulation.eventLog.slice(eventStart);
    fullTrace.push(fullFrame(simulation, newPlanning));
    behaviorTrace.push(behaviorFrame(simulation));
    prefixTrace.push(prefixFrame(simulation));
    ballTrace.push(ballFrame(simulation));

    const roles = roleSnapshot(simulation);
    const roleSignature = JSON.stringify(roles);
    if (roleSignature !== previousRoles) {
      roleSequence.push({ tick: simulation.world.tick, roles });
      previousRoles = roleSignature;
    }

    seen.contact ||= simulation.world.facts.contact;
    seen.routeExposure ||= simulation.world.facts.routeExposure;
    seen.impeded ||= simulation.world.facts.impeded;
    seen.screenEffective ||= simulation.world.facts.screenEffective;
    maxStepDisplacement = Math.max(maxStepDisplacement, simulation.world.lastStepMaxDisplacement);
    if (previousBall.inFlight) {
      maxBallStep = Math.max(maxBallStep, distance(previousBall.pos, simulation.world.ball.pos));
    }
    previousBall = {
      pos: { ...simulation.world.ball.pos },
      inFlight: simulation.world.ball.inFlight,
    };

    addFailure(
      failures,
      simulation.world.time !== Math.round(simulation.world.tick * FIXED_DT * 1e6) / 1e6,
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
    addFailure(failures, !rolesAreLegal(simulation), "ROLE_OWNERSHIP_CONFLICT");
    addFailure(
      failures,
      simulation.world.lastStepMaxDisplacement > 0.15,
      "MAX_DISPLACEMENT_EXCEEDED",
    );

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

    for (const event of newEvents) {
      if (
        event.type === "pass_caught" ||
        event.type === "pass_denied" ||
        event.type === "kickout_caught" ||
        event.type === "reject_slip_caught"
      ) {
        const owner = simulation.world.ballOwner;
        if (!owner) {
          failures.add("TOUCH_WITHOUT_OWNER");
          continue;
        }
        actualTouchers.push(owner);
        const toucher = simulation.world.players[owner];
        const localThreshold =
          toucher.radius +
          simulation.world.ball.radius +
          (event.type === "pass_denied" ? 0.045 : 0.075);
        addFailure(
          failures,
          distance(simulation.world.ball.pos, toucher.pos) > localThreshold + 1e-9,
          "NON_LOCAL_TOUCH",
        );
      }
    }
  }

  addFailure(failures, !simulation.world.terminal, "NO_EXPLAINABLE_TERMINAL");
  addFailure(failures, simulation.world.branch === "undecided", "UNRESOLVED_BRANCH");
  addFailure(failures, minimumBodyGap < -0.01, "BODY_OVERLAP_DURING_RUN");
  addFailure(failures, !eventOrderIsLegal(simulation.eventLog), "EVENT_ORDER_VIOLATION");
  addFailure(failures, !eventDeliveryIsLegal(simulation), "EVENT_DELIVERY_VIOLATION");
  addFailure(failures, maxBallStep > 14 * FIXED_DT + 0.007, "BALL_STEP_TOO_LARGE");
  addFailure(failures, !planningIsExplainable(simulation.planningLog), "UNEXPLAINABLE_PLAN");

  const firstOffense = simulation.planningLog.find(
    (record) => record.tick === 0 && record.team === "offense",
  );
  const firstDefense = simulation.planningLog.find(
    (record) => record.tick === 0 && record.team === "defense",
  );
  if (!firstOffense || !firstDefense || !simulation.world.terminal) {
    throw new Error(`G06 ${spec.id} missing initial plans or terminal`);
  }

  const eventTicks: Partial<Record<EventType, number>> = {};
  for (const event of simulation.eventLog) eventTicks[event.type] ??= event.tick;
  const planning = simulation.planningLog.map(clonePlanning);
  const explainable = planningIsExplainable(simulation.planningLog);

  return {
    row: {
      ...spec,
      publicInput: {
        ...config,
        initialPositions: Object.fromEntries(
          PLAYER_IDS.map((id) => [id, { ...config.initialPositions[id] }]),
        ) as InitialPlayerPositions,
      },
      initialPositions: Object.fromEntries(
        PLAYER_IDS.map((id) => [id, { ...config.initialPositions[id] }]),
      ) as InitialPlayerPositions,
      initialOffense: clonePlanning(firstOffense),
      initialDefense: clonePlanning(firstDefense),
      planning,
      roleSequence,
      events: simulation.eventLog.map(({ type, tick, order, availableAtTick }) => ({
        type,
        tick,
        order,
        availableAtTick,
      })),
      eventTicks,
      branch: simulation.world.branch,
      firstMismatchOffense: firstChosen(simulation.planningLog, "offense", [
        "FEED_SEAL",
        "ATTACK_BIG",
        "RESET_MISMATCH",
      ]),
      firstPostCatchOffense: firstChosen(simulation.planningLog, "offense", [
        "POST_FINISH",
        "KICK_OUT",
      ]),
      firstPostCatchDefense: firstChosen(simulation.planningLog, "defense", [
        "STAY_HOME_POST",
        "DIG_POST",
      ]),
      terminalReason: simulation.world.terminal.reason,
      terminalLabel: simulation.world.terminal.label,
      terminalTick: simulation.world.tick,
      ballOwner: simulation.world.ballOwner,
      ballOutcome: simulation.world.ball.outcome,
      passLaunched: simulation.eventLog.some((event) => event.type === "pass_launched"),
      kickoutLaunched: simulation.eventLog.some((event) => event.type === "kickout_launched"),
      actualTouchers,
      offenseReplans: simulation.planningLog.filter((record) => record.team === "offense").length,
      defenseReplans: simulation.planningLog.filter((record) => record.team === "defense").length,
      watchdogReplans: simulation.planningLog.filter(
        (record) => record.trigger === "有限看门狗",
      ).length,
      minimumBodyGap: Number(minimumBodyGap.toFixed(6)),
      maxStepDisplacement: Number(maxStepDisplacement.toFixed(6)),
      maxBallStep: Number(maxBallStep.toFixed(6)),
      contactSeen: seen.contact,
      routeExposureSeen: seen.routeExposure,
      impededSeen: seen.impeded,
      screenEffectiveSeen: seen.screenEffective,
      explainable,
      invariantFailures: [...failures],
    },
    fullTrace,
    behaviorTrace,
    prefixTrace,
    ballTrace,
  };
}

function traceBefore(trace: string[], tick: number | undefined, includeTick = false): string[] {
  if (tick === undefined) return [];
  return trace.slice(0, tick + (includeTick ? 1 : 0));
}

function matrixAGroupKey(row: G06Row): string {
  return `${row.positionId}/${numberId(row.o1MaxSpeed)}`;
}

function matrixBGroupKey(row: G06Row): string {
  return row.positionId;
}

export function scanG06Combinations(): G06AuditResult {
  const runs = new Map<string, AuditRun>();
  const rows: G06Row[] = [];
  const failureReasons: string[] = [];

  for (const spec of G06_SPECS) {
    const first = runSpec(spec);
    const second = runSpec(spec);
    const deterministic = sameTrace(first.fullTrace, second.fullTrace);
    const row: G06Row = { ...first.row, deterministic };
    runs.set(spec.id, first);
    rows.push(row);
    if (!deterministic) failureReasons.push(`${spec.id}: full tick trace did not reproduce`);
    for (const failure of row.invariantFailures) {
      failureReasons.push(`${spec.id}: ${failure}`);
    }
  }

  const matrixA = rows.filter((row) => row.matrix === "A");
  const matrixB = rows.filter((row) => row.matrix === "B");

  for (const key of new Set(matrixA.map(matrixAGroupKey))) {
    const pair = matrixA.filter((row) => matrixAGroupKey(row) === key);
    const first = pair[0];
    const second = pair[1];
    const firstRun = runs.get(first.id);
    const secondRun = runs.get(second.id);
    const boundaryTick = Math.min(
      first.eventTicks.seal_established ?? Number.POSITIVE_INFINITY,
      second.eventTicks.seal_established ?? Number.POSITIVE_INFINITY,
    );
    if (
      !firstRun ||
      !secondRun ||
      !Number.isFinite(boundaryTick) ||
      !sameTrace(
        traceBefore(firstRun.prefixTrace, boundaryTick),
        traceBefore(secondRun.prefixTrace, boundaryTick),
      )
    ) {
      failureReasons.push(`Matrix A ${key}: front-delay changed the pre-fronting prefix`);
    }

    if (first.firstMismatchOffense === "ATTACK_BIG" && second.firstMismatchOffense === "ATTACK_BIG") {
      if (
        first.passLaunched ||
        second.passLaunched ||
        first.terminalReason !== second.terminalReason ||
        first.ballOwner !== second.ballOwner ||
        !firstRun ||
        !secondRun ||
        !sameTrace(firstRun.ballTrace, secondRun.ballTrace)
      ) {
        failureReasons.push(`Matrix A ${key}: unused front-delay changed ATTACK_BIG ball outcome`);
      }
    }
  }

  for (const key of new Set(matrixB.map(matrixBGroupKey))) {
    const group = matrixB.filter((row) => matrixBGroupKey(row) === key);
    const reference = group[0];
    const referenceRun = runs.get(reference.id);
    for (const candidate of group.slice(1)) {
      const candidateRun = runs.get(candidate.id);
      const catchTick = Math.min(
        reference.eventTicks.pass_caught ?? Number.POSITIVE_INFINITY,
        candidate.eventTicks.pass_caught ?? Number.POSITIVE_INFINITY,
      );
      if (
        !referenceRun ||
        !candidateRun ||
        !Number.isFinite(catchTick) ||
        !sameTrace(
          traceBefore(referenceRun.prefixTrace, catchTick, true),
          traceBefore(candidateRun.prefixTrace, catchTick, true),
        )
      ) {
        failureReasons.push(`Matrix B ${key}: recovery-delay changed the pre-catch prefix`);
      }
    }
  }

  const deterministic = rows.every((row) => row.deterministic);
  const invariantsPassed = rows.every((row) => row.invariantFailures.length === 0);
  const explainable = rows.every((row) => row.explainable);
  const stageCausalityPassed = !failureReasons.some((reason) => reason.includes("prefix"));
  const attackNoLobPassed = !failureReasons.some((reason) => reason.includes("ATTACK_BIG"));

  const denied = matrixA
    .filter((row) => row.terminalReason === "pass_denied")
    .sort((first, second) => first.terminalTick - second.terminalTick || first.id.localeCompare(second.id))[0];
  const attack = matrixA
    .filter((row) => row.firstMismatchOffense === "ATTACK_BIG")
    .sort((first, second) => second.terminalTick - first.terminalTick || first.id.localeCompare(second.id))[0];
  const baselineFinish = matrixB.find(
    (row) => row.positionId === "baseline" && row.terminalReason === "post_catch_finish_window",
  );
  const geometryFlip = baselineFinish
    ? matrixB.find(
        (row) =>
          row.d1PostCatchRecoveryDelay === baselineFinish.d1PostCatchRecoveryDelay &&
          row.terminalReason !== baselineFinish.terminalReason,
      )
    : undefined;
  const replays: G06ReplaySample[] = [
    denied
      ? {
          id: "real-deflection",
          sampleId: denied.id,
          label: "组合后的真实破坏",
          note: `${denied.positionId} · D1 ${numberId(denied.d1FrontReactionDelay)}s · ${denied.terminalReason}`,
        }
      : null,
    attack
      ? {
          id: "attack-big",
          sampleId: attack.id,
          label: "高速度攻击大个",
          note: `${attack.positionId} · O1 ${numberId(attack.o1MaxSpeed)}m/s · 无高吊`,
        }
      : null,
    geometryFlip
      ? {
          id: "geometry-interaction",
          sampleId: geometryFlip.id,
          label: "位置改变接球后判断",
          note: `同为 recovery ${numberId(geometryFlip.d1PostCatchRecoveryDelay)}s，局部位置令结果变为 ${geometryFlip.terminalReason}`,
        }
      : null,
  ].filter((replay): replay is G06ReplaySample => replay !== null);

  const passed =
    rows.length === 21 &&
    matrixA.length === 12 &&
    matrixB.length === 9 &&
    deterministic &&
    invariantsPassed &&
    stageCausalityPassed &&
    attackNoLobPassed &&
    explainable &&
    failureReasons.length === 0;

  return {
    id: "G06",
    label: "有限参数交叉组合审计",
    matrixA,
    matrixB,
    rows,
    sampleCount: rows.length,
    deterministic,
    invariantsPassed,
    stageCausalityPassed,
    attackNoLobPassed,
    explainable,
    passed,
    failureReasons,
    replays,
  };
}
