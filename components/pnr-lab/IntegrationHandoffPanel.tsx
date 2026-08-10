import { PLAYER_IDS, type TeamPlan } from "@/lib/pnr-core";
import {
  makeI03RepresentativeReplayConfig,
  type I03IntegrationAudit,
  type I03RepresentativeReplay,
} from "@/lib/pnr-integration-audit";
import {
  I00_CONTRACT_VERSION,
  I00_INPUT_MANIFEST_VERSION,
  I00_MANIFEST_HASH,
  I00_RUNTIME_CONTRACT,
  I00_UPSTREAM_CONTRACT,
} from "@/lib/pnr-integration-manifest";
import type { UiSnapshot } from "./types";

const REPLAY_LABELS: Record<I03RepresentativeReplay["id"], string> = {
  "formed-handoff": "形成后连续交接",
  "strategy-carry": "既有策略全程携带",
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
  activeReplayId: I03RepresentativeReplay["id"];
  audit: I03IntegrationAudit;
  locked: boolean;
  onReplaySelect: (replayId: I03RepresentativeReplay["id"]) => void;
  snapshot: UiSnapshot;
}) {
  const replay =
    audit.replays.find((candidate) => candidate.id === activeReplayId) ??
    audit.replays[0];
  if (!replay) return null;
  const matrix = audit.i02;
  const row = matrix.rows.find((candidate) =>
    candidate.inputId === replay.inputId && candidate.matchupId === replay.matchupId);
  if (!row) throw new Error(`Missing I03 audit row: ${replay.inputId}/${replay.matchupId}`);
  const sideAudit = replay.mirrored ? row.audit.left : row.audit.right;
  const config = makeI03RepresentativeReplayConfig(replay);
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
  const recentStrategyRecords = snapshot.planning.length > 0
    ? snapshot.planning.map((record) =>
        `${record.team}:${record.strategy.id}@${record.strategy.version}/${record.decisionPhase}@${record.tick}`,
      ).join(" · ")
    : "等待首个球队规划记录";

  return (
    <section
      className="g01-probe g08-probe formation-generalization"
      aria-label="I00 到 I03 自动 Formation 连续交接与既有策略整合审计"
    >
      <div className="g01-probe__head">
        <div>
          <span className="eyebrow">
            I00–I03 · AUTO FORMATION → SAME-WORLD HANDOFF → MINIMUM-T@1
          </span>
          <h2>Formation → T · 既有策略连续回合</h2>
          <p>
            同一个 simulation、世界、固定时钟和球权从 formation_ready
            的下一规划边界进入 drop / chase
            与进攻二级读取；同一个已注册策略选择从 tick 0 携带到终局。
            面板只读展示，不向任一球队提供 side、anchor、计划或结果。
          </p>
        </div>
        <span
          className={"g01-status " + (audit.passed ? "is-pass" : "is-fail")}
        >
          {audit.passed ? "I00–I03 AUDIT PASS" : "I00–I03 AUDIT FAIL"}
        </span>
      </div>

      <div className="g01-summary formation-stage-summary">
        <div>
          <span>INPUT-ONLY CONTRACT</span>
          <strong>
            {matrix.inputCount} inputs × {matrix.matchupCount} matchups · {matrix.worldCount} worlds ×
            {matrix.executionsPerWorld}
          </strong>
          <small>
            {I00_CONTRACT_VERSION} · {I00_INPUT_MANIFEST_VERSION}
          </small>
        </div>
        <div>
          <span>SAME-WORLD CONTINUITY</span>
          <strong>
            {passLabel(
              matrix.sameSimulationWorldIdentity && matrix.monotonicTickTime,
            )}
          </strong>
          <small>
            position / velocity {passLabel(matrix.playerContinuity)} · ball{" "}
            {passLabel(matrix.ballContinuity)} · public causality{" "}
            {passLabel(matrix.publicEventCausalityPassed)}
          </small>
        </div>
        <div>
          <span>ORDER / INFORMATION</span>
          <strong>
            {passLabel(matrix.deterministic && matrix.defenseFirstEquivalent)}
          </strong>
          <small>
            defense-first {passLabel(matrix.defenseFirstEquivalent)} · no
            early T {passLabel(matrix.noTacticalReadBeforeHandoff)}
          </small>
        </div>
        <div>
          <span>CURRENT REPLAY</span>
          <strong>
            {REPLAY_LABELS[replay.id]} · {replay.side?.toUpperCase() ?? "NO SIDE"}
          </strong>
          <small>
            {replay.inputId} · {replay.matchupId} · {replay.terminalReason} ·{" "}
            {locked ? "LOCKED" : "READY"}
          </small>
        </div>
      </div>

      <div
        className="g01-replays formation-replays"
        aria-label="I03 四个审计后代表回放"
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
              {candidate.inputId} · {candidate.matchupId} · {candidate.side?.toUpperCase() ?? "NO SIDE"} ·{" "}
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
            {matrix.inputCount} locked inputs · hash{" "}
            {matrix.inputHash === I00_MANIFEST_HASH ? "MATCH" : "FAIL"}
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
            {I00_UPSTREAM_CONTRACT.tacticalVocabularyVersion} · {matrix.version}
          </small>
        </div>
        <div>
          <span>INPUT BOUNDARY</span>
          <strong>{replay.strategies.offense.id} × {replay.strategies.defense.id}</strong>
          <small>
            auto · form_pnr · tactical_resolution · caller side{" "}
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
          <em>recent team-owned strategy refs · {recentStrategyRecords}</em>
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
            world {passLabel(matrix.sameSimulationWorldIdentity)} · tick/time{" "}
            {passLabel(matrix.monotonicTickTime)}
          </strong>
          <small>
            players {passLabel(matrix.playerContinuity)} · ball{" "}
            {passLabel(matrix.ballContinuity)} · defense-first{" "}
            {passLabel(matrix.defenseFirstEquivalent)}
          </small>
          <em>
            determinism {passLabel(matrix.deterministic)} · ready boundary{" "}
            {passLabel(matrix.formationReadyNextBoundary)}
          </em>
        </div>
        <div>
          <span>MIRROR / INFO / POLICY</span>
          <strong>
            mirror {passLabel(matrix.mirrored)} · information{" "}
            {passLabel(matrix.informationBoundaryPassed)}
          </strong>
          <small>
            refs {passLabel(matrix.strategyReferencesPassed)} · phase carry{" "}
            {passLabel(matrix.strategyPhaseCoveragePassed)} · locked{" "}
            {passLabel(matrix.strategyLocked)}
          </small>
          <em>
            hard veto {passLabel(matrix.hardVetoPriorityPassed)} · effect causality{" "}
            {passLabel(matrix.strategyEffectCausalityPassed)} · default unchanged{" "}
            {passLabel(matrix.defaultBaselineUnchanged)} · observed differences{" "}
            {matrix.observedBehaviorDifferenceInputs} (legal) · adjustment{" "}
            {matrix.allObservedAdjustmentsZero ? "0 observed" : "nonzero"}
          </em>
        </div>
        <div>
          <span>TEAMMATE / POCKET / EXIT</span>
          <strong>
            channels {passLabel(matrix.teammateChannelPassed)} · pocket{" "}
            {passLabel(matrix.pocketIntegrityPassed)}
          </strong>
          <small>
            sealed T teammate {passLabel(audit.inheritedTacticalTeammateCoordinationPassed)} ·
            real pocket flight {passLabel(audit.inheritedTacticalPocketFlightPassed)}
          </small>
          <em>
            safe exit {passLabel(matrix.safeExitPassed)} · allowed terminals{" "}
            {passLabel(matrix.allowedTerminalsPassed)} · opponent isolation{" "}
            {passLabel(matrix.opponentStrategyIsolationPassed)}
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
