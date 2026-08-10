import {
  FIXED_DT,
  FORMATION_LANDMARK_OFFSETS,
  FORMATION_TACTICAL_INTEGRATION_VERSION,
  MINIMUM_TACTICAL_VOCABULARY_VERSION,
  copyInitialPlayerPositions,
  deriveTacticalLandmarks,
  mirrorInitialPlayerPositions,
  validateInitialPlayerPositions,
  type FormationLandmarkOffsets,
  type InitialPlayerPositions,
  type TerminalState,
} from "./pnr-core.ts";
import { A01_AUTONOMOUS_SETUP_INPUTS } from "./pnr-a01-autonomous-setup-manifest.ts";
import {
  F02_FORMATION_SAMPLES,
  createFormationMulberry32,
  sampleF01FormationParameters,
} from "./pnr-f02-formation-samples.ts";
import { F03_HELDOUT_MANIFEST } from "./pnr-f03-heldout-manifest.ts";
import {
  F01_CANONICAL_STARTS,
  F01_FORMATION_INPUT_DOMAIN,
  assertFormationInputInF01Domain,
  copyFormationDomainPositions,
  makeFormationTacticalPositions,
  type FormationDomainPositions,
  type FormationInputParameters,
} from "./pnr-formation-domain.ts";
import {
  I00_ALLOWED_TERMINALS,
  I00_CONTRACT_VERSION,
  I00_MANIFEST_HASH,
  I00_RUNTIME_CONTRACT,
} from "./pnr-integration-manifest.ts";
import { P03_POLICY_MATCHUPS } from "./pnr-p03-policy-matrix.ts";
import {
  DEFENSE_BALANCED_COVERAGE,
  DEFENSE_EARLY_DIG,
  DEFENSE_MISMATCH_PRESSURE,
  OFFENSE_BALANCED_READ,
  OFFENSE_MISMATCH_PRESSURE,
  type TeamStrategyReference,
} from "./pnr-strategy.ts";

export const V00_CONTRACT_VERSION = "locked-integrated-validation-contract@1" as const;
export const V00_INPUT_MANIFEST_VERSION = "locked-integrated-validation-inputs@1" as const;
export const V00_EVIDENCE_VERSION = "locked-integrated-validation-evidence@1" as const;
export const V00_ROLLBACK_COMMIT =
  "28cf70e8c95710665f7ee2322a2dca8ff57e1951" as const;
export const V00_BEHAVIOR_COMMIT =
  "6f7af556823f372b012053b7eaa8ea194be7b5df" as const;
export const V00_MANIFEST_SEED = 20260811 as const;
export const V00_SIMULATION_SEED_BASE = 20261000 as const;
export const V00_INPUT_COUNT = 12 as const;
export const V00_MANIFEST_HASH =
  "sha256:1fef82a37a1d610dcd8e5b91b00a123fd46312c8bb71c46566093cd4c57dd27a" as const;

export const V00_UPSTREAM_CONTRACT = Object.freeze({
  integratedCheckpoint: V00_ROLLBACK_COMMIT,
  behaviorCheckpoint: V00_BEHAVIOR_COMMIT,
  integrationContractVersion: I00_CONTRACT_VERSION,
  integrationInputHash: I00_MANIFEST_HASH,
  formationDomainVersion: F01_FORMATION_INPUT_DOMAIN.version,
  tacticalVocabularyVersion: MINIMUM_TACTICAL_VOCABULARY_VERSION,
  integrationVersion: FORMATION_TACTICAL_INTEGRATION_VERSION,
  policyCheckpoint: "c4ada7d" as const,
});

export const V00_RUNTIME_CONTRACT = Object.freeze({
  setupMode: I00_RUNTIME_CONTRACT.setupMode,
  startMode: I00_RUNTIME_CONTRACT.startMode,
  horizon: I00_RUNTIME_CONTRACT.horizon,
  fixedDt: FIXED_DT,
  maxTime: I00_RUNTIME_CONTRACT.maxTime,
  o1MaxSpeed: I00_RUNTIME_CONTRACT.o1MaxSpeed,
  d1FrontReactionDelay: I00_RUNTIME_CONTRACT.d1FrontReactionDelay,
  d1PostCatchRecoveryDelay: I00_RUNTIME_CONTRACT.d1PostCatchRecoveryDelay,
  formationDomainVersion: F01_FORMATION_INPUT_DOMAIN.version,
  tacticalVocabularyVersion: MINIMUM_TACTICAL_VOCABULARY_VERSION,
  integrationVersion: FORMATION_TACTICAL_INTEGRATION_VERSION,
});

const STRATEGY_REFERENCES = Object.freeze({
  [OFFENSE_BALANCED_READ.id]: Object.freeze({
    id: OFFENSE_BALANCED_READ.id,
    version: OFFENSE_BALANCED_READ.version,
  }),
  [OFFENSE_MISMATCH_PRESSURE.id]: Object.freeze({
    id: OFFENSE_MISMATCH_PRESSURE.id,
    version: OFFENSE_MISMATCH_PRESSURE.version,
  }),
  [DEFENSE_BALANCED_COVERAGE.id]: Object.freeze({
    id: DEFENSE_BALANCED_COVERAGE.id,
    version: DEFENSE_BALANCED_COVERAGE.version,
  }),
  [DEFENSE_MISMATCH_PRESSURE.id]: Object.freeze({
    id: DEFENSE_MISMATCH_PRESSURE.id,
    version: DEFENSE_MISMATCH_PRESSURE.version,
  }),
  [DEFENSE_EARLY_DIG.id]: Object.freeze({
    id: DEFENSE_EARLY_DIG.id,
    version: DEFENSE_EARLY_DIG.version,
  }),
});

export const V00_STRATEGY_MATCHUPS = Object.freeze(
  P03_POLICY_MATCHUPS.map((matchup) => Object.freeze({
    id: matchup.id,
    offense: STRATEGY_REFERENCES[matchup.offenseStrategyId] as TeamStrategyReference,
    defense: STRATEGY_REFERENCES[matchup.defenseStrategyId] as TeamStrategyReference,
  })),
);

export const V00_EXECUTION_ORDER = Object.freeze({
  inputs: "manifest-order" as const,
  matchups: Object.freeze(V00_STRATEGY_MATCHUPS.map((matchup) => matchup.id)),
  worlds: Object.freeze(["right-canonical", "left-true-mirror"] as const),
  perWorld: Object.freeze(["primary", "duplicate", "defense-first"] as const),
  flattenedSimulations: Object.freeze([
    "right-primary",
    "right-duplicate",
    "right-defense-first",
    "left-primary",
    "left-duplicate",
    "left-defense-first",
  ] as const),
  scheduler: "six-simulation-tick-lockstep" as const,
  terminalMismatchPolicy:
    "record first mismatch, then continue every nonterminal simulation through its terminal or the locked watchdog",
});

export const V00_ALLOWED_TERMINALS = Object.freeze(
  [...I00_ALLOWED_TERMINALS] as TerminalState["reason"][],
);

export const V00_PASS_THRESHOLDS = Object.freeze({
  mirrorMaximumError: 1e-9,
  minimumTeammateBodyGap: 0.06 - 1e-6,
  requiredRepresentativeReplayCount: 4,
});

export const V00_REQUIRED_GATES = Object.freeze([
  "manifest_input_only_hash",
  "all_locked_inputs_in_domain",
  "determinism",
  "true_world_mirror",
  "continuous_phase_and_possession",
  "legal_state_and_action",
  "strategy_reference_carry",
  "defense_first_equivalence",
  "planner_information_boundary",
  "role_ownership",
  "route_and_ball_ownership",
  "hard_veto_priority",
  "public_event_causality",
  "tactical_completion_or_safe_exit",
  "teammate_channel_and_pocket_integrity",
  "no_remote_screen",
  "strategy_effect_requires_adjustment",
] as const);

export const V00_OUT_OF_DOMAIN_POLICY = Object.freeze({
  generatorExclusions: Object.freeze([
    "parameter_outside_F01_v1",
    "invalid_initial_geometry",
    "duplicate_generated_input",
    "duplicate_prior_F_A_I_input",
  ] as const),
  lockedInputRule:
    "Every accepted manifest input is in-domain. A lock-time preflight failure in V01 is reported as out_of_domain_contract_failure and fails V01; it is never excluded or replaced.",
  safeExitRule:
    "formation_aborted and formation_timeout are allowed in-domain safe exits, never out-of-domain classifications.",
});

export const V00_REPRESENTATIVE_REPLAY_RULE = Object.freeze({
  selectionTiming: "after-all-locked-cells" as const,
  passingSlots: Object.freeze([
    "longest_terminal_tick_then_cell_order_right",
    "smallest_teammate_body_gap_then_cell_order_right",
    "first_formed_non_default_matchup_then_cell_order_right",
    "true_left_mirror_of_longest_terminal",
  ] as const),
  failureOverride: Object.freeze([
    "slot_1_first_failed_cell_right",
    "slot_2_first_failed_cell_left_mirror",
  ] as const),
  tieBreak: "manifest-order, then locked matchup-order" as const,
  categoryFallback: "first-passing-cell-in-locked-order" as const,
  nonRunnableFailureFallback:
    "keep the first failed input/matchup as an unresolved replay reproduction; use it for missing slots rather than selecting around the failure",
});

export const V00_EVIDENCE_CONTRACT = Object.freeze({
  version: V00_EVIDENCE_VERSION,
  path: "outputs/v01-integrated-validation.json" as const,
  requiredSections: Object.freeze([
    "contract",
    "execution",
    "aggregate",
    "terminalHistogram",
    "classifications",
    "failures",
    "cells",
    "representativeReplays",
  ] as const),
  minimumReproductionKey:
    "input/matchup:code; append side/execution@tick when identified by the shared audit" as const,
});

export const V00_REPOSITORY_GATES = Object.freeze([
  "context_check",
  "test",
  "lint",
  "build",
  "diff_check",
] as const);

export interface V00ValidationInputSource {
  generator: "mulberry32-v1";
  seed: typeof V00_MANIFEST_SEED;
  candidateIndex: number;
  tacticalFrame: "right-canonical";
  domainVersion: typeof F01_FORMATION_INPUT_DOMAIN.version;
  parameters: Readonly<FormationInputParameters>;
}

export interface V00ValidationInput {
  id: string;
  initialPositions: InitialPlayerPositions;
  seed: number;
  source: V00ValidationInputSource;
}

interface GeneratedManifest {
  inputs: V00ValidationInput[];
  candidateCount: number;
  geometryRejectedCount: number;
  duplicateRejectedCount: number;
  priorInputRejectedCount: number;
}

function copyOffsets(): FormationLandmarkOffsets {
  return {
    screenAnchor: { ...FORMATION_LANDMARK_OFFSETS.screenAnchor },
    handlerWaitingPoint: { ...FORMATION_LANDMARK_OFFSETS.handlerWaitingPoint },
    useGate: { ...FORMATION_LANDMARK_OFFSETS.useGate },
    rejectGate: { ...FORMATION_LANDMARK_OFFSETS.rejectGate },
  };
}

function validateCandidateGeometry(
  parameters: FormationInputParameters,
): FormationDomainPositions {
  const candidate = makeFormationTacticalPositions(parameters) as InitialPlayerPositions;
  const positions = validateInitialPlayerPositions(candidate);
  assertFormationInputInF01Domain(positions);
  deriveTacticalLandmarks("form_pnr", positions, "right", copyOffsets());
  const mirror = mirrorInitialPlayerPositions(positions);
  validateInitialPlayerPositions(mirror);
  deriveTacticalLandmarks("form_pnr", mirror, "left", copyOffsets());
  return copyFormationDomainPositions(positions);
}

function freezeInput(input: V00ValidationInput): V00ValidationInput {
  for (const position of Object.values(input.initialPositions)) Object.freeze(position);
  Object.freeze(input.initialPositions);
  Object.freeze(input.source.parameters);
  Object.freeze(input.source);
  return Object.freeze(input);
}

function priorInputKeys(): Set<string> {
  const keys = new Set<string>();
  const add = (positions: InitialPlayerPositions): void => {
    keys.add(JSON.stringify(positions));
    keys.add(JSON.stringify(mirrorInitialPlayerPositions(positions)));
  };
  F01_CANONICAL_STARTS.forEach((input) => add(input.tacticalPositions));
  F02_FORMATION_SAMPLES.forEach((input) => add(input.tacticalPositions));
  F03_HELDOUT_MANIFEST.forEach((input) =>
    add(makeFormationTacticalPositions(input.source.parameters)));
  A01_AUTONOMOUS_SETUP_INPUTS.forEach((input) => add(input.initialPositions));
  return keys;
}

function generateManifest(): GeneratedManifest {
  const next = createFormationMulberry32(V00_MANIFEST_SEED);
  const inputs: V00ValidationInput[] = [];
  const prior = priorInputKeys();
  const accepted = new Set<string>();
  let candidateCount = 0;
  let geometryRejectedCount = 0;
  let duplicateRejectedCount = 0;
  let priorInputRejectedCount = 0;

  while (inputs.length < V00_INPUT_COUNT) {
    candidateCount += 1;
    if (candidateCount > 10_000) {
      throw new Error("V00 validation manifest generator exhausted its deterministic guard");
    }
    const parameters = sampleF01FormationParameters(next);
    let initialPositions: FormationDomainPositions;
    try {
      initialPositions = validateCandidateGeometry(parameters);
    } catch {
      geometryRejectedCount += 1;
      continue;
    }
    const key = JSON.stringify(initialPositions);
    if (prior.has(key)) {
      priorInputRejectedCount += 1;
      continue;
    }
    if (accepted.has(key)) {
      duplicateRejectedCount += 1;
      continue;
    }
    accepted.add(key);
    const acceptedIndex = inputs.length + 1;
    inputs.push(freezeInput({
      id: `V00-C${String(acceptedIndex).padStart(2, "0")}`,
      initialPositions: copyInitialPlayerPositions(initialPositions),
      seed: V00_SIMULATION_SEED_BASE + acceptedIndex,
      source: {
        generator: "mulberry32-v1",
        seed: V00_MANIFEST_SEED,
        candidateIndex: candidateCount,
        tacticalFrame: "right-canonical",
        domainVersion: F01_FORMATION_INPUT_DOMAIN.version,
        parameters: { ...parameters },
      },
    }));
  }

  return {
    inputs,
    candidateCount,
    geometryRejectedCount,
    duplicateRejectedCount,
    priorInputRejectedCount,
  };
}

const generated = generateManifest();

export const V00_VALIDATION_INPUTS = Object.freeze(generated.inputs);

export const V00_MANIFEST_GENERATION = Object.freeze({
  generator: "mulberry32-v1" as const,
  seed: V00_MANIFEST_SEED,
  simulationSeedBase: V00_SIMULATION_SEED_BASE,
  domainVersion: F01_FORMATION_INPUT_DOMAIN.version,
  requestedCount: V00_INPUT_COUNT,
  candidateCount: generated.candidateCount,
  geometryRejectedCount: generated.geometryRejectedCount,
  duplicateRejectedCount: generated.duplicateRejectedCount,
  priorInputRejectedCount: generated.priorInputRejectedCount,
  acceptedCount: generated.inputs.length,
});

export function canonicalV00ManifestJson(): string {
  return JSON.stringify({
    contractVersion: V00_CONTRACT_VERSION,
    inputManifestVersion: V00_INPUT_MANIFEST_VERSION,
    rollbackCommit: V00_ROLLBACK_COMMIT,
    behaviorCommit: V00_BEHAVIOR_COMMIT,
    upstream: V00_UPSTREAM_CONTRACT,
    generation: V00_MANIFEST_GENERATION,
    runtime: V00_RUNTIME_CONTRACT,
    strategyMatchups: V00_STRATEGY_MATCHUPS,
    executionOrder: V00_EXECUTION_ORDER,
    allowedTerminals: V00_ALLOWED_TERMINALS,
    passThresholds: V00_PASS_THRESHOLDS,
    requiredGates: V00_REQUIRED_GATES,
    outOfDomainPolicy: V00_OUT_OF_DOMAIN_POLICY,
    representativeReplayRule: V00_REPRESENTATIVE_REPLAY_RULE,
    evidence: V00_EVIDENCE_CONTRACT,
    repositoryGates: V00_REPOSITORY_GATES,
    inputs: V00_VALIDATION_INPUTS,
  });
}

const PROHIBITED_INPUT_FIELDS = new Set([
  "side",
  "screenside",
  "anchor",
  "anchorid",
  "formationlandmarkoffsets",
  "tacticallandmarks",
  "plan",
  "planid",
  "plans",
  "branch",
  "event",
  "events",
  "terminal",
  "terminalreason",
  "outcome",
  "result",
  "score",
  "success",
  "failure",
  "passed",
  "expected",
  "expectedterminal",
]);

export function findV00ProhibitedInputFields(input: unknown): string[] {
  const failures: string[] = [];
  const visit = (value: unknown, path: string): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    for (const [key, nested] of Object.entries(value)) {
      if (PROHIBITED_INPUT_FIELDS.has(key.toLowerCase())) {
        failures.push(path ? `${path}.${key}` : key);
      }
      visit(nested, path ? `${path}.${key}` : key);
    }
  };
  visit(input, "");
  return failures;
}
