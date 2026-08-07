import {
  FORMATION_LANDMARK_OFFSETS,
  copyInitialPlayerPositions,
  deriveTacticalLandmarks,
  mirrorInitialPlayerPositions,
  validateInitialPlayerPositions,
  type FormationLandmarkOffsets,
  type InitialPlayerPositions,
  type ScreenSide,
  type SimulationConfig,
} from "./pnr-core.ts";
import {
  F01_CANONICAL_STARTS,
  F01_FORMATION_INPUT_DOMAIN,
  copyFormationDomainPositions,
  makeFormationTacticalPositions,
  type FormationDomainPositions,
  type FormationInputParameters,
} from "./pnr-formation-domain.ts";
import {
  F02_FORMATION_SAMPLES,
  F02_INPUT_HASH,
  createFormationMulberry32,
  sampleF01FormationParameters,
} from "./pnr-f02-formation-samples.ts";

export const F03_FROZEN_CORE_COMMIT =
  "90631359ba5a52eacfdbfc1434d657f8743df45e" as const;
export const F03_MANIFEST_SEED = 20260810 as const;
export const F03_SIMULATION_SEED = 17 as const;
export const F03_MANIFEST_HASH =
  "sha256:7d7331992d4855d0d43704f926da97a0698e4c80a3da6b494ca4f350f3eb5b68" as const;

export interface F03ManifestSource {
  generator: "mulberry32-v1";
  seed: typeof F03_MANIFEST_SEED;
  candidateIndex: number;
  tacticalFrame: "right-canonical";
  domainVersion: typeof F01_FORMATION_INPUT_DOMAIN.version;
  frozenF02InputHash: typeof F02_INPUT_HASH;
  parameters: Readonly<FormationInputParameters>;
}

export interface F03FormationInput {
  startMode: "form_pnr";
  screenSide: ScreenSide;
  initialPositions: InitialPlayerPositions;
  formationLandmarkOffsets: FormationLandmarkOffsets;
  seed: typeof F03_SIMULATION_SEED;
  maxTime: 8;
  d1FrontReactionDelay: 0.12;
  d1PostCatchRecoveryDelay: 0;
  o1MaxSpeed: 3.72;
  horizon: "formation_resolution";
}

export interface F03ManifestItem {
  id: string;
  side: ScreenSide;
  input: F03FormationInput;
  source: F03ManifestSource;
}

interface GeneratedManifest {
  items: F03ManifestItem[];
  candidateCount: number;
  geometryRejectedCount: number;
  duplicateRejectedCount: number;
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
  "label",
  "humanlabel",
]);

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
  side: ScreenSide,
): { tacticalPositions: FormationDomainPositions; initialPositions: InitialPlayerPositions } {
  const tacticalCandidate = makeFormationTacticalPositions(parameters) as InitialPlayerPositions;
  const tacticalPositions = validateInitialPlayerPositions(tacticalCandidate);
  const initialPositions = validateInitialPlayerPositions(
    side === "right"
      ? copyInitialPlayerPositions(tacticalPositions)
      : mirrorInitialPlayerPositions(tacticalPositions),
  );
  deriveTacticalLandmarks(
    "form_pnr",
    initialPositions,
    side,
    copyOffsets(),
  );
  return {
    tacticalPositions: copyFormationDomainPositions(tacticalPositions),
    initialPositions,
  };
}

function freezeManifestItem(item: F03ManifestItem): F03ManifestItem {
  for (const position of Object.values(item.input.initialPositions)) Object.freeze(position);
  Object.freeze(item.input.initialPositions);
  for (const offset of Object.values(item.input.formationLandmarkOffsets)) {
    Object.freeze(offset);
  }
  Object.freeze(item.input.formationLandmarkOffsets);
  Object.freeze(item.input);
  Object.freeze(item.source.parameters);
  Object.freeze(item.source);
  return Object.freeze(item);
}

function priorInputKeys(): Set<string> {
  return new Set([
    ...F01_CANONICAL_STARTS.map((start) => JSON.stringify(start.tacticalPositions)),
    ...F02_FORMATION_SAMPLES.map((sample) => JSON.stringify(sample.tacticalPositions)),
  ]);
}

function generateManifest(): GeneratedManifest {
  const next = createFormationMulberry32(F03_MANIFEST_SEED);
  const items: F03ManifestItem[] = [];
  const seenTacticalInputs = priorInputKeys();
  let candidateCount = 0;
  let geometryRejectedCount = 0;
  let duplicateRejectedCount = 0;

  for (const side of ["right", "left"] as const) {
    let acceptedForSide = 0;
    while (acceptedForSide < 8) {
      candidateCount += 1;
      if (candidateCount > 10_000) {
        throw new Error("F03 Formation manifest generator exhausted its deterministic guard");
      }
      const parameters = sampleF01FormationParameters(next);
      let geometry: ReturnType<typeof validateCandidateGeometry>;
      try {
        geometry = validateCandidateGeometry(parameters, side);
      } catch {
        geometryRejectedCount += 1;
        continue;
      }
      const tacticalKey = JSON.stringify(geometry.tacticalPositions);
      if (seenTacticalInputs.has(tacticalKey)) {
        duplicateRejectedCount += 1;
        continue;
      }
      seenTacticalInputs.add(tacticalKey);
      acceptedForSide += 1;
      const sideCode = side === "right" ? "R" : "L";
      items.push(freezeManifestItem({
        id: `F03-${sideCode}${String(acceptedForSide).padStart(2, "0")}`,
        side,
        input: {
          startMode: "form_pnr",
          screenSide: side,
          initialPositions: geometry.initialPositions,
          formationLandmarkOffsets: copyOffsets(),
          seed: F03_SIMULATION_SEED,
          maxTime: 8,
          d1FrontReactionDelay: 0.12,
          d1PostCatchRecoveryDelay: 0,
          o1MaxSpeed: 3.72,
          horizon: "formation_resolution",
        },
        source: {
          generator: "mulberry32-v1",
          seed: F03_MANIFEST_SEED,
          candidateIndex: candidateCount,
          tacticalFrame: "right-canonical",
          domainVersion: F01_FORMATION_INPUT_DOMAIN.version,
          frozenF02InputHash: F02_INPUT_HASH,
          parameters: { ...parameters },
        },
      }));
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

export const F03_HELDOUT_MANIFEST = Object.freeze(generated.items);

export const F03_MANIFEST_GENERATION = Object.freeze({
  generator: "mulberry32-v1" as const,
  seed: F03_MANIFEST_SEED,
  domainVersion: F01_FORMATION_INPUT_DOMAIN.version,
  frozenF02InputHash: F02_INPUT_HASH,
  candidateCount: generated.candidateCount,
  geometryRejectedCount: generated.geometryRejectedCount,
  duplicateRejectedCount: generated.duplicateRejectedCount,
  acceptedCount: generated.items.length,
  rightCount: generated.items.filter((item) => item.side === "right").length,
  leftCount: generated.items.filter((item) => item.side === "left").length,
});

export function canonicalF03ManifestJson(): string {
  return JSON.stringify(F03_HELDOUT_MANIFEST);
}

export function findF03ProhibitedOutputFields(value: unknown): string[] {
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

export function copyF03SimulationInput(item: F03ManifestItem): SimulationConfig {
  return {
    ...item.input,
    initialPositions: copyInitialPlayerPositions(item.input.initialPositions),
    formationLandmarkOffsets: {
      screenAnchor: { ...item.input.formationLandmarkOffsets.screenAnchor },
      handlerWaitingPoint: { ...item.input.formationLandmarkOffsets.handlerWaitingPoint },
      useGate: { ...item.input.formationLandmarkOffsets.useGate },
      rejectGate: { ...item.input.formationLandmarkOffsets.rejectGate },
    },
  };
}
