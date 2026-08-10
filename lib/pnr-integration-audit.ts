import {
  AUTONOMOUS_FORMATION_DOMAIN_VERSION,
  FIXED_DT,
  FORMATION_TACTICAL_INTEGRATION_VERSION,
  MINIMUM_TACTICAL_VOCABULARY_VERSION,
  PLAYER_IDS,
  PnrSimulation,
  copyInitialPlayerPositions,
  createPlannerObservation,
  mirrorInitialPlayerPositions,
  mirrorPointAcrossCenterline,
  mirrorVectorAcrossCenterline,
  type InitialPlayerPositions,
  type PlanningRecord,
  type ScreenSide,
  type SimulationConfig,
  type TeamPlan,
  type TerminalState,
  type Vec2,
  type WorldEvent,
} from "./pnr-core.ts";
import {
  I00_ALLOWED_TERMINALS,
  I00_INPUT_MANIFEST_VERSION,
  I00_INTEGRATION_INPUTS,
  I00_MANIFEST_HASH,
  I00_RUNTIME_CONTRACT,
  I00_STRATEGY_CONTRACT,
  type I00IntegrationInput,
} from "./pnr-integration-manifest.ts";

const TACTICAL_OFFENSE_READS = new Set([
  "ATTACK_DROP_GAP",
  "TAKE_DROP_PULLUP",
  "RESET_DROP",
  "SNAKE_CHASE",
  "POCKET_PASS",
  "RESET_CHASE",
]);
const TACTICAL_DEFENSE_COVERAGES = new Set(["DROP_CONTAIN", "CHASE_OVER"]);
const TACTICAL_EVENTS = new Set([
  "drop_committed",
  "chase_over_committed",
  "pocket_window_open",
  "pocket_pass_launched",
  "pocket_pass_caught",
  "tactical_drive_advantage",
  "tactical_pullup_window",
  "tactical_snake_advantage",
  "tactical_contained",
]);
const MAXIMUM_TICKS = Math.ceil(I00_RUNTIME_CONTRACT.maxTime / FIXED_DT) + 3;
const EPSILON = 1e-9;

export type I01Resolution = TerminalState["reason"] | "unresolved";

export interface I01SideAudit {
  mirrored: boolean;
  selectedSide: ScreenSide | null;
  readyTick: number | null;
  readyAvailableAtTick: number | null;
  handoffTick: number | null;
  enteredPnrAtTick: number | null;
  handoffTeams: Array<"offense" | "defense">;
  handoffOffensePlan: string | null;
  handoffDefensePlan: string | null;
  defenseCoverages: string[];
  offenseReads: string[];
  terminalReason: I01Resolution;
  terminalTick: number | null;
  sameSimulationWorldIdentity: boolean;
  monotonicTickTime: boolean;
  playerContinuity: boolean;
  ballContinuity: boolean;
  noTacticalReadBeforeHandoff: boolean;
  publicEventCausalityPassed: boolean;
  informationBoundaryPassed: boolean;
  zeroStrategyAdjustment: boolean;
  safeExitPassed: boolean;
  allowedTerminal: boolean;
}

export interface I01IntegrationRow {
  id: string;
  resolution: I01Resolution;
  terminalTick: number | null;
  formed: boolean;
  readyTick: number | null;
  handoffTick: number | null;
  handoffDefensePlan: string | null;
  offenseReads: string[];
  right: I01SideAudit;
  left: I01SideAudit;
  deterministic: boolean;
  evaluationOrderStable: boolean;
  defenseFirstEquivalent: boolean;
  mirrored: boolean;
  mirrorMaximumError: number;
  sameSimulationWorldIdentity: boolean;
  formationReadyNextBoundary: boolean;
  monotonicTickTime: boolean;
  playerContinuity: boolean;
  ballContinuity: boolean;
  noTacticalReadBeforeHandoff: boolean;
  publicEventCausalityPassed: boolean;
  informationBoundaryPassed: boolean;
  zeroStrategyAdjustment: boolean;
  safeExitPassed: boolean;
  allowedTerminalsPassed: boolean;
  failures: string[];
  passed: boolean;
}

export interface I01RepresentativeReplay {
  id: "formed-handoff" | "chase-read" | "mirrored-handoff" | "safe-exit";
  inputId: string;
  mirrored: boolean;
  side: ScreenSide | null;
  terminalReason: I01Resolution;
  note: string;
}

export interface I01IntegrationAudit {
  manifestVersion: typeof I00_INPUT_MANIFEST_VERSION;
  inputHash: typeof I00_MANIFEST_HASH;
  inputCount: number;
  worldCount: number;
  executionsPerWorld: 3;
  rows: I01IntegrationRow[];
  formedWorlds: number;
  safeExitWorlds: number;
  sameSimulationWorldIdentity: boolean;
  formationReadyNextBoundary: boolean;
  monotonicTickTime: boolean;
  playerContinuity: boolean;
  ballContinuity: boolean;
  deterministic: boolean;
  evaluationOrderStable: boolean;
  defenseFirstEquivalent: boolean;
  noTacticalReadBeforeHandoff: boolean;
  publicEventCausalityPassed: boolean;
  mirrored: boolean;
  informationBoundaryPassed: boolean;
  zeroStrategyAdjustment: boolean;
  safeExitPassed: boolean;
  allowedTerminalsPassed: boolean;
  replays: I01RepresentativeReplay[];
  passed: boolean;
  firstFailure: { id: string; reason: string } | null;
}

function copyPositions(positions: InitialPlayerPositions): InitialPlayerPositions {
  return copyInitialPlayerPositions(positions);
}

export function makeI01IntegrationConfig(
  input: I00IntegrationInput,
  mirrored = false,
  plannerEvaluationOrder: "offense-first" | "defense-first" = "offense-first",
): SimulationConfig {
  return {
    initialPositions: mirrored
      ? mirrorInitialPlayerPositions(input.initialPositions)
      : copyPositions(input.initialPositions),
    setupMode: I00_RUNTIME_CONTRACT.setupMode,
    startMode: I00_RUNTIME_CONTRACT.startMode,
    formationDomainVersion: AUTONOMOUS_FORMATION_DOMAIN_VERSION,
    seed: input.seed,
    horizon: I00_RUNTIME_CONTRACT.horizon,
    tacticalVocabularyVersion: MINIMUM_TACTICAL_VOCABULARY_VERSION,
    integrationVersion: FORMATION_TACTICAL_INTEGRATION_VERSION,
    strategies: {
      offense: { ...I00_STRATEGY_CONTRACT.offense },
      defense: { ...I00_STRATEGY_CONTRACT.defense },
    },
    plannerEvaluationOrder,
  };
}

export function createI01IntegrationReplay(
  inputId: string,
  mirrored = false,
): PnrSimulation {
  const input = I00_INTEGRATION_INPUTS.find((candidate) => candidate.id === inputId);
  if (!input) throw new Error(`Unknown I01 integration input: ${inputId}`);
  return new PnrSimulation(makeI01IntegrationConfig(input, mirrored));
}

interface IdentityFrame {
  simulation: PnrSimulation;
  world: PnrSimulation["world"];
  players: PnrSimulation["world"]["players"];
  playerObjects: Array<PnrSimulation["world"]["players"][keyof PnrSimulation["world"]["players"]]>;
  ball: PnrSimulation["world"]["ball"];
}

interface StepFrame {
  tick: number;
  time: number;
  phase: "formation" | "pnr";
  players: Record<string, { pos: Vec2; vel: Vec2; maxSpeed: number }>;
  ballOwner: string | null;
  ball: { pos: Vec2; vel: Vec2; inFlight: boolean; kind: string | null; outcome: string };
}

interface RuntimeChecks {
  identity: IdentityFrame;
  sameObject: boolean;
  monotonic: boolean;
  playerContinuity: boolean;
  ballContinuity: boolean;
  noTBefore: boolean;
}

function identityFrame(simulation: PnrSimulation): IdentityFrame {
  return {
    simulation,
    world: simulation.world,
    players: simulation.world.players,
    playerObjects: PLAYER_IDS.map((id) => simulation.world.players[id]),
    ball: simulation.world.ball,
  };
}

function stepFrame(simulation: PnrSimulation): StepFrame {
  return {
    tick: simulation.world.tick,
    time: simulation.world.time,
    phase: simulation.world.formation.phase,
    players: Object.fromEntries(PLAYER_IDS.map((id) => [id, {
      pos: { ...simulation.world.players[id].pos },
      vel: { ...simulation.world.players[id].vel },
      maxSpeed: simulation.world.players[id].maxSpeed,
    }])),
    ballOwner: simulation.world.ballOwner,
    ball: {
      pos: { ...simulation.world.ball.pos },
      vel: { ...simulation.world.ball.vel },
      inFlight: simulation.world.ball.inFlight,
      kind: simulation.world.ball.kind,
      outcome: simulation.world.ball.outcome,
    },
  };
}

function identityPassed(simulation: PnrSimulation, identity: IdentityFrame): boolean {
  return simulation === identity.simulation &&
    simulation.world === identity.world &&
    simulation.world.players === identity.players &&
    simulation.world.ball === identity.ball &&
    PLAYER_IDS.every((id, index) => simulation.world.players[id] === identity.playerObjects[index]);
}

function tacticalReadPresent(simulation: PnrSimulation): boolean {
  return simulation.world.tacticalVocabularyVersion !== undefined ||
    simulation.world.tacticalCoverage !== undefined ||
    TACTICAL_OFFENSE_READS.has(simulation.offensePlan.id) ||
    TACTICAL_DEFENSE_COVERAGES.has(simulation.defensePlan.id) ||
    simulation.planningLog.some((record) =>
      TACTICAL_OFFENSE_READS.has(record.chosen) ||
      TACTICAL_DEFENSE_COVERAGES.has(record.chosen) ||
      record.decisionPhase === "offense_drop_read" ||
      record.decisionPhase === "offense_chase_read"
    ) || simulation.eventLog.some((event) => TACTICAL_EVENTS.has(event.type));
}

function afterStepChecks(
  simulation: PnrSimulation,
  previous: StepFrame,
  checks: RuntimeChecks,
): void {
  checks.sameObject = checks.sameObject && identityPassed(simulation, checks.identity);
  checks.monotonic = checks.monotonic &&
    simulation.world.tick === previous.tick + 1 &&
    Math.abs(simulation.world.time - simulation.world.tick * FIXED_DT) <= 1e-6;
  for (const id of PLAYER_IDS) {
    const before = previous.players[id];
    const after = simulation.world.players[id];
    const displacement = Math.hypot(after.pos.x - before.pos.x, after.pos.y - before.pos.y);
    checks.playerContinuity = checks.playerContinuity &&
      Number.isFinite(displacement) && displacement <= after.maxSpeed * FIXED_DT + EPSILON &&
      Math.hypot(after.vel.x, after.vel.y) <= after.maxSpeed + EPSILON;
    if (previous.phase === "formation" && simulation.world.formation.phase === "pnr") {
      checks.playerContinuity = checks.playerContinuity &&
        Math.hypot(after.vel.x - before.vel.x, after.vel.y - before.vel.y) <=
          12.8 * FIXED_DT + EPSILON;
    }
  }
  const ball = simulation.world.ball;
  checks.ballContinuity = checks.ballContinuity &&
    [ball.pos.x, ball.pos.y, ball.vel.x, ball.vel.y].every(Number.isFinite);
  if (simulation.world.ballOwner) {
    const owner = simulation.world.players[simulation.world.ballOwner];
    checks.ballContinuity = checks.ballContinuity &&
      Math.hypot(ball.pos.x - owner.pos.x, ball.pos.y - owner.pos.y) <= EPSILON;
  }
  if (previous.phase === "formation" && simulation.world.formation.phase === "pnr") {
    checks.ballContinuity = checks.ballContinuity &&
      previous.ballOwner === simulation.world.ballOwner &&
      previous.ball.inFlight === ball.inFlight && previous.ball.kind === ball.kind &&
      previous.ball.outcome === ball.outcome;
  }
  if (simulation.world.formation.phase === "formation") {
    checks.noTBefore = checks.noTBefore && !tacticalReadPresent(simulation);
  }
}

function deterministicFrame(simulation: PnrSimulation): string {
  const plan = (value: TeamPlan) => ({
    id: value.id,
    version: value.version,
    route: value.route
      ? Object.fromEntries(PLAYER_IDS.map((id) => [id, value.route?.tracks[id]
        ? {
            segmentIndex: value.route.tracks[id]?.segmentIndex,
            reachedAtTick: value.route.tracks[id]?.reachedAtTick,
          }
        : null]))
      : null,
  });
  return JSON.stringify({
    tick: simulation.world.tick,
    stateHash: simulation.world.stateHash,
    offense: plan(simulation.offensePlan),
    defense: plan(simulation.defensePlan),
    planning: simulation.planningLog.map((record) => [
      record.tick, record.team, record.decisionPhase, record.chosen, record.triggerEventIds,
    ]),
    events: simulation.eventLog.map((event) => [event.tick, event.availableAtTick, event.type]),
    terminal: simulation.world.terminal?.reason ?? null,
  });
}

function vectorError(first: Vec2, second: Vec2): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function comparePlanMirror(right: TeamPlan, left: TeamPlan): number {
  if (right.id !== left.id) return Number.POSITIVE_INFINITY;
  let maximum = 0;
  const comparePoint = (a?: Vec2, b?: Vec2) => {
    if (!a || !b) {
      if (a || b) maximum = Number.POSITIVE_INFINITY;
      return;
    }
    maximum = Math.max(maximum, vectorError(mirrorPointAcrossCenterline(a), b));
  };
  comparePoint(right.primaryTarget, left.primaryTarget);
  comparePoint(right.secondaryTarget, left.secondaryTarget);
  for (const id of PLAYER_IDS) {
    const a = right.route?.tracks[id];
    const b = left.route?.tracks[id];
    if (!a || !b) {
      if (a || b) return Number.POSITIVE_INFINITY;
      continue;
    }
    if (a.segmentIndex !== b.segmentIndex || a.segments.length !== b.segments.length) {
      return Number.POSITIVE_INFINITY;
    }
    a.segments.forEach((segment, index) => comparePoint(segment.target, b.segments[index]?.target));
  }
  const aSetup = right.autonomousSetup;
  const bSetup = left.autonomousSetup;
  if (aSetup || bSetup) {
    if (!aSetup || !bSetup || aSetup.anchorId !== bSetup.anchorId ||
      (aSetup.side === bSetup.side)) return Number.POSITIVE_INFINITY;
    comparePoint(aSetup.planningOrigin, bSetup.planningOrigin);
    for (const key of ["screenAnchor", "handlerWaitingPoint", "useGate", "rejectGate"] as const) {
      comparePoint(aSetup.landmarks[key], bSetup.landmarks[key]);
    }
  }
  return maximum;
}

function mirrorError(right: PnrSimulation, left: PnrSimulation): number {
  let maximum = Math.max(
    comparePlanMirror(right.offensePlan, left.offensePlan),
    comparePlanMirror(right.defensePlan, left.defensePlan),
    vectorError(mirrorPointAcrossCenterline(right.world.ball.pos), left.world.ball.pos),
    vectorError(mirrorVectorAcrossCenterline(right.world.ball.vel), left.world.ball.vel),
  );
  for (const id of PLAYER_IDS) {
    maximum = Math.max(maximum,
      vectorError(mirrorPointAcrossCenterline(right.world.players[id].pos), left.world.players[id].pos),
      vectorError(mirrorVectorAcrossCenterline(right.world.players[id].vel), left.world.players[id].vel));
  }
  return maximum;
}

function mirrorSemantics(right: PnrSimulation, left: PnrSimulation): boolean {
  const opposite = (side: ScreenSide | null) => side === "right" ? "left" : side === "left" ? "right" : null;
  return left.world.screenSide === opposite(right.world.screenSide) &&
    right.world.formation.phase === left.world.formation.phase &&
    left.world.formation.committedSide === opposite(right.world.formation.committedSide ?? null) &&
    right.world.branch === left.world.branch && right.world.ballOwner === left.world.ballOwner &&
    right.world.ball.kind === left.world.ball.kind && right.world.ball.outcome === left.world.ball.outcome &&
    right.world.terminal?.reason === left.world.terminal?.reason &&
    JSON.stringify(right.planningLog.map((r) => [r.tick, r.team, r.decisionPhase, r.chosen])) ===
      JSON.stringify(left.planningLog.map((r) => [r.tick, r.team, r.decisionPhase, r.chosen])) &&
    JSON.stringify(right.eventLog.map((e) => [e.tick, e.availableAtTick, e.type])) ===
      JSON.stringify(left.eventLog.map((e) => [e.tick, e.availableAtTick, e.type]));
}

function informationBoundaryPassed(simulation: PnrSimulation): boolean {
  const offense = createPlannerObservation(simulation.world, "offense") as unknown as Record<string, unknown>;
  const defense = createPlannerObservation(simulation.world, "defense") as unknown as Record<string, unknown>;
  const events = new Map(simulation.eventLog.map((event) => [event.id, event]));
  return !Object.hasOwn(offense, "defensePlan") && !Object.hasOwn(offense, "defenseStrategy") &&
    !Object.hasOwn(defense, "offensePlan") && !Object.hasOwn(defense, "offenseStrategy") &&
    simulation.planningLog.every((record) =>
      record.observationBoundary.includes("不含") && record.triggerEventIds.every((id) => {
        const event = events.get(id);
        return Boolean(event && event.availableAtTick <= record.tick);
      }));
}

function eventForRecord(
  simulation: PnrSimulation,
  record: PlanningRecord,
  types: ReadonlySet<string>,
): WorldEvent | undefined {
  return simulation.eventLog.find((event) =>
    record.triggerEventIds.includes(event.id) && types.has(event.type) && event.availableAtTick <= record.tick);
}

function sideAudit(simulation: PnrSimulation, mirrored: boolean, checks: RuntimeChecks): I01SideAudit {
  const ready = simulation.eventLog.find((event) => event.type === "formation_ready");
  const handoffRecords = ready
    ? simulation.planningLog.filter((record) => record.triggerEventIds.includes(ready.id))
    : [];
  const handoffOffense = handoffRecords.find((record) => record.team === "offense");
  const handoffDefense = handoffRecords.find((record) => record.team === "defense");
  const offenseReadRecords = simulation.planningLog.filter((record) =>
    record.team === "offense" && TACTICAL_OFFENSE_READS.has(record.chosen));
  const defenseCoverages = [...new Set(simulation.planningLog
    .filter((record) => record.team === "defense" && TACTICAL_DEFENSE_COVERAGES.has(record.chosen))
    .map((record) => record.chosen))];
  const offenseReads = [...new Set(offenseReadRecords.map((record) => record.chosen))];
  const terminalReason = simulation.world.terminal?.reason ?? "unresolved";
  const formed = Boolean(ready);
  const nextBoundary = !formed || Boolean(
    ready && ready.availableAtTick === ready.tick + 1 &&
    handoffOffense?.tick === ready.availableAtTick && handoffDefense?.tick === ready.availableAtTick &&
    simulation.world.formation.enteredPnrAtTick === ready.availableAtTick &&
    handoffOffense.triggerEventIds.includes(ready.id) && handoffDefense.triggerEventIds.includes(ready.id) &&
    TACTICAL_DEFENSE_COVERAGES.has(handoffDefense.chosen));
  const secondaryReadCausal = !formed || Boolean(offenseReadRecords[0] &&
    offenseReadRecords[0].tick > (ready?.tick ?? -1) &&
    eventForRecord(simulation, offenseReadRecords[0], new Set(["drop_committed", "chase_over_committed"])));
  const safeExit = terminalReason !== "formation_aborted" && terminalReason !== "formation_timeout" ||
    (!ready && simulation.world.formation.phase === "formation" &&
      simulation.world.tacticalVocabularyVersion === undefined &&
      simulation.world.tacticalCoverage === undefined && offenseReads.length === 0 && defenseCoverages.length === 0);
  return {
    mirrored,
    selectedSide: simulation.world.screenSide,
    readyTick: ready?.tick ?? null,
    readyAvailableAtTick: ready?.availableAtTick ?? null,
    handoffTick: handoffOffense?.tick ?? handoffDefense?.tick ?? null,
    enteredPnrAtTick: simulation.world.formation.enteredPnrAtTick,
    handoffTeams: handoffRecords.map((record) => record.team),
    handoffOffensePlan: handoffOffense?.chosen ?? null,
    handoffDefensePlan: handoffDefense?.chosen ?? null,
    defenseCoverages,
    offenseReads,
    terminalReason,
    terminalTick: simulation.world.terminal ? simulation.world.tick : null,
    sameSimulationWorldIdentity: checks.sameObject,
    monotonicTickTime: checks.monotonic,
    playerContinuity: checks.playerContinuity,
    ballContinuity: checks.ballContinuity,
    noTacticalReadBeforeHandoff: checks.noTBefore,
    publicEventCausalityPassed: nextBoundary && secondaryReadCausal,
    informationBoundaryPassed: informationBoundaryPassed(simulation),
    zeroStrategyAdjustment: simulation.planningLog.every((record) =>
      record.candidates.every((candidate) => candidate.strategyAdjustment === 0)),
    safeExitPassed: safeExit,
    allowedTerminal: terminalReason !== "unresolved" &&
      (I00_ALLOWED_TERMINALS as readonly string[]).includes(terminalReason),
  };
}

function auditRow(input: I00IntegrationInput): I01IntegrationRow {
  const right = new PnrSimulation(makeI01IntegrationConfig(input));
  const rightDuplicate = new PnrSimulation(makeI01IntegrationConfig(input));
  const rightDefenseFirst = new PnrSimulation(makeI01IntegrationConfig(input, false, "defense-first"));
  const left = new PnrSimulation(makeI01IntegrationConfig(input, true));
  const leftDuplicate = new PnrSimulation(makeI01IntegrationConfig(input, true));
  const leftDefenseFirst = new PnrSimulation(makeI01IntegrationConfig(input, true, "defense-first"));
  const simulations = [right, rightDuplicate, rightDefenseFirst, left, leftDuplicate, leftDefenseFirst];
  const runtime = simulations.map((simulation): RuntimeChecks => ({
    identity: identityFrame(simulation), sameObject: true, monotonic: true,
    playerContinuity: true, ballContinuity: true, noTBefore: !tacticalReadPresent(simulation),
  }));
  const failures: string[] = [];
  let deterministic = true;
  let orderStable = true;
  let mirrored = true;
  let mirrorMaximumError = 0;
  for (let tick = 0; tick <= MAXIMUM_TICKS; tick += 1) {
    deterministic = deterministic && deterministicFrame(right) === deterministicFrame(rightDuplicate) &&
      deterministicFrame(left) === deterministicFrame(leftDuplicate);
    orderStable = orderStable && deterministicFrame(right) === deterministicFrame(rightDefenseFirst) &&
      deterministicFrame(left) === deterministicFrame(leftDefenseFirst);
    for (const [a, b] of [[right, left], [rightDuplicate, leftDuplicate], [rightDefenseFirst, leftDefenseFirst]] as const) {
      const error = mirrorError(a, b);
      mirrorMaximumError = Math.max(mirrorMaximumError, error);
      mirrored = mirrored && Number.isFinite(error) && error <= EPSILON && mirrorSemantics(a, b);
    }
    if (simulations.every((simulation) => simulation.world.terminal)) break;
    if (simulations.some((simulation) => simulation.world.terminal)) {
      failures.push(`TERMINAL_TICK_MISMATCH@${tick}`);
      break;
    }
    const before = simulations.map(stepFrame);
    simulations.forEach((simulation) => simulation.step());
    simulations.forEach((simulation, index) => afterStepChecks(simulation, before[index], runtime[index]));
  }
  const rightSummary = sideAudit(right, false, runtime[0]);
  const leftSummary = sideAudit(left, true, runtime[3]);
  const sides = [rightSummary, leftSummary];
  const everyRuntime = (pick: (check: RuntimeChecks) => boolean) => runtime.every(pick);
  const sameObject = everyRuntime((check) => check.sameObject);
  const monotonic = everyRuntime((check) => check.monotonic);
  const playerContinuity = everyRuntime((check) => check.playerContinuity);
  const ballContinuity = everyRuntime((check) => check.ballContinuity);
  const noTBefore = everyRuntime((check) => check.noTBefore);
  const formationReadyNextBoundary = sides.every((side) => side.publicEventCausalityPassed ||
    side.terminalReason === "formation_aborted" || side.terminalReason === "formation_timeout");
  const informationBoundary = simulations.every(informationBoundaryPassed);
  const zeroAdjustment = simulations.every((simulation) => simulation.planningLog.every((record) =>
    record.candidates.every((candidate) => candidate.strategyAdjustment === 0)));
  const safeExit = sides.every((side) => side.safeExitPassed);
  const allowed = sides.every((side) => side.allowedTerminal);
  if (!deterministic) failures.push("NONDETERMINISTIC");
  if (!orderStable) failures.push("DEFENSE_FIRST_DIVERGED");
  if (!mirrored) failures.push("WORLD_MIRROR");
  if (!sameObject) failures.push("OBJECT_IDENTITY");
  if (!formationReadyNextBoundary) failures.push("FORMATION_READY_BOUNDARY");
  if (!monotonic) failures.push("TICK_TIME_MONOTONICITY");
  if (!playerContinuity) failures.push("PLAYER_CONTINUITY");
  if (!ballContinuity) failures.push("BALL_CONTINUITY");
  if (!noTBefore) failures.push("TACTICAL_READ_BEFORE_HANDOFF");
  if (!sides.every((side) => side.publicEventCausalityPassed)) failures.push("PUBLIC_EVENT_CAUSALITY");
  if (!informationBoundary) failures.push("INFORMATION_BOUNDARY");
  if (!zeroAdjustment) failures.push("NONZERO_STRATEGY_ADJUSTMENT");
  if (!safeExit) failures.push("FORMATION_SAFE_EXIT");
  if (!allowed) failures.push("TERMINAL_NOT_ALLOWED");
  return {
    id: input.id,
    resolution: rightSummary.terminalReason,
    terminalTick: rightSummary.terminalTick,
    formed: rightSummary.readyTick !== null,
    readyTick: rightSummary.readyTick,
    handoffTick: rightSummary.handoffTick,
    handoffDefensePlan: rightSummary.handoffDefensePlan,
    offenseReads: rightSummary.offenseReads,
    right: rightSummary,
    left: leftSummary,
    deterministic,
    evaluationOrderStable: orderStable,
    defenseFirstEquivalent: orderStable,
    mirrored,
    mirrorMaximumError,
    sameSimulationWorldIdentity: sameObject,
    formationReadyNextBoundary,
    monotonicTickTime: monotonic,
    playerContinuity,
    ballContinuity,
    noTacticalReadBeforeHandoff: noTBefore,
    publicEventCausalityPassed: sides.every((side) => side.publicEventCausalityPassed),
    informationBoundaryPassed: informationBoundary,
    zeroStrategyAdjustment: zeroAdjustment,
    safeExitPassed: safeExit,
    allowedTerminalsPassed: allowed,
    failures,
    passed: failures.length === 0,
  };
}

function representativeReplays(rows: I01IntegrationRow[]): I01RepresentativeReplay[] {
  const formed = rows.find((row) => row.formed && row.passed) ?? rows.find((row) => row.formed);
  const chase = rows.find((row) => row.right.defenseCoverages.includes("CHASE_OVER")) ?? formed;
  const safe = rows.find((row) => row.resolution === "formation_aborted") ??
    rows.find((row) => row.resolution === "formation_timeout");
  if (!formed || !chase || !safe) return [];
  return [
    { id: "formed-handoff", inputId: formed.id, mirrored: false, side: formed.right.selectedSide,
      terminalReason: formed.right.terminalReason, note: `formation_ready 于 tick ${formed.readyTick} 发布并在 ${formed.handoffTick} 交接` },
    { id: "chase-read", inputId: chase.id, mirrored: false, side: chase.right.selectedSide,
      terminalReason: chase.right.terminalReason, note: "连续世界中由 DROP 进入 CHASE 与进攻二级读取" },
    { id: "mirrored-handoff", inputId: formed.id, mirrored: true, side: formed.left.selectedSide,
      terminalReason: formed.left.terminalReason, note: "同一冻结输入的真实世界镜像交接" },
    { id: "safe-exit", inputId: safe.id, mirrored: false, side: safe.right.selectedSide,
      terminalReason: safe.right.terminalReason, note: "Formation 真实安全退出且未提前启用 T" },
  ];
}

export function scanI01Integration(): I01IntegrationAudit {
  const rows = I00_INTEGRATION_INPUTS.map(auditRow);
  const replays = representativeReplays(rows);
  const firstFailureRow = rows.find((row) => !row.passed);
  const firstFailure = firstFailureRow
    ? { id: firstFailureRow.id, reason: firstFailureRow.failures[0] ?? "unknown" }
    : replays.length === 4 ? null : { id: "I01-REPLAYS", reason: "representative replay coverage missing" };
  const audit: Omit<I01IntegrationAudit, "passed" | "firstFailure"> = {
    manifestVersion: I00_INPUT_MANIFEST_VERSION,
    inputHash: I00_MANIFEST_HASH,
    inputCount: I00_INTEGRATION_INPUTS.length,
    worldCount: I00_INTEGRATION_INPUTS.length * 2,
    executionsPerWorld: 3,
    rows,
    formedWorlds: rows.filter((row) => row.formed).length * 2,
    safeExitWorlds: rows.filter((row) => !row.formed).length * 2,
    sameSimulationWorldIdentity: rows.every((row) => row.sameSimulationWorldIdentity),
    formationReadyNextBoundary: rows.every((row) => row.formationReadyNextBoundary),
    monotonicTickTime: rows.every((row) => row.monotonicTickTime),
    playerContinuity: rows.every((row) => row.playerContinuity),
    ballContinuity: rows.every((row) => row.ballContinuity),
    deterministic: rows.every((row) => row.deterministic),
    evaluationOrderStable: rows.every((row) => row.evaluationOrderStable),
    defenseFirstEquivalent: rows.every((row) => row.defenseFirstEquivalent),
    noTacticalReadBeforeHandoff: rows.every((row) => row.noTacticalReadBeforeHandoff),
    publicEventCausalityPassed: rows.every((row) => row.publicEventCausalityPassed),
    mirrored: rows.every((row) => row.mirrored),
    informationBoundaryPassed: rows.every((row) => row.informationBoundaryPassed),
    zeroStrategyAdjustment: rows.every((row) => row.zeroStrategyAdjustment),
    safeExitPassed: rows.every((row) => row.safeExitPassed),
    allowedTerminalsPassed: rows.every((row) => row.allowedTerminalsPassed),
    replays,
  };
  return { ...audit, passed: rows.every((row) => row.passed) && replays.length === 4, firstFailure };
}

export function makeI01RepresentativeReplayConfig(
  replay: I01RepresentativeReplay,
): SimulationConfig {
  const input = I00_INTEGRATION_INPUTS.find((candidate) => candidate.id === replay.inputId);
  if (!input) throw new Error(`Unknown I01 representative input: ${replay.inputId}`);
  return makeI01IntegrationConfig(input, replay.mirrored);
}
