import {
  PnrSimulation,
  copyInitialPlayerPositions,
  mirrorInitialPlayerPositions,
  type CandidateEvaluation,
  type PlanningRecord,
  type RoleAssignment,
  type ScreenSide,
  type SimulationConfig,
} from "./pnr-core.ts";
import { makeG01Config } from "./pnr-generalization.ts";
import { makeScenarioConfig, type ScenarioId } from "./pnr-scenarios.ts";
import {
  DEFENSE_BALANCED_COVERAGE,
  OFFENSE_BALANCED_READ,
  OFFENSE_MISMATCH_PRESSURE,
  OFFENSE_MISMATCH_PRESSURE_ATTACK_BIG_ADJUSTMENT,
  makeTeamStrategySelection,
  type TeamStrategyProfile,
} from "./pnr-strategy.ts";

export type P01OffenseStrategyId =
  | typeof OFFENSE_BALANCED_READ.id
  | typeof OFFENSE_MISMATCH_PRESSURE.id;

export type P01ReplayId = "boundary-398" | "stable-low-372" | "hard-veto";

export interface P01ReplaySpec {
  readonly id: P01ReplayId;
  readonly code: string;
  readonly label: string;
  readonly note: string;
  readonly kind: "g01-speed" | "scenario";
  readonly speed?: 3.72 | 3.98;
  readonly scenarioId?: ScenarioId;
}

export const P01_OFFENSE_STRATEGIES = Object.freeze([
  OFFENSE_BALANCED_READ,
  OFFENSE_MISMATCH_PRESSURE,
] as const);

export const P01_REPLAYS = Object.freeze([
  {
    id: "boundary-398",
    code: "3.98m/s",
    label: "边界样本 · 策略产生差异",
    note: "Balanced 喂 O5；Mismatch Pressure 以统一 +0.02 攻击 D5。",
    kind: "g01-speed",
    speed: 3.98,
  },
  {
    id: "stable-low-372",
    code: "3.72m/s",
    label: "稳定低侧 · 尊重基础优势",
    note: "两套策略都保留 FEED_SEAL，避免无脑攻击错位。",
    kind: "g01-speed",
    speed: 3.72,
  },
  {
    id: "hard-veto",
    code: "S02",
    label: "硬否决 · 策略不能救活",
    note: "尚未形成换防；ATTACK_BIG 保持 veto，压力策略不能越过阶段与硬约束。",
    kind: "scenario",
    scenarioId: "reject_overplay_right",
  },
] as const satisfies readonly P01ReplaySpec[]);

export interface P01CandidateSnapshot {
  readonly id: string;
  readonly feasible: boolean;
  readonly baseScore: number | null;
  readonly strategyAdjustment: number;
  readonly effectiveScore: number | null;
  readonly strategyReason: string;
  readonly vetoes: readonly string[];
}

export interface P01CalibrationRow {
  readonly speed: 3.72 | 3.98 | 4;
  readonly strategyId: P01OffenseStrategyId;
  readonly side: ScreenSide;
  readonly decisionTick: number;
  readonly chosen: string;
  readonly attack: P01CandidateSnapshot;
  readonly feed: P01CandidateSnapshot;
  readonly reset: P01CandidateSnapshot;
  readonly offenseRoles: readonly RoleAssignment[];
  readonly defensePlan: string;
}

export interface P01CalibrationResult {
  readonly id: "P01";
  readonly adjustment: number;
  readonly maximumAllowedAdjustment: 0.2;
  readonly rows: readonly P01CalibrationRow[];
  readonly veto: P01CandidateSnapshot;
  readonly passed: boolean;
  readonly failureReasons: readonly string[];
}

function getOffenseStrategy(id: P01OffenseStrategyId): TeamStrategyProfile {
  const profile = P01_OFFENSE_STRATEGIES.find((candidate) => candidate.id === id);
  if (!profile) throw new Error(`Unknown P01 offense strategy: ${id}`);
  return profile;
}

export function makeP01StrategySelection(id: P01OffenseStrategyId) {
  return makeTeamStrategySelection(getOffenseStrategy(id), DEFENSE_BALANCED_COVERAGE);
}

export function withP01OffenseStrategy(
  config: SimulationConfig,
  id: P01OffenseStrategyId,
): SimulationConfig {
  return {
    ...config,
    initialPositions: copyInitialPlayerPositions(config.initialPositions),
    strategies: makeP01StrategySelection(id),
  };
}

export function makeP01G01Config(
  speed: 3.72 | 3.98 | 4,
  strategyId: P01OffenseStrategyId,
  side: ScreenSide = "right",
): SimulationConfig {
  const right = makeG01Config(speed);
  return withP01OffenseStrategy(
    {
      ...right,
      screenSide: side,
      initialPositions:
        side === "right"
          ? copyInitialPlayerPositions(right.initialPositions)
          : mirrorInitialPlayerPositions(right.initialPositions),
    },
    strategyId,
  );
}

export function makeP01ReplayConfig(
  replayId: P01ReplayId,
  strategyId: P01OffenseStrategyId,
  side: ScreenSide = "right",
): SimulationConfig {
  const replay = P01_REPLAYS.find((candidate) => candidate.id === replayId);
  if (!replay) throw new Error(`Unknown P01 replay: ${replayId}`);
  if (replay.kind === "g01-speed" && replay.speed !== undefined) {
    return makeP01G01Config(replay.speed, strategyId, side);
  }
  if (replay.kind === "scenario" && replay.scenarioId) {
    return withP01OffenseStrategy(
      makeScenarioConfig(replay.scenarioId, side),
      strategyId,
    );
  }
  throw new Error(`P01 replay ${replayId} has no runnable public input`);
}

export function createP01Replay(
  replayId: P01ReplayId,
  strategyId: P01OffenseStrategyId,
  side: ScreenSide = "right",
): PnrSimulation {
  return new PnrSimulation(makeP01ReplayConfig(replayId, strategyId, side));
}

function candidateSnapshot(
  record: PlanningRecord,
  id: "ATTACK_BIG" | "FEED_SEAL" | "RESET_MISMATCH",
): P01CandidateSnapshot {
  const candidate = record.candidates.find((item) => item.id === id);
  if (!candidate) throw new Error(`P01 missing ${id} at tick ${record.tick}`);
  return cloneCandidate(candidate);
}

function cloneCandidate(candidate: CandidateEvaluation): P01CandidateSnapshot {
  return {
    id: candidate.id,
    feasible: candidate.feasible,
    baseScore: candidate.baseScore,
    strategyAdjustment: candidate.strategyAdjustment,
    effectiveScore: candidate.effectiveScore,
    strategyReason: candidate.strategyReason,
    vetoes: [...candidate.vetoes],
  };
}

function runMismatchCalibration(
  speed: 3.72 | 3.98 | 4,
  strategyId: P01OffenseStrategyId,
  side: ScreenSide = "right",
): P01CalibrationRow {
  const simulation = new PnrSimulation(makeP01G01Config(speed, strategyId, side));
  let decision: PlanningRecord | undefined;
  for (let index = 0; index < 600 && !simulation.world.terminal; index += 1) {
    simulation.step();
    decision = simulation.planningLog.find(
      (record) =>
        record.team === "offense" && record.decisionPhase === "offense_mismatch",
    );
    if (decision) break;
  }
  if (!decision) throw new Error(`P01 ${speed.toFixed(2)}m/s never reached post-switch`);
  return {
    speed,
    strategyId,
    side,
    decisionTick: decision.tick,
    chosen: decision.chosen,
    attack: candidateSnapshot(decision, "ATTACK_BIG"),
    feed: candidateSnapshot(decision, "FEED_SEAL"),
    reset: candidateSnapshot(decision, "RESET_MISMATCH"),
    offenseRoles: simulation.getRoles().filter((role) => role.playerId.startsWith("O")),
    defensePlan: simulation.defensePlan.id,
  };
}

export function scanP01Calibration(): P01CalibrationResult {
  const rows = ([3.72, 3.98, 4] as const).flatMap((speed) =>
    P01_OFFENSE_STRATEGIES.map((strategy) =>
      runMismatchCalibration(speed, strategy.id, "right"),
    ),
  );
  rows.push(
    runMismatchCalibration(3.98, OFFENSE_MISMATCH_PRESSURE.id, "left"),
  );

  const vetoSimulation = createP01Replay(
    "hard-veto",
    OFFENSE_MISMATCH_PRESSURE.id,
  );
  const initialOffense = vetoSimulation.planningLog.find(
    (record) => record.team === "offense",
  );
  const vetoCandidate = initialOffense?.candidates.find(
    (candidate) => candidate.id === "ATTACK_BIG",
  );
  if (!vetoCandidate) throw new Error("P01 hard-veto replay is missing ATTACK_BIG");
  const veto = cloneCandidate(vetoCandidate);

  const row = (
    speed: 3.72 | 3.98 | 4,
    strategyId: P01OffenseStrategyId,
    side: ScreenSide = "right",
  ) => rows.find(
    (candidate) =>
      candidate.speed === speed &&
      candidate.strategyId === strategyId &&
      candidate.side === side,
  );
  const balanced372 = row(3.72, OFFENSE_BALANCED_READ.id);
  const pressure372 = row(3.72, OFFENSE_MISMATCH_PRESSURE.id);
  const balanced398 = row(3.98, OFFENSE_BALANCED_READ.id);
  const pressure398 = row(3.98, OFFENSE_MISMATCH_PRESSURE.id);
  const balanced400 = row(4, OFFENSE_BALANCED_READ.id);
  const pressure400 = row(4, OFFENSE_MISMATCH_PRESSURE.id);
  const left398 = row(3.98, OFFENSE_MISMATCH_PRESSURE.id, "left");

  const failureReasons: string[] = [];
  if (
    OFFENSE_MISMATCH_PRESSURE_ATTACK_BIG_ADJUSTMENT <= 0 ||
    OFFENSE_MISMATCH_PRESSURE_ATTACK_BIG_ADJUSTMENT > 0.2
  ) {
    failureReasons.push("ATTACK_BIG 全局调整不在 (0, +0.20] 范围内");
  }
  if (balanced398?.chosen !== "FEED_SEAL" || pressure398?.chosen !== "ATTACK_BIG") {
    failureReasons.push("3.98m/s 未形成 Balanced FEED / Pressure ATTACK 差异");
  }
  if (balanced372?.chosen !== "FEED_SEAL" || pressure372?.chosen !== "FEED_SEAL") {
    failureReasons.push("3.72m/s 稳定低侧被策略强行翻转");
  }
  if (balanced400?.chosen !== "ATTACK_BIG" || pressure400?.chosen !== "ATTACK_BIG") {
    failureReasons.push("4.00m/s 高侧没有保持两套策略均攻击大个");
  }
  if (
    !pressure398 ||
    pressure398.attack.strategyAdjustment !==
      OFFENSE_MISMATCH_PRESSURE_ATTACK_BIG_ADJUSTMENT ||
    pressure398.feed.strategyAdjustment !== 0 ||
    pressure398.reset.strategyAdjustment !== 0
  ) {
    failureReasons.push("Pressure 没有只调整 post-switch ATTACK_BIG");
  }
  if (
    !balanced398 ||
    !pressure398 ||
    balanced398.attack.baseScore !== pressure398.attack.baseScore ||
    balanced398.feed.baseScore !== pressure398.feed.baseScore ||
    balanced398.reset.baseScore !== pressure398.reset.baseScore
  ) {
    failureReasons.push("策略改变了 3.98m/s 基础评分");
  }
  if (
    pressure398?.offenseRoles.find((role) => role.playerId === "O1")?.roleCode !==
      "attack_big" ||
    pressure398.offenseRoles.find((role) => role.playerId === "O5")?.roleCode !==
      "clear_lane"
  ) {
    failureReasons.push("Pressure 选择 ATTACK_BIG 后没有同时分配 O1 攻击与 O5 清空");
  }
  if (
    !left398 ||
    left398.chosen !== pressure398?.chosen ||
    left398.attack.baseScore !== pressure398.attack.baseScore ||
    left398.attack.strategyAdjustment !== pressure398.attack.strategyAdjustment ||
    left398.attack.effectiveScore !== pressure398.attack.effectiveScore
  ) {
    failureReasons.push("左右侧没有共享同一个策略常数与评分逻辑");
  }
  if (veto.feasible || veto.effectiveScore !== null || veto.strategyAdjustment !== 0) {
    failureReasons.push("Pressure 恢复了被硬否决的 ATTACK_BIG");
  }

  return {
    id: "P01",
    adjustment: OFFENSE_MISMATCH_PRESSURE_ATTACK_BIG_ADJUSTMENT,
    maximumAllowedAdjustment: 0.2,
    rows,
    veto,
    passed: failureReasons.length === 0,
    failureReasons,
  };
}
