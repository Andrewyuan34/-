import type {
  DefensePlanId,
  OffensePlanId,
  PlanId,
  Team,
} from "./pnr-core.ts";

export type DecisionPhase =
  | "offense_initial_read"
  | "offense_mismatch"
  | "offense_post_catch"
  | "defense_initial_coverage"
  | "defense_mismatch"
  | "defense_post_catch";

export interface StrategyPreference {
  readonly planId: PlanId;
  readonly adjustment: number;
  readonly reason: string;
}

export interface TeamStrategyProfile {
  readonly id: string;
  readonly version: number;
  readonly team: Team;
  readonly label: string;
  readonly description: string;
  readonly phasePreferences: Readonly<
    Partial<Record<DecisionPhase, readonly StrategyPreference[]>>
  >;
}

export interface TeamStrategyReference {
  readonly id: string;
  readonly version: number;
}

export interface TeamStrategySelection {
  readonly offense: TeamStrategyReference;
  readonly defense: TeamStrategyReference;
}

export interface StrategyScoreInput {
  readonly planId: PlanId;
  readonly feasible: boolean;
  readonly baseScore: number | null;
}

export interface StrategyScoreBreakdown {
  readonly baseScore: number | null;
  readonly strategyAdjustment: number;
  readonly effectiveScore: number | null;
  readonly strategyReason: string;
}

export const DECISION_PHASE_LABELS: Readonly<Record<DecisionPhase, string>> = Object.freeze({
  offense_initial_read: "进攻 · 初始阅读",
  offense_mismatch: "进攻 · 换防后错位",
  offense_post_catch: "进攻 · O5 接球后",
  defense_initial_coverage: "防守 · 初始覆盖",
  defense_mismatch: "防守 · 换防后错位",
  defense_post_catch: "防守 · O5 接球后",
});

const OFFENSE_PHASES = new Set<DecisionPhase>([
  "offense_initial_read",
  "offense_mismatch",
  "offense_post_catch",
]);
const DEFENSE_PHASES = new Set<DecisionPhase>([
  "defense_initial_coverage",
  "defense_mismatch",
  "defense_post_catch",
]);

const OFFENSE_PLAN_IDS = [
  "USE_RIGHT_SCREEN",
  "REJECT_LEFT",
  "ATTACK_BIG",
  "FEED_SEAL",
  "RESET_MISMATCH",
  "POST_FINISH",
  "KICK_OUT",
  "REJECT_SLIP_PASS",
] as const satisfies readonly OffensePlanId[];

const DEFENSE_PLAN_IDS = [
  "SWITCH_READY",
  "SWITCH",
  "STAY_HOME",
  "CONTAIN_MISMATCH",
  "FRONT_SEAL",
  "BACKSIDE_CONTEST",
  "STAY_HOME_POST",
  "DIG_POST",
  "PRESSURE_MISMATCH",
  "UNDER",
  "TAG_REJECT",
] as const satisfies readonly DefensePlanId[];

const OFFENSE_PLAN_SET = new Set<PlanId>(OFFENSE_PLAN_IDS);
const DEFENSE_PLAN_SET = new Set<PlanId>(DEFENSE_PLAN_IDS);

function planBelongsToTeam(planId: PlanId, team: Team): boolean {
  return (team === "offense" ? OFFENSE_PLAN_SET : DEFENSE_PLAN_SET).has(planId);
}

function phaseBelongsToTeam(phase: DecisionPhase, team: Team): boolean {
  return (team === "offense" ? OFFENSE_PHASES : DEFENSE_PHASES).has(phase);
}

function zeroPreferences(
  planIds: readonly PlanId[],
  reason: string,
): readonly StrategyPreference[] {
  return Object.freeze(
    planIds.map((planId) => Object.freeze({ planId, adjustment: 0, reason })),
  );
}

function freezeProfile(profile: TeamStrategyProfile): TeamStrategyProfile {
  const phasePreferences = Object.fromEntries(
    Object.entries(profile.phasePreferences).map(([phase, preferences]) => [
      phase,
      Object.freeze(
        (preferences ?? []).map((preference) => Object.freeze({ ...preference })),
      ),
    ]),
  ) as TeamStrategyProfile["phasePreferences"];
  return Object.freeze({
    ...profile,
    phasePreferences: Object.freeze(phasePreferences),
  });
}

const OFFENSE_ZERO_REASON = "P00 平衡阅读：保持现有基础评分，不施加额外偏好";
const DEFENSE_ZERO_REASON = "P00 平衡覆盖：保持现有基础评分，不施加额外偏好";

export const OFFENSE_MISMATCH_PRESSURE_ATTACK_BIG_ADJUSTMENT = 0.02;

function mismatchPressurePreferences(): readonly StrategyPreference[] {
  return Object.freeze(
    OFFENSE_PLAN_IDS.map((planId) => Object.freeze({
      planId,
      adjustment:
        planId === "ATTACK_BIG"
          ? OFFENSE_MISMATCH_PRESSURE_ATTACK_BIG_ADJUSTMENT
          : 0,
      reason:
        planId === "ATTACK_BIG"
          ? `P01 错位攻击优先：post-switch 可行 ATTACK_BIG 统一 +${OFFENSE_MISMATCH_PRESSURE_ATTACK_BIG_ADJUSTMENT.toFixed(2)}`
          : "P01 错位攻击优先：post-switch 只提升 ATTACK_BIG；本候选保持基础评分",
    })),
  );
}

export const OFFENSE_BALANCED_READ = freezeProfile({
  id: "OFFENSE_BALANCED_READ",
  version: 1,
  team: "offense",
  label: "平衡阅读",
  description: "只保留既有硬可行性、短推演与滞回评分；P00 不改变任何进攻候选偏好。",
  phasePreferences: {
    offense_initial_read: zeroPreferences(OFFENSE_PLAN_IDS, OFFENSE_ZERO_REASON),
    offense_mismatch: zeroPreferences(OFFENSE_PLAN_IDS, OFFENSE_ZERO_REASON),
    offense_post_catch: zeroPreferences(OFFENSE_PLAN_IDS, OFFENSE_ZERO_REASON),
  },
});

export const OFFENSE_MISMATCH_PRESSURE = freezeProfile({
  id: "OFFENSE_MISMATCH_PRESSURE",
  version: 1,
  team: "offense",
  label: "错位攻击优先",
  description:
    "只在换防完成后的错位阶段，为硬可行的 ATTACK_BIG 增加统一 +0.02；其他候选和阶段保持零调整。",
  phasePreferences: {
    offense_initial_read: zeroPreferences(
      OFFENSE_PLAN_IDS,
      "P01 错位攻击优先尚未进入 post-switch；保持基础评分",
    ),
    offense_mismatch: mismatchPressurePreferences(),
    offense_post_catch: zeroPreferences(
      OFFENSE_PLAN_IDS,
      "P01 错位攻击优先已离开 post-switch；接球后保持基础评分",
    ),
  },
});

export const DEFENSE_BALANCED_COVERAGE = freezeProfile({
  id: "DEFENSE_BALANCED_COVERAGE",
  version: 1,
  team: "defense",
  label: "平衡覆盖",
  description: "只保留既有硬可行性、短推演与滞回评分；P00 不改变任何防守候选偏好。",
  phasePreferences: {
    defense_initial_coverage: zeroPreferences(DEFENSE_PLAN_IDS, DEFENSE_ZERO_REASON),
    defense_mismatch: zeroPreferences(DEFENSE_PLAN_IDS, DEFENSE_ZERO_REASON),
    defense_post_catch: zeroPreferences(DEFENSE_PLAN_IDS, DEFENSE_ZERO_REASON),
  },
});

const REGISTERED_STRATEGIES = new Map<string, TeamStrategyProfile>([
  [OFFENSE_BALANCED_READ.id, OFFENSE_BALANCED_READ],
  [OFFENSE_MISMATCH_PRESSURE.id, OFFENSE_MISMATCH_PRESSURE],
  [DEFENSE_BALANCED_COVERAGE.id, DEFENSE_BALANCED_COVERAGE],
]);

export const REGISTERED_TEAM_STRATEGIES = Object.freeze([
  OFFENSE_BALANCED_READ,
  OFFENSE_MISMATCH_PRESSURE,
  DEFENSE_BALANCED_COVERAGE,
]);

export function makeTeamStrategySelection(
  offense: TeamStrategyReference = OFFENSE_BALANCED_READ,
  defense: TeamStrategyReference = DEFENSE_BALANCED_COVERAGE,
): TeamStrategySelection {
  return copyTeamStrategySelection({ offense, defense });
}

export function makeDefaultTeamStrategySelection(): TeamStrategySelection {
  return makeTeamStrategySelection();
}

export const DEFAULT_TEAM_STRATEGY_SELECTION = makeDefaultTeamStrategySelection();

export function copyTeamStrategySelection(
  input: TeamStrategySelection,
): TeamStrategySelection {
  if (!input || typeof input !== "object") {
    throw new Error("strategies must contain offense and defense strategy references");
  }
  const copyReference = (team: Team): TeamStrategyReference => {
    const reference = input[team];
    if (!reference || typeof reference.id !== "string" || !Number.isInteger(reference.version)) {
      throw new Error(`strategies.${team} must contain a string id and integer version`);
    }
    return Object.freeze({ id: reference.id, version: reference.version });
  };
  return Object.freeze({
    offense: copyReference("offense"),
    defense: copyReference("defense"),
  });
}

export function validateTeamStrategyProfile(
  input: TeamStrategyProfile,
  expectedTeam: Team = input?.team,
): TeamStrategyProfile {
  if (!input || typeof input !== "object") throw new Error("strategy profile must be an object");
  if (input.team !== "offense" && input.team !== "defense") {
    throw new Error(`strategy ${String(input.id)} must declare offense or defense team ownership`);
  }
  if (input.team !== expectedTeam) {
    throw new Error(`strategy ${input.id} belongs to ${input.team}, not ${expectedTeam}`);
  }
  if (!input.id || !Number.isInteger(input.version) || input.version < 1) {
    throw new Error("strategy id must be non-empty and version must be a positive integer");
  }
  if (!input.label || !input.description) {
    throw new Error(`strategy ${input.id} requires a label and description`);
  }

  for (const [phase, preferences] of Object.entries(input.phasePreferences)) {
    if (!phaseBelongsToTeam(phase as DecisionPhase, input.team)) {
      throw new Error(`strategy ${input.id} cannot configure opponent phase ${phase}`);
    }
    const seen = new Set<PlanId>();
    for (const preference of preferences ?? []) {
      if (!planBelongsToTeam(preference.planId, input.team)) {
        throw new Error(`strategy ${input.id} cannot adjust opponent plan ${preference.planId}`);
      }
      if (seen.has(preference.planId)) {
        throw new Error(`strategy ${input.id} repeats ${preference.planId} in ${phase}`);
      }
      if (!Number.isFinite(preference.adjustment) || !preference.reason) {
        throw new Error(`strategy ${input.id} has an invalid preference for ${preference.planId}`);
      }
      seen.add(preference.planId);
    }
  }

  return freezeProfile(input);
}

export function resolveRegisteredTeamStrategy(
  reference: TeamStrategyReference,
  expectedTeam: Team,
): TeamStrategyProfile {
  const profile = REGISTERED_STRATEGIES.get(reference.id);
  if (!profile) throw new Error(`Unknown ${expectedTeam} strategy: ${reference.id}`);
  if (profile.team !== expectedTeam) {
    throw new Error(`strategy ${reference.id} belongs to ${profile.team}, not ${expectedTeam}`);
  }
  if (profile.version !== reference.version) {
    throw new Error(
      `strategy ${reference.id} version ${reference.version} is unavailable; expected ${profile.version}`,
    );
  }
  return validateTeamStrategyProfile(profile, expectedTeam);
}

export function scoreCandidateWithStrategy(
  profile: TeamStrategyProfile,
  phase: DecisionPhase,
  candidate: StrategyScoreInput,
): StrategyScoreBreakdown {
  if (!phaseBelongsToTeam(phase, profile.team)) {
    throw new Error(`strategy ${profile.id} cannot read ${phase}`);
  }
  if (!planBelongsToTeam(candidate.planId, profile.team)) {
    throw new Error(`strategy ${profile.id} cannot adjust opponent plan ${candidate.planId}`);
  }
  if (!candidate.feasible || candidate.baseScore === null) {
    return {
      baseScore: candidate.baseScore,
      strategyAdjustment: 0,
      effectiveScore: null,
      strategyReason: `硬可行性否决优先；${profile.id} 未应用，不能恢复候选`,
    };
  }

  const preference = profile.phasePreferences[phase]?.find(
    (item) => item.planId === candidate.planId,
  );
  const adjustment = preference?.adjustment ?? 0;
  if (!Number.isFinite(adjustment)) {
    throw new Error(`strategy ${profile.id} produced a non-finite adjustment`);
  }
  const effectiveScore = Math.round((candidate.baseScore + adjustment) * 1000) / 1000;
  return {
    baseScore: candidate.baseScore,
    strategyAdjustment: adjustment,
    effectiveScore,
    strategyReason:
      preference?.reason ?? `${profile.id} 在 ${phase} 未配置该候选；默认调整 0`,
  };
}
