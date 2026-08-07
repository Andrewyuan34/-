import {
  PnrSimulation,
  copyInitialPlayerPositions,
  type CandidateEvaluation,
  type PlanningRecord,
  type RoleAssignment,
  type ScreenSide,
  type SimulationConfig,
} from "./pnr-core.ts";
import { makeG03Config } from "./pnr-g03-generalization.ts";
import { makeG01Config } from "./pnr-generalization.ts";
import {
  P01_OFFENSE_STRATEGIES,
  type P01OffenseStrategyId,
} from "./pnr-p01-offense-strategy.ts";
import {
  DEFENSE_BALANCED_COVERAGE,
  DEFENSE_EARLY_DIG,
  DEFENSE_EARLY_DIG_ADJUSTMENT,
  DEFENSE_MISMATCH_PRESSURE,
  DEFENSE_MISMATCH_PRESSURE_ADJUSTMENT,
  OFFENSE_BALANCED_READ,
  makeTeamStrategySelection,
  scoreCandidateWithStrategy,
  type DecisionPhase,
  type TeamStrategyProfile,
} from "./pnr-strategy.ts";

export type P02OffenseStrategyId = P01OffenseStrategyId;
export type P02DefenseStrategyId =
  | typeof DEFENSE_BALANCED_COVERAGE.id
  | typeof DEFENSE_MISMATCH_PRESSURE.id
  | typeof DEFENSE_EARLY_DIG.id;

export const P02_DEFENSE_STRATEGIES = Object.freeze([
  DEFENSE_BALANCED_COVERAGE,
  DEFENSE_MISMATCH_PRESSURE,
  DEFENSE_EARLY_DIG,
] as const);

export interface P02CandidateSnapshot {
  readonly id: string;
  readonly feasible: boolean;
  readonly baseScore: number | null;
  readonly strategyAdjustment: number;
  readonly effectiveScore: number | null;
  readonly strategyReason: string;
  readonly vetoes: readonly string[];
  readonly evidence: readonly string[];
}

export interface P02CalibrationRow {
  readonly family: "mismatch" | "post-catch";
  readonly input: number;
  readonly inputLabel: string;
  readonly defenseStrategyId: P02DefenseStrategyId;
  readonly side: ScreenSide;
  readonly decisionPhase: Extract<DecisionPhase, "defense_mismatch" | "defense_post_catch">;
  readonly decisionTick: number;
  readonly chosen: string;
  readonly candidates: readonly P02CandidateSnapshot[];
  readonly defenseRoles: readonly RoleAssignment[];
}

export interface P02CalibrationResult {
  readonly id: "P02";
  readonly mismatchAdjustment: number;
  readonly earlyDigAdjustment: number;
  readonly rows: readonly P02CalibrationRow[];
  readonly pressureHardVeto: P02CandidateSnapshot;
  readonly digHardVeto: P02CandidateSnapshot;
  readonly passed: boolean;
  readonly failureReasons: readonly string[];
}

function getOffenseStrategy(id: P02OffenseStrategyId): TeamStrategyProfile {
  const profile = P01_OFFENSE_STRATEGIES.find((candidate) => candidate.id === id);
  if (!profile) throw new Error(`Unknown P02 offense strategy: ${id}`);
  return profile;
}

export function getP02DefenseStrategy(id: P02DefenseStrategyId): TeamStrategyProfile {
  const profile = P02_DEFENSE_STRATEGIES.find((candidate) => candidate.id === id);
  if (!profile) throw new Error(`Unknown P02 defense strategy: ${id}`);
  return profile;
}

export function makeP02StrategySelection(
  offenseId: P02OffenseStrategyId = OFFENSE_BALANCED_READ.id,
  defenseId: P02DefenseStrategyId = DEFENSE_BALANCED_COVERAGE.id,
) {
  return makeTeamStrategySelection(
    getOffenseStrategy(offenseId),
    getP02DefenseStrategy(defenseId),
  );
}

export function withP02Strategies(
  config: SimulationConfig,
  offenseId: P02OffenseStrategyId = OFFENSE_BALANCED_READ.id,
  defenseId: P02DefenseStrategyId = DEFENSE_BALANCED_COVERAGE.id,
): SimulationConfig {
  return {
    ...config,
    initialPositions: copyInitialPlayerPositions(config.initialPositions),
    strategies: makeP02StrategySelection(offenseId, defenseId),
  };
}

function cloneCandidate(candidate: CandidateEvaluation): P02CandidateSnapshot {
  return {
    id: candidate.id,
    feasible: candidate.feasible,
    baseScore: candidate.baseScore,
    strategyAdjustment: candidate.strategyAdjustment,
    effectiveScore: candidate.effectiveScore,
    strategyReason: candidate.strategyReason,
    vetoes: [...candidate.vetoes],
    evidence: [...candidate.evidence],
  };
}

function findFirstDefenseDecision(
  config: SimulationConfig,
  phase: Extract<DecisionPhase, "defense_mismatch" | "defense_post_catch">,
): { simulation: PnrSimulation; decision: PlanningRecord } {
  const simulation = new PnrSimulation(config);
  for (let index = 0; index < 600 && !simulation.world.terminal; index += 1) {
    const decision = simulation.planningLog.find(
      (record) => record.team === "defense" && record.decisionPhase === phase,
    );
    if (decision) return { simulation, decision };
    simulation.step();
  }
  const decision = simulation.planningLog.find(
    (record) => record.team === "defense" && record.decisionPhase === phase,
  );
  if (!decision) throw new Error(`P02 never reached ${phase}`);
  return { simulation, decision };
}

function calibrationRow(
  family: P02CalibrationRow["family"],
  input: number,
  defenseStrategyId: P02DefenseStrategyId,
  side: ScreenSide = "right",
): P02CalibrationRow {
  const phase = family === "mismatch" ? "defense_mismatch" : "defense_post_catch";
  const base = family === "mismatch" ? makeG01Config(input) : makeG03Config(input);
  const config = withP02Strategies(
    {
      ...base,
      screenSide: side,
      initialPositions: copyInitialPlayerPositions(base.initialPositions),
    },
    OFFENSE_BALANCED_READ.id,
    defenseStrategyId,
  );
  const { simulation, decision } = findFirstDefenseDecision(config, phase);
  const candidateIds = family === "mismatch"
    ? ["CONTAIN_MISMATCH", "PRESSURE_MISMATCH"]
    : ["STAY_HOME_POST", "DIG_POST"];
  const candidates = candidateIds.map((id) => {
    const candidate = decision.candidates.find((item) => item.id === id);
    if (!candidate) throw new Error(`P02 ${phase} missing ${id}`);
    return cloneCandidate(candidate);
  });
  return {
    family,
    input,
    inputLabel: family === "mismatch" ? `${input.toFixed(2)}m/s` : `${input.toFixed(2)}s`,
    defenseStrategyId,
    side,
    decisionPhase: phase,
    decisionTick: decision.tick,
    chosen: decision.chosen,
    candidates,
    defenseRoles: simulation.getRoles().filter((role) => role.playerId.startsWith("D")),
  };
}

function preferenceFailures(
  profile: TeamStrategyProfile,
  phase: DecisionPhase,
  planId: string,
  adjustment: number,
): string[] {
  const failures: string[] = [];
  for (const [candidatePhase, preferences] of Object.entries(profile.phasePreferences)) {
    for (const preference of preferences ?? []) {
      const expected = candidatePhase === phase && preference.planId === planId
        ? adjustment
        : 0;
      if (preference.adjustment !== expected) {
        failures.push(
          `${profile.id} unexpectedly adjusts ${candidatePhase}/${preference.planId}`,
        );
      }
    }
  }
  return failures;
}

export function scanP02DefenseCalibration(): P02CalibrationResult {
  const rows: P02CalibrationRow[] = [];
  for (const speed of [3.98, 4] as const) {
    rows.push(calibrationRow("mismatch", speed, DEFENSE_BALANCED_COVERAGE.id));
    rows.push(calibrationRow("mismatch", speed, DEFENSE_MISMATCH_PRESSURE.id));
  }
  for (const delay of [0, 0.18, 0.21] as const) {
    rows.push(calibrationRow("post-catch", delay, DEFENSE_BALANCED_COVERAGE.id));
    rows.push(calibrationRow("post-catch", delay, DEFENSE_EARLY_DIG.id));
  }

  const row = (
    family: P02CalibrationRow["family"],
    input: number,
    defenseStrategyId: P02DefenseStrategyId,
  ) => rows.find(
    (candidate) =>
      candidate.family === family &&
      candidate.input === input &&
      candidate.defenseStrategyId === defenseStrategyId,
  );
  const candidate = (entry: P02CalibrationRow | undefined, id: string) =>
    entry?.candidates.find((item) => item.id === id);

  const balanced398 = row("mismatch", 3.98, DEFENSE_BALANCED_COVERAGE.id);
  const pressure398 = row("mismatch", 3.98, DEFENSE_MISMATCH_PRESSURE.id);
  const balanced400 = row("mismatch", 4, DEFENSE_BALANCED_COVERAGE.id);
  const pressure400 = row("mismatch", 4, DEFENSE_MISMATCH_PRESSURE.id);
  const balanced000 = row("post-catch", 0, DEFENSE_BALANCED_COVERAGE.id);
  const early000 = row("post-catch", 0, DEFENSE_EARLY_DIG.id);
  const balanced018 = row("post-catch", 0.18, DEFENSE_BALANCED_COVERAGE.id);
  const early018 = row("post-catch", 0.18, DEFENSE_EARLY_DIG.id);
  const balanced021 = row("post-catch", 0.21, DEFENSE_BALANCED_COVERAGE.id);
  const early021 = row("post-catch", 0.21, DEFENSE_EARLY_DIG.id);

  const pressureHardVeto = cloneCandidate({
    id: "PRESSURE_MISMATCH",
    label: "PRESSURE_MISMATCH",
    feasible: false,
    score: null,
    ...scoreCandidateWithStrategy(
      DEFENSE_MISMATCH_PRESSURE,
      "defense_mismatch",
      { planId: "PRESSURE_MISMATCH", feasible: false, baseScore: null },
    ),
    vetoes: ["测试硬否决"],
    evidence: [],
  });
  const digHardVeto = cloneCandidate({
    id: "DIG_POST",
    label: "DIG_POST",
    feasible: false,
    score: null,
    ...scoreCandidateWithStrategy(
      DEFENSE_EARLY_DIG,
      "defense_post_catch",
      { planId: "DIG_POST", feasible: false, baseScore: null },
    ),
    vetoes: ["测试硬否决"],
    evidence: [],
  });

  const failureReasons = [
    ...preferenceFailures(
      DEFENSE_MISMATCH_PRESSURE,
      "defense_mismatch",
      "PRESSURE_MISMATCH",
      DEFENSE_MISMATCH_PRESSURE_ADJUSTMENT,
    ),
    ...preferenceFailures(
      DEFENSE_EARLY_DIG,
      "defense_post_catch",
      "DIG_POST",
      DEFENSE_EARLY_DIG_ADJUSTMENT,
    ),
  ];

  if (balanced398?.chosen !== "CONTAIN_MISMATCH" || pressure398?.chosen !== "PRESSURE_MISMATCH") {
    failureReasons.push("3.98m/s 未形成 Balanced CONTAIN / Pressure PRESSURE 差异");
  }
  if (balanced400?.chosen !== "CONTAIN_MISMATCH" || pressure400?.chosen !== "CONTAIN_MISMATCH") {
    failureReasons.push("4.00m/s 没有保留两套策略均 CONTAIN 的基础判断");
  }
  if (balanced000?.chosen !== "STAY_HOME_POST" || early000?.chosen !== "STAY_HOME_POST") {
    failureReasons.push("0.00s 稳定低侧被 Early Dig 强行翻转");
  }
  if (balanced018?.chosen !== "STAY_HOME_POST" || early018?.chosen !== "DIG_POST") {
    failureReasons.push("0.18s 未形成 Balanced STAY / Early Dig DIG 差异");
  }
  if (balanced021?.chosen !== "DIG_POST" || early021?.chosen !== "DIG_POST") {
    failureReasons.push("0.21s 没有保留两套策略均 DIG 的基础判断");
  }

  const scoreChecks = [
    [candidate(balanced398, "CONTAIN_MISMATCH"), 4.569, 0, 4.569],
    [candidate(balanced398, "PRESSURE_MISMATCH"), 3.396, 0, 3.396],
    [candidate(pressure398, "CONTAIN_MISMATCH"), 4.569, 0, 4.569],
    [candidate(pressure398, "PRESSURE_MISMATCH"), 3.396, 1.18, 4.576],
    [candidate(balanced400, "CONTAIN_MISMATCH"), 4.577, 0, 4.577],
    [candidate(pressure400, "PRESSURE_MISMATCH"), 3.387, 1.18, 4.567],
    [candidate(balanced018, "STAY_HOME_POST"), 1.217, 0, 1.217],
    [candidate(balanced018, "DIG_POST"), 0.98, 0, 0.98],
    [candidate(early018, "STAY_HOME_POST"), 1.217, 0, 1.217],
    [candidate(early018, "DIG_POST"), 0.98, 0.24, 1.22],
  ] as const;
  for (const [snapshot, baseScore, adjustment, effectiveScore] of scoreChecks) {
    if (
      !snapshot ||
      snapshot.baseScore !== baseScore ||
      snapshot.strategyAdjustment !== adjustment ||
      snapshot.effectiveScore !== effectiveScore
    ) {
      failureReasons.push(
        `校准分数不符：expected ${baseScore} + ${adjustment} = ${effectiveScore}`,
      );
    }
  }

  if (
    pressureHardVeto.feasible ||
    pressureHardVeto.strategyAdjustment !== 0 ||
    pressureHardVeto.effectiveScore !== null ||
    digHardVeto.feasible ||
    digHardVeto.strategyAdjustment !== 0 ||
    digHardVeto.effectiveScore !== null
  ) {
    failureReasons.push("防守策略恢复了硬否决候选");
  }

  return {
    id: "P02",
    mismatchAdjustment: DEFENSE_MISMATCH_PRESSURE_ADJUSTMENT,
    earlyDigAdjustment: DEFENSE_EARLY_DIG_ADJUSTMENT,
    rows,
    pressureHardVeto,
    digHardVeto,
    passed: failureReasons.length === 0,
    failureReasons,
  };
}
