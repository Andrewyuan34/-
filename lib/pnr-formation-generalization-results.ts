import {
  makeF01Config,
  makeF02Config,
  scanF01Formation,
  scanF02Formation,
  type FormationPairAudit,
  type FormationSideAudit,
  type FormationStageAudit,
} from "./pnr-formation-audit.ts";
import {
  F02_INPUT_HASH,
  F02_SAMPLE_GENERATION,
  F02_SAMPLE_SEED,
} from "./pnr-f02-formation-samples.ts";
import {
  F03_MANIFEST_COMMIT,
  makeF03Config,
  scanF03Heldout,
  type F03HeldoutAudit,
  type F03HeldoutRow,
} from "./pnr-f03-heldout-audit.ts";
import {
  F03_FROZEN_CORE_COMMIT,
  F03_MANIFEST_GENERATION,
  F03_MANIFEST_HASH,
  F03_MANIFEST_SEED,
} from "./pnr-f03-heldout-manifest.ts";
import type { ScreenSide, SimulationConfig, TerminalState } from "./pnr-core.ts";

export type FormationGeneralizationStage = "F01" | "F02" | "F03";
export type FormationGeneralizationReplayId =
  | "longest-f01-arrival"
  | "tightest-f02-clearance"
  | "longest-or-safe-exit"
  | "diverse-heldout";

export interface FormationGeneralizationReplay {
  id: FormationGeneralizationReplayId;
  stage: FormationGeneralizationStage;
  sampleId: string;
  side: ScreenSide;
  label: string;
  note: string;
  terminalCategory: string;
  formationTimeSeconds: number;
  initialMinimumBodyGap: number;
}

export interface FormationGeneralizationSummary {
  f01: FormationStageAudit;
  f02: FormationStageAudit;
  f03: F03HeldoutAudit;
  passed: boolean;
  stageStatus: Record<FormationGeneralizationStage, "PASS" | "FAIL">;
  f02Seed: typeof F02_SAMPLE_SEED;
  f02InputHash: typeof F02_INPUT_HASH;
  f02Generation: typeof F02_SAMPLE_GENERATION;
  f03FrozenCoreCommit: typeof F03_FROZEN_CORE_COMMIT;
  f03ManifestCommit: typeof F03_MANIFEST_COMMIT;
  f03ManifestSeed: typeof F03_MANIFEST_SEED;
  f03ManifestHash: typeof F03_MANIFEST_HASH;
  f03Generation: typeof F03_MANIFEST_GENERATION;
  replays: FormationGeneralizationReplay[];
}

interface ReplayCandidate {
  stage: FormationGeneralizationStage;
  sampleId: string;
  side: ScreenSide;
  world: FormationSideAudit;
  o5ArrivalDistance: number;
}

function terminalCategory(world: FormationSideAudit): string {
  return world.safeExitReason ?? world.terminalReason ?? "missing_terminal";
}

function pairCandidate(
  stage: "F01" | "F02",
  row: FormationPairAudit,
  side: ScreenSide = "right",
): ReplayCandidate {
  return {
    stage,
    sampleId: row.id,
    side,
    world: side === "right" ? row.right : row.left,
    o5ArrivalDistance: row.o5ArrivalDistance,
  };
}

function heldoutCandidate(row: F03HeldoutRow): ReplayCandidate {
  return {
    stage: "F03",
    sampleId: row.id,
    side: row.side,
    world: row.primary,
    o5ArrivalDistance: row.pair.o5ArrivalDistance,
  };
}

function candidateKey(candidate: ReplayCandidate): string {
  return `${candidate.stage}/${candidate.sampleId}/${candidate.side}`;
}

function selectRepresentativeReplays(
  f01: FormationStageAudit,
  f02: FormationStageAudit,
  f03: F03HeldoutAudit,
): FormationGeneralizationReplay[] {
  if (!f01.passed || !f02.passed || !f03.passed) return [];
  const selected: ReplayCandidate[] = [];

  const longestF01 = f01.rows
    .map((row) => pairCandidate("F01", row))
    .toSorted(
      (first, second) =>
        second.o5ArrivalDistance - first.o5ArrivalDistance ||
        first.sampleId.localeCompare(second.sampleId),
    )[0];
  selected.push(longestF01);

  const tightestF02 = f02.rows
    .map((row) => pairCandidate("F02", row))
    .toSorted(
      (first, second) =>
        first.world.initialMinimumBodyGap - second.world.initialMinimumBodyGap ||
        first.sampleId.localeCompare(second.sampleId),
    )[0];
  selected.push(tightestF02);

  const used = new Set(selected.map(candidateKey));
  const durationCandidates = [
    ...f02.rows.map((row) => pairCandidate("F02", row)),
    ...f03.rows.map(heldoutCandidate),
  ].filter((candidate) => !used.has(candidateKey(candidate)));
  const longestOrSafeExit = durationCandidates.toSorted(
    (first, second) =>
      Number(Boolean(second.world.safeExitReason)) -
        Number(Boolean(first.world.safeExitReason)) ||
      second.world.formationTimeSeconds - first.world.formationTimeSeconds ||
      first.stage.localeCompare(second.stage) ||
      first.sampleId.localeCompare(second.sampleId),
  )[0];
  selected.push(longestOrSafeExit);
  used.add(candidateKey(longestOrSafeExit));

  const representedSides = new Set(selected.map((candidate) => candidate.side));
  const representedTerminals = new Set(
    selected.map((candidate) => terminalCategory(candidate.world)),
  );
  const diverseHeldout = f03.rows
    .map(heldoutCandidate)
    .filter((candidate) => !used.has(candidateKey(candidate)))
    .toSorted((first, second) => {
      const firstNovelty =
        Number(!representedSides.has(first.side)) +
        Number(!representedTerminals.has(terminalCategory(first.world)));
      const secondNovelty =
        Number(!representedSides.has(second.side)) +
        Number(!representedTerminals.has(terminalCategory(second.world)));
      return secondNovelty - firstNovelty ||
        second.world.formationTimeSeconds - first.world.formationTimeSeconds ||
        first.sampleId.localeCompare(second.sampleId);
    })[0];
  selected.push(diverseHeldout);

  const [longest, tightest, slowOrExit, diverse] = selected;
  return [
    {
      id: "longest-f01-arrival",
      stage: longest.stage,
      sampleId: longest.sampleId,
      side: longest.side,
      label: "F01 · O5 最长到位路线",
      note: `初始到 anchor ${longest.o5ArrivalDistance.toFixed(3)}m · ${terminalCategory(longest.world)}`,
      terminalCategory: terminalCategory(longest.world),
      formationTimeSeconds: longest.world.formationTimeSeconds,
      initialMinimumBodyGap: longest.world.initialMinimumBodyGap,
    },
    {
      id: "tightest-f02-clearance",
      stage: tightest.stage,
      sampleId: tightest.sampleId,
      side: tightest.side,
      label: "F02 · 最紧合法起手净空",
      note: `初始身体净空 ${tightest.world.initialMinimumBodyGap.toFixed(3)}m · ${terminalCategory(tightest.world)}`,
      terminalCategory: terminalCategory(tightest.world),
      formationTimeSeconds: tightest.world.formationTimeSeconds,
      initialMinimumBodyGap: tightest.world.initialMinimumBodyGap,
    },
    {
      id: "longest-or-safe-exit",
      stage: slowOrExit.stage,
      sampleId: slowOrExit.sampleId,
      side: slowOrExit.side,
      label: "F02/F03 · 最长形成 / 安全退出",
      note: `${slowOrExit.world.formationTimeSeconds.toFixed(3)}s · ${terminalCategory(slowOrExit.world)}`,
      terminalCategory: terminalCategory(slowOrExit.world),
      formationTimeSeconds: slowOrExit.world.formationTimeSeconds,
      initialMinimumBodyGap: slowOrExit.world.initialMinimumBodyGap,
    },
    {
      id: "diverse-heldout",
      stage: diverse.stage,
      sampleId: diverse.sampleId,
      side: diverse.side,
      label: "F03 · 不同侧 / 终局 held-out",
      note: `${diverse.side.toUpperCase()} · ${terminalCategory(diverse.world)} · ${diverse.world.formationTimeSeconds.toFixed(3)}s`,
      terminalCategory: terminalCategory(diverse.world),
      formationTimeSeconds: diverse.world.formationTimeSeconds,
      initialMinimumBodyGap: diverse.world.initialMinimumBodyGap,
    },
  ];
}

export function scanFormationGeneralization(): FormationGeneralizationSummary {
  const f01 = scanF01Formation();
  const f02 = scanF02Formation();
  const f03 = scanF03Heldout();
  return {
    f01,
    f02,
    f03,
    passed: f01.passed && f02.passed && f03.passed,
    stageStatus: {
      F01: f01.passed ? "PASS" : "FAIL",
      F02: f02.passed ? "PASS" : "FAIL",
      F03: f03.passed ? "PASS" : "FAIL",
    },
    f02Seed: F02_SAMPLE_SEED,
    f02InputHash: F02_INPUT_HASH,
    f02Generation: F02_SAMPLE_GENERATION,
    f03FrozenCoreCommit: F03_FROZEN_CORE_COMMIT,
    f03ManifestCommit: F03_MANIFEST_COMMIT,
    f03ManifestSeed: F03_MANIFEST_SEED,
    f03ManifestHash: F03_MANIFEST_HASH,
    f03Generation: F03_MANIFEST_GENERATION,
    replays: selectRepresentativeReplays(f01, f02, f03),
  };
}

export function makeFormationGeneralizationReplayConfig(
  replay: FormationGeneralizationReplay,
): SimulationConfig {
  if (replay.stage === "F01") return makeF01Config(replay.sampleId, replay.side);
  if (replay.stage === "F02") return makeF02Config(replay.sampleId, replay.side);
  return makeF03Config(replay.sampleId, replay.side);
}

export function terminalCategoryLabel(
  reason: TerminalState["reason"] | null,
): string {
  return reason === "formation_timeout" || reason === "formation_aborted"
    ? "safe-exit"
    : reason ?? "live";
}
