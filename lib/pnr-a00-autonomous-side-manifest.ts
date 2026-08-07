import type { InitialPlayerPositions } from "./pnr-core.ts";
import {
  F01_CANONICAL_STARTS,
  F01_FORMATION_INPUT_DOMAIN,
} from "./pnr-formation-domain.ts";
import { F02_FORMATION_SAMPLES } from "./pnr-f02-formation-samples.ts";
import { F03_HELDOUT_MANIFEST } from "./pnr-f03-heldout-manifest.ts";

export const A00_AUDIT_SEED = 20260811 as const;
export const A00_INPUT_HASH =
  "sha256:ed568eb77c78bc62cffa0dba06aa59df660bd7df181b2eb9b254c37d4887bcc4" as const;

export interface A00AutonomousSideInput {
  id: string;
  sourceStage: "F01" | "F02" | "F03";
  initialPositions: InitialPlayerPositions;
  seed: number;
  formationDomainVersion: typeof F01_FORMATION_INPUT_DOMAIN.version;
}

function copyPositions(input: InitialPlayerPositions): InitialPlayerPositions {
  return {
    O1: { ...input.O1 },
    O5: { ...input.O5 },
    D1: { ...input.D1 },
    D5: { ...input.D5 },
  };
}

function freezeInput(input: A00AutonomousSideInput): A00AutonomousSideInput {
  for (const point of Object.values(input.initialPositions)) Object.freeze(point);
  Object.freeze(input.initialPositions);
  return Object.freeze(input);
}

const selected = [
  ...[0, 1, 4, 7].map((index) => ({
    id: `A00-F01-${String(index + 1).padStart(2, "0")}`,
    sourceStage: "F01" as const,
    initialPositions: copyPositions(
      F01_CANONICAL_STARTS[index].tacticalPositions as InitialPlayerPositions,
    ),
  })),
  ...[1, 6, 9, 14].map((index) => ({
    id: `A00-F02-${String(index + 1).padStart(2, "0")}`,
    sourceStage: "F02" as const,
    initialPositions: copyPositions(
      F02_FORMATION_SAMPLES[index].tacticalPositions as InitialPlayerPositions,
    ),
  })),
  ...[0, 3, 8, 15].map((index) => ({
    id: `A00-F03-${String(index + 1).padStart(2, "0")}`,
    sourceStage: "F03" as const,
    initialPositions: copyPositions(F03_HELDOUT_MANIFEST[index].input.initialPositions),
  })),
].map((input, index) =>
  freezeInput({
    ...input,
    seed: A00_AUDIT_SEED + index,
    formationDomainVersion: F01_FORMATION_INPUT_DOMAIN.version,
  })
);

export const A00_AUTONOMOUS_SIDE_INPUTS = Object.freeze(selected);

export function canonicalA00InputJson(): string {
  return JSON.stringify(A00_AUTONOMOUS_SIDE_INPUTS);
}

const PROHIBITED_OUTPUT_FIELDS = new Set([
  "side",
  "anchor",
  "plan",
  "plans",
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
]);

export function findA00ProhibitedOutputFields(input: unknown): string[] {
  const failures: string[] = [];
  const visit = (value: unknown, path: string): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    for (const [key, nested] of Object.entries(value)) {
      if (PROHIBITED_OUTPUT_FIELDS.has(key.toLowerCase())) {
        failures.push(path ? `${path}.${key}` : key);
      }
      visit(nested, path ? `${path}.${key}` : key);
    }
  };
  visit(input, "");
  return failures;
}
