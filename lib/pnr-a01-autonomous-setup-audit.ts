import {
  AUTONOMOUS_CANONICAL_ANCHORS,
  FIXED_DT,
  PLAYER_IDS,
  PnrSimulation,
  createPlannerObservation,
  formationReadiness,
  mirrorInitialPlayerPositions,
  type AutonomousAnchorId,
  type InitialPlayerPositions,
  type PlanningRecord,
  type ScreenSide,
  type SimulationConfig,
  type TeamPlan,
} from "./pnr-core.ts";
import {
  DEFAULT_TEAM_STRATEGY_SELECTION,
  OFFENSE_MISMATCH_PRESSURE,
} from "./pnr-strategy.ts";
import {
  autonomousDeterministicFrame,
  autonomousSamePublicTimeline,
  autonomousSimulationMirrorError,
} from "./pnr-a00-autonomous-side-audit.ts";
import {
  A01_AUTONOMOUS_SETUP_INPUTS,
  A01_INPUT_HASH,
  type A01AutonomousSetupInput,
} from "./pnr-a01-autonomous-setup-manifest.ts";

export type A01Resolution = "formation_ready" | "formation_aborted" | "formation_timeout";

export interface A01AutonomousSetupRow {
  id: string;
  sourceStage: A01AutonomousSetupInput["sourceStage"];
  selectedSide: ScreenSide | null;
  selectedAnchorId: AutonomousAnchorId | null;
  mirroredSelectedSide: ScreenSide | null;
  mirroredSelectedAnchorId: AutonomousAnchorId | null;
  resolution: A01Resolution;
  resolvedTick: number;
  publicCommitTick: number | null;
  screenSetTick: number | null;
  jointReadyTick: number | null;
  chosenFormationEta: number | null;
  chosenCorridorClearance: number | null;
  deterministic: boolean;
  evaluationOrderStable: boolean;
  mirrorPassed: boolean;
  mirrorMaximumError: number;
  routeSegmentsMonotonic: boolean;
  choiceStable: boolean;
  informationBoundaryPassed: boolean;
  publicCausalityPassed: boolean;
  safeExitReal: boolean;
  zeroStrategyAdjustment: boolean;
  failures: string[];
}

export interface A01RepresentativeReplay {
  id: "longest-formed" | "tightest-corridor" | "diverse-mirror" | "safe-exit";
  inputId: string;
  mirrored: boolean;
  side: ScreenSide | null;
  anchorId: AutonomousAnchorId | null;
  resolution: A01Resolution;
  note: string;
}

export interface A01AutonomousSetupAudit {
  inputHash: typeof A01_INPUT_HASH;
  inputCount: number;
  worldCount: number;
  executionsPerWorld: 2;
  canonicalAnchorIds: AutonomousAnchorId[];
  rows: A01AutonomousSetupRow[];
  formedWorlds: number;
  timeoutWorlds: number;
  safeExitWorlds: number;
  deterministic: boolean;
  evaluationOrderStable: boolean;
  mirrored: boolean;
  routeSegmentsMonotonic: boolean;
  informationBoundaryPassed: boolean;
  publicCausalityPassed: boolean;
  zeroStrategyAdjustment: boolean;
  replays: A01RepresentativeReplay[];
  passed: boolean;
  firstFailure: { id: string; reason: string } | null;
}

function copyPositions(input: InitialPlayerPositions): InitialPlayerPositions {
  return Object.fromEntries(
    PLAYER_IDS.map((id) => [id, { ...input[id] }]),
  ) as unknown as InitialPlayerPositions;
}

export function makeA01AutonomousConfig(
  input: A01AutonomousSetupInput,
  mirrored = false,
  plannerEvaluationOrder: "offense-first" | "defense-first" = "offense-first",
): SimulationConfig {
  return {
    initialPositions: mirrored
      ? mirrorInitialPlayerPositions(input.initialPositions)
      : copyPositions(input.initialPositions),
    setupMode: "auto",
    startMode: "form_pnr",
    formationDomainVersion: input.formationDomainVersion,
    seed: input.seed,
    horizon: "formation_resolution",
    plannerEvaluationOrder,
  };
}

export function createA01AutonomousReplay(
  inputId: string,
  mirrored = false,
): PnrSimulation {
  const input = A01_AUTONOMOUS_SETUP_INPUTS.find((candidate) => candidate.id === inputId);
  if (!input) throw new Error(`Unknown A01 autonomous setup input: ${inputId}`);
  return new PnrSimulation(makeA01AutonomousConfig(input, mirrored));
}

function opposite(side: ScreenSide | null): ScreenSide | null {
  return side === "right" ? "left" : side === "left" ? "right" : null;
}

function chosenCandidate(record: PlanningRecord) {
  return record.candidates.find((candidate) => candidate.label === record.chosenLabel);
}

function formationRecords(simulation: PnrSimulation): PlanningRecord[] {
  return simulation.planningLog.filter(
    (record) => record.team === "offense" && record.decisionPhase === "offense_formation",
  );
}

function resolution(simulation: PnrSimulation): A01Resolution {
  if (simulation.world.terminal?.reason === "formation_aborted") return "formation_aborted";
  if (simulation.world.terminal?.reason === "formation_timeout") return "formation_timeout";
  return "formation_ready";
}

function resolved(simulation: PnrSimulation): boolean {
  return simulation.world.formation.phase === "pnr" || Boolean(simulation.world.terminal);
}

function defenseInitialFrame(simulation: PnrSimulation): string {
  const record = simulation.planningLog.find((item) => item.team === "defense");
  return JSON.stringify({ plan: simulation.defensePlan, record });
}

function inspectRouteMonotonicity(
  plan: TeamPlan,
  seen: Map<string, number>,
): boolean {
  if (plan.route?.boundary !== "formation_setup") return true;
  for (const [id, track] of Object.entries(plan.route.tracks)) {
    if (!track) continue;
    const key = `${plan.version}:${id}`;
    const previous = seen.get(key) ?? 0;
    if (track.segmentIndex < previous) return false;
    seen.set(key, track.segmentIndex);
    let reachedGap = false;
    for (const reachedAt of track.reachedAtTick) {
      if (reachedAt === null) reachedGap = true;
      else if (reachedGap) return false;
    }
  }
  return true;
}

function setupChoice(record: PlanningRecord): string | null {
  const setup = chosenCandidate(record)?.autonomousSetup;
  return setup ? `${setup.side}:${setup.anchorId}` : null;
}

function auditRow(input: A01AutonomousSetupInput): A01AutonomousSetupRow {
  const primary = new PnrSimulation(makeA01AutonomousConfig(input));
  const duplicate = new PnrSimulation(makeA01AutonomousConfig(input));
  const mirrored = new PnrSimulation(makeA01AutonomousConfig(input, true));
  const mirroredDuplicate = new PnrSimulation(makeA01AutonomousConfig(input, true));
  const defenseFirst = new PnrSimulation(
    makeA01AutonomousConfig(input, false, "defense-first"),
  );
  const pressure = new PnrSimulation({
    ...makeA01AutonomousConfig(input),
    strategies: {
      offense: { id: OFFENSE_MISMATCH_PRESSURE.id, version: OFFENSE_MISMATCH_PRESSURE.version },
      defense: { ...DEFAULT_TEAM_STRATEGY_SELECTION.defense },
    },
  });
  const failures: string[] = [];
  const initialSetup = primary.offensePlan.autonomousSetup ?? null;
  const mirroredInitialSetup = mirrored.offensePlan.autonomousSetup ?? null;
  const initialObservation = createPlannerObservation(primary.world, "defense");
  const neutralLandmarks =
    primary.world.landmarks.screenAnchor.x === primary.world.players.O5.pos.x &&
    primary.world.landmarks.screenAnchor.y === primary.world.players.O5.pos.y &&
    primary.world.landmarks.handlerWaitingPoint.x === primary.world.players.O1.pos.x &&
    primary.world.landmarks.handlerWaitingPoint.y === primary.world.players.O1.pos.y;
  const pressureSetup = pressure.offensePlan.autonomousSetup;
  const initialInformationBoundary =
    primary.config.screenSide === undefined &&
    primary.world.screenSide === null &&
    initialObservation.screenSide === null &&
    Object.keys(initialObservation.landmarks).length === 1 &&
    initialObservation.landmarks.screenAnchor.x === primary.world.players.O5.pos.x &&
    initialObservation.landmarks.screenAnchor.y === primary.world.players.O5.pos.y &&
    neutralLandmarks &&
    defenseInitialFrame(primary) === defenseInitialFrame(pressure) &&
    pressureSetup?.side === initialSetup?.side &&
    pressureSetup?.anchorId === initialSetup?.anchorId;
  if (!initialInformationBoundary) failures.push("A01_INITIAL_INFORMATION_BOUNDARY");

  const initialRecord = formationRecords(primary)[0];
  const setupCandidates = initialRecord.candidates.filter(
    (candidate) => candidate.autonomousSetup,
  );
  const catalogPassed =
    setupCandidates.length === AUTONOMOUS_CANONICAL_ANCHORS.length * 2 &&
    (["right", "left"] as const).every((side) =>
      AUTONOMOUS_CANONICAL_ANCHORS.every((anchor) =>
        setupCandidates.some((candidate) =>
          candidate.autonomousSetup?.side === side &&
          candidate.autonomousSetup.anchorId === anchor.id
        )
      )
    );
  if (!catalogPassed) failures.push("A01_CANONICAL_CATALOG");

  let deterministic = true;
  let evaluationOrderStable = true;
  let mirrorMaximumError = 0;
  let routeSegmentsMonotonic = true;
  let readyFactObserved = false;
  const routeProgress = new Map<string, number>();
  const mirroredRouteProgress = new Map<string, number>();
  const initialOffensePositions = {
    O1: { ...primary.world.players.O1.pos },
    O5: { ...primary.world.players.O5.pos },
  };
  const maximumTicks = Math.ceil(3.35 / FIXED_DT);
  for (let tick = 0; tick <= maximumTicks; tick += 1) {
    if (
      autonomousDeterministicFrame(primary) !== autonomousDeterministicFrame(duplicate) ||
      autonomousDeterministicFrame(mirrored) !==
        autonomousDeterministicFrame(mirroredDuplicate)
    ) {
      deterministic = false;
      failures.push(`A01_NONDETERMINISTIC@${tick}`);
      break;
    }
    if (autonomousDeterministicFrame(primary) !== autonomousDeterministicFrame(defenseFirst)) {
      evaluationOrderStable = false;
      failures.push(`A01_EVALUATION_ORDER@${tick}`);
      break;
    }
    mirrorMaximumError = Math.max(
      mirrorMaximumError,
      autonomousSimulationMirrorError(primary, mirrored),
    );
    if (!Number.isFinite(mirrorMaximumError) || mirrorMaximumError > 1e-9) {
      failures.push(`A01_MIRROR_GEOMETRY@${tick}`);
      break;
    }
    routeSegmentsMonotonic =
      routeSegmentsMonotonic &&
      inspectRouteMonotonicity(primary.offensePlan, routeProgress) &&
      inspectRouteMonotonicity(mirrored.offensePlan, mirroredRouteProgress);
    if (!routeSegmentsMonotonic) {
      failures.push(`A01_ROUTE_SEGMENT_REGRESSION@${tick}`);
      break;
    }
    if ([primary, duplicate, mirrored, mirroredDuplicate, defenseFirst].every(resolved)) break;
    const eventStart = primary.eventLog.length;
    primary.step();
    duplicate.step();
    mirrored.step();
    mirroredDuplicate.step();
    defenseFirst.step();
    if (
      primary.eventLog.slice(eventStart).some((event) => event.type === "formation_ready")
    ) {
      readyFactObserved = formationReadiness(primary.world).ready;
    }
  }

  const primaryResolution = resolution(primary);
  const mirroredResolution = resolution(mirrored);
  if (primaryResolution !== mirroredResolution) failures.push("A01_MIRROR_RESOLUTION");
  if (!autonomousSamePublicTimeline(primary, mirrored)) {
    failures.push("A01_MIRROR_TIMELINE");
  }
  const records = formationRecords(primary);
  const mirroredRecords = formationRecords(mirrored);
  const initialChoice = setupChoice(records[0]);
  const mirroredInitialChoice = setupChoice(mirroredRecords[0]);
  const choiceStable = [records, mirroredRecords].every((items) => {
    const first = setupChoice(items[0]);
    return items.slice(1).every((record) =>
      record.chosen === "ABORT_FORMATION" || setupChoice(record) === first
    );
  });
  if (!choiceStable) failures.push("A01_CHOICE_JITTER");
  if (
    initialSetup &&
    mirroredInitialSetup &&
    (mirroredInitialSetup.side !== opposite(initialSetup.side) ||
      mirroredInitialSetup.anchorId !== initialSetup.anchorId)
  ) {
    failures.push("A01_CHOICE_NOT_MIRRORED");
  }
  if ((initialChoice === null) !== (mirroredInitialChoice === null)) {
    failures.push("A01_ABORT_NOT_MIRRORED");
  }

  const zeroStrategyAdjustment = [records, mirroredRecords].every((items) =>
    items.every((record) =>
      record.candidates.every((candidate) => candidate.strategyAdjustment === 0)
    )
  ) && formationRecords(pressure).every((record) =>
    record.candidates.every((candidate) => candidate.strategyAdjustment === 0)
  );
  if (!zeroStrategyAdjustment) failures.push("A01_NONZERO_STRATEGY_ADJUSTMENT");

  const commitEvent = primary.eventLog.find(
    (event) => event.type === "formation_side_committed",
  );
  const screenSetEvent = primary.eventLog.find((event) => event.type === "screen_set");
  const readyEvent = primary.eventLog.find((event) => event.type === "formation_ready");
  const abortRequest = primary.eventLog.find(
    (event) => event.type === "formation_abort_requested",
  );
  const abortEvent = primary.eventLog.find((event) => event.type === "formation_aborted");
  const defenseCommitRecord = primary.planningLog.find(
    (record) =>
      record.team === "defense" &&
      commitEvent &&
      record.triggerEventIds.includes(commitEvent.id),
  );
  const postCommitInformationBoundary = primaryResolution === "formation_aborted"
    ? !commitEvent
    : Boolean(commitEvent && defenseCommitRecord?.chosen === "TRACK_FORMATION");
  const informationBoundaryPassed =
    initialInformationBoundary && postCommitInformationBoundary;
  if (!postCommitInformationBoundary) failures.push("A01_POST_COMMIT_INFORMATION_BOUNDARY");

  const formedCausality = primaryResolution === "formation_ready" &&
    Boolean(
      commitEvent &&
      screenSetEvent &&
      readyEvent &&
      commitEvent.tick <= screenSetEvent.tick &&
      screenSetEvent.tick <= readyEvent.tick &&
      readyFactObserved,
    );
  const offenseStayedPut =
    Math.hypot(
      primary.world.players.O1.pos.x - initialOffensePositions.O1.x,
      primary.world.players.O1.pos.y - initialOffensePositions.O1.y,
    ) <= 1e-12 &&
    Math.hypot(
      primary.world.players.O5.pos.x - initialOffensePositions.O5.x,
      primary.world.players.O5.pos.y - initialOffensePositions.O5.y,
    ) <= 1e-12;
  const safeExitReal = primaryResolution !== "formation_aborted" || Boolean(
    abortRequest &&
    abortEvent &&
    abortRequest.tick === abortEvent.tick &&
    abortEvent.tick > 0 &&
    abortEvent.tick < Math.ceil(3.2 / FIXED_DT) &&
    primary.world.ballOwner === "O1" &&
    !primary.world.ball.inFlight &&
    primary.world.formation.abortedReason === "no_feasible_canonical_setup" &&
    offenseStayedPut &&
    !screenSetEvent &&
    !readyEvent,
  );
  if (!safeExitReal) failures.push("A01_SAFE_EXIT_NOT_REAL");
  const publicCausalityPassed = primaryResolution === "formation_ready"
    ? formedCausality
    : primaryResolution === "formation_aborted"
      ? safeExitReal
      : Boolean(primary.world.terminal?.reason === "formation_timeout");
  if (!publicCausalityPassed) failures.push("A01_PUBLIC_CAUSALITY");

  return {
    id: input.id,
    sourceStage: input.sourceStage,
    selectedSide: initialSetup?.side ?? null,
    selectedAnchorId: initialSetup?.anchorId ?? null,
    mirroredSelectedSide: mirroredInitialSetup?.side ?? null,
    mirroredSelectedAnchorId: mirroredInitialSetup?.anchorId ?? null,
    resolution: primaryResolution,
    resolvedTick: primary.world.tick,
    publicCommitTick: commitEvent?.tick ?? null,
    screenSetTick: screenSetEvent?.tick ?? null,
    jointReadyTick: readyEvent?.tick ?? null,
    chosenFormationEta: initialSetup?.formationEta ?? null,
    chosenCorridorClearance: initialSetup?.corridorClearance ?? null,
    deterministic,
    evaluationOrderStable,
    mirrorPassed:
      mirrorMaximumError <= 1e-9 &&
      autonomousSamePublicTimeline(primary, mirrored) &&
      primaryResolution === mirroredResolution,
    mirrorMaximumError,
    routeSegmentsMonotonic,
    choiceStable,
    informationBoundaryPassed,
    publicCausalityPassed,
    safeExitReal,
    zeroStrategyAdjustment,
    failures,
  };
}

function representativeReplays(rows: A01AutonomousSetupRow[]): A01RepresentativeReplay[] {
  const formed = rows.filter((row) => row.resolution === "formation_ready");
  const longest = [...formed].sort(
    (first, second) => second.resolvedTick - first.resolvedTick || first.id.localeCompare(second.id),
  )[0];
  const tightest = [...formed]
    .filter((row) => row.id !== longest?.id)
    .sort(
      (first, second) =>
        (first.chosenCorridorClearance ?? Infinity) -
          (second.chosenCorridorClearance ?? Infinity) ||
        first.id.localeCompare(second.id),
    )[0] ?? longest;
  const diverse = formed.find(
    (row) =>
      row.id !== longest?.id &&
      row.id !== tightest?.id &&
      row.selectedAnchorId !== longest?.selectedAnchorId,
  ) ?? formed.find((row) => row.id !== longest?.id && row.id !== tightest?.id) ?? longest;
  const safeExit = rows.find((row) => row.resolution === "formation_aborted");
  if (!longest || !tightest || !diverse || !safeExit) return [];
  return [
    {
      id: "longest-formed",
      inputId: longest.id,
      mirrored: false,
      side: longest.selectedSide,
      anchorId: longest.selectedAnchorId,
      resolution: longest.resolution,
      note: `审计中最晚联合就绪：tick ${longest.resolvedTick}`,
    },
    {
      id: "tightest-corridor",
      inputId: tightest.id,
      mirrored: false,
      side: tightest.selectedSide,
      anchorId: tightest.selectedAnchorId,
      resolution: tightest.resolution,
      note: `审计中最小已选同步走廊净空 ${tightest.chosenCorridorClearance?.toFixed(3)}m`,
    },
    {
      id: "diverse-mirror",
      inputId: diverse.id,
      mirrored: true,
      side: opposite(diverse.selectedSide),
      anchorId: diverse.selectedAnchorId,
      resolution: diverse.resolution,
      note: "审计后选择的真实对应镜像与不同 canonical anchor",
    },
    {
      id: "safe-exit",
      inputId: safeExit.id,
      mirrored: false,
      side: null,
      anchorId: null,
      resolution: safeExit.resolution,
      note: `全部固定组合被 veto 后于 tick ${safeExit.resolvedTick} 真实安全退出`,
    },
  ];
}

export function scanA01AutonomousSetups(): A01AutonomousSetupAudit {
  const rows = A01_AUTONOMOUS_SETUP_INPUTS.map(auditRow);
  const firstFailureRow = rows.find((row) => row.failures.length > 0);
  const replays = representativeReplays(rows);
  return {
    inputHash: A01_INPUT_HASH,
    inputCount: A01_AUTONOMOUS_SETUP_INPUTS.length,
    worldCount: A01_AUTONOMOUS_SETUP_INPUTS.length * 2,
    executionsPerWorld: 2,
    canonicalAnchorIds: AUTONOMOUS_CANONICAL_ANCHORS.map((anchor) => anchor.id),
    rows,
    formedWorlds: rows.filter((row) => row.resolution === "formation_ready").length * 2,
    timeoutWorlds: rows.filter((row) => row.resolution === "formation_timeout").length * 2,
    safeExitWorlds: rows.filter((row) => row.resolution === "formation_aborted").length * 2,
    deterministic: rows.every((row) => row.deterministic),
    evaluationOrderStable: rows.every((row) => row.evaluationOrderStable),
    mirrored: rows.every((row) => row.mirrorPassed),
    routeSegmentsMonotonic: rows.every((row) => row.routeSegmentsMonotonic),
    informationBoundaryPassed: rows.every((row) => row.informationBoundaryPassed),
    publicCausalityPassed: rows.every((row) => row.publicCausalityPassed),
    zeroStrategyAdjustment: rows.every((row) => row.zeroStrategyAdjustment),
    replays,
    passed: rows.every((row) => row.failures.length === 0) && replays.length === 4,
    firstFailure: firstFailureRow
      ? { id: firstFailureRow.id, reason: firstFailureRow.failures[0] }
      : null,
  };
}

export function makeA01RepresentativeReplayConfig(
  replay: A01RepresentativeReplay,
): SimulationConfig {
  const input = A01_AUTONOMOUS_SETUP_INPUTS.find(
    (candidate) => candidate.id === replay.inputId,
  );
  if (!input) throw new Error(`Unknown A01 representative input: ${replay.inputId}`);
  return makeA01AutonomousConfig(input, replay.mirrored);
}
