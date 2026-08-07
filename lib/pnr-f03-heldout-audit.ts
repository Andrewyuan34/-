import {
  PnrSimulation,
  copyInitialPlayerPositions,
  mirrorInitialPlayerPositions,
  type InitialPlayerPositions,
  type ScreenSide,
  type SimulationConfig,
} from "./pnr-core.ts";
import {
  auditFormationPair,
  makeFormationAuditConfig,
  type FormationFailureTrace,
  type FormationPairAudit,
  type FormationSideAudit,
} from "./pnr-formation-audit.ts";
import {
  F03_FROZEN_CORE_COMMIT,
  F03_HELDOUT_MANIFEST,
  F03_MANIFEST_HASH,
  copyF03SimulationInput,
  type F03ManifestItem,
} from "./pnr-f03-heldout-manifest.ts";
import { makeDefaultTeamStrategySelection } from "./pnr-strategy.ts";

export const F03_MANIFEST_COMMIT =
  "ba39ef025f29d181af8c7d137d6807f7825c9717" as const;

export interface F03HeldoutRow {
  id: string;
  side: ScreenSide;
  manifestHash: typeof F03_MANIFEST_HASH;
  primary: FormationSideAudit;
  correspondingMirror: FormationSideAudit;
  pair: FormationPairAudit;
  passed: boolean;
  failureReasons: string[];
  earliestFailureTick: number | null;
  minimumFailureTrace: FormationFailureTrace | null;
}

export interface F03HeldoutAudit {
  stage: "F03";
  frozenCoreCommit: typeof F03_FROZEN_CORE_COMMIT;
  manifestCommit: typeof F03_MANIFEST_COMMIT;
  manifestHash: typeof F03_MANIFEST_HASH;
  manifestCount: number;
  executedCount: number;
  primaryWorldCount: number;
  correspondingMirrorWorldCount: number;
  executionsPerWorld: 2;
  rows: F03HeldoutRow[];
  successfulFormationWorlds: number;
  safeExitWorlds: number;
  deterministic: boolean;
  mirrored: boolean;
  invariantsPassed: boolean;
  passed: boolean;
  failedCaseIds: string[];
  failureReasons: string[];
}

function getManifestItem(id: string): F03ManifestItem {
  const item = F03_HELDOUT_MANIFEST.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Unknown F03 held-out Formation input: ${id}`);
  return item;
}

function tacticalPositions(item: F03ManifestItem): InitialPlayerPositions {
  return item.side === "right"
    ? copyInitialPlayerPositions(item.input.initialPositions)
    : mirrorInitialPlayerPositions(item.input.initialPositions);
}

export function makeF03Config(
  id: string,
  side: ScreenSide = getManifestItem(id).side,
): SimulationConfig {
  const item = getManifestItem(id);
  if (side === item.side) {
    return {
      ...copyF03SimulationInput(item),
      strategies: makeDefaultTeamStrategySelection(),
    };
  }
  return makeFormationAuditConfig(tacticalPositions(item), side, item.input.seed);
}

export function createF03Replay(
  id: string,
  side: ScreenSide = getManifestItem(id).side,
): PnrSimulation {
  return new PnrSimulation(makeF03Config(id, side));
}

function firstFailureTrace(
  primary: FormationSideAudit,
  mirror: FormationSideAudit,
): FormationFailureTrace | null {
  const traces = [primary.failureTrace, mirror.failureTrace]
    .filter((trace): trace is FormationFailureTrace => trace !== null)
    .sort((first, second) => first.tick - second.tick);
  return traces[0] ?? null;
}

function runHeldoutItem(item: F03ManifestItem): F03HeldoutRow {
  const pair = auditFormationPair({
    id: item.id,
    label: item.id,
    stage: "F03",
    tacticalPositions: tacticalPositions(item),
    source: item.source as unknown as Readonly<Record<string, unknown>>,
  });
  const primary = item.side === "right" ? pair.right : pair.left;
  const correspondingMirror = item.side === "right" ? pair.left : pair.right;
  const failureReasons = [
    ...primary.failures.map((failure) => `${item.id}/${item.side}: ${failure}`),
    ...correspondingMirror.failures.map(
      (failure) => `${item.id}/mirror-${correspondingMirror.side}: ${failure}`,
    ),
    ...(!pair.mirrorPassed ? [`${item.id}: MIRROR_DIVERGENCE`] : []),
  ];
  const minimumFailureTrace = firstFailureTrace(primary, correspondingMirror);
  return {
    id: item.id,
    side: item.side,
    manifestHash: F03_MANIFEST_HASH,
    primary,
    correspondingMirror,
    pair,
    passed: pair.passed && failureReasons.length === 0,
    failureReasons,
    earliestFailureTick: minimumFailureTrace?.tick ?? null,
    minimumFailureTrace,
  };
}

export function scanF03Heldout(): F03HeldoutAudit {
  const rows: F03HeldoutRow[] = [];
  const failedCaseIds: string[] = [];
  const failureReasons: string[] = [];
  for (const item of F03_HELDOUT_MANIFEST) {
    const row = runHeldoutItem(item);
    rows.push(row);
    if (!row.passed) {
      failedCaseIds.push(row.id);
      failureReasons.push(...row.failureReasons);
      break;
    }
  }

  const worlds = rows.flatMap((row) => [row.primary, row.correspondingMirror]);
  const deterministic = worlds.every((world) => world.deterministic);
  const mirrored = rows.every((row) => row.pair.mirrorPassed);
  const invariantsPassed = worlds.every((world) => world.failures.length === 0);
  return {
    stage: "F03",
    frozenCoreCommit: F03_FROZEN_CORE_COMMIT,
    manifestCommit: F03_MANIFEST_COMMIT,
    manifestHash: F03_MANIFEST_HASH,
    manifestCount: F03_HELDOUT_MANIFEST.length,
    executedCount: rows.length,
    primaryWorldCount: rows.length,
    correspondingMirrorWorldCount: rows.length,
    executionsPerWorld: 2,
    rows,
    successfulFormationWorlds: worlds.filter((world) => !world.safeExitReason).length,
    safeExitWorlds: worlds.filter((world) => world.safeExitReason).length,
    deterministic,
    mirrored,
    invariantsPassed,
    passed:
      rows.length === F03_HELDOUT_MANIFEST.length &&
      deterministic &&
      mirrored &&
      invariantsPassed &&
      failureReasons.length === 0,
    failedCaseIds,
    failureReasons,
  };
}
