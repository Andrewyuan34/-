import { PLAYER_IDS, type TeamPlan } from "@/lib/pnr-core";
import {
  makeI01RepresentativeReplayConfig,
  type I01IntegrationAudit,
  type I01RepresentativeReplay,
} from "@/lib/pnr-integration-audit";
import {
  I00_CONTRACT_VERSION,
  I00_INPUT_MANIFEST_VERSION,
  I00_MANIFEST_HASH,
  I00_RUNTIME_CONTRACT,
  I00_UPSTREAM_CONTRACT,
} from "@/lib/pnr-integration-manifest";
import type { UiSnapshot } from "./types";

const REPLAY_LABELS: Record<I01RepresentativeReplay["id"], string> = {
  "formed-handoff": "形成后连续交接",
  "chase-read": "CHASE 后进攻读取",
  "mirrored-handoff": "同一路径真实镜像",
  "safe-exit": "Formation 安全退出",
};

const CAUSAL_EVENTS = new Set([
  "formation_side_committed",
  "screen_set",
  "formation_ready",
  "drop_committed",
  "chase_over_committed",
  "pocket_window_open",
  "pocket_pass_launched",
  "pocket_pass_caught",
  "tactical_drive_advantage",
  "tactical_pullup_window",
  "tactical_snake_advantage",
  "tactical_contained",
  "formation_aborted",
  "formation_timeout",
  "terminal",
]);

function routePhase(plan: TeamPlan): string {
  if (!plan.route) {
    return plan.id === "ABORT_FORMATION" ? "stationary abort intent" : "none";
  }
  return (
    Object.values(plan.route.tracks)
      .flatMap((track) => {
        if (!track) return [];
        const segment = track.segments[track.segmentIndex];
        return segment
          ? [
              `${track.playerId}:${segment.phase}[${track.segmentIndex + 1}/${track.segments.length}]`,
            ]
          : [`${track.playerId}:complete`];
      })
      .join(" · ") || plan.route.kind
  );
}

function passLabel(value: boolean): string {
  return value ? "PASS" : "FAIL";
}

export function IntegrationHandoffPanel({
  activeReplayId,
  audit,
  locked,
  onReplaySelect,
  snapshot,
}: {
  activeReplayId: I01RepresentativeReplay["id"];
  audit: I01IntegrationAudit;
  locked: boolean;
  onReplaySelect: (replayId: I01RepresentativeReplay["id"]) => void;
  snapshot: UiSnapshot;
}) {
  const replay =
    audit.replays.find((candidate) => candidate.id === activeReplayId) ??
    audit.replays[0];
  if (!replay) return null;
  const row = audit.rows.find((candidate) => candidate.id === replay.inputId);
  if (!row) throw new Error(`Missing I01 audit row: ${replay.inputId}`);
  const sideAudit = replay.mirrored ? row.left : row.right;
  const config = makeI01RepresentativeReplayConfig(replay);
  const initialFormationRecord = snapshot.formationPlanning;
  const initialChoice = initialFormationRecord?.candidates.find(
    (candidate) => candidate.label === initialFormationRecord.chosenLabel,
  );
  const observerSetup = initialChoice?.autonomousSetup;
  const liveEvents = [
    ...new Map(
      [...snapshot.formationEvents, ...snapshot.events].map((event) => [
        event.id,
        event,
      ]),
    ).values(),
  ]
    .filter((event) => CAUSAL_EVENTS.has(event.type))
    .sort(
      (a, b) =>
        a.tick - b.tick || a.order - b.order || a.id.localeCompare(b.id),
    );
  const liveTimeline =
    liveEvents.length > 0
      ? liveEvents.map((event) => `${event.type}@${event.tick}`).join(" → ")
      : "等待真实 Formation 运动事实";
  const auditedTimeline =
    (sideAudit.readyTick === null || sideAudit.readyTick === undefined)
      ? `${sideAudit.terminalReason} · 未进入 T handoff`
      : [
          `formation_ready@${sideAudit.readyTick}`,
          `handoff@${sideAudit.handoffTick}`,
          sideAudit.defenseCoverages.join("/") || "coverage pending",
          sideAudit.offenseReads.join("/") || "offense read pending",
          `${sideAudit.terminalReason}@${sideAudit.terminalTick}`,
        ].join(" → ");

  return (
    <section
      className="g01-probe g08-probe formation-generalization"
      aria-label="I00 到 I01 自动 Formation 连续交接最小战术词汇审计"
    >
      <div className="g01-probe__head">
        <div>
          <span className="eyebrow">
            I00–I01 · AUTO FORMATION → SAME-WORLD HANDOFF → MINIMUM-T@1
          </span>
          <h2>Formation → T 连续交接</h2>
          <p>
            同一个 simulation、世界、固定时钟和球权从 formation_ready
            的下一规划边界进入 drop / chase
            与进攻二级读取；面板只读展示，不向任一球队提供
            side、anchor、计划或结果。
          </p>
        </div>
        <span
          className={"g01-status " + (audit.passed ? "is-pass" : "is-fail")}
        >
          {audit.passed ? "I00–I01 AUDIT PASS" : "I00–I01 AUDIT FAIL"}
        </span>
      </div>

      <div className="g01-summary formation-stage-summary">
        <div>
          <span>INPUT-ONLY CONTRACT</span>
          <strong>
            {audit.inputCount} inputs / {audit.worldCount} worlds · each ×
            {audit.executionsPerWorld}
          </strong>
          <small>
            {I00_CONTRACT_VERSION} · {I00_INPUT_MANIFEST_VERSION}
          </small>
        </div>
        <div>
          <span>SAME-WORLD CONTINUITY</span>
          <strong>
            {passLabel(
              audit.sameSimulationWorldIdentity && audit.monotonicTickTime,
            )}
          </strong>
          <small>
            position / velocity {passLabel(audit.playerContinuity)} · ball{" "}
            {passLabel(audit.ballContinuity)} · public causality{" "}
            {passLabel(audit.publicEventCausalityPassed)}
          </small>
        </div>
        <div>
          <span>ORDER / INFORMATION</span>
          <strong>
            {passLabel(audit.deterministic && audit.evaluationOrderStable)}
          </strong>
          <small>
            defense-first {passLabel(audit.defenseFirstEquivalent)} · no
            early T {passLabel(audit.noTacticalReadBeforeHandoff)}
          </small>
        </div>
        <div>
          <span>CURRENT REPLAY</span>
          <strong>
            {REPLAY_LABELS[replay.id]} · {replay.side?.toUpperCase() ?? "NO SIDE"}
          </strong>
          <small>
            {replay.inputId} · {replay.terminalReason} ·{" "}
            {locked ? "LOCKED" : "READY"}
          </small>
        </div>
      </div>

      <div
        className="g01-replays formation-replays"
        aria-label="I01 四个审计后代表回放"
      >
        {audit.replays.map((candidate) => (
          <button
            aria-pressed={candidate.id === replay.id}
            className={candidate.id === replay.id ? "is-active" : ""}
            disabled={locked}
            key={candidate.id}
            onClick={() => onReplaySelect(candidate.id)}
            type="button"
          >
            <span>{REPLAY_LABELS[candidate.id]}</span>
            <strong>
              {candidate.inputId} · {candidate.side?.toUpperCase() ?? "NO SIDE"} ·{" "}
              {candidate.terminalReason}
            </strong>
            <small>{candidate.note}</small>
          </button>
        ))}
      </div>

      <div className="formation-lock-grid">
        <div>
          <span>I00 INPUT-ONLY HASH</span>
          <strong>
            {audit.inputCount} locked inputs · hash{" "}
            {audit.inputHash === I00_MANIFEST_HASH ? "MATCH" : "FAIL"}
          </strong>
          <small className="formation-hash" title={I00_MANIFEST_HASH}>
            {I00_MANIFEST_HASH}
          </small>
        </div>
        <div>
          <span>EXPLICIT VERSION TUPLE</span>
          <strong>{I00_RUNTIME_CONTRACT.integrationVersion}</strong>
          <small>
            {I00_UPSTREAM_CONTRACT.formationDomainVersion} →{" "}
            {I00_UPSTREAM_CONTRACT.tacticalVocabularyVersion}
          </small>
        </div>
        <div>
          <span>INPUT BOUNDARY</span>
          <strong>auto · form_pnr · tactical_resolution</strong>
          <small>
            caller side{" "}
            {Object.hasOwn(config, "screenSide") ? "PRESENT / FAIL" : "absent"}{" "}
            · caller anchor absent · expected result absent
          </small>
        </div>
      </div>

      <div className="formation-input-layout">
        <div>
          <span>
            PUBLIC INITIAL POSITIONS · {replay.side?.toUpperCase() ?? "NO SIDE"}
          </span>
          <div className="g05-positions">
            {PLAYER_IDS.map((id) => (
              <div key={id}>
                <span>{id}</span>
                <strong>
                  ({config.initialPositions[id].x.toFixed(3)},{" "}
                  {config.initialPositions[id].y.toFixed(3)})
                </strong>
                <small>
                  {id === "O1"
                    ? "ball handler"
                    : id === "O5"
                      ? "screener"
                      : `guards ${id === "D1" ? "O1" : "O5"}`}
                </small>
              </div>
            ))}
          </div>
        </div>
        <div>
          <span>OBSERVER-ONLY FORMATION CHOICE</span>
          <strong>
            {observerSetup
              ? `${observerSetup.side.toUpperCase()} · ${observerSetup.anchorId}`
              : "尚无私有 formation choice"}
          </strong>
          <small>
            {observerSetup
              ? `anchor (${observerSetup.landmarks.screenAnchor.x.toFixed(3)}, ${observerSetup.landmarks.screenAnchor.y.toFixed(3)})`
              : "等待进攻从公开几何独立选择"}
          </small>
          <em>
            仅供全知 UI 观察；不写回 config、world 或 planner observation。
          </em>
        </div>
        <div>
          <span>LIVE SAME-WORLD HANDOFF</span>
          <strong>
            {snapshot.world.formation.phase === "pnr"
              ? `PNR · ${snapshot.world.tacticalVocabularyVersion ?? "no T version"}`
              : (snapshot.world.terminal?.reason ?? "FORMATION")}
          </strong>
          <small>
            tick {snapshot.world.tick} · ball{" "}
            {snapshot.world.ballOwner ?? "none"} · O {snapshot.offensePlan.id} ·
            D {snapshot.defensePlan.id}
          </small>
          <small>
            O route {routePhase(snapshot.offensePlan)} · D route{" "}
            {routePhase(snapshot.defensePlan)}
          </small>
        </div>
      </div>

      <div className="p03-current-grid formation-current-grid">
        <div>
          <span>FORMATION_READY → HANDOFF → T</span>
          <strong>{auditedTimeline}</strong>
          <small>
            {sideAudit.readyTick === null
              ? "safe exit · no formation_ready and no tactical read"
              : `ready event becomes planner-visible at tick ${sideAudit.readyAvailableAtTick}; handoff uses that shared planning boundary`}
          </small>
          <em>live · {liveTimeline}</em>
        </div>
        <div>
          <span>CONTINUITY / ORDER GATES</span>
          <strong>
            world {passLabel(audit.sameSimulationWorldIdentity)} · tick/time{" "}
            {passLabel(audit.monotonicTickTime)}
          </strong>
          <small>
            players {passLabel(audit.playerContinuity)} · ball{" "}
            {passLabel(audit.ballContinuity)} · defense-first{" "}
            {passLabel(audit.defenseFirstEquivalent)}
          </small>
          <em>
            determinism {passLabel(audit.deterministic)} · evaluation order{" "}
            {passLabel(audit.evaluationOrderStable)}
          </em>
        </div>
        <div>
          <span>MIRROR / INFO / ZERO</span>
          <strong>
            mirror {passLabel(audit.mirrored)} · information{" "}
            {passLabel(audit.informationBoundaryPassed)}
          </strong>
          <small>
            no T before ready {passLabel(audit.noTacticalReadBeforeHandoff)} ·
            strategy adjustment{" "}
            {audit.zeroStrategyAdjustment ? "0 / PASS" : "FAIL"}
          </small>
          <em>
            safe exit {passLabel(audit.safeExitPassed)} · allowed terminals{" "}
            {passLabel(audit.allowedTerminalsPassed)}
          </em>
        </div>
      </div>

      {!audit.passed && (
        <div className="g01-failures">
          <p>
            {audit.firstFailure?.id}: {audit.firstFailure?.reason}
          </p>
        </div>
      )}
    </section>
  );
}
