import {
  PLAYER_IDS,
  type CandidateEvaluation,
  type TeamPlan,
} from "@/lib/pnr-core";
import type { A00AutonomousSideAudit } from "@/lib/pnr-a00-autonomous-side-audit";
import {
  makeA01RepresentativeReplayConfig,
  type A01AutonomousSetupAudit,
  type A01RepresentativeReplay,
} from "@/lib/pnr-a01-autonomous-setup-audit";
import type { UiSnapshot } from "./types";

const REPLAY_LABELS: Record<A01RepresentativeReplay["id"], string> = {
  "longest-formed": "最晚形成",
  "tightest-corridor": "最窄走廊",
  "diverse-mirror": "不同 anchor 镜像",
  "safe-exit": "全 veto 安全退出",
};

function routePhase(plan: TeamPlan): string {
  if (!plan.route) return plan.id === "ABORT_FORMATION" ? "stationary abort intent" : "none";
  return Object.values(plan.route.tracks).flatMap((track) => {
    if (!track) return [];
    const segment = track.segments[track.segmentIndex];
    return segment
      ? [`${track.playerId}:${segment.phase}[${track.segmentIndex + 1}/${track.segments.length}]`]
      : [`${track.playerId}:complete`];
  }).join(" · ") || plan.route.kind;
}

function candidateTitle(candidate: CandidateEvaluation): string {
  const setup = candidate.autonomousSetup;
  if (!setup) return candidate.label;
  return `${setup.side.toUpperCase()} · ${setup.anchorId}`;
}

export function AutonomousSetupPanel({
  a00,
  a01,
  activeReplayId,
  locked,
  onReplaySelect,
  snapshot,
}: {
  a00: A00AutonomousSideAudit;
  a01: A01AutonomousSetupAudit;
  activeReplayId: A01RepresentativeReplay["id"];
  locked: boolean;
  onReplaySelect: (replayId: A01RepresentativeReplay["id"]) => void;
  snapshot: UiSnapshot;
}) {
  const replay = a01.replays.find((candidate) => candidate.id === activeReplayId) ??
    a01.replays[0];
  if (!replay) return null;
  const row = a01.rows.find((candidate) => candidate.id === replay.inputId);
  if (!row) throw new Error(`Missing A01 audit row: ${replay.inputId}`);
  const config = makeA01RepresentativeReplayConfig(replay);
  const initialFormationRecord = snapshot.formationPlanning;
  const initialChoice = initialFormationRecord?.candidates.find(
    (candidate) => candidate.label === initialFormationRecord.chosenLabel,
  );
  const observerSetup = snapshot.offensePlan.autonomousSetup ?? initialChoice?.autonomousSetup;
  const keyEvents = snapshot.formationEvents;
  const publicCommit = keyEvents.find((event) => event.type === "formation_side_committed");
  const failures = [
    ...(a00.firstFailure ? [`${a00.firstFailure.id}: ${a00.firstFailure.reason}`] : []),
    ...(a01.firstFailure ? [`${a01.firstFailure.id}: ${a01.firstFailure.reason}`] : []),
  ];
  const passed = a00.passed && a01.passed;
  const resolution = snapshot.world.terminal?.reason ??
    (snapshot.world.formation.phase === "pnr" ? "formation_ready" : "forming");

  return (
    <section
      className="g01-probe g08-probe formation-generalization"
      aria-label="A00 到 A01 自动组织挡拆审计"
    >
      <div className="g01-probe__head">
        <div>
          <span className="eyebrow">A00–A01 · PUBLIC GEOMETRY → PRIVATE TEAM PLAN → PUBLIC COMMIT</span>
          <h2>自动组织挡拆</h2>
          <p>调用方不提供 side 或 anchor。进攻在同一公开快照上比较固定候选；UI 仅以全知观察者显示私有选择，防守仍只消费真实运动与公开事件。</p>
        </div>
        <span className={"g01-status " + (passed ? "is-pass" : "is-fail")}>
          {passed ? "A00–A01 AUDIT PASS" : "A00–A01 AUDIT FAIL"}
        </span>
      </div>

      <div className="g01-summary formation-stage-summary">
        <div>
          <span>A00 · AUTO SIDE</span>
          <strong>{a00.inputCount} inputs / {a00.worldCount} worlds · each ×{a00.executionsPerWorld}</strong>
          <small>deterministic {a00.deterministic ? "PASS" : "FAIL"} · mirror {a00.mirrored ? "PASS" : "FAIL"} · commit/hysteresis {a00.minimumCommitPassed && a00.hysteresisPassed ? "PASS" : "FAIL"}</small>
        </div>
        <div>
          <span>A01 · SIDE × ANCHOR</span>
          <strong>2 sides × {a01.canonicalAnchorIds.length} anchors · {a01.worldCount} worlds</strong>
          <small>{a01.formedWorlds} formed · {a01.timeoutWorlds} inherited timeouts · {a01.safeExitWorlds} safe exits</small>
        </div>
        <div>
          <span>BOUNDARIES</span>
          <strong>{a01.informationBoundaryPassed && a01.evaluationOrderStable ? "INFORMATION / ORDER PASS" : "BOUNDARY FAIL"}</strong>
          <small>hard veto before score · strategy adjustment 0 · route segments {a01.routeSegmentsMonotonic ? "monotonic" : "regressed"}</small>
        </div>
        <div>
          <span>CURRENT REPLAY</span>
          <strong>{REPLAY_LABELS[replay.id]} · {replay.inputId}</strong>
          <small>{locked ? "RUNNING · replay locked" : "READY · choose one audited replay"}</small>
        </div>
      </div>

      <div className="g01-replays formation-replays" aria-label="四个 A00 A01 审计后代表回放">
        {a01.replays.map((candidate) => (
          <button
            aria-pressed={candidate.id === replay.id}
            className={candidate.id === replay.id ? "is-active" : ""}
            disabled={locked}
            key={candidate.id}
            onClick={() => onReplaySelect(candidate.id)}
            type="button"
          >
            <span>{REPLAY_LABELS[candidate.id]}</span>
            <strong>{candidate.inputId} · {candidate.side?.toUpperCase() ?? "NO SIDE"} · {candidate.anchorId ?? "NO ANCHOR"}</strong>
            <small>{candidate.note}</small>
          </button>
        ))}
      </div>

      <div className="formation-lock-grid">
        <div>
          <span>A00 INPUT-ONLY HASH</span>
          <strong>{a00.inputCount} locked inputs</strong>
          <small className="formation-hash" title={a00.inputHash}>{a00.inputHash}</small>
        </div>
        <div>
          <span>A01 INPUT-ONLY HASH</span>
          <strong>{a01.inputCount} locked inputs · first failure {a01.firstFailure?.id ?? "none"}</strong>
          <small className="formation-hash" title={a01.inputHash}>{a01.inputHash}</small>
        </div>
        <div>
          <span>CONFIG CONTRACT</span>
          <strong>setupMode auto · {config.formationDomainVersion}</strong>
          <small>caller screenSide {Object.hasOwn(config, "screenSide") ? "PRESENT · FAIL" : "absent"} · caller anchor absent · seed {config.seed}</small>
        </div>
      </div>

      <div className="formation-input-layout">
        <div>
          <span>PUBLIC INITIAL POSITIONS</span>
          <div className="g05-positions">
            {PLAYER_IDS.map((id) => (
              <div key={id}>
                <span>{id}</span>
                <strong>({config.initialPositions[id].x.toFixed(3)}, {config.initialPositions[id].y.toFixed(3)})</strong>
                <small>{id === "O1" ? "ball handler" : id === "O5" ? "screener" : `guards ${id === "D1" ? "O1" : "O5"}`}</small>
              </div>
            ))}
          </div>
        </div>
        <div>
          <span>OBSERVER-ONLY PRIVATE CHOICE</span>
          <strong>{observerSetup
            ? `${observerSetup.side.toUpperCase()} · ${observerSetup.anchorId}`
            : "全部固定组合被 veto"}</strong>
          <small>{observerSetup
            ? `anchor (${observerSetup.landmarks.screenAnchor.x.toFixed(3)}, ${observerSetup.landmarks.screenAnchor.y.toFixed(3)}) · ETA ${observerSetup.formationEta.toFixed(3)}s · corridor ${observerSetup.corridorClearance.toFixed(3)}m`
            : "无 side / anchor payload；进攻只提交 ABORT_FORMATION"}</small>
          <em>只读 observer 展示；不写回 simulation config 或任一 planner observation。</em>
        </div>
        <div>
          <span>PUBLIC WORLD</span>
          <strong>screenSide = {snapshot.world.screenSide ?? "未公开"}</strong>
          <small>commit {publicCommit ? `tick ${publicCommit.tick}` : "等待 O5 真实位移与速度"} · resolution {resolution}</small>
          <small>live ball {snapshot.world.ballOwner ?? "none"} · offense route {routePhase(snapshot.offensePlan)}</small>
        </div>
      </div>

      <div className="p03-current-grid formation-current-grid">
        <div>
          <span>CANONICAL CANDIDATES · INITIAL SNAPSHOT</span>
          <strong>{initialFormationRecord?.candidates.length ?? 0} evaluated · chosen {initialFormationRecord?.chosenLabel ?? "—"}</strong>
          <div className="candidate-list">
            {initialFormationRecord?.candidates.map((candidate, index) => (
              <div
                className={"candidate " + (candidate.feasible ? "" : "is-vetoed")}
                key={`${candidate.id}/${candidate.label}/${index}`}
              >
                <div>
                  <span>{candidateTitle(candidate)}</span>
                  <strong>{candidate.feasible && candidate.baseScore !== null
                    ? `BASE ${candidate.baseScore.toFixed(2)} + STRATEGY ${candidate.strategyAdjustment.toFixed(2)} = ${candidate.effectiveScore?.toFixed(2) ?? "VETO"}`
                    : "HARD VETO · SCORE BLOCKED"}</strong>
                </div>
                <p>{candidate.vetoes[0] ?? candidate.evidence.slice(0, 2).join(" · ")}</p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <span>LIVE OWNERSHIP / ROUTE</span>
          <strong>O · {snapshot.offensePlan.id} · {routePhase(snapshot.offensePlan)}</strong>
          <small>D · {snapshot.defensePlan.id} · {routePhase(snapshot.defensePlan)}</small>
          <em>{snapshot.roles.map((role) => `${role.playerId}→${role.owner}`).join(" · ")}</em>
        </div>
        <div>
          <span>PUBLIC CAUSAL TIMELINE</span>
          <strong>{keyEvents.length > 0 ? keyEvents.map((event) => `${event.type}@${event.tick}`).join(" → ") : "等待真实运动事实"}</strong>
          <small>audit resolution {row.resolution}@{row.resolvedTick} · mirror error {row.mirrorMaximumError.toExponential(2)}m</small>
          <em>安全退出要求 O1 持球、O1/O5 真实停止且无 screen_set / formation_ready。</em>
        </div>
      </div>

      {!passed && (
        <div className="g01-failures">
          {failures.map((reason) => <p key={reason}>{reason}</p>)}
        </div>
      )}
    </section>
  );
}
