import {
  PnrSimulation,
  type CandidateEvaluation,
  type PlanId,
  type PlanningRecord,
  type SimulationConfig,
} from "./pnr-core.ts";
import { makeInitialPositionsForCue } from "./pnr-scenarios.ts";

export const G01_SPEEDS = Object.freeze(
  Array.from({ length: 19 }, (_, index) => Number((3.72 + index * 0.02).toFixed(2))),
);

export const G01_BASE_CONFIG = Object.freeze({
  initialPositions: makeInitialPositionsForCue("neutral"),
  screenSide: "right",
  seed: 17,
  maxTime: 7.4,
  d1FrontReactionDelay: 0.12,
  d1PostCatchRecoveryDelay: 0,
  o1MaxSpeed: G01_SPEEDS[0],
  horizon: "pnr_resolution",
} satisfies SimulationConfig);

export type G01DecisionPlan = Extract<PlanId, "ATTACK_BIG" | "FEED_SEAL">;
export type G01ReplayId = "stable-high" | "last-feed" | "first-attack";

export interface G01CandidateAudit {
  id: G01DecisionPlan;
  feasible: boolean;
  score: number | null;
  vetoes: string[];
  evidence: string[];
}

export interface G01ScanRow {
  speed: number;
  chosen: G01DecisionPlan;
  decisionTick: number;
  switchTick: number;
  deterministic: boolean;
  attack: G01CandidateAudit;
  feed: G01CandidateAudit;
}

export interface G01BoundaryTransition {
  fromSpeed: number;
  fromPlan: G01DecisionPlan;
  toSpeed: number;
  toPlan: G01DecisionPlan;
}

export interface G01FailureInterval {
  fromSpeed: number;
  toSpeed: number;
  reason: string;
}

export interface G01ReplaySample {
  id: G01ReplayId;
  label: string;
  note: string;
  speed: number;
  chosen: G01DecisionPlan;
}

export interface G01AuditResult {
  id: "G01";
  label: string;
  rows: G01ScanRow[];
  deterministic: boolean;
  monotonic: boolean;
  passed: boolean;
  transitions: G01BoundaryTransition[];
  failureIntervals: G01FailureInterval[];
  lastFeedSpeed: number | null;
  firstAttackSpeed: number | null;
  replays: G01ReplaySample[];
}

interface AuditRun {
  row: Omit<G01ScanRow, "deterministic">;
  tickTrace: string[];
}

export function makeG01Config(speed: number): SimulationConfig {
  if (!G01_SPEEDS.includes(speed)) {
    throw new Error(`G01 speed must be one of the 19 approved samples: ${speed}`);
  }
  return {
    ...G01_BASE_CONFIG,
    initialPositions: makeInitialPositionsForCue("neutral"),
    o1MaxSpeed: speed,
  };
}

export function createG01Replay(speed: number): PnrSimulation {
  return new PnrSimulation(makeG01Config(speed));
}

function cloneCandidate(
  record: PlanningRecord,
  id: G01DecisionPlan,
): G01CandidateAudit {
  const candidate = record.candidates.find((item) => item.id === id);
  if (!candidate) throw new Error(`G01 missing ${id} at tick ${record.tick}`);
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

function runAuditSample(speed: number): AuditRun {
  const simulation = createG01Replay(speed);
  const tickTrace = [captureTick(simulation)];
  for (let index = 0; index < 600 && !simulation.world.terminal; index += 1) {
    simulation.step();
    tickTrace.push(captureTick(simulation));
  }

  const switchEvent = simulation.eventLog.find((event) => event.type === "switch_completed");
  if (!switchEvent) throw new Error(`G01 ${speed.toFixed(2)}m/s never completed the switch`);
  const decision = simulation.planningLog.find(
    (record) =>
      record.team === "offense" &&
      record.tick >= switchEvent.availableAtTick &&
      record.triggerEventIds.includes(switchEvent.id),
  );
  if (!decision) {
    throw new Error(`G01 ${speed.toFixed(2)}m/s has no first offense replan after the switch`);
  }
  if (decision.chosen !== "ATTACK_BIG" && decision.chosen !== "FEED_SEAL") {
    throw new Error(`G01 ${speed.toFixed(2)}m/s chose unexpected plan ${decision.chosen}`);
  }

  return {
    row: {
      speed,
      chosen: decision.chosen,
      decisionTick: decision.tick,
      switchTick: switchEvent.tick,
      attack: cloneCandidate(decision, "ATTACK_BIG"),
      feed: cloneCandidate(decision, "FEED_SEAL"),
    },
    tickTrace,
  };
}

function sameTrace(first: string[], second: string[]): boolean {
  return (
    first.length === second.length &&
    first.every((frame, index) => frame === second[index])
  );
}

export function scanG01SpeedBoundary(): G01AuditResult {
  const rows = G01_SPEEDS.map((speed) => {
    const first = runAuditSample(speed);
    const replay = runAuditSample(speed);
    return {
      ...first.row,
      deterministic: sameTrace(first.tickTrace, replay.tickTrace),
    };
  });

  const transitions: G01BoundaryTransition[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (previous.chosen !== current.chosen) {
      transitions.push({
        fromSpeed: previous.speed,
        fromPlan: previous.chosen,
        toSpeed: current.speed,
        toPlan: current.chosen,
      });
    }
  }

  const failureIntervals: G01FailureInterval[] = [];
  let attackSeen = false;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    attackSeen ||= row.chosen === "ATTACK_BIG";
    if (attackSeen && row.chosen === "FEED_SEAL") {
      failureIntervals.push({
        fromSpeed: rows[Math.max(0, index - 1)].speed,
        toSpeed: row.speed,
        reason: "速度上升后从 ATTACK_BIG 回跳到 FEED_SEAL",
      });
    }
    if (!row.deterministic) {
      failureIntervals.push({
        fromSpeed: row.speed,
        toSpeed: row.speed,
        reason: "同一输入的两次逐 tick 轨迹不一致",
      });
    }
  }

  const lastFeed = [...rows].reverse().find((row) => row.chosen === "FEED_SEAL") ?? null;
  const firstAttack = rows.find((row) => row.chosen === "ATTACK_BIG") ?? null;
  const stableHigh = rows[rows.length - 1];
  const deterministic = rows.every((row) => row.deterministic);
  const monotonic = failureIntervals.every((failure) => !failure.reason.includes("回跳"));
  const passed =
    deterministic &&
    monotonic &&
    transitions.length === 1 &&
    transitions[0].fromPlan === "FEED_SEAL" &&
    transitions[0].toPlan === "ATTACK_BIG" &&
    lastFeed !== null &&
    firstAttack !== null;

  const replays: G01ReplaySample[] = [];
  if (stableHigh) {
    replays.push({
      id: "stable-high",
      label: "边界外稳定样本",
      note: "高侧稳定区，用来判断 ATTACK_BIG 是否持续成立",
      speed: stableHigh.speed,
      chosen: stableHigh.chosen,
    });
  }
  if (lastFeed) {
    replays.push({
      id: "last-feed",
      label: "最后一个 FEED_SEAL",
      note: "边界低侧的最后一个喂内线样本",
      speed: lastFeed.speed,
      chosen: lastFeed.chosen,
    });
  }
  if (firstAttack) {
    replays.push({
      id: "first-attack",
      label: "第一个 ATTACK_BIG",
      note: "与最后 FEED_SEAL 相邻的边界高侧样本",
      speed: firstAttack.speed,
      chosen: firstAttack.chosen,
    });
  }

  return {
    id: "G01",
    label: "O1 速度决策边界泛化探针",
    rows,
    deterministic,
    monotonic,
    passed,
    transitions,
    failureIntervals,
    lastFeedSpeed: lastFeed?.speed ?? null,
    firstAttackSpeed: firstAttack?.speed ?? null,
    replays,
  };
}
