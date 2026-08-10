import {
  FIXED_DT,
  FORMATION_TACTICAL_INTEGRATION_VERSION,
  MINIMUM_TACTICAL_VOCABULARY_VERSION,
  type InitialPlayerPositions,
  type TerminalState,
} from "./pnr-core.ts";
import {
  A01_AUTONOMOUS_SETUP_INPUTS,
  A01_INPUT_HASH,
} from "./pnr-a01-autonomous-setup-manifest.ts";
import { F01_FORMATION_INPUT_DOMAIN } from "./pnr-formation-domain.ts";
import {
  TACTICAL_INPUT_HASH,
  TACTICAL_INPUT_MANIFEST_VERSION,
} from "./pnr-tactical-manifest.ts";
import {
  DEFENSE_BALANCED_COVERAGE,
  OFFENSE_BALANCED_READ,
} from "./pnr-strategy.ts";

export const I00_CONTRACT_VERSION = "formation-minimum-t-contract@1" as const;
export const I00_INPUT_MANIFEST_VERSION = "formation-minimum-t-inputs@1" as const;
export const I00_ROLLBACK_COMMIT = "7eb4bd2" as const;
export const I00_MANIFEST_HASH =
  "sha256:e4b0bec29c54b51157ae0b82681eb7f7ad01c5222f2e6802eab7ee0cd27d7554" as const;

export const I00_UPSTREAM_CONTRACT = Object.freeze({
  autonomousCheckpoint: "7ecedea" as const,
  formationDomainVersion: F01_FORMATION_INPUT_DOMAIN.version,
  autonomousInputHash: A01_INPUT_HASH,
  tacticalCheckpoint: "e735f47" as const,
  tacticalVocabularyVersion: MINIMUM_TACTICAL_VOCABULARY_VERSION,
  tacticalInputManifestVersion: TACTICAL_INPUT_MANIFEST_VERSION,
  tacticalInputHash: TACTICAL_INPUT_HASH,
});

export const I00_RUNTIME_CONTRACT = Object.freeze({
  integrationVersion: FORMATION_TACTICAL_INTEGRATION_VERSION,
  setupMode: "auto" as const,
  startMode: "form_pnr" as const,
  horizon: "tactical_resolution" as const,
  fixedDt: FIXED_DT,
  maxTime: 7.4,
  o1MaxSpeed: 3.72,
  d1FrontReactionDelay: 0,
  d1PostCatchRecoveryDelay: 0,
});

export const I00_STRATEGY_CONTRACT = Object.freeze({
  offense: Object.freeze({
    id: OFFENSE_BALANCED_READ.id,
    version: OFFENSE_BALANCED_READ.version,
  }),
  defense: Object.freeze({
    id: DEFENSE_BALANCED_COVERAGE.id,
    version: DEFENSE_BALANCED_COVERAGE.version,
  }),
  requiredAdjustment: 0 as const,
});

export const I00_ALLOWED_TERMINALS = Object.freeze([
  "formation_aborted",
  "formation_timeout",
  "tactical_drive_advantage",
  "tactical_pullup_window",
  "tactical_snake_advantage",
  "tactical_pocket_caught",
  "tactical_contained",
  "pass_denied",
] as const satisfies readonly TerminalState["reason"][]);

export const I00_REQUIRED_GATES = Object.freeze([
  "manifest_input_only_hash",
  "explicit_integration_opt_in",
  "legacy_trace_identity",
  "same_simulation_world_identity",
  "formation_ready_next_boundary",
  "monotonic_tick_time",
  "player_position_velocity_continuity",
  "ball_ownership_state_continuity",
  "no_tactical_read_before_handoff",
  "public_event_causality",
  "determinism",
  "defense_first_equivalence",
  "true_world_mirror",
  "planner_information_boundary",
  "formation_safe_exit",
  "allowed_terminal",
  "default_zero_adjustment",
  "sealed_A_T_regression",
] as const);

export const I00_REPOSITORY_GATES = Object.freeze([
  "context_check",
  "test",
  "lint",
  "build",
  "diff_check",
] as const);

export interface I00IntegrationInput {
  id: string;
  initialPositions: InitialPlayerPositions;
  seed: number;
}

function freezeInput(input: I00IntegrationInput): I00IntegrationInput {
  for (const point of Object.values(input.initialPositions)) Object.freeze(point);
  Object.freeze(input.initialPositions);
  return Object.freeze(input);
}

export const I00_INTEGRATION_INPUTS = Object.freeze(
  A01_AUTONOMOUS_SETUP_INPUTS.map((input, index) =>
    freezeInput({
      id: `I00-C${String(index + 1).padStart(2, "0")}`,
      initialPositions: {
        O1: { ...input.initialPositions.O1 },
        O5: { ...input.initialPositions.O5 },
        D1: { ...input.initialPositions.D1 },
        D5: { ...input.initialPositions.D5 },
      },
      seed: input.seed,
    })
  ),
);

export function canonicalI00ManifestJson(): string {
  return JSON.stringify({
    contractVersion: I00_CONTRACT_VERSION,
    inputManifestVersion: I00_INPUT_MANIFEST_VERSION,
    rollbackCommit: I00_ROLLBACK_COMMIT,
    upstream: I00_UPSTREAM_CONTRACT,
    runtime: I00_RUNTIME_CONTRACT,
    strategies: I00_STRATEGY_CONTRACT,
    allowedTerminals: I00_ALLOWED_TERMINALS,
    requiredGates: I00_REQUIRED_GATES,
    repositoryGates: I00_REPOSITORY_GATES,
    inputs: I00_INTEGRATION_INPUTS,
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

export function findI00ProhibitedInputFields(input: unknown): string[] {
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
