import {
  FORMATION_LANDMARK_OFFSETS,
  deriveTacticalLandmarks,
  validateInitialPlayerPositions,
  type FormationLandmarkOffsets,
  type InitialPlayerPositions,
} from "./pnr-core.ts";
import {
  F01_CANONICAL_STARTS,
  F01_FORMATION_INPUT_DOMAIN,
  copyFormationDomainPositions,
  makeFormationTacticalPositions,
  type FormationDomainPositions,
  type FormationInputParameters,
  type FormationParameterName,
} from "./pnr-formation-domain.ts";

export const F02_SAMPLE_SEED = 20260809 as const;
export const F02_CANONICAL_SAMPLE_COUNT = 16 as const;
export const F02_INPUT_HASH =
  "sha256:9e92f30216aba6d76be9ba9a54197e511a03015dff68bf2b814fd54aa35f63b6" as const;

export interface F02FormationSample {
  id: string;
  tacticalPositions: FormationDomainPositions;
  source: Readonly<{
    generator: "mulberry32-v1";
    seed: typeof F02_SAMPLE_SEED;
    candidateIndex: number;
    domainVersion: typeof F01_FORMATION_INPUT_DOMAIN.version;
    parameters: Readonly<FormationInputParameters>;
  }>;
}

interface F02GeneratedSamples {
  samples: F02FormationSample[];
  candidateCount: number;
  geometryRejectedCount: number;
  duplicateRejectedCount: number;
}

const PARAMETER_NAMES = Object.freeze([
  "handlerOriginX",
  "handlerOriginY",
  "screenerApproachDistance",
  "screenerApproachAngle",
  "d1GoalSideDepth",
  "d1LateralShade",
  "d5GoalSideDepth",
  "d5LateralShade",
] as const satisfies readonly FormationParameterName[]);

function copyOffsets(): FormationLandmarkOffsets {
  return {
    screenAnchor: { ...FORMATION_LANDMARK_OFFSETS.screenAnchor },
    handlerWaitingPoint: { ...FORMATION_LANDMARK_OFFSETS.handlerWaitingPoint },
    useGate: { ...FORMATION_LANDMARK_OFFSETS.useGate },
    rejectGate: { ...FORMATION_LANDMARK_OFFSETS.rejectGate },
  };
}

export function createFormationMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function sampleRange(
  next: () => number,
  range: readonly [number, number],
): number {
  return round6(range[0] + (range[1] - range[0]) * next());
}

export function sampleF01FormationParameters(
  next: () => number,
): FormationInputParameters {
  return Object.fromEntries(
    PARAMETER_NAMES.map((name) => [
      name,
      sampleRange(next, F01_FORMATION_INPUT_DOMAIN.parameters[name]),
    ]),
  ) as unknown as FormationInputParameters;
}

function geometryValidatedPositions(
  parameters: FormationInputParameters,
): FormationDomainPositions {
  const candidate = makeFormationTacticalPositions(parameters) as InitialPlayerPositions;
  const positions = validateInitialPlayerPositions(candidate);
  deriveTacticalLandmarks(
    "form_pnr",
    positions,
    "right",
    copyOffsets(),
  );
  return copyFormationDomainPositions(positions);
}

function freezeSample(sample: F02FormationSample): F02FormationSample {
  Object.freeze(sample.tacticalPositions.O1);
  Object.freeze(sample.tacticalPositions.O5);
  Object.freeze(sample.tacticalPositions.D1);
  Object.freeze(sample.tacticalPositions.D5);
  Object.freeze(sample.tacticalPositions);
  Object.freeze(sample.source.parameters);
  Object.freeze(sample.source);
  return Object.freeze(sample);
}

function generateF02Samples(): F02GeneratedSamples {
  const next = createFormationMulberry32(F02_SAMPLE_SEED);
  const samples: F02FormationSample[] = [];
  const seenInputs = new Set(
    F01_CANONICAL_STARTS.map((start) => JSON.stringify(start.tacticalPositions)),
  );
  let candidateCount = 0;
  let geometryRejectedCount = 0;
  let duplicateRejectedCount = 0;

  while (samples.length < F02_CANONICAL_SAMPLE_COUNT) {
    candidateCount += 1;
    if (candidateCount > 10_000) {
      throw new Error("F02 Formation sampler exhausted its deterministic guard");
    }
    const parameters = sampleF01FormationParameters(next);
    let tacticalPositions: FormationDomainPositions;
    try {
      tacticalPositions = geometryValidatedPositions(parameters);
    } catch {
      geometryRejectedCount += 1;
      continue;
    }
    const inputKey = JSON.stringify(tacticalPositions);
    if (seenInputs.has(inputKey)) {
      duplicateRejectedCount += 1;
      continue;
    }
    seenInputs.add(inputKey);
    const acceptedIndex = samples.length + 1;
    samples.push(freezeSample({
      id: `F02-S${String(acceptedIndex).padStart(2, "0")}`,
      tacticalPositions,
      source: {
        generator: "mulberry32-v1",
        seed: F02_SAMPLE_SEED,
        candidateIndex: candidateCount,
        domainVersion: F01_FORMATION_INPUT_DOMAIN.version,
        parameters: { ...parameters },
      },
    }));
  }

  return {
    samples,
    candidateCount,
    geometryRejectedCount,
    duplicateRejectedCount,
  };
}

const generated = generateF02Samples();

export const F02_FORMATION_SAMPLES = Object.freeze(generated.samples);

export const F02_SAMPLE_GENERATION = Object.freeze({
  generator: "mulberry32-v1" as const,
  seed: F02_SAMPLE_SEED,
  domainVersion: F01_FORMATION_INPUT_DOMAIN.version,
  candidateCount: generated.candidateCount,
  geometryRejectedCount: generated.geometryRejectedCount,
  duplicateRejectedCount: generated.duplicateRejectedCount,
  acceptedCount: generated.samples.length,
});

export function canonicalF02InputJson(): string {
  return JSON.stringify(F02_FORMATION_SAMPLES);
}
