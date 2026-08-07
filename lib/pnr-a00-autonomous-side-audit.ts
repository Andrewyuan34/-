import {
  AUTONOMOUS_FORMATION_DOMAIN_VERSION,
  AUTONOMOUS_SIDE_MINIMUM_COMMIT_SECONDS,
  FIXED_DT,
  PLAYER_IDS,
  PnrSimulation,
  createPlannerObservation,
  mirrorInitialPlayerPositions,
  mirrorPointAcrossCenterline,
  type InitialPlayerPositions,
  type PlanningRecord,
  type ScreenSide,
  type SimulationConfig,
  type TeamPlan,
  type Vec2,
} from "./pnr-core.ts";
import {
  A00_AUTONOMOUS_SIDE_INPUTS,
  A00_INPUT_HASH,
  type A00AutonomousSideInput,
} from "./pnr-a00-autonomous-side-manifest.ts";

export interface A00AutonomousSideRow {
  id: string;
  sourceStage: A00AutonomousSideInput["sourceStage"];
  selectedSide: ScreenSide;
  mirroredSelectedSide: ScreenSide;
  publicCommitTick: number | null;
  mirroredPublicCommitTick: number | null;
  resolvedTick: number;
  resolvedKind: "formation_ready" | "formation_timeout";
  deterministic: boolean;
  mirrorPassed: boolean;
  mirrorMaximumError: number;
  minimumCommitPassed: boolean;
  hysteresisPassed: boolean;
  zeroStrategyAdjustment: boolean;
  privateBeforeCommit: boolean;
  failures: string[];
}

export interface A00AutonomousSideAudit {
  inputHash: typeof A00_INPUT_HASH;
  inputCount: number;
  worldCount: number;
  executionsPerWorld: 2;
  rows: A00AutonomousSideRow[];
  deterministic: boolean;
  mirrored: boolean;
  minimumCommitPassed: boolean;
  hysteresisPassed: boolean;
  zeroStrategyAdjustment: boolean;
  privateBeforeCommit: boolean;
  passed: boolean;
  firstFailure: { id: string; reason: string } | null;
}

function copyPositions(input: InitialPlayerPositions): InitialPlayerPositions {
  return Object.fromEntries(
    PLAYER_IDS.map((id) => [id, { ...input[id] }]),
  ) as unknown as InitialPlayerPositions;
}

export function makeA00AutonomousConfig(
  input: A00AutonomousSideInput,
  mirrored = false,
): SimulationConfig {
  const positions = mirrored
    ? mirrorInitialPlayerPositions(input.initialPositions)
    : copyPositions(input.initialPositions);
  return {
    initialPositions: positions,
    setupMode: "auto",
    startMode: "form_pnr",
    formationDomainVersion: AUTONOMOUS_FORMATION_DOMAIN_VERSION,
    seed: input.seed,
    horizon: "formation_resolution",
  };
}

export function createA00AutonomousReplay(
  id: string,
  mirrored = false,
): PnrSimulation {
  const input = A00_AUTONOMOUS_SIDE_INPUTS.find((candidate) => candidate.id === id);
  if (!input) throw new Error(`Unknown A00 autonomous input: ${id}`);
  return new PnrSimulation(makeA00AutonomousConfig(input, mirrored));
}

function opposite(side: ScreenSide): ScreenSide {
  return side === "right" ? "left" : "right";
}

function chosenSetupSide(record: PlanningRecord): ScreenSide | null {
  return record.candidates.find(
    (candidate) => candidate.label === record.chosenLabel,
  )?.autonomousSetup?.side ?? null;
}

function initialSetupSide(simulation: PnrSimulation): ScreenSide | null {
  return simulation.offensePlan.autonomousSetup?.side ?? null;
}

export function autonomousDeterministicFrame(simulation: PnrSimulation): string {
  return JSON.stringify({
    world: simulation.world,
    offensePlan: simulation.offensePlan,
    defensePlan: simulation.defensePlan,
    planningLog: simulation.planningLog,
    eventLog: simulation.eventLog,
  });
}

function pointMirrorError(right: Vec2, left: Vec2): number {
  const mirrored = mirrorPointAcrossCenterline(right);
  return Math.hypot(mirrored.x - left.x, mirrored.y - left.y);
}

function vectorMirrorError(right: Vec2, left: Vec2): number {
  return Math.hypot(-right.x - left.x, right.y - left.y);
}

function planMirrorError(right: TeamPlan, left: TeamPlan): number {
  let maximum = 0;
  const comparePoint = (a?: Vec2, b?: Vec2): void => {
    if (!a || !b) {
      if (a || b) maximum = Number.POSITIVE_INFINITY;
      return;
    }
    maximum = Math.max(maximum, pointMirrorError(a, b));
  };
  comparePoint(right.primaryTarget, left.primaryTarget);
  comparePoint(right.secondaryTarget, left.secondaryTarget);
  const rightSetup = right.autonomousSetup;
  const leftSetup = left.autonomousSetup;
  if (rightSetup || leftSetup) {
    if (
      !rightSetup ||
      !leftSetup ||
      opposite(rightSetup.side) !== leftSetup.side ||
      rightSetup.anchorId !== leftSetup.anchorId
    ) {
      return Number.POSITIVE_INFINITY;
    }
    comparePoint(rightSetup.planningOrigin, leftSetup.planningOrigin);
    for (const name of [
      "screenAnchor",
      "handlerWaitingPoint",
      "useGate",
      "rejectGate",
    ] as const) {
      comparePoint(rightSetup.landmarks[name], leftSetup.landmarks[name]);
    }
    for (const routeName of ["handlerRoute", "screenerRoute"] as const) {
      const rightPoints = rightSetup[routeName].waypoints;
      const leftPoints = leftSetup[routeName].waypoints;
      if (rightPoints.length !== leftPoints.length) return Number.POSITIVE_INFINITY;
      rightPoints.forEach((point, index) => comparePoint(point, leftPoints[index]));
    }
  }
  return maximum;
}

export function autonomousSimulationMirrorError(
  right: PnrSimulation,
  left: PnrSimulation,
): number {
  let maximum = 0;
  for (const id of PLAYER_IDS) {
    maximum = Math.max(
      maximum,
      pointMirrorError(right.world.players[id].pos, left.world.players[id].pos),
      vectorMirrorError(right.world.players[id].vel, left.world.players[id].vel),
    );
  }
  maximum = Math.max(
    maximum,
    pointMirrorError(right.world.ball.pos, left.world.ball.pos),
    vectorMirrorError(right.world.ball.vel, left.world.ball.vel),
    planMirrorError(right.offensePlan, left.offensePlan),
  );
  for (const name of [
    "screenAnchor",
    "handlerWaitingPoint",
    "useGate",
    "rejectGate",
  ] as const) {
    maximum = Math.max(
      maximum,
      pointMirrorError(right.world.landmarks[name], left.world.landmarks[name]),
    );
  }
  if (
    right.world.screenSide === null
      ? left.world.screenSide !== null
      : left.world.screenSide !== opposite(right.world.screenSide)
  ) {
    return Number.POSITIVE_INFINITY;
  }
  return maximum;
}

export function autonomousSamePublicTimeline(
  right: PnrSimulation,
  left: PnrSimulation,
): boolean {
  const rightEvents = right.eventLog.map((event) => [event.type, event.tick]);
  const leftEvents = left.eventLog.map((event) => [event.type, event.tick]);
  if (JSON.stringify(rightEvents) !== JSON.stringify(leftEvents)) return false;
  const normalizeFormation = (simulation: PnrSimulation) => ({
    ...simulation.world.formation,
    committedSide: simulation.world.formation.committedSide ? "committed" : null,
  });
  return JSON.stringify(normalizeFormation(right)) ===
    JSON.stringify(normalizeFormation(left));
}

function resolved(simulation: PnrSimulation): boolean {
  return simulation.world.formation.phase === "pnr" || Boolean(simulation.world.terminal);
}

function formationRecords(simulation: PnrSimulation): PlanningRecord[] {
  return simulation.planningLog.filter(
    (record) => record.team === "offense" && record.decisionPhase === "offense_formation",
  );
}

function auditRow(input: A00AutonomousSideInput): A00AutonomousSideRow {
  const primary = new PnrSimulation(makeA00AutonomousConfig(input));
  const duplicate = new PnrSimulation(makeA00AutonomousConfig(input));
  const mirrored = new PnrSimulation(makeA00AutonomousConfig(input, true));
  const mirroredDuplicate = new PnrSimulation(makeA00AutonomousConfig(input, true));
  const failures: string[] = [];
  const selectedSide = initialSetupSide(primary);
  const mirroredSelectedSide = initialSetupSide(mirrored);
  if (!selectedSide || !mirroredSelectedSide) failures.push("A00_MISSING_PRIVATE_SIDE");
  if (selectedSide && mirroredSelectedSide !== opposite(selectedSide)) {
    failures.push("A00_SIDE_NOT_MIRRORED");
  }
  const offenseObservation = createPlannerObservation(primary.world, "offense");
  const defenseObservation = createPlannerObservation(primary.world, "defense");
  const privateBeforeCommit =
    primary.world.screenSide === null &&
    offenseObservation.screenSide === null &&
    defenseObservation.screenSide === null &&
    Object.keys(defenseObservation.landmarks).length === 1 &&
    defenseObservation.landmarks.screenAnchor.x === primary.world.players.O5.pos.x &&
    defenseObservation.landmarks.screenAnchor.y === primary.world.players.O5.pos.y;
  if (!privateBeforeCommit) failures.push("A00_SIDE_VISIBLE_BEFORE_COMMIT");

  let deterministic = true;
  let mirrorMaximumError = 0;
  const maximumTicks = Math.ceil(3.35 / FIXED_DT);
  for (let tick = 0; tick <= maximumTicks; tick += 1) {
    if (
      autonomousDeterministicFrame(primary) !== autonomousDeterministicFrame(duplicate) ||
      autonomousDeterministicFrame(mirrored) !== autonomousDeterministicFrame(mirroredDuplicate)
    ) {
      deterministic = false;
      failures.push(`A00_NONDETERMINISTIC@${tick}`);
      break;
    }
    mirrorMaximumError = Math.max(
      mirrorMaximumError,
      autonomousSimulationMirrorError(primary, mirrored),
    );
    if (!Number.isFinite(mirrorMaximumError) || mirrorMaximumError > 1e-9) {
      failures.push(`A00_MIRROR_GEOMETRY@${tick}`);
      break;
    }
    if ([primary, duplicate, mirrored, mirroredDuplicate].every(resolved)) break;
    primary.step();
    duplicate.step();
    mirrored.step();
    mirroredDuplicate.step();
  }
  if (!autonomousSamePublicTimeline(primary, mirrored)) {
    failures.push("A00_MIRROR_TIMELINE");
  }
  if (!resolved(primary) || !resolved(mirrored)) failures.push("A00_WATCHDOG_UNBOUNDED");

  const primaryRecords = formationRecords(primary);
  const mirrorRecords = formationRecords(mirrored);
  const minimumCommitTick = Math.ceil(
    AUTONOMOUS_SIDE_MINIMUM_COMMIT_SECONDS / FIXED_DT,
  );
  const laterRecords = primaryRecords.slice(1);
  const mirroredLaterRecords = mirrorRecords.slice(1);
  const minimumCommitPassed =
    laterRecords.every((record) => record.tick >= minimumCommitTick) &&
    mirroredLaterRecords.every((record) => record.tick >= minimumCommitTick);
  if (!minimumCommitPassed) failures.push("A00_MINIMUM_COMMIT");
  const hysteresisPassed = [primaryRecords, mirrorRecords].every((records) =>
    records.slice(1).every((record) => {
      const side = chosenSetupSide(record);
      const chosen = record.candidates.find((candidate) => candidate.label === record.chosenLabel);
      return side === chosenSetupSide(records[0]) &&
        Boolean(chosen?.evidence.some((item) => item.includes("滞回")));
    })
  );
  if (!hysteresisPassed) failures.push("A00_HYSTERESIS");
  const zeroStrategyAdjustment = [primaryRecords, mirrorRecords].every((records) =>
    records.every((record) =>
      record.candidates.every((candidate) => candidate.strategyAdjustment === 0)
    )
  );
  if (!zeroStrategyAdjustment) failures.push("A00_NONZERO_STRATEGY_ADJUSTMENT");
  const publicCommitTick = primary.eventLog.find(
    (event) => event.type === "formation_side_committed",
  )?.tick ?? null;
  const mirroredPublicCommitTick = mirrored.eventLog.find(
    (event) => event.type === "formation_side_committed",
  )?.tick ?? null;
  if (
    !selectedSide ||
    primary.world.formation.committedSide !== selectedSide ||
    mirrored.world.formation.committedSide !== mirroredSelectedSide
  ) {
    failures.push("A00_PUBLIC_COMMIT_MISMATCH");
  }
  const readyEvent = primary.eventLog.find((event) => event.type === "formation_ready");
  const resolvedKind = readyEvent ? "formation_ready" : "formation_timeout";
  return {
    id: input.id,
    sourceStage: input.sourceStage,
    selectedSide: selectedSide ?? "right",
    mirroredSelectedSide: mirroredSelectedSide ?? "left",
    publicCommitTick,
    mirroredPublicCommitTick,
    resolvedTick: primary.world.tick,
    resolvedKind,
    deterministic,
    mirrorPassed:
      mirrorMaximumError <= 1e-9 && autonomousSamePublicTimeline(primary, mirrored),
    mirrorMaximumError,
    minimumCommitPassed,
    hysteresisPassed,
    zeroStrategyAdjustment,
    privateBeforeCommit,
    failures,
  };
}

export function scanA00AutonomousSides(): A00AutonomousSideAudit {
  const rows = A00_AUTONOMOUS_SIDE_INPUTS.map(auditRow);
  const firstFailureRow = rows.find((row) => row.failures.length > 0);
  return {
    inputHash: A00_INPUT_HASH,
    inputCount: A00_AUTONOMOUS_SIDE_INPUTS.length,
    worldCount: A00_AUTONOMOUS_SIDE_INPUTS.length * 2,
    executionsPerWorld: 2,
    rows,
    deterministic: rows.every((row) => row.deterministic),
    mirrored: rows.every((row) => row.mirrorPassed),
    minimumCommitPassed: rows.every((row) => row.minimumCommitPassed),
    hysteresisPassed: rows.every((row) => row.hysteresisPassed),
    zeroStrategyAdjustment: rows.every((row) => row.zeroStrategyAdjustment),
    privateBeforeCommit: rows.every((row) => row.privateBeforeCommit),
    passed: rows.every((row) => row.failures.length === 0),
    firstFailure: firstFailureRow
      ? { id: firstFailureRow.id, reason: firstFailureRow.failures[0] }
      : null,
  };
}
