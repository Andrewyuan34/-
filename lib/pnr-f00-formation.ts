import {
  COURT,
  FIXED_DT,
  FORMATION_LANDMARK_OFFSETS,
  PLAYER_IDS,
  PnrSimulation,
  UNDER_PULLUP_MIN_BODY_CLEARANCE,
  copyInitialPlayerPositions,
  createPlannerObservation,
  distance,
  formationReadiness,
  mirrorInitialPlayerPositions,
  mirrorPointAcrossCenterline,
  mirrorVectorAcrossCenterline,
  type FormationLandmarkOffsets,
  type FormationReadiness,
  type InitialPlayerPositions,
  type PlayerId,
  type ScreenFacts,
  type ScreenSide,
  type SimulationConfig,
  type TacticalLandmarks,
  type Vec2,
  type WorldEvent,
} from "./pnr-core.ts";
import {
  DEFAULT_TEAM_STRATEGY_SELECTION,
  copyTeamStrategySelection,
} from "./pnr-strategy.ts";

export const F00_RIGHT_INITIAL_POSITIONS = Object.freeze({
  O1: Object.freeze({ x: 3.8, y: 6.85 }),
  O5: Object.freeze({ x: 6.85, y: 6.2 }),
  D1: Object.freeze({ x: 3.72, y: 5.95 }),
  D5: Object.freeze({ x: 6.55, y: 5.05 }),
}) satisfies Readonly<InitialPlayerPositions>;

export const F00_EXPECTED_RIGHT_LANDMARKS = Object.freeze({
  screenAnchor: Object.freeze({ x: 5.07, y: 5.89 }),
  handlerWaitingPoint: Object.freeze({ x: 4.07, y: 6.25 }),
  useGate: Object.freeze({ x: 5.83, y: 4.99 }),
  rejectGate: Object.freeze({ x: 2.63, y: 5.09 }),
}) satisfies Readonly<TacticalLandmarks>;

export const F00_OUT_OF_BOUNDS_OFFSETS = Object.freeze({
  ...FORMATION_LANDMARK_OFFSETS,
  screenAnchor: Object.freeze({ x: 7.2, y: -0.96 }),
}) satisfies Readonly<FormationLandmarkOffsets>;

export const F00_SWAPPED_GATE_OFFSETS = Object.freeze({
  ...FORMATION_LANDMARK_OFFSETS,
  useGate: Object.freeze({ ...FORMATION_LANDMARK_OFFSETS.rejectGate }),
  rejectGate: Object.freeze({ ...FORMATION_LANDMARK_OFFSETS.useGate }),
}) satisfies Readonly<FormationLandmarkOffsets>;

export const F00_WAITING_CONFLICT_OFFSETS = Object.freeze({
  ...FORMATION_LANDMARK_OFFSETS,
  handlerWaitingPoint: Object.freeze({ x: 3.05, y: -0.65 }),
}) satisfies Readonly<FormationLandmarkOffsets>;

export const F00_UNAPPROVED_OFFSETS = Object.freeze({
  ...FORMATION_LANDMARK_OFFSETS,
  screenAnchor: Object.freeze({ x: 1.28, y: -0.96 }),
}) satisfies Readonly<FormationLandmarkOffsets>;

/** Backward-compatible test alias; F00 production construction no longer accepts overrides. */
export const F00_INVALID_OFFSETS = F00_OUT_OF_BOUNDS_OFFSETS;

function copyOffsets(
  input: Readonly<FormationLandmarkOffsets>,
): FormationLandmarkOffsets {
  return {
    screenAnchor: { ...input.screenAnchor },
    handlerWaitingPoint: { ...input.handlerWaitingPoint },
    useGate: { ...input.useGate },
    rejectGate: { ...input.rejectGate },
  };
}

export function makeF00Config(side: ScreenSide = "right"): SimulationConfig {
  const rightPositions = copyInitialPlayerPositions(F00_RIGHT_INITIAL_POSITIONS);
  return {
    startMode: "form_pnr",
    formationLandmarkOffsets: copyOffsets(FORMATION_LANDMARK_OFFSETS),
    initialPositions:
      side === "right" ? rightPositions : mirrorInitialPlayerPositions(rightPositions),
    screenSide: side,
    seed: 17,
    maxTime: 8,
    d1FrontReactionDelay: 0.12,
    d1PostCatchRecoveryDelay: 0,
    o1MaxSpeed: 3.72,
    horizon: "formation_resolution",
    strategies: copyTeamStrategySelection(DEFAULT_TEAM_STRATEGY_SELECTION),
  };
}

export function createF00Replay(side: ScreenSide = "right"): PnrSimulation {
  return new PnrSimulation(makeF00Config(side));
}

function makeRejectedConfig(
  offsets: Readonly<FormationLandmarkOffsets>,
): SimulationConfig {
  return {
    ...makeF00Config("right"),
    formationLandmarkOffsets: copyOffsets(offsets),
  };
}

interface F00Frame {
  tick: number;
  stateHash: string;
  phase: string;
  branch: string;
  formation: {
    screenSet: boolean;
    jointReady: boolean;
  };
  readiness: FormationReadiness;
  players: Record<PlayerId, { pos: Vec2; vel: Vec2 }>;
  ball: { pos: Vec2; vel: Vec2; owner: PlayerId | null; inFlight: boolean };
  landmarks: TacticalLandmarks;
  facts: Pick<
    ScreenFacts,
    "contact" | "routeExposure" | "impeded" | "screenEffective" | "screenLegalPose"
  >;
  offensePlan: string;
  defensePlan: string;
  roles: Array<{ playerId: PlayerId; roleCode: string; owner: string }>;
  events: Array<{ type: string; tick: number }>;
  terminal: string | null;
}

export interface F00HandoffDiagnostics {
  screenSetTick: number | null;
  jointReadyTick: number | null;
  pnrPlanningTick: number | null;
  firstOffensePlan: string | null;
  firstDefensePlan: string | null;
  branch: string | null;
  branchTick: number | null;
  underCommittedTick: number | null;
  underReadTick: number | null;
  underReadPlan: string | null;
  minimumD5O1GapAfterUnder: number | null;
  terminalReason: string | null;
  terminalTick: number | null;
  d1GoalSideMargin: number | null;
  d1O1Distance: number | null;
  o5O1Distance: number | null;
}

interface F00Run {
  side: ScreenSide;
  frames: F00Frame[];
  events: WorldEvent[];
  failures: string[];
  passed: boolean;
  terminalReason: string | null;
  maximumPlayerStep: number;
  maximumAllowedPlayerStep: number;
  minimumBodyGap: number;
  diagnostics: F00HandoffDiagnostics;
  simulation: PnrSimulation;
}

const BODY_PAIRS: ReadonlyArray<readonly [PlayerId, PlayerId]> = [
  ["O1", "O5"],
  ["O1", "D1"],
  ["O1", "D5"],
  ["O5", "D1"],
  ["O5", "D5"],
  ["D1", "D5"],
];

function copyFrame(simulation: PnrSimulation, events: WorldEvent[]): F00Frame {
  const facts = simulation.world.facts;
  return {
    tick: simulation.world.tick,
    stateHash: simulation.world.stateHash,
    phase: simulation.world.formation.phase,
    branch: simulation.world.branch,
    formation: {
      screenSet: simulation.world.formation.screenSet,
      jointReady: simulation.world.formation.jointReady,
    },
    readiness: formationReadiness(simulation.world),
    players: Object.fromEntries(
      PLAYER_IDS.map((id) => [id, {
        pos: { ...simulation.world.players[id].pos },
        vel: { ...simulation.world.players[id].vel },
      }]),
    ) as Record<PlayerId, { pos: Vec2; vel: Vec2 }>,
    ball: {
      pos: { ...simulation.world.ball.pos },
      vel: { ...simulation.world.ball.vel },
      owner: simulation.world.ballOwner,
      inFlight: simulation.world.ball.inFlight,
    },
    landmarks: {
      screenAnchor: { ...simulation.world.landmarks.screenAnchor },
      handlerWaitingPoint: { ...simulation.world.landmarks.handlerWaitingPoint },
      useGate: { ...simulation.world.landmarks.useGate },
      rejectGate: { ...simulation.world.landmarks.rejectGate },
    },
    facts: {
      contact: facts.contact,
      routeExposure: facts.routeExposure,
      impeded: facts.impeded,
      screenEffective: facts.screenEffective,
      screenLegalPose: facts.screenLegalPose,
    },
    offensePlan: simulation.offensePlan.id,
    defensePlan: simulation.defensePlan.id,
    roles: simulation.getRoles().map(({ playerId, roleCode, owner }) => ({
      playerId,
      roleCode,
      owner,
    })),
    events: events.map(({ type, tick }) => ({ type, tick })),
    terminal: simulation.world.terminal?.reason ?? null,
  };
}

function roleCode(frame: F00Frame, playerId: PlayerId): string | null {
  return frame.roles.find((role) => role.playerId === playerId)?.roleCode ?? null;
}

function runF00(side: ScreenSide): F00Run {
  const simulation = createF00Replay(side);
  const frames: F00Frame[] = [copyFrame(simulation, [])];
  const failures = new Set<string>();
  let eventStart = 0;
  let maximumPlayerStep = 0;
  let maximumAllowedPlayerStep = 0;
  let minimumBodyGap = Number.POSITIVE_INFINITY;
  const previousPositions = Object.fromEntries(
    PLAYER_IDS.map((id) => [id, { ...simulation.world.players[id].pos }]),
  ) as Record<PlayerId, Vec2>;

  const inspect = (): void => {
    const roles = simulation.getRoles();
    if (roles.length !== 4 || new Set(roles.map((role) => role.playerId)).size !== 4) {
      failures.add("ROLE_OWNERSHIP_CONFLICT");
    }
    if (roles.some(
      (role) => role.owner !==
        (role.playerId.startsWith("O") ? "offense-planner" : "defense-planner"),
    )) {
      failures.add("ROLE_WRONG_TEAM_OWNER");
    }
    if (simulation.world.formation.phase === "formation") {
      if (simulation.world.branch !== "undecided") failures.add("BRANCH_DURING_FORMATION");
      if (simulation.world.facts.screenEffective) {
        failures.add("SCREEN_EFFECTIVE_DURING_FORMATION");
      }
      if (simulation.world.facts.impeded) failures.add("IMPEDED_DURING_FORMATION");
      if (simulation.offensePlan.id !== "FORM_SCREEN") {
        failures.add("NON_FORM_OFFENSE_PLAN_DURING_FORMATION");
      }
      if (simulation.defensePlan.id !== "TRACK_FORMATION") {
        failures.add("NON_TRACK_DEFENSE_PLAN_DURING_FORMATION");
      }
      if (
        roles.find((role) => role.playerId === "D1")?.roleCode !== "contain_setup" ||
        roles.find((role) => role.playerId === "D5")?.roleCode !== "track_screener"
      ) {
        failures.add("FORMATION_DEFENSE_RESPONSIBILITY");
      }
    }
    if (
      simulation.world.facts.impeded &&
      !simulation.world.facts.contact &&
      !simulation.world.facts.routeExposure
    ) {
      failures.add("REMOTE_IMPEDIMENT");
    }
    if (simulation.world.ball.inFlight && simulation.world.ballOwner !== null) {
      failures.add("ILLEGAL_POSSESSION_DURING_FLIGHT");
    }

    for (const id of PLAYER_IDS) {
      const player = simulation.world.players[id];
      const playerStep = distance(previousPositions[id], player.pos);
      const allowedStep = player.maxSpeed * FIXED_DT + 0.007;
      maximumPlayerStep = Math.max(maximumPlayerStep, playerStep);
      maximumAllowedPlayerStep = Math.max(maximumAllowedPlayerStep, allowedStep);
      if (playerStep > allowedStep + 1e-9) failures.add(`TELEPORT_${id}`);
      previousPositions[id] = { ...player.pos };
    }
    for (const [firstId, secondId] of BODY_PAIRS) {
      const first = simulation.world.players[firstId];
      const second = simulation.world.players[secondId];
      minimumBodyGap = Math.min(
        minimumBodyGap,
        distance(first.pos, second.pos) - first.radius - second.radius,
      );
    }
  };

  inspect();
  for (let index = 0; index < 720 && !simulation.world.terminal; index += 1) {
    simulation.step();
    const newEvents = simulation.eventLog.slice(eventStart);
    eventStart = simulation.eventLog.length;
    inspect();
    frames.push(copyFrame(simulation, newEvents));
  }

  const screenSet = simulation.eventLog.find((event) => event.type === "screen_set");
  const formationReady = simulation.eventLog.find(
    (event) => event.type === "formation_ready",
  );
  const firstBranch = simulation.eventLog.find(
    (event) => event.type === "branch_use" || event.type === "branch_reject",
  );
  const firstPnrOffense = simulation.planningLog.find(
    (record) => record.decisionPhase === "offense_initial_read",
  );
  const firstPnrDefense = simulation.planningLog.find(
    (record) => record.decisionPhase === "defense_initial_coverage",
  );
  const underCommitted = simulation.eventLog.find(
    (event) => event.type === "under_committed",
  );
  const firstUnderRead = simulation.planningLog.find(
    (record) => record.decisionPhase === "offense_under_read",
  );
  const pullupWindow = simulation.eventLog.find(
    (event) => event.type === "pullup_window",
  );
  const minimumD5O1GapAfterUnder = underCommitted
    ? Math.min(
        ...frames
          .filter((frame) => frame.tick >= underCommitted.tick)
          .map(
            (frame) =>
              distance(frame.players.D5.pos, frame.players.O1.pos) -
              simulation.world.players.D5.radius -
              simulation.world.players.O1.radius,
          ),
      )
    : null;
  const readyFrame = formationReady
    ? frames.find((frame) => frame.tick === formationReady.tick)
    : undefined;

  if (minimumBodyGap < -0.01) failures.add("BODY_PENETRATION");
  if (!screenSet) failures.add("MISSING_SCREEN_SET");
  if (!formationReady) failures.add("MISSING_JOINT_READY");
  if (!firstBranch) failures.add("MISSING_LEGAL_PNR_BRANCH");
  if (!simulation.world.terminal) failures.add("MISSING_FINITE_TERMINAL");
  if (!underCommitted) failures.add("MISSING_UNDER_COMMITTED");
  if (!firstUnderRead) failures.add("MISSING_OFFENSE_UNDER_READ");
  if (
    underCommitted &&
    (!firstUnderRead ||
      firstUnderRead.tick !== underCommitted.availableAtTick ||
      firstUnderRead.tick <= underCommitted.tick)
  ) {
    failures.add("UNDER_READ_NOT_ON_NEXT_EVENT_BOUNDARY");
  }
  if (
    !firstUnderRead ||
    firstUnderRead.chosen !== "ATTACK_UNDER_GAP" ||
    !firstUnderRead.candidates.find(
      (candidate) => candidate.id === "ATTACK_UNDER_GAP" && candidate.feasible,
    )
  ) {
    failures.add("F00_UNDER_GAP_NOT_SELECTED");
  }
  if (
    !firstUnderRead ||
    firstUnderRead.candidates.find(
      (candidate) => candidate.id === "TAKE_UNDER_PULLUP" && candidate.feasible,
    )
  ) {
    failures.add("F00_CONTESTED_PULLUP_NOT_VETOED");
  }
  if (pullupWindow) failures.add("F00_FALSE_PULLUP_WINDOW");
  if (
    minimumD5O1GapAfterUnder === null ||
    minimumD5O1GapAfterUnder >= UNDER_PULLUP_MIN_BODY_CLEARANCE
  ) {
    failures.add("F00_MISSING_NEAR_CONTEST_NEGATIVE_BOUNDARY");
  }
  if (
    simulation.world.terminal?.reason !== "under_drive_advantage" &&
    simulation.world.terminal?.reason !== "under_contained"
  ) {
    failures.add("F00_MISSING_EXPLICIT_UNDER_RESOLUTION");
  }
  if (screenSet && formationReady && screenSet.tick > formationReady.tick) {
    failures.add("JOINT_READY_BEFORE_SCREEN_SET");
  }
  if (formationReady && firstBranch && firstBranch.tick <= formationReady.tick) {
    failures.add("BRANCH_NOT_AFTER_JOINT_READY");
  }
  if (
    formationReady &&
    (firstPnrOffense?.tick !== formationReady.availableAtTick ||
      firstPnrDefense?.tick !== formationReady.availableAtTick ||
      firstPnrOffense.tick <= formationReady.tick ||
      firstPnrDefense.tick <= formationReady.tick)
  ) {
    failures.add("PNR_READ_NOT_ON_NEXT_JOINT_READY_BOUNDARY");
  }
  if (
    !firstPnrOffense ||
    !firstPnrOffense.candidates.find(
      (candidate) => candidate.id === firstPnrOffense.chosen && candidate.feasible,
    )
  ) {
    failures.add("NO_FEASIBLE_EXISTING_OFFENSE_BRANCH");
  }
  if (
    !firstPnrDefense ||
    !firstPnrDefense.candidates.find(
      (candidate) => candidate.id === firstPnrDefense.chosen && candidate.feasible,
    )
  ) {
    failures.add("NO_FEASIBLE_EXISTING_DEFENSE_BRANCH");
  }
  if (!readyFrame || !readyFrame.readiness.ready) {
    failures.add("JOINT_READY_FACTS_INCOMPLETE");
  }
  if (readyFrame) {
    if (
      roleCode(readyFrame, "D1") !== "contain_setup" ||
      roleCode(readyFrame, "D5") !== "track_screener" ||
      readyFrame.defensePlan !== "TRACK_FORMATION"
    ) {
      failures.add("HANDOFF_DEFENSE_RESPONSIBILITY");
    }
    const d1GoalSideMargin =
      distance(readyFrame.players.O1.pos, COURT.hoop) -
      distance(readyFrame.players.D1.pos, COURT.hoop);
    const d1O1Distance = distance(readyFrame.players.D1.pos, readyFrame.players.O1.pos);
    const o5O1Distance = distance(readyFrame.players.O5.pos, readyFrame.players.O1.pos);
    if (d1GoalSideMargin <= 0) failures.add("D1_NOT_GOAL_SIDE_AT_HANDOFF");
    if (d1O1Distance >= o5O1Distance) failures.add("D1_NOT_CLOSEST_O1_DEFENDER_AT_HANDOFF");
  }
  if (simulation.eventLog.some(
    (event) => event.type === "switch_completed" &&
      (!formationReady || event.tick <= formationReady.tick),
  )) {
    failures.add("EARLY_FORMATION_SWITCH");
  }
  for (const record of simulation.planningLog.filter(
    (item) =>
      item.decisionPhase === "offense_formation" ||
      item.decisionPhase === "defense_formation",
  )) {
    if (record.candidates.some((candidate) => candidate.strategyAdjustment !== 0)) {
      failures.add("FORMATION_STRATEGY_ADJUSTMENT");
    }
    if (!record.observationBoundary.includes("公开世界事实 + 自队角色")) {
      failures.add("FORMATION_INFORMATION_BOUNDARY");
    }
  }

  const d1GoalSideMargin = readyFrame
    ? distance(readyFrame.players.O1.pos, COURT.hoop) -
      distance(readyFrame.players.D1.pos, COURT.hoop)
    : null;
  const d1O1Distance = readyFrame
    ? distance(readyFrame.players.D1.pos, readyFrame.players.O1.pos)
    : null;
  const o5O1Distance = readyFrame
    ? distance(readyFrame.players.O5.pos, readyFrame.players.O1.pos)
    : null;
  const terminalEvent = simulation.eventLog.find((event) => event.type === "terminal");
  const diagnostics: F00HandoffDiagnostics = {
    screenSetTick: screenSet?.tick ?? null,
    jointReadyTick: formationReady?.tick ?? null,
    pnrPlanningTick: firstPnrOffense?.tick ?? null,
    firstOffensePlan: firstPnrOffense?.chosen ?? null,
    firstDefensePlan: firstPnrDefense?.chosen ?? null,
    branch: firstBranch?.type ?? null,
    branchTick: firstBranch?.tick ?? null,
    underCommittedTick: underCommitted?.tick ?? null,
    underReadTick: firstUnderRead?.tick ?? null,
    underReadPlan: firstUnderRead?.chosen ?? null,
    minimumD5O1GapAfterUnder,
    terminalReason: simulation.world.terminal?.reason ?? null,
    terminalTick: terminalEvent?.tick ?? null,
    d1GoalSideMargin,
    d1O1Distance,
    o5O1Distance,
  };

  return {
    side,
    frames,
    events: [...simulation.eventLog],
    failures: [...failures],
    passed: failures.size === 0,
    terminalReason: simulation.world.terminal?.reason ?? null,
    maximumPlayerStep,
    maximumAllowedPlayerStep,
    minimumBodyGap,
    diagnostics,
    simulation,
  };
}

function pointError(actual: Vec2, expected: Vec2): number {
  return Math.max(Math.abs(actual.x - expected.x), Math.abs(actual.y - expected.y));
}

function mirrorAudit(right: F00Run, left: F00Run): { maximumError: number; failures: string[] } {
  const failures = new Set<string>();
  let maximumError = 0;
  if (right.frames.length !== left.frames.length) failures.add("MIRROR_FRAME_COUNT");
  for (let index = 0; index < Math.min(right.frames.length, left.frames.length); index += 1) {
    const rightFrame = right.frames[index];
    const leftFrame = left.frames[index];
    for (const id of PLAYER_IDS) {
      maximumError = Math.max(
        maximumError,
        pointError(
          leftFrame.players[id].pos,
          mirrorPointAcrossCenterline(rightFrame.players[id].pos),
        ),
        pointError(
          leftFrame.players[id].vel,
          mirrorVectorAcrossCenterline(rightFrame.players[id].vel),
        ),
      );
    }
    maximumError = Math.max(
      maximumError,
      pointError(leftFrame.ball.pos, mirrorPointAcrossCenterline(rightFrame.ball.pos)),
      pointError(leftFrame.ball.vel, mirrorVectorAcrossCenterline(rightFrame.ball.vel)),
    );
    for (const name of [
      "screenAnchor",
      "handlerWaitingPoint",
      "useGate",
      "rejectGate",
    ] as const) {
      maximumError = Math.max(
        maximumError,
        pointError(
          leftFrame.landmarks[name],
          mirrorPointAcrossCenterline(rightFrame.landmarks[name]),
        ),
      );
    }
    if (
      rightFrame.phase !== leftFrame.phase ||
      rightFrame.branch !== leftFrame.branch ||
      rightFrame.offensePlan !== leftFrame.offensePlan ||
      rightFrame.defensePlan !== leftFrame.defensePlan ||
      rightFrame.terminal !== leftFrame.terminal ||
      JSON.stringify(rightFrame.formation) !== JSON.stringify(leftFrame.formation) ||
      JSON.stringify(rightFrame.readiness) !== JSON.stringify(leftFrame.readiness) ||
      JSON.stringify(rightFrame.facts) !== JSON.stringify(leftFrame.facts) ||
      JSON.stringify(rightFrame.roles) !== JSON.stringify(leftFrame.roles) ||
      JSON.stringify(rightFrame.events) !== JSON.stringify(leftFrame.events)
    ) {
      failures.add(`MIRROR_SEMANTICS_TICK_${rightFrame.tick}`);
    }
  }
  if (maximumError > 1e-9) failures.add("MIRROR_NUMERIC_ERROR");
  return { maximumError, failures: [...failures] };
}

function rejectionReason(offsets: Readonly<FormationLandmarkOffsets>): string {
  try {
    new PnrSimulation(makeRejectedConfig(offsets));
    return "NOT_REJECTED";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function defensePrivateGeometryAudit(): {
  passed: boolean;
  privateFieldsHidden: boolean;
  decisionStable: boolean;
} {
  const baseline = createF00Replay("right");
  const changed = createF00Replay("right");
  changed.world.landmarks.handlerWaitingPoint = { x: 4.55, y: 6.62 };
  changed.world.landmarks.useGate = { x: 6.15, y: 4.72 };
  changed.world.landmarks.rejectGate = { x: 2.31, y: 5.32 };
  changed.world.tacticalLandmarks.handlerWaitingPoint = { x: 4.55, y: 6.62 };
  changed.world.tacticalLandmarks.useGate = { x: 6.15, y: 4.72 };
  changed.world.tacticalLandmarks.rejectGate = { x: 2.31, y: 5.32 };

  const defenseView = createPlannerObservation(changed.world, "defense");
  const privateFieldsHidden =
    !Object.hasOwn(defenseView.landmarks, "handlerWaitingPoint") &&
    !Object.hasOwn(defenseView.landmarks, "useGate") &&
    !Object.hasOwn(defenseView.landmarks, "rejectGate");
  baseline.defensePlan.watchdogAt = 0;
  changed.defensePlan.watchdogAt = 0;
  baseline.step();
  changed.step();
  const baselineDecision = baseline.planningLog.filter((record) => record.team === "defense").at(-1);
  const changedDecision = changed.planningLog.filter((record) => record.team === "defense").at(-1);
  const decisionStable =
    baselineDecision?.chosen === changedDecision?.chosen &&
    JSON.stringify(baselineDecision?.candidates) === JSON.stringify(changedDecision?.candidates) &&
    JSON.stringify(baseline.defensePlan.roles) === JSON.stringify(changed.defensePlan.roles) &&
    JSON.stringify(baseline.defensePlan.primaryTarget) ===
      JSON.stringify(changed.defensePlan.primaryTarget);
  return {
    passed: privateFieldsHidden && decisionStable,
    privateFieldsHidden,
    decisionStable,
  };
}

const rightFirst = runF00("right");
const rightReplay = runF00("right");
const leftFirst = runF00("left");
const leftReplay = runF00("left");
const mirrors = mirrorAudit(rightFirst, leftFirst);
const topologyRejections = {
  outOfBounds: rejectionReason(F00_OUT_OF_BOUNDS_OFFSETS),
  swappedGates: rejectionReason(F00_SWAPPED_GATE_OFFSETS),
  waitingConflict: rejectionReason(F00_WAITING_CONFLICT_OFFSETS),
  unapprovedTemplate: rejectionReason(F00_UNAPPROVED_OFFSETS),
};
const topologyPassed =
  topologyRejections.outOfBounds !== "NOT_REJECTED" &&
  topologyRejections.swappedGates !== "NOT_REJECTED" &&
  topologyRejections.waitingConflict !== "NOT_REJECTED" &&
  topologyRejections.unapprovedTemplate !== "NOT_REJECTED";
const informationOwnership = defensePrivateGeometryAudit();
const rightDeterministic =
  JSON.stringify(rightFirst.frames) === JSON.stringify(rightReplay.frames);
const leftDeterministic =
  JSON.stringify(leftFirst.frames) === JSON.stringify(leftReplay.frames);
const passed =
  rightDeterministic &&
  leftDeterministic &&
  rightFirst.passed &&
  leftFirst.passed &&
  mirrors.failures.length === 0 &&
  topologyPassed &&
  informationOwnership.passed;

export const F00_AUDIT = Object.freeze({
  sampleId: "F00-OFFSET-FORMATION",
  passed,
  input: Object.freeze({
    startMode: "form_pnr" as const,
    rightInitialPositions: copyInitialPlayerPositions(F00_RIGHT_INITIAL_POSITIONS),
    tacticalOffsets: copyOffsets(FORMATION_LANDMARK_OFFSETS),
    expectedRightLandmarks: {
      screenAnchor: { ...F00_EXPECTED_RIGHT_LANDMARKS.screenAnchor },
      handlerWaitingPoint: { ...F00_EXPECTED_RIGHT_LANDMARKS.handlerWaitingPoint },
      useGate: { ...F00_EXPECTED_RIGHT_LANDMARKS.useGate },
      rejectGate: { ...F00_EXPECTED_RIGHT_LANDMARKS.rejectGate },
    },
  }),
  right: Object.freeze({
    passed: rightFirst.passed,
    deterministic: rightDeterministic,
    failures: Object.freeze([...rightFirst.failures]),
    terminalReason: rightFirst.terminalReason,
    maximumPlayerStep: rightFirst.maximumPlayerStep,
    maximumAllowedPlayerStep: rightFirst.maximumAllowedPlayerStep,
    minimumBodyGap: rightFirst.minimumBodyGap,
    diagnostics: Object.freeze({ ...rightFirst.diagnostics }),
    events: Object.freeze(rightFirst.events.map((event) => Object.freeze({ ...event }))),
  }),
  left: Object.freeze({
    passed: leftFirst.passed,
    deterministic: leftDeterministic,
    failures: Object.freeze([...leftFirst.failures]),
    terminalReason: leftFirst.terminalReason,
    maximumPlayerStep: leftFirst.maximumPlayerStep,
    maximumAllowedPlayerStep: leftFirst.maximumAllowedPlayerStep,
    minimumBodyGap: leftFirst.minimumBodyGap,
    diagnostics: Object.freeze({ ...leftFirst.diagnostics }),
    events: Object.freeze(leftFirst.events.map((event) => Object.freeze({ ...event }))),
  }),
  mirrorMaximumError: mirrors.maximumError,
  mirrorFailures: Object.freeze(mirrors.failures),
  topologyPassed,
  topologyRejections: Object.freeze(topologyRejections),
  informationOwnership: Object.freeze(informationOwnership),
  invalidInputReason: topologyRejections.outOfBounds,
});
