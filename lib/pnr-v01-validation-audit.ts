import {
  FORMATION_LANDMARK_OFFSETS,
  PnrSimulation,
  deriveTacticalLandmarks,
  mirrorInitialPlayerPositions,
  validateInitialPlayerPositions,
  type FormationLandmarkOffsets,
  type ScreenSide,
  type SimulationConfig,
  type TerminalState,
} from "./pnr-core.ts";
import {
  I02_STRATEGY_MATRIX,
  auditIntegratedInput,
  makeI02IntegrationConfig,
  type I01SideAudit,
  type I01IntegrationRow,
  type I02StrategyMatchup,
} from "./pnr-integration-audit.ts";
import {
  F01_FORMATION_INPUT_DOMAIN,
  assertFormationInputInF01Domain,
  formationParameterFailures,
  makeFormationTacticalPositions,
} from "./pnr-formation-domain.ts";
import type { P03MatchupId } from "./pnr-p03-policy-matrix.ts";
import type {
  TeamStrategyReference,
  TeamStrategySelection,
} from "./pnr-strategy.ts";
import {
  V00_ALLOWED_TERMINALS,
  V00_CONTRACT_VERSION,
  V00_EVIDENCE_VERSION,
  V00_EXECUTION_ORDER,
  V00_INPUT_MANIFEST_VERSION,
  V00_MANIFEST_HASH,
  V00_PASS_THRESHOLDS,
  V00_REPRESENTATIVE_REPLAY_RULE,
  V00_STRATEGY_MATCHUPS,
  V00_VALIDATION_INPUTS,
  type V00ValidationInput,
} from "./pnr-v00-validation-manifest.ts";

export const V01_AUDIT_VERSION = "locked-integrated-validation-audit@1" as const;

export type V01Classification =
  | "passed"
  | "candidate_general_defect"
  | "out_of_domain_contract_failure";

export interface V01ValidationCell {
  id: string;
  inputId: string;
  matchupId: P03MatchupId;
  offenseStrategy: TeamStrategyReference;
  defenseStrategy: TeamStrategyReference;
  audit: I01IntegrationRow | null;
  behaviorSignature: string | null;
  initialOffenseSignature: string | null;
  initialDefenseSignature: string | null;
  classification: V01Classification;
  failures: string[];
  reproductionIds: string[];
  passed: boolean;
}

export interface V01RepresentativeReplay {
  id:
    | "first-failure"
    | "first-failure-mirror"
    | "longest-resolution"
    | "tightest-channel"
    | "strategy-carry"
    | "mirror-of-longest";
  inputId: string;
  matchupId: P03MatchupId;
  strategies: TeamStrategySelection;
  mirrored: boolean;
  side: ScreenSide | null;
  terminalReason: TerminalState["reason"] | "unresolved";
  terminalTick: number | null;
  note: string;
}

export interface V01IntegratedValidationAudit {
  version: typeof V01_AUDIT_VERSION;
  contractVersion: typeof V00_CONTRACT_VERSION;
  manifestVersion: typeof V00_INPUT_MANIFEST_VERSION;
  manifestHash: typeof V00_MANIFEST_HASH;
  evidenceVersion: typeof V00_EVIDENCE_VERSION;
  inputCount: number;
  inDomainInputCount: number;
  outOfDomainInputCount: number;
  matchupCount: number;
  cellCount: number;
  worldCount: number;
  executionsPerWorld: 3;
  plannedSimulationCount: number;
  executedSimulationCount: number;
  cells: V01ValidationCell[];
  passedCellCount: number;
  failedCellCount: number;
  candidateGeneralDefectCount: number;
  outOfDomainContractFailureCount: number;
  formedWorldCount: number;
  safeExitWorldCount: number;
  terminalHistogram: Record<string, number>;
  deterministic: boolean;
  mirrored: boolean;
  continuousPhaseAndPossession: boolean;
  legalStateAndAction: boolean;
  strategyReferenceCarry: boolean;
  plannerOrderStable: boolean;
  informationBoundaryPassed: boolean;
  opponentStrategyIsolationPassed: boolean;
  roleOwnershipPassed: boolean;
  routesAndBallOwnershipPassed: boolean;
  hardVetoPriorityPassed: boolean;
  publicEventCausalityPassed: boolean;
  tacticalCompletionOrSafeExitPassed: boolean;
  teammateChannelAndPocketIntegrityPassed: boolean;
  localScreenCausalityPassed: boolean;
  strategyEffectCausalityPassed: boolean;
  representativeReplays: V01RepresentativeReplay[];
  firstFailure: { id: string; reason: string } | null;
  passed: boolean;
}

function copyOffsets(): FormationLandmarkOffsets {
  return {
    screenAnchor: { ...FORMATION_LANDMARK_OFFSETS.screenAnchor },
    handlerWaitingPoint: { ...FORMATION_LANDMARK_OFFSETS.handlerWaitingPoint },
    useGate: { ...FORMATION_LANDMARK_OFFSETS.useGate },
    rejectGate: { ...FORMATION_LANDMARK_OFFSETS.rejectGate },
  };
}

export function v00InputDomainFailures(input: V00ValidationInput): string[] {
  const failures = [
    ...(input.source.domainVersion === F01_FORMATION_INPUT_DOMAIN.version
      ? []
      : [`DOMAIN_VERSION:${input.source.domainVersion}`]),
    ...formationParameterFailures(input.source.parameters).map((failure) =>
      `PARAMETER:${failure}`),
  ];
  const generatedPositions = makeFormationTacticalPositions(input.source.parameters);
  if (JSON.stringify(generatedPositions) !== JSON.stringify(input.initialPositions)) {
    failures.push("SOURCE_POSITION_MISMATCH");
  }
  try {
    const canonical = validateInitialPlayerPositions(input.initialPositions);
    assertFormationInputInF01Domain(canonical);
    deriveTacticalLandmarks("form_pnr", canonical, "right", copyOffsets());
    const mirror = mirrorInitialPlayerPositions(canonical);
    validateInitialPlayerPositions(mirror);
    deriveTacticalLandmarks("form_pnr", mirror, "left", copyOffsets());
  } catch (error) {
    failures.push(`GEOMETRY:${error instanceof Error ? error.message : String(error)}`);
  }
  return failures;
}

function matchupFor(id: P03MatchupId): I02StrategyMatchup {
  const matchup = I02_STRATEGY_MATRIX.find((candidate) => candidate.id === id);
  if (!matchup) throw new Error(`V01 missing sealed I02 matchup ${id}`);
  return matchup;
}

function reproductionIds(cellId: string, failures: readonly string[]): string[] {
  return failures.map((failure) => `${cellId}:${failure}`);
}

function withFailure(
  cell: V01ValidationCell,
  failure: string,
): V01ValidationCell {
  if (cell.failures.includes(failure)) return cell;
  const failures = [...cell.failures, failure];
  return {
    ...cell,
    classification: "candidate_general_defect",
    failures,
    reproductionIds: reproductionIds(cell.id, failures),
    passed: false,
  };
}

function opponentStrategyIsolationFailures(cells: readonly V01ValidationCell[]): string[] {
  const failures: string[] = [];
  for (const input of V00_VALIDATION_INPUTS) {
    const inputCells = cells.filter((cell) => cell.inputId === input.id && cell.audit);
    const offenseIds = new Set(inputCells.map((cell) => cell.offenseStrategy.id));
    const defenseIds = new Set(inputCells.map((cell) => cell.defenseStrategy.id));
    for (const offenseId of offenseIds) {
      const signatures = new Set(inputCells
        .filter((cell) => cell.offenseStrategy.id === offenseId)
        .map((cell) => cell.initialOffenseSignature));
      if (signatures.size !== 1) failures.push(`${input.id}/offense-${offenseId}`);
    }
    for (const defenseId of defenseIds) {
      const signatures = new Set(inputCells
        .filter((cell) => cell.defenseStrategy.id === defenseId)
        .map((cell) => cell.initialDefenseSignature));
      if (signatures.size !== 1) failures.push(`${input.id}/defense-${defenseId}`);
    }
  }
  return failures;
}

function strategiesFor(cell: V01ValidationCell): TeamStrategySelection {
  return matchupFor(cell.matchupId).strategies;
}

function replay(
  id: V01RepresentativeReplay["id"],
  cell: V01ValidationCell,
  mirrored: boolean,
  note: string,
): V01RepresentativeReplay {
  const side = cell.audit ? (mirrored ? cell.audit.left : cell.audit.right) : null;
  return {
    id,
    inputId: cell.inputId,
    matchupId: cell.matchupId,
    strategies: strategiesFor(cell),
    mirrored,
    side: side?.selectedSide ?? null,
    terminalReason: side?.terminalReason ?? "unresolved",
    terminalTick: side?.terminalTick ?? null,
    note,
  };
}

function selectRepresentativeReplays(
  cells: readonly V01ValidationCell[],
): V01RepresentativeReplay[] {
  const runnable = cells.filter((cell) => cell.audit);
  const passing = runnable.filter((cell) => cell.passed);
  const failed = cells.find((cell) => !cell.passed);
  const pool = passing.length > 0
    ? passing
    : failed
      ? [failed]
      : [];
  if (pool.length === 0) return [];
  const first = pool[0];
  const longest = pool.reduce((selected, cell) =>
    (cell.audit?.terminalTick ?? -1) > (selected.audit?.terminalTick ?? -1)
      ? cell
      : selected, first);
  const tightest = pool.reduce((selected, cell) =>
    (cell.audit?.minimumTeammateBodyGap ?? Number.POSITIVE_INFINITY) <
      (selected.audit?.minimumTeammateBodyGap ?? Number.POSITIVE_INFINITY)
      ? cell
      : selected, first);
  const strategyCarry = passing.find((cell) =>
    cell.audit?.formed && cell.matchupId !== "OB-DB") ?? first;
  const selected = failed
    ? [
        replay("first-failure", failed, false, `首个失败：${failed.failures[0] ?? "unknown"}`),
        replay("first-failure-mirror", failed, true, "首个失败 cell 的真实左侧镜像"),
        replay("strategy-carry", strategyCarry, false, "首个形成成功的非默认策略携带；缺类时按锁定顺序回退"),
        replay("mirror-of-longest", longest, true, "最长终局 cell 的真实左侧镜像"),
      ]
    : [
        replay("longest-resolution", longest, false, "终局 tick 最大；按锁定 cell 顺序破同值"),
        replay("tightest-channel", tightest, false, "最小 O1/O5 身体净空；按锁定 cell 顺序破同值"),
        replay("strategy-carry", strategyCarry, false, "首个形成成功的非默认策略携带；缺类时按锁定顺序回退"),
        replay("mirror-of-longest", longest, true, "最长终局 cell 的真实左侧镜像"),
      ];
  return selected;
}

export function scanV01IntegratedValidation(): V01IntegratedValidationAudit {
  const domainFailures = new Map(V00_VALIDATION_INPUTS.map((input) => [
    input.id,
    v00InputDomainFailures(input),
  ]));
  const rawCells = V00_VALIDATION_INPUTS.flatMap((input) =>
    V00_STRATEGY_MATCHUPS.map((lockedMatchup): V01ValidationCell => {
      const id = `${input.id}/${lockedMatchup.id}`;
      const inputFailures = domainFailures.get(input.id) ?? [];
      if (inputFailures.length > 0) {
        const failures = inputFailures.map((failure) => `OUT_OF_DOMAIN:${failure}`);
        return {
          id,
          inputId: input.id,
          matchupId: lockedMatchup.id,
          offenseStrategy: lockedMatchup.offense,
          defenseStrategy: lockedMatchup.defense,
          audit: null,
          behaviorSignature: null,
          initialOffenseSignature: null,
          initialDefenseSignature: null,
          classification: "out_of_domain_contract_failure",
          failures,
          reproductionIds: reproductionIds(id, failures),
          passed: false,
        };
      }
      const matchup = matchupFor(lockedMatchup.id);
      try {
        const result = auditIntegratedInput(input, matchup.strategies);
        const failures = [...result.row.failures];
        if (result.row.mirrorMaximumError > V00_PASS_THRESHOLDS.mirrorMaximumError) {
          failures.push("MIRROR_THRESHOLD");
        }
        if (result.row.minimumTeammateBodyGap < V00_PASS_THRESHOLDS.minimumTeammateBodyGap) {
          failures.push("TEAMMATE_BODY_GAP");
        }
        return {
          id,
          inputId: input.id,
          matchupId: lockedMatchup.id,
          offenseStrategy: lockedMatchup.offense,
          defenseStrategy: lockedMatchup.defense,
          audit: result.row,
          behaviorSignature: result.row.behaviorTraceSignature,
          initialOffenseSignature: result.initialOffenseSignature,
          initialDefenseSignature: result.initialDefenseSignature,
          classification: failures.length === 0 ? "passed" : "candidate_general_defect",
          failures,
          reproductionIds: reproductionIds(id, failures),
          passed: failures.length === 0,
        };
      } catch (error) {
        const failures = [
          `RUNTIME_EXCEPTION:${error instanceof Error ? error.message : String(error)}`,
        ];
        return {
          id,
          inputId: input.id,
          matchupId: lockedMatchup.id,
          offenseStrategy: lockedMatchup.offense,
          defenseStrategy: lockedMatchup.defense,
          audit: null,
          behaviorSignature: null,
          initialOffenseSignature: null,
          initialDefenseSignature: null,
          classification: "candidate_general_defect",
          failures,
          reproductionIds: reproductionIds(id, failures),
          passed: false,
        };
      }
    }),
  );

  const defaultSignatures = new Map(V00_VALIDATION_INPUTS.map((input) => [
    input.id,
    rawCells.find((cell) => cell.inputId === input.id && cell.matchupId === "OB-DB")
      ?.behaviorSignature,
  ]));
  let cells = rawCells.map((cell) => {
    const defaultSignature = defaultSignatures.get(cell.inputId);
    return cell.audit?.zeroStrategyAdjustment && typeof defaultSignature === "string" &&
      cell.behaviorSignature !== defaultSignature
      ? withFailure(cell, "STRATEGY_EFFECT_WITHOUT_ADJUSTMENT")
      : cell;
  });
  const allCellsAudited = cells.every((cell) => cell.audit !== null);
  const isolationFailures = opponentStrategyIsolationFailures(cells);
  const opponentIsolation = allCellsAudited && isolationFailures.length === 0;
  for (const isolationFailure of isolationFailures) {
    const [inputId, strategyKey] = isolationFailure.split("/", 2);
    const offenseId = strategyKey?.startsWith("offense-")
      ? strategyKey.slice("offense-".length)
      : null;
    const defenseId = strategyKey?.startsWith("defense-")
      ? strategyKey.slice("defense-".length)
      : null;
    const index = cells.findIndex((cell) =>
      cell.inputId === inputId &&
      (offenseId === null || cell.offenseStrategy.id === offenseId) &&
      (defenseId === null || cell.defenseStrategy.id === defenseId));
    if (index >= 0) {
      cells = cells.map((cell, cellIndex) => cellIndex === index
        ? withFailure(cell, `OPPONENT_STRATEGY_ISOLATION:${isolationFailure}`)
        : cell);
    }
  }
  const everyAudit = (pick: (audit: I01IntegrationRow) => boolean): boolean =>
    cells.every((cell) => cell.audit !== null && pick(cell.audit));
  const terminalHistogram: Record<string, number> = {};
  const auditedSides: I01SideAudit[] = [];
  for (const cell of cells) {
    if (!cell.audit) continue;
    for (const side of [cell.audit.right, cell.audit.left]) {
      auditedSides.push(side);
      terminalHistogram[side.terminalReason] = (terminalHistogram[side.terminalReason] ?? 0) + 1;
    }
  }
  const representativeReplays = selectRepresentativeReplays(cells);
  const cellFailure = cells.find((cell) => !cell.passed);
  const firstFailure = cellFailure
    ? { id: cellFailure.id, reason: cellFailure.failures[0] ?? "unknown" }
    : isolationFailures.length > 0
      ? { id: isolationFailures[0], reason: "OPPONENT_STRATEGY_ISOLATION" }
      : representativeReplays.length === V00_PASS_THRESHOLDS.requiredRepresentativeReplayCount
        ? null
        : { id: "V01-REPLAYS", reason: "representative replay coverage missing" };
  const inDomainInputCount = [...domainFailures.values()].filter((failures) => failures.length === 0).length;
  const outOfDomainInputCount = V00_VALIDATION_INPUTS.length - inDomainInputCount;
  const candidateGeneralDefectCount = cells.filter((cell) =>
    cell.classification === "candidate_general_defect").length;
  const outOfDomainContractFailureCount = cells.filter((cell) =>
    cell.classification === "out_of_domain_contract_failure").length;
  const strategyEffectCausalityPassed = allCellsAudited && cells.every((cell) =>
    !cell.failures.includes("STRATEGY_EFFECT_WITHOUT_ADJUSTMENT"));
  const audit: Omit<V01IntegratedValidationAudit, "passed" | "firstFailure"> = {
    version: V01_AUDIT_VERSION,
    contractVersion: V00_CONTRACT_VERSION,
    manifestVersion: V00_INPUT_MANIFEST_VERSION,
    manifestHash: V00_MANIFEST_HASH,
    evidenceVersion: V00_EVIDENCE_VERSION,
    inputCount: V00_VALIDATION_INPUTS.length,
    inDomainInputCount,
    outOfDomainInputCount,
    matchupCount: V00_STRATEGY_MATCHUPS.length,
    cellCount: cells.length,
    worldCount: cells.length * V00_EXECUTION_ORDER.worlds.length,
    executionsPerWorld: 3,
    plannedSimulationCount: cells.length * V00_EXECUTION_ORDER.worlds.length *
      V00_EXECUTION_ORDER.perWorld.length,
    executedSimulationCount: cells.filter((cell) => cell.audit).length *
      V00_EXECUTION_ORDER.worlds.length * V00_EXECUTION_ORDER.perWorld.length,
    cells,
    passedCellCount: cells.filter((cell) => cell.passed).length,
    failedCellCount: cells.filter((cell) => !cell.passed).length,
    candidateGeneralDefectCount,
    outOfDomainContractFailureCount,
    formedWorldCount: auditedSides.filter((side) => side.readyTick !== null).length,
    safeExitWorldCount: auditedSides.filter((side) =>
      (side.terminalReason === "formation_aborted" ||
        side.terminalReason === "formation_timeout") && side.safeExitPassed).length,
    terminalHistogram,
    deterministic: everyAudit((row) => row.deterministic),
    mirrored: everyAudit((row) => row.mirrored),
    continuousPhaseAndPossession: everyAudit((row) =>
      row.sameSimulationWorldIdentity && row.formationReadyNextBoundary &&
      row.monotonicTickTime && row.playerContinuity && row.ballContinuity &&
      row.noTacticalReadBeforeHandoff),
    legalStateAndAction: everyAudit((row) =>
      row.playerContinuity && row.routesLegal && row.hardVetoPriorityPassed &&
      row.ballStatePassed && row.worldStatePassed && row.allowedTerminalsPassed),
    strategyReferenceCarry: everyAudit((row) =>
      row.strategyReferencesPassed && row.strategyPhaseCoveragePassed && row.strategyLocked),
    plannerOrderStable: everyAudit((row) =>
      row.evaluationOrderStable && row.defenseFirstEquivalent),
    informationBoundaryPassed: everyAudit((row) => row.informationBoundaryPassed),
    opponentStrategyIsolationPassed: opponentIsolation,
    roleOwnershipPassed: everyAudit((row) => row.roleOwnershipPassed),
    routesAndBallOwnershipPassed: everyAudit((row) => row.routesLegal && row.ballStatePassed),
    hardVetoPriorityPassed: everyAudit((row) => row.hardVetoPriorityPassed),
    publicEventCausalityPassed: everyAudit((row) => row.publicEventCausalityPassed),
    tacticalCompletionOrSafeExitPassed: everyAudit((row) =>
      row.tacticalResolutionPassed && row.safeExitPassed),
    teammateChannelAndPocketIntegrityPassed: everyAudit((row) =>
      row.teammateChannelPassed && row.pocketIntegrityPassed),
    localScreenCausalityPassed: everyAudit((row) => row.localScreenCausalityPassed),
    strategyEffectCausalityPassed,
    representativeReplays,
  };
  return {
    ...audit,
    firstFailure,
    passed: outOfDomainInputCount === 0 && cells.every((cell) => cell.passed) &&
      opponentIsolation && strategyEffectCausalityPassed &&
      representativeReplays.length === V00_PASS_THRESHOLDS.requiredRepresentativeReplayCount,
  };
}

export function makeV01RepresentativeReplayConfig(
  replaySpec: V01RepresentativeReplay,
): SimulationConfig {
  const input = V00_VALIDATION_INPUTS.find((candidate) => candidate.id === replaySpec.inputId);
  if (!input) throw new Error(`Unknown V01 representative input: ${replaySpec.inputId}`);
  return makeI02IntegrationConfig(
    input,
    matchupFor(replaySpec.matchupId),
    replaySpec.mirrored,
  );
}

export function createV01RepresentativeReplay(
  replaySpec: V01RepresentativeReplay,
): PnrSimulation {
  return new PnrSimulation(makeV01RepresentativeReplayConfig(replaySpec));
}

export function v01AllowedTerminal(reason: string): boolean {
  return (V00_ALLOWED_TERMINALS as readonly string[]).includes(reason);
}

export const V01_REPRESENTATIVE_RULE = V00_REPRESENTATIVE_REPLAY_RULE;
