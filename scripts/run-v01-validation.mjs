import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { scanV01IntegratedValidation } from "../lib/pnr-v01-validation-audit.ts";
import {
  V00_EVIDENCE_CONTRACT,
  V00_EXECUTION_ORDER,
  V00_MANIFEST_HASH,
  V00_REPRESENTATIVE_REPLAY_RULE,
  V00_ROLLBACK_COMMIT,
  canonicalV00ManifestJson,
} from "../lib/pnr-v00-validation-manifest.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function git(...args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

const actualManifestHash = sha256(canonicalV00ManifestJson());
if (actualManifestHash !== V00_MANIFEST_HASH) {
  throw new Error(`V00 manifest hash mismatch: ${actualManifestHash} !== ${V00_MANIFEST_HASH}`);
}

const lockCommit = git("rev-parse", "HEAD");
execFileSync("git", ["merge-base", "--is-ancestor", V00_ROLLBACK_COMMIT, lockCommit], {
  cwd: repoRoot,
  stdio: "ignore",
});
const lockParent = git("rev-parse", `${lockCommit}^`);
if (lockParent !== V00_ROLLBACK_COMMIT) {
  throw new Error(
    `V01 HEAD must be the direct V00 lock child of ${V00_ROLLBACK_COMMIT}; found parent ${lockParent}`,
  );
}
const trackedStatus = git("status", "--porcelain", "--untracked-files=no");
if (trackedStatus) {
  throw new Error(`V01 requires an unchanged V00 lock tree; tracked changes found:\n${trackedStatus}`);
}
const evidencePath = resolve(repoRoot, V00_EVIDENCE_CONTRACT.path);
if (existsSync(evidencePath)) {
  throw new Error(`V01 evidence already exists; refusing to rerun or overwrite ${evidencePath}`);
}

const audit = scanV01IntegratedValidation();
const evidence = {
  contract: {
    evidenceVersion: V00_EVIDENCE_CONTRACT.version,
    lockCommit,
    rollbackCommit: V00_ROLLBACK_COMMIT,
    manifestVersion: audit.manifestVersion,
    manifestHash: audit.manifestHash,
    auditVersion: audit.version,
    executionOrder: V00_EXECUTION_ORDER,
    representativeReplayRule: V00_REPRESENTATIVE_REPLAY_RULE,
  },
  execution: {
    inputCount: audit.inputCount,
    matchupCount: audit.matchupCount,
    cellCount: audit.cellCount,
    worldCount: audit.worldCount,
    executionsPerWorld: audit.executionsPerWorld,
    plannedSimulationCount: audit.plannedSimulationCount,
    executedSimulationCount: audit.executedSimulationCount,
  },
  aggregate: {
    passed: audit.passed,
    passedCellCount: audit.passedCellCount,
    failedCellCount: audit.failedCellCount,
    formedWorldCount: audit.formedWorldCount,
    safeExitWorldCount: audit.safeExitWorldCount,
    gates: {
      deterministic: audit.deterministic,
      mirrored: audit.mirrored,
      continuousPhaseAndPossession: audit.continuousPhaseAndPossession,
      legalStateAndAction: audit.legalStateAndAction,
      strategyReferenceCarry: audit.strategyReferenceCarry,
      plannerOrderStable: audit.plannerOrderStable,
      informationBoundaryPassed: audit.informationBoundaryPassed,
      opponentStrategyIsolationPassed: audit.opponentStrategyIsolationPassed,
      roleOwnershipPassed: audit.roleOwnershipPassed,
      routesAndBallOwnershipPassed: audit.routesAndBallOwnershipPassed,
      hardVetoPriorityPassed: audit.hardVetoPriorityPassed,
      publicEventCausalityPassed: audit.publicEventCausalityPassed,
      tacticalCompletionOrSafeExitPassed: audit.tacticalCompletionOrSafeExitPassed,
      teammateChannelAndPocketIntegrityPassed: audit.teammateChannelAndPocketIntegrityPassed,
      localScreenCausalityPassed: audit.localScreenCausalityPassed,
      strategyEffectCausalityPassed: audit.strategyEffectCausalityPassed,
    },
  },
  terminalHistogram: audit.terminalHistogram,
  classifications: {
    passed: audit.passedCellCount,
    candidateGeneralDefect: audit.candidateGeneralDefectCount,
    outOfDomainContractFailure: audit.outOfDomainContractFailureCount,
    inDomainInputs: audit.inDomainInputCount,
    outOfDomainInputs: audit.outOfDomainInputCount,
  },
  failures: audit.cells.flatMap((cell) => cell.reproductionIds).concat(
    audit.firstFailure && !audit.cells.some((cell) => cell.id === audit.firstFailure?.id)
      ? [`${audit.firstFailure.id}:${audit.firstFailure.reason}`]
      : [],
  ),
  cells: audit.cells.map((cell) => ({
    id: cell.id,
    inputId: cell.inputId,
    matchupId: cell.matchupId,
    classification: cell.classification,
    passed: cell.passed,
    formed: cell.audit?.formed ?? null,
    terminalReason: cell.audit?.resolution ?? null,
    terminalTick: cell.audit?.terminalTick ?? null,
    minimumTeammateBodyGap: cell.audit?.minimumTeammateBodyGap ?? null,
    mirrorMaximumError: cell.audit?.mirrorMaximumError ?? null,
    behaviorSignatureHash: cell.behaviorSignature ? sha256(cell.behaviorSignature) : null,
    failures: cell.failures,
    reproductionIds: cell.reproductionIds,
  })),
  representativeReplays: audit.representativeReplays,
};

mkdirSync(dirname(evidencePath), { recursive: true });
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
  encoding: "utf8",
  flag: "wx",
});

process.stdout.write(`${JSON.stringify({
  lockCommit,
  manifestHash: audit.manifestHash,
  inputs: audit.inputCount,
  cells: audit.cellCount,
  worlds: audit.worldCount,
  simulations: audit.executedSimulationCount,
  passedCells: audit.passedCellCount,
  failedCells: audit.failedCellCount,
  outOfDomainInputs: audit.outOfDomainInputCount,
  passed: audit.passed,
  evidence: V00_EVIDENCE_CONTRACT.path,
})}\n`);

if (!audit.passed) process.exitCode = 1;
