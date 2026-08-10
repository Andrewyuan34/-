import type { InitialPlayerPositions } from "./pnr-core.ts";

export const TACTICAL_INPUT_MANIFEST_VERSION = "minimum-t-inputs@1" as const;
export const TACTICAL_INPUT_HASH =
  "sha256:eccf50dbfaa532412bf854afaffcb6277d3b0908a3b882a2d94fa686c8e296f8" as const;

export interface TacticalManifestInput {
  id: string;
  stage: "T00" | "T01";
  focus:
    | "deep_drop_read"
    | "coverage_containment"
    | "chase_snake"
    | "chase_pocket";
  initialPositions: InitialPlayerPositions;
  o1MaxSpeed: number;
  seed: number;
}

function freezeInput(input: TacticalManifestInput): TacticalManifestInput {
  for (const point of Object.values(input.initialPositions)) Object.freeze(point);
  Object.freeze(input.initialPositions);
  return Object.freeze(input);
}

const presetOffense = Object.freeze({
  O1: Object.freeze({ x: 4.35, y: 6.58 }),
  O5: Object.freeze({ x: 6.62, y: 5.32 }),
});

function positions(
  D1: InitialPlayerPositions["D1"],
  D5: InitialPlayerPositions["D5"],
): InitialPlayerPositions {
  return {
    O1: { ...presetOffense.O1 },
    O5: { ...presetOffense.O5 },
    D1: { ...D1 },
    D5: { ...D5 },
  };
}

export const TACTICAL_MANIFEST_INPUTS = Object.freeze([
  freezeInput({
    id: "T00-C01",
    stage: "T00",
    focus: "deep_drop_read",
    initialPositions: positions({ x: 4.8, y: 3 }, { x: 6.4, y: 3.7 }),
    o1MaxSpeed: 3.72,
    seed: 17,
  }),
  freezeInput({
    id: "T00-C02",
    stage: "T00",
    focus: "coverage_containment",
    initialPositions: positions({ x: 4.4, y: 3.6 }, { x: 5.6, y: 3.7 }),
    o1MaxSpeed: 3.72,
    seed: 17,
  }),
  freezeInput({
    id: "T01-C01",
    stage: "T01",
    focus: "chase_snake",
    initialPositions: positions({ x: 3.6, y: 5.4 }, { x: 5.6, y: 3.7 }),
    o1MaxSpeed: 4.2,
    seed: 17,
  }),
  freezeInput({
    id: "T01-C02",
    stage: "T01",
    focus: "chase_pocket",
    initialPositions: positions({ x: 4.4, y: 5.1 }, { x: 6.25, y: 3.45 }),
    o1MaxSpeed: 3.72,
    seed: 17,
  }),
]);

export function canonicalTacticalInputJson(): string {
  return JSON.stringify({
    version: TACTICAL_INPUT_MANIFEST_VERSION,
    inputs: TACTICAL_MANIFEST_INPUTS,
  });
}

const PROHIBITED_OUTPUT_FIELDS = new Set([
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

export function findTacticalManifestOutputFields(input: unknown): string[] {
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
