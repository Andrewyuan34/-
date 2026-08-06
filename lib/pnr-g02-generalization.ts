import {
  FIXED_DT,
  PnrSimulation,
  distance,
  type CandidateEvaluation,
  type PlanId,
  type PlanningRecord,
  type SealFacts,
  type SimulationConfig,
} from "./pnr-core.ts";
import { makeInitialPositionsForCue } from "./pnr-scenarios.ts";

export const G02_DELAYS = Object.freeze(
  Array.from({ length: 17 }, (_, index) => Number((index * 0.01).toFixed(2))),
);

export const G02_BASE_CONFIG = Object.freeze({
  initialPositions: makeInitialPositionsForCue("neutral"),
  seed: 17,
  maxTime: 7.4,
  d1FrontReactionDelay: G02_DELAYS[0],
  d1PostCatchRecoveryDelay: 0,
  o1MaxSpeed: 3.72,
  horizon: "pnr_resolution",
} satisfies SimulationConfig);

export type G02DecisionPlan = Extract<PlanId, "FRONT_SEAL" | "BACKSIDE_CONTEST">;
export type G02Outcome = "D1_DEFLECTION" | "O5_CATCH";
export type G02ReplayId = "last-deflection" | "first-catch" | "stable-catch";

export interface G02CandidateAudit {
  id: G02DecisionPlan;
  feasible: boolean;
  score: number | null;
  vetoes: string[];
  evidence: string[];
}

export interface G02ScanRow {
  delay: number;
  chosen: G02DecisionPlan;
  outcome: G02Outcome;
  deterministic: boolean;
  frontFeasible: boolean;
  frontEta: number;
  entryFlightTime: number;
  etaSlack: number;
  front: G02CandidateAudit;
  backside: G02CandidateAudit;
  actualFirstToucher: "D1" | "O5";
  ballOutcome: "deflected" | "caught";
  sealTick: number;
  decisionTick: number;
  launchTick: number;
  touchTick: number;
  flightSteps: number;
  flightDistance: number;
  maxBallStep: number;
  touchDistance: number;
  touchThreshold: number;
  localTouch: boolean;
}

export interface G02BoundaryTransition {
  fromDelay: number;
  fromOutcome: G02Outcome;
  toDelay: number;
  toOutcome: G02Outcome;
}

export interface G02FailureInterval {
  fromDelay: number;
  toDelay: number;
  reason: string;
}

export interface G02ReplaySample {
  id: G02ReplayId;
  label: string;
  note: string;
  delay: number;
  outcome: G02Outcome;
}

export interface G02AuditResult {
  id: "G02";
  label: string;
  rows: G02ScanRow[];
  deterministic: boolean;
  monotonic: boolean;
  passed: boolean;
  transitions: G02BoundaryTransition[];
  failureIntervals: G02FailureInterval[];
  lastDeflectionDelay: number | null;
  firstCatchDelay: number | null;
  replays: G02ReplaySample[];
}

interface G02AuditRun {
  row: Omit<G02ScanRow, "deterministic">;
  tickTrace: string[];
}

export function makeG02Config(delay: number): SimulationConfig {
  if (!G02_DELAYS.includes(delay)) {
    throw new Error(`G02 delay must be one of the 17 approved samples: ${delay}`);
  }
  return {
    ...G02_BASE_CONFIG,
    initialPositions: makeInitialPositionsForCue("neutral"),
    d1FrontReactionDelay: delay,
  };
}

export function createG02Replay(delay: number): PnrSimulation {
  return new PnrSimulation(makeG02Config(delay));
}

function cloneCandidate(
  record: PlanningRecord,
  id: G02DecisionPlan,
): G02CandidateAudit {
  const candidate = record.candidates.find((item) => item.id === id);
  if (!candidate) throw new Error(`G02 missing ${id} at tick ${record.tick}`);
  return {
    id,
    feasible: candidate.feasible,
    score: candidate.score,
    vetoes: [...candidate.vetoes],
    evidence: [...candidate.evidence],
  };
}

function candidateTrace(candidate: CandidateEvaluation): object {
  return {
    id: candidate.id,
    feasible: candidate.feasible,
    score: candidate.score,
    vetoes: candidate.vetoes,
    evidence: candidate.evidence,
  };
}

function captureTick(simulation: PnrSimulation): string {
  const tick = simulation.world.tick;
  return JSON.stringify({
    tick,
    stateHash: simulation.world.stateHash,
    ballOwner: simulation.world.ballOwner,
    offensePlan: {
      id: simulation.offensePlan.id,
      version: simulation.offensePlan.version,
      startedTick: simulation.offensePlan.startedTick,
      chosenScore: simulation.offensePlan.chosenScore,
    },
    defensePlan: {
      id: simulation.defensePlan.id,
      version: simulation.defensePlan.version,
      startedTick: simulation.defensePlan.startedTick,
      chosenScore: simulation.defensePlan.chosenScore,
    },
    roles: simulation.getRoles().map(({ playerId, roleCode, owner }) => ({
      playerId,
      roleCode,
      owner,
    })),
    events: simulation.eventLog
      .filter((event) => event.tick === tick)
      .map(({ id, type, order, availableAtTick, label, detail }) => ({
        id,
        type,
        order,
        availableAtTick,
        label,
        detail,
      })),
    planning: simulation.planningLog
      .filter((record) => record.tick === tick)
      .map((record) => ({
        team: record.team,
        trigger: record.trigger,
        triggerEventIds: record.triggerEventIds,
        chosen: record.chosen,
        candidates: record.candidates.map(candidateTrace),
      })),
  });
}

function runAuditSample(delay: number): G02AuditRun {
  const simulation = createG02Replay(delay);
  const sealAtTick = new Map<number, SealFacts>([
    [simulation.world.tick, { ...simulation.world.seal }],
  ]);
  const tickTrace = [captureTick(simulation)];
  let previousBall = {
    pos: { ...simulation.world.ball.pos },
    inFlight: simulation.world.ball.inFlight,
    outcome: simulation.world.ball.outcome,
  };
  let flightSteps = 0;
  let flightDistance = 0;
  let maxBallStep = 0;
  let touchDistance = Number.POSITIVE_INFINITY;
  let touchThreshold = 0;

  for (let index = 0; index < 600 && !simulation.world.terminal; index += 1) {
    simulation.step();
    sealAtTick.set(simulation.world.tick, { ...simulation.world.seal });
    tickTrace.push(captureTick(simulation));

    const ballStep = distance(previousBall.pos, simulation.world.ball.pos);
    if (previousBall.inFlight) {
      flightSteps += 1;
      flightDistance += ballStep;
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

  const sealEvent = simulation.eventLog.find((event) => event.type === "seal_established");
  if (!sealEvent) throw new Error(`G02 ${delay.toFixed(2)}s never established the seal`);
  const decision = simulation.planningLog.find(
    (record) =>
      record.team === "defense" &&
      record.tick >= sealEvent.availableAtTick &&
      record.triggerEventIds.includes(sealEvent.id),
  );
  if (!decision) {
    throw new Error(`G02 ${delay.toFixed(2)}s has no first fronting decision`);
  }
  if (decision.chosen !== "FRONT_SEAL" && decision.chosen !== "BACKSIDE_CONTEST") {
    throw new Error(`G02 ${delay.toFixed(2)}s chose unexpected plan ${decision.chosen}`);
  }
  const decisionFacts = sealAtTick.get(decision.tick);
  if (!decisionFacts) throw new Error(`G02 ${delay.toFixed(2)}s missing seal facts at decision`);

  const launch = simulation.eventLog.find((event) => event.type === "pass_launched");
  const touch = simulation.eventLog.find(
    (event) => event.type === "pass_caught" || event.type === "pass_denied",
  );
  if (!launch || !touch) throw new Error(`G02 ${delay.toFixed(2)}s did not resolve a full lob path`);
  if (simulation.world.ballOwner !== "D1" && simulation.world.ballOwner !== "O5") {
    throw new Error(`G02 ${delay.toFixed(2)}s ended without D1/O5 first touch`);
  }
  if (
    simulation.world.ball.outcome !== "deflected" &&
    simulation.world.ball.outcome !== "caught"
  ) {
    throw new Error(`G02 ${delay.toFixed(2)}s has unexpected ball outcome`);
  }

  const actualFirstToucher = simulation.world.ballOwner;
  const outcome: G02Outcome =
    actualFirstToucher === "D1" ? "D1_DEFLECTION" : "O5_CATCH";
  return {
    row: {
      delay,
      chosen: decision.chosen,
      outcome,
      frontFeasible: decisionFacts.frontFeasible,
      frontEta: decisionFacts.frontEta,
      entryFlightTime: decisionFacts.entryFlightTime,
      etaSlack: Number((decisionFacts.entryFlightTime - decisionFacts.frontEta).toFixed(6)),
      front: cloneCandidate(decision, "FRONT_SEAL"),
      backside: cloneCandidate(decision, "BACKSIDE_CONTEST"),
      actualFirstToucher,
      ballOutcome: simulation.world.ball.outcome,
      sealTick: sealEvent.tick,
      decisionTick: decision.tick,
      launchTick: launch.tick,
      touchTick: touch.tick,
      flightSteps,
      flightDistance: Number(flightDistance.toFixed(6)),
      maxBallStep: Number(maxBallStep.toFixed(6)),
      touchDistance: Number(touchDistance.toFixed(6)),
      touchThreshold: Number(touchThreshold.toFixed(6)),
      localTouch: touchDistance <= touchThreshold + 1e-9,
    },
    tickTrace,
  };
}

function sameTrace(first: string[], second: string[]): boolean {
  return first.length === second.length && first.every((frame, index) => frame === second[index]);
}

export function scanG02FrontReactionBoundary(): G02AuditResult {
  const rows = G02_DELAYS.map((delay) => {
    const first = runAuditSample(delay);
    const replay = runAuditSample(delay);
    return {
      ...first.row,
      deterministic: sameTrace(first.tickTrace, replay.tickTrace),
    };
  });

  const transitions: G02BoundaryTransition[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (previous.outcome !== current.outcome) {
      transitions.push({
        fromDelay: previous.delay,
        fromOutcome: previous.outcome,
        toDelay: current.delay,
        toOutcome: current.outcome,
      });
    }
  }

  const failureIntervals: G02FailureInterval[] = [];
  let catchSeen = false;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    catchSeen ||= row.outcome === "O5_CATCH";
    if (catchSeen && row.outcome === "D1_DEFLECTION") {
      failureIntervals.push({
        fromDelay: rows[Math.max(0, index - 1)].delay,
        toDelay: row.delay,
        reason: "反应成本上升后从 O5 接球回跳到 D1 破坏",
      });
    }
    if (!row.deterministic) {
      failureIntervals.push({
        fromDelay: row.delay,
        toDelay: row.delay,
        reason: "同一输入的两次逐 tick 轨迹不一致",
      });
    }
    if (!row.localTouch || row.flightSteps < 1 || row.maxBallStep > 9.2 * FIXED_DT + 0.007) {
      failureIntervals.push({
        fromDelay: row.delay,
        toDelay: row.delay,
        reason: "最终结果没有由完整飞行后的局部触球产生",
      });
    }
  }

  const lastDeflection =
    [...rows].reverse().find((row) => row.outcome === "D1_DEFLECTION") ?? null;
  const firstCatch = rows.find((row) => row.outcome === "O5_CATCH") ?? null;
  const preferredStableDelay = firstCatch?.delay === 0.12 ? 0.16 : 0.12;
  const stableCatch =
    rows.find(
      (row) => row.delay === preferredStableDelay && row.outcome === "O5_CATCH",
    ) ?? rows[rows.length - 1];
  const deterministic = rows.every((row) => row.deterministic);
  const monotonic = failureIntervals.every((failure) => !failure.reason.includes("回跳"));
  const passed =
    deterministic &&
    monotonic &&
    failureIntervals.length === 0 &&
    transitions.length === 1 &&
    transitions[0].fromOutcome === "D1_DEFLECTION" &&
    transitions[0].toOutcome === "O5_CATCH" &&
    lastDeflection !== null &&
    firstCatch !== null;

  const replays: G02ReplaySample[] = [];
  if (lastDeflection) {
    replays.push({
      id: "last-deflection",
      label: "最后一个 D1 合法破坏",
      note: "边界低侧：D1 走完绕前路线并真实先触球",
      delay: lastDeflection.delay,
      outcome: lastDeflection.outcome,
    });
  }
  if (firstCatch) {
    replays.push({
      id: "first-catch",
      label: "第一个 O5 合法接球",
      note: "边界高侧：D1 绕前被时间约束否决，留在身后",
      delay: firstCatch.delay,
      outcome: firstCatch.outcome,
    });
  }
  if (stableCatch) {
    replays.push({
      id: "stable-catch",
      label: `${stableCatch.delay.toFixed(2)}s 稳定接球`,
      note: stableCatch.delay === 0.12 ? "保留原始 S03 反应成本" : "高侧稳定接球样本",
      delay: stableCatch.delay,
      outcome: stableCatch.outcome,
    });
  }

  return {
    id: "G02",
    label: "D1 绕前反应时间边界泛化探针",
    rows,
    deterministic,
    monotonic,
    passed,
    transitions,
    failureIntervals,
    lastDeflectionDelay: lastDeflection?.delay ?? null,
    firstCatchDelay: firstCatch?.delay ?? null,
    replays,
  };
}
