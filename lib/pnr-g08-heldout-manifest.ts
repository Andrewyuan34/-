import {
  PLAYER_IDS,
  mirrorInitialPlayerPositions,
  validateInitialPlayerPositions,
  type InitialPlayerPositions,
  type ScreenSide,
  type SimulationConfig,
} from "./pnr-core.ts";
import { NEUTRAL_INITIAL_POSITIONS } from "./pnr-scenarios.ts";

export const G08_FROZEN_CORE_COMMIT =
  "d92ed9f63bba3dcfa28d65d54b6a47c7e3e1f74c" as const;
export const G08_MANIFEST_SEED = 20260808 as const;
export const G08_SIMULATION_SEED = 17 as const;
export const G08_COMMON_HORIZON = "post_catch_resolution" as const;
export const G08_COMMON_MAX_TIME = 7.4 as const;
export const G08_MANIFEST_HASH =
  "sha256:5ff19401f264663f5d5fcfc2e944cb1e0ef4430093a11281193f7f8d8d07fee3" as const;

export const G08_INPUT_DOMAIN = Object.freeze({
  formationTranslationX: Object.freeze([-0.15, 0.15] as const),
  formationTranslationY: Object.freeze([-0.12, 0.12] as const),
  o5RelativeX: Object.freeze([-0.08, 0.08] as const),
  o5RelativeY: Object.freeze([-0.08, 0.08] as const),
  d1RelativeX: Object.freeze([-0.08, 0.08] as const),
  d1RelativeY: Object.freeze([-0.08, 0.08] as const),
  d5RelativeX: Object.freeze([-0.08, 0.08] as const),
  d5RelativeY: Object.freeze([-0.08, 0.08] as const),
  o1MaxSpeed: Object.freeze([3.73, 4.07] as const),
  d1FrontReactionDelay: Object.freeze([0.003, 0.157] as const),
  d1PostCatchRecoveryDelay: Object.freeze([0.015, 0.585] as const),
});

export interface G08TacticalOffsets {
  formation: Readonly<{ x: number; y: number }>;
  O5: Readonly<{ x: number; y: number }>;
  D1: Readonly<{ x: number; y: number }>;
  D5: Readonly<{ x: number; y: number }>;
}

export interface G08ManifestSource {
  generator: "mulberry32-v1";
  candidateIndex: number;
  tacticalFrame: "right-canonical";
  offsets: G08TacticalOffsets;
}

export interface G08ManifestItem {
  id: string;
  side: ScreenSide;
  source: G08ManifestSource;
  input: SimulationConfig;
}

interface GeneratedManifest {
  items: G08ManifestItem[];
  candidateCount: number;
  geometryRejectedCount: number;
  duplicateRejectedCount: number;
}

const PROHIBITED_OUTPUT_FIELDS = new Set([
  "plan",
  "winner",
  "ballowner",
  "terminal",
  "terminalreason",
  "outcome",
  "result",
  "score",
  "expected",
  "label",
]);

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleRange(next: () => number, range: readonly [number, number]): number {
  return round3(range[0] + (range[1] - range[0]) * next());
}

function isOnGrid(value: number, origin: number, step: number): boolean {
  const units = (value - origin) / step;
  return Math.abs(units - Math.round(units)) <= 1e-9;
}

function sampleOffGrid(
  next: () => number,
  range: readonly [number, number],
  origin: number,
  step: number,
): number {
  const sampled = sampleRange(next, range);
  if (!isOnGrid(sampled, origin, step)) return sampled;
  return round3(sampled + 0.001 <= range[1] ? sampled + 0.001 : sampled - 0.001);
}

function makeOffsets(next: () => number): G08TacticalOffsets {
  return {
    formation: {
      x: sampleRange(next, G08_INPUT_DOMAIN.formationTranslationX),
      y: sampleRange(next, G08_INPUT_DOMAIN.formationTranslationY),
    },
    O5: {
      x: sampleRange(next, G08_INPUT_DOMAIN.o5RelativeX),
      y: sampleRange(next, G08_INPUT_DOMAIN.o5RelativeY),
    },
    D1: {
      x: sampleRange(next, G08_INPUT_DOMAIN.d1RelativeX),
      y: sampleRange(next, G08_INPUT_DOMAIN.d1RelativeY),
    },
    D5: {
      x: sampleRange(next, G08_INPUT_DOMAIN.d5RelativeX),
      y: sampleRange(next, G08_INPUT_DOMAIN.d5RelativeY),
    },
  };
}

function makeTacticalPositions(offsets: G08TacticalOffsets): InitialPlayerPositions {
  const formation = offsets.formation;
  return {
    O1: {
      x: round3(NEUTRAL_INITIAL_POSITIONS.O1.x + formation.x),
      y: round3(NEUTRAL_INITIAL_POSITIONS.O1.y + formation.y),
    },
    O5: {
      x: round3(NEUTRAL_INITIAL_POSITIONS.O5.x + formation.x + offsets.O5.x),
      y: round3(NEUTRAL_INITIAL_POSITIONS.O5.y + formation.y + offsets.O5.y),
    },
    D1: {
      x: round3(NEUTRAL_INITIAL_POSITIONS.D1.x + formation.x + offsets.D1.x),
      y: round3(NEUTRAL_INITIAL_POSITIONS.D1.y + formation.y + offsets.D1.y),
    },
    D5: {
      x: round3(NEUTRAL_INITIAL_POSITIONS.D5.x + formation.x + offsets.D5.x),
      y: round3(NEUTRAL_INITIAL_POSITIONS.D5.y + formation.y + offsets.D5.y),
    },
  };
}

function roundPositions3(positions: InitialPlayerPositions): InitialPlayerPositions {
  return Object.fromEntries(
    PLAYER_IDS.map((id) => [
      id,
      { x: round3(positions[id].x), y: round3(positions[id].y) },
    ]),
  ) as unknown as InitialPlayerPositions;
}

function freezeManifestItem(item: G08ManifestItem): G08ManifestItem {
  for (const id of PLAYER_IDS) Object.freeze(item.input.initialPositions[id]);
  Object.freeze(item.input.initialPositions);
  Object.freeze(item.input);
  Object.freeze(item.source.offsets.formation);
  Object.freeze(item.source.offsets.O5);
  Object.freeze(item.source.offsets.D1);
  Object.freeze(item.source.offsets.D5);
  Object.freeze(item.source.offsets);
  Object.freeze(item.source);
  return Object.freeze(item);
}

function generateManifest(): GeneratedManifest {
  const next = createMulberry32(G08_MANIFEST_SEED);
  const items: G08ManifestItem[] = [];
  const seenInputs = new Set<string>();
  let candidateCount = 0;
  let geometryRejectedCount = 0;
  let duplicateRejectedCount = 0;

  for (const side of ["right", "left"] as const) {
    let acceptedForSide = 0;
    while (acceptedForSide < 12) {
      candidateCount += 1;
      if (candidateCount > 10000) throw new Error("G08 manifest generator exhausted its guard");

      const offsets = makeOffsets(next);
      const o1MaxSpeed = sampleOffGrid(next, G08_INPUT_DOMAIN.o1MaxSpeed, 3.72, 0.02);
      const d1FrontReactionDelay = sampleOffGrid(
        next,
        G08_INPUT_DOMAIN.d1FrontReactionDelay,
        0,
        0.01,
      );
      const d1PostCatchRecoveryDelay = sampleOffGrid(
        next,
        G08_INPUT_DOMAIN.d1PostCatchRecoveryDelay,
        0,
        0.03,
      );
      const tacticalPositions = makeTacticalPositions(offsets);

      let initialPositions: InitialPlayerPositions;
      try {
        const legalTacticalPositions = validateInitialPlayerPositions(tacticalPositions);
        initialPositions = validateInitialPlayerPositions(
          roundPositions3(
            side === "right"
              ? legalTacticalPositions
              : mirrorInitialPlayerPositions(legalTacticalPositions),
          ),
        );
      } catch {
        geometryRejectedCount += 1;
        continue;
      }

      const input: SimulationConfig = {
        initialPositions,
        screenSide: side,
        seed: G08_SIMULATION_SEED,
        maxTime: G08_COMMON_MAX_TIME,
        d1FrontReactionDelay,
        d1PostCatchRecoveryDelay,
        o1MaxSpeed,
        horizon: G08_COMMON_HORIZON,
      };
      const inputKey = JSON.stringify(input);
      if (seenInputs.has(inputKey)) {
        duplicateRejectedCount += 1;
        continue;
      }
      seenInputs.add(inputKey);

      acceptedForSide += 1;
      items.push(
        freezeManifestItem({
          id: `G08-${side === "right" ? "R" : "L"}${String(acceptedForSide).padStart(2, "0")}`,
          side,
          source: {
            generator: "mulberry32-v1",
            candidateIndex: candidateCount,
            tacticalFrame: "right-canonical",
            offsets,
          },
          input,
        }),
      );
    }
  }

  return {
    items,
    candidateCount,
    geometryRejectedCount,
    duplicateRejectedCount,
  };
}

const generated = generateManifest();

export const G08_HELDOUT_MANIFEST = Object.freeze(generated.items);

export const G08_MANIFEST_GENERATION = Object.freeze({
  generator: "mulberry32-v1" as const,
  candidateCount: generated.candidateCount,
  geometryRejectedCount: generated.geometryRejectedCount,
  duplicateRejectedCount: generated.duplicateRejectedCount,
  acceptedCount: generated.items.length,
  rightCount: generated.items.filter((item) => item.side === "right").length,
  leftCount: generated.items.filter((item) => item.side === "left").length,
});

export function canonicalG08ManifestJson(): string {
  return JSON.stringify(G08_HELDOUT_MANIFEST);
}

export function findG08ProhibitedOutputFields(value: unknown): string[] {
  const found = new Set<string>();
  const visit = (current: unknown): void => {
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (!current || typeof current !== "object") return;
    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      if (PROHIBITED_OUTPUT_FIELDS.has(key.toLowerCase())) found.add(key);
      visit(child);
    }
  };
  visit(value);
  return [...found].sort();
}

export function isG08ValueOnPriorGrid(
  kind: "speed" | "front" | "recovery",
  value: number,
): boolean {
  if (kind === "speed") return isOnGrid(value, 3.72, 0.02);
  if (kind === "front") return isOnGrid(value, 0, 0.01);
  return isOnGrid(value, 0, 0.03);
}
