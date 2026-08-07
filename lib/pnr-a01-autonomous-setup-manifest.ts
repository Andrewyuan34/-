import type { InitialPlayerPositions } from "./pnr-core.ts";
import { F01_FORMATION_INPUT_DOMAIN } from "./pnr-formation-domain.ts";
import { A00_AUTONOMOUS_SIDE_INPUTS } from "./pnr-a00-autonomous-side-manifest.ts";

export const A01_INPUT_HASH =
  "sha256:0518aadfcea925a6736f16bfaf4843f7c842290c1bff9c959f3c8afceaba42b6" as const;

export interface A01AutonomousSetupInput {
  id: string;
  sourceStage: "F01" | "F02" | "F03" | "domain_cross_combination";
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

function freezeInput(input: A01AutonomousSetupInput): A01AutonomousSetupInput {
  for (const point of Object.values(input.initialPositions)) Object.freeze(point);
  Object.freeze(input.initialPositions);
  return Object.freeze(input);
}

const inherited = A00_AUTONOMOUS_SIDE_INPUTS.map((input) =>
  freezeInput({
    id: input.id.replace("A00-", "A01-"),
    sourceStage: input.sourceStage,
    initialPositions: copyPositions(input.initialPositions),
    seed: input.seed,
    formationDomainVersion: input.formationDomainVersion,
  })
);

const crossCombination = freezeInput({
  id: "A01-X01",
  sourceStage: "domain_cross_combination",
  initialPositions: {
    O1: { x: 3.929588, y: 6.720009 },
    O5: { x: 6.465438, y: 6.78863 },
    D1: { x: 4.071446, y: 5.646071 },
    D5: { x: 6.245272, y: 5.458864 },
  },
  seed: 20260830,
  formationDomainVersion: F01_FORMATION_INPUT_DOMAIN.version,
});

export const A01_AUTONOMOUS_SETUP_INPUTS = Object.freeze([
  ...inherited,
  crossCombination,
]);

export function canonicalA01InputJson(): string {
  return JSON.stringify(A01_AUTONOMOUS_SETUP_INPUTS);
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

export function findA01ProhibitedOutputFields(input: unknown): string[] {
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
