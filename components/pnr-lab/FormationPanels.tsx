import { PLAYER_IDS, type ScreenSide, type TeamPlan } from "@/lib/pnr-core";
import { F00_AUDIT } from "@/lib/pnr-f00-formation";
import {
  makeFormationGeneralizationReplayConfig,
  type FormationGeneralizationReplay,
  type FormationGeneralizationReplayId,
  type FormationGeneralizationSummary,
} from "@/lib/pnr-formation-generalization-results";
import type { FormationSideAudit } from "@/lib/pnr-formation-audit";
import {
  UNDER_R2_AUDIT,
  UNDER_R2_REPLAYS,
  makeUnderR2ReplayConfig,
  type UnderR2ReplayId,
} from "@/lib/pnr-under-r2";
import type { UiSnapshot } from "./types";

export function F00FormationPanel({
  replayId,
  side,
  sideLocked,
  snapshot,
  onReplayChange,
  onSideChange,
}: {
  replayId: UnderR2ReplayId;
  side: ScreenSide;
  sideLocked: boolean;
  snapshot: UiSnapshot;
  onReplayChange: (replayId: UnderR2ReplayId) => void;
  onSideChange: (side: ScreenSide) => void;
}) {
  const config = makeUnderR2ReplayConfig(replayId, side);
  const activeReplay = UNDER_R2_REPLAYS.find((replay) => replay.id === replayId) ??
    UNDER_R2_REPLAYS[0];
  const isFormationReplay = replayId === "f00-gap";
  const auditSide = side === "right" ? F00_AUDIT.right : F00_AUDIT.left;
  const passed = UNDER_R2_AUDIT.passed;
  const diagnostics = auditSide.diagnostics;
  const keyEvents = (isFormationReplay ? auditSide.events : snapshot.events).filter((event) => [
    "screen_set",
    "formation_ready",
    "branch_use",
    "branch_reject",
    "contact_on",
    "screen_effective",
    "switch_completed",
    "under_committed",
    "under_recovery_blocked",
    "under_drive_advantage",
    "under_contained",
    "pullup_window",
    "pass_caught",
    "formation_timeout",
    "terminal",
  ].includes(event.type));
  const latestUnderRead = [...snapshot.planning].reverse().find(
    (record) => record.decisionPhase === "offense_under_read",
  );
  const underReadPlan = latestUnderRead?.chosen ??
    (isFormationReplay
      ? diagnostics.underReadPlan
      : UNDER_R2_AUDIT.deepRetreat.selectedPlan);
  const underTick = isFormationReplay
    ? diagnostics.underCommittedTick
    : UNDER_R2_AUDIT.deepRetreat.underTick;
  const underReadTick = isFormationReplay
    ? diagnostics.underReadTick
    : UNDER_R2_AUDIT.deepRetreat.readTick;
  const topologyReasons = Object.values(F00_AUDIT.topologyRejections).join(" · ");
  const failureReasons = [...new Set([
    ...F00_AUDIT.right.failures,
    ...F00_AUDIT.left.failures,
    ...F00_AUDIT.mirrorFailures,
    ...(!F00_AUDIT.topologyPassed ? ["F00_TOPOLOGY_REJECTION_GATE"] : []),
    ...(!F00_AUDIT.informationOwnership.passed
      ? ["F00_DEFENSE_INFORMATION_OWNERSHIP"]
      : []),
    ...UNDER_R2_AUDIT.deepRetreat.failures,
  ])];
  const currentFormationLabel = snapshot.world.under.active
    ? "UNDER 后二级读取"
    : snapshot.world.formation.phase === "pnr"
      ? "现有挡拆阅读"
    : snapshot.world.formation.screenSet && !snapshot.world.formation.jointReady
      ? "O5 已设稳 · 等待 O1"
      : snapshot.world.formation.jointReady
        ? "O1 / O5 联合就绪"
        : "形成掩护";

  const routePhase = (plan: TeamPlan): string => {
    if (!plan.route) return "none";
    const activeSegments = Object.values(plan.route.tracks).flatMap((track) => {
      if (!track) return [];
      const segment = track.segments[track.segmentIndex];
      return segment
        ? [`${track.playerId}:${segment.phase}[${track.segmentIndex + 1}/${track.segments.length}]`]
        : [`${track.playerId}:complete`];
    });
    return `v${plan.route.routeVersion} ${plan.route.boundary} · ${activeSegments.join(" · ")}`;
  };

  return (
    <section className="g01-probe g07-probe f00-probe" aria-label="F00 与 UNDER 二级读取纠偏">
      <div className="g01-probe__head">
        <div>
          <span className="eyebrow">F00-R2 · UNDER EVENT → NEXT-BOUNDARY OFFENSE READ</span>
          <h2>形成挡拆与 UNDER 二级读取</h2>
          <p>中立世界只发布 D1 已走下方；下一规划边界由进攻读取 D5 的真实深度、髋部路线和 contest 净空，再决定继续突破、真实急停或安全收住。</p>
        </div>
        <span className={"g01-status " + (passed ? "is-pass" : "is-fail")}>
          {passed ? "F00-R2 SEMANTIC PASS" : "F00-R2 SEMANTIC FAIL"}
        </span>
      </div>

      <div className="g01-summary">
        <div>
          <span>当前阶段</span>
          <strong>{currentFormationLabel}</strong>
          <small>{isFormationReplay ? `screen_set ${snapshot.world.formation.screenSetTick ?? "—"} · joint ready ${snapshot.world.formation.jointReadyTick ?? "—"} · PnR ${snapshot.world.formation.enteredPnrAtTick ?? "—"}` : "固定测试级 preset 起手；不加入 S 场景目录"}</small>
        </div>
        <div>
          <span>双运行</span>
          <strong>{(isFormationReplay
            ? auditSide.deterministic
            : side === "right"
              ? UNDER_R2_AUDIT.deepRetreat.deterministicRight
              : UNDER_R2_AUDIT.deepRetreat.deterministicLeft) ? "2 / 2 IDENTICAL" : "DIVERGED"}</strong>
          <small>{side.toUpperCase()} · {(isFormationReplay ? auditSide.terminalReason : UNDER_R2_AUDIT.deepRetreat.terminalReason)} · mirror {(isFormationReplay ? F00_AUDIT.mirrorMaximumError : UNDER_R2_AUDIT.deepRetreat.maximumMirrorError).toExponential(2)}m</small>
        </div>
        <div>
          <span>UNDER 二级读取</span>
          <strong>{underReadPlan ?? "等待 under_committed"}</strong>
          <small>under {underTick ?? "—"} · read {underReadTick ?? "—"} · 必须晚一 tick</small>
        </div>
        <div>
          <span>{isFormationReplay ? "交接责任与输入边界" : "真实 pullup 净空"}</span>
          <strong>{isFormationReplay
            ? `D1 篮筐侧 +${diagnostics.d1GoalSideMargin?.toFixed(2)}m`
            : `D5–O1 body gap ${UNDER_R2_AUDIT.deepRetreat.bodyGap?.toFixed(2)}m`}</strong>
          <small title={topologyReasons}>{isFormationReplay
            ? "4/4 非法模板拒绝；防守视图不含进攻私有地标"
            : `O1 ${UNDER_R2_AUDIT.deepRetreat.maximumO1Speed.toFixed(2)} → ${UNDER_R2_AUDIT.deepRetreat.finalO1Speed?.toFixed(2)}m/s 后才发布窗口`}</small>
          {!isFormationReplay && (
            <small>
              rim {UNDER_R2_AUDIT.deepRetreat.initialO1RimDistance.toFixed(2)} → {UNDER_R2_AUDIT.deepRetreat.finalO1RimDistance.toFixed(2)}m · post-clear progress {UNDER_R2_AUDIT.deepRetreat.rimwardProgressAfterClear?.toFixed(2)}m
            </small>
          )}
        </div>
      </div>

      <div className="g07-side-row">
        <div className="g07-side-switch" aria-label="选择 UNDER 代表回放">
          {UNDER_R2_REPLAYS.map((replay) => (
            <button
              aria-pressed={replay.id === replayId}
              className={replay.id === replayId ? "is-active" : ""}
              disabled={sideLocked}
              key={replay.id}
              onClick={() => onReplayChange(replay.id)}
              type="button"
            >
              {replay.label}
            </button>
          ))}
        </div>
        <div className="g07-side-switch" aria-label="选择 F00 真实运行侧">
          {(["right", "left"] as const).map((option) => (
            <button
              aria-pressed={side === option}
              className={side === option ? "is-active" : ""}
              disabled={sideLocked}
              key={option}
              onClick={() => onSideChange(option)}
              type="button"
            >
              {option === "right" ? "RIGHT · 右侧世界" : "LEFT · 左侧世界"}
            </button>
          ))}
        </div>
        <small>{sideLocked ? "运行已开始：回放与 side 均锁定；重置到 tick 0 后才可切换。" : activeReplay.note}</small>
      </div>

      <div className="g07-current">
        <div>
          <span className="eyebrow">{isFormationReplay ? "PUBLIC OFFSET START" : "TEST-LEVEL DEEP RETREAT INPUT"} · {side.toUpperCase()}</span>
          <strong>screen anchor ({snapshot.world.landmarks.screenAnchor.x.toFixed(2)}, {snapshot.world.landmarks.screenAnchor.y.toFixed(2)})</strong>
          <small>Observer debug：O1 waiting ({snapshot.world.landmarks.handlerWaitingPoint.x.toFixed(2)}, {snapshot.world.landmarks.handlerWaitingPoint.y.toFixed(2)})；防守规划输入不含 waiting/use/reject</small>
        </div>
        <div className="g05-positions">
          {PLAYER_IDS.map((id) => (
            <div key={id}>
              <span>{id}</span>
              <strong>({config.initialPositions[id].x.toFixed(2)}, {config.initialPositions[id].y.toFixed(2)})</strong>
              <small>{isFormationReplay ? "固定公开 Formation 起手" : "固定测试级深沉退起手"}</small>
            </div>
          ))}
        </div>
      </div>

      <div className="p03-current-grid">
        <div>
          <span>LIVE TEAM PLANS</span>
          <strong>O · {snapshot.offensePlan.id}</strong>
          <small>D · {snapshot.defensePlan.id}</small>
          <small>O route {routePhase(snapshot.offensePlan)}</small>
          <small>D route {routePhase(snapshot.defensePlan)}</small>
          <em>Formation 与 UNDER 二级读取的策略 adjustment 均固定为 0</em>
        </div>
        <div>
          <span>LIVE ROLE OWNERSHIP</span>
          <strong>{snapshot.roles.map((role) => `${role.playerId} ${role.roleCode}`).join(" · ")}</strong>
          <small>每名球员始终只有一个本队规划器角色所有者</small>
        </div>
        <div>
          <span>SEMANTIC GATE · DIAGNOSTIC TIMELINE</span>
          <small>under_committed · next-tick offense_under_read · 真实运动 · 世界结果</small>
          <strong>{keyEvents.length > 0 ? keyEvents.map((event) => `${event.type}@${event.tick}`).join(" → ") : "等待公开事件"}</strong>
          <small>{isFormationReplay ? `${diagnostics.firstOffensePlan} × ${diagnostics.firstDefensePlan} · ${diagnostics.terminalReason}@${diagnostics.terminalTick}` : `TAKE_UNDER_PULLUP · pullup_window@${UNDER_R2_AUDIT.deepRetreat.pullupTick}`}</small>
        </div>
      </div>

      {latestUnderRead && (
        <div className="p03-current-grid" aria-label="UNDER 候选、评分与否决">
          {latestUnderRead.candidates.map((candidate) => (
            <div key={candidate.id}>
              <span>{candidate.id}</span>
              <strong>{candidate.feasible ? "FEASIBLE" : "VETOED"}</strong>
              <small>{candidate.baseScore ?? "—"} + {candidate.strategyAdjustment.toFixed(2)} = {candidate.effectiveScore ?? "—"}</small>
              <em>{candidate.feasible ? candidate.evidence[0] : candidate.vetoes[0]}</em>
            </div>
          ))}
        </div>
      )}

      {!passed && (
        <div className="g01-failures">
          {failureReasons.map((reason) => <p key={reason}>{reason}</p>)}
        </div>
      )}
    </section>
  );
}
function auditedFormationWorld(
  summary: FormationGeneralizationSummary,
  replay: FormationGeneralizationReplay,
): FormationSideAudit {
  if (replay.stage === "F01" || replay.stage === "F02") {
    const audit = replay.stage === "F01" ? summary.f01 : summary.f02;
    const row = audit.rows.find((candidate) => candidate.id === replay.sampleId);
    if (!row) throw new Error(`Missing ${replay.stage} audit row: ${replay.sampleId}`);
    return replay.side === "right" ? row.right : row.left;
  }
  const row = summary.f03.rows.find((candidate) => candidate.id === replay.sampleId);
  if (!row) throw new Error(`Missing F03 audit row: ${replay.sampleId}`);
  return row.primary.side === replay.side ? row.primary : row.correspondingMirror;
}

export function FormationGeneralizationPanel({
  activeReplayId,
  locked,
  onReplaySelect,
  snapshot,
  summary,
}: {
  activeReplayId: FormationGeneralizationReplayId;
  locked: boolean;
  onReplaySelect: (replayId: FormationGeneralizationReplayId) => void;
  snapshot: UiSnapshot;
  summary: FormationGeneralizationSummary;
}) {
  const activeReplay = summary.replays.find((replay) => replay.id === activeReplayId) ??
    summary.replays[0];
  if (!activeReplay) return null;
  const auditedWorld = auditedFormationWorld(summary, activeReplay);
  const config = makeFormationGeneralizationReplayConfig(activeReplay);
  const ticks = auditedWorld.eventTicks;
  const keyEvents = auditedWorld.events.filter((event) => [
    "screen_set",
    "formation_ready",
    "branch_use",
    "branch_reject",
    "screen_cleared",
    "formation_timeout",
    "terminal",
  ].includes(event.type));
  const displayMeters = (value: number): string =>
    (Math.abs(value) < 0.0005 ? 0 : value).toFixed(3);
  const routePhase = (plan: TeamPlan): string => {
    if (!plan.route) return "none";
    return Object.values(plan.route.tracks).flatMap((track) => {
      if (!track) return [];
      const segment = track.segments[track.segmentIndex];
      return segment
        ? [`${track.playerId}:${segment.phase}[${track.segmentIndex + 1}/${track.segments.length}]`]
        : [`${track.playerId}:complete`];
    }).join(" · ") || plan.route.kind;
  };
  const observerSummary = (team: "offense" | "defense"): string =>
    auditedWorld.observerPlans
      .filter((plan) => plan.team === team)
      .map((plan) => {
        const phases = [...new Set(plan.segments.map(
          (segment) => `${segment.playerId}:${segment.phase}`,
        ))];
        const route = plan.routeKind
          ? `${plan.routeKind} · ${phases.join("/")}`
          : "no-private-route";
        return `${plan.planId} [${route}]`;
      })
      .filter((entry, index, entries) => index === 0 || entry !== entries[index - 1])
      .join(" → ");
  const failureReasons = [
    ...summary.f01.failureReasons,
    ...summary.f02.failureReasons,
    ...summary.f03.failureReasons,
  ];

  return (
    <section
      className="g01-probe g08-probe formation-generalization"
      aria-label="F01 到 F03 Formation 泛化审计"
    >
      <div className="g01-probe__head">
        <div>
          <span className="eyebrow">F01–F03 · STRUCTURED → BOUNDED RANDOM → LOCKED HELD-OUT</span>
          <h2>Formation 泛化</h2>
          <p>同一组 FORM_SCREEN / TRACK_FORMATION 原语；公开几何输入先验合法，真实运动决定形成、旧挡拆分支或明确安全退出。</p>
        </div>
        <span className={"g01-status " + (summary.passed ? "is-pass" : "is-fail")}>
          {summary.passed ? "F01–F03 AUDIT PASS" : "F01–F03 AUDIT FAIL"}
        </span>
      </div>

      <div className="g01-summary formation-stage-summary">
        <div>
          <span>F01 · STRUCTURED</span>
          <strong>{summary.stageStatus.F01} · {summary.f01.canonicalInputCount} inputs / {summary.f01.worldCount} worlds</strong>
          <small>{summary.f01.successfulFormationWorlds} formed · {summary.f01.safeExitWorlds} safe exits · each world ×{summary.f01.executionsPerWorld}</small>
        </div>
        <div>
          <span>F02 · BOUNDED RANDOM</span>
          <strong>{summary.stageStatus.F02} · {summary.f02.canonicalInputCount} inputs / {summary.f02.worldCount} worlds</strong>
          <small>{summary.f02.successfulFormationWorlds} formed · {summary.f02.safeExitWorlds} safe exits · seed {summary.f02Seed}</small>
        </div>
        <div>
          <span>F03 · HELD-OUT</span>
          <strong>{summary.stageStatus.F03} · {summary.f03.executedCount}/{summary.f03.manifestCount}</strong>
          <small>{summary.f03.successfulFormationWorlds} formed · {summary.f03.safeExitWorlds} safe exits · {summary.f03.primaryWorldCount} manifest + {summary.f03.correspondingMirrorWorldCount} mirrors · each world ×{summary.f03.executionsPerWorld}</small>
        </div>
        <div>
          <span>CURRENT LOCK</span>
          <strong>{activeReplay.stage} · {activeReplay.sampleId} · {activeReplay.side.toUpperCase()}</strong>
          <small>{locked ? "RUNNING · sample/side locked" : "READY · choose one audited replay"}</small>
        </div>
      </div>

      <div className="g01-replays formation-replays" aria-label="四个审计后代表回放">
        {summary.replays.map((replay) => (
          <button
            aria-pressed={replay.id === activeReplay.id}
            className={replay.id === activeReplay.id ? "is-active" : ""}
            disabled={locked}
            key={replay.id}
            onClick={() => onReplaySelect(replay.id)}
            type="button"
          >
            <span>{replay.label}</span>
            <strong>{replay.sampleId} · {replay.side.toUpperCase()}</strong>
            <small>{replay.note}</small>
          </button>
        ))}
      </div>

      <div className="formation-lock-grid">
        <div>
          <span>F02 SEED / INPUT HASH</span>
          <strong>{summary.f02Seed} · {summary.f02Generation.acceptedCount}/{summary.f02Generation.candidateCount}</strong>
          <small className="formation-hash" title={summary.f02InputHash}>{summary.f02InputHash}</small>
        </div>
        <div>
          <span>F03 FROZEN CORE</span>
          <strong title={summary.f03FrozenCoreCommit}>{summary.f03FrozenCoreCommit.slice(0, 12)}</strong>
          <small>{summary.f03Generation.candidateCount} candidates · {summary.f03Generation.geometryRejectedCount} geometry rejects · seed {summary.f03ManifestSeed}</small>
        </div>
        <div>
          <span>F03 MANIFEST COMMIT / HASH</span>
          <strong title={summary.f03ManifestCommit}>{summary.f03ManifestCommit.slice(0, 12)}</strong>
          <small className="formation-hash" title={summary.f03ManifestHash}>{summary.f03ManifestHash}</small>
        </div>
      </div>

      <div className="formation-input-layout">
        <div>
          <span>PUBLIC INITIAL POSITIONS · {activeReplay.side.toUpperCase()}</span>
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
          <span>PUBLIC FORMATION LANDMARKS</span>
          {Object.entries(snapshot.world.landmarks).map(([name, value]) => (
            <small key={name}>{name} ({value.x.toFixed(3)}, {value.y.toFixed(3)})</small>
          ))}
          <strong>screenSide = {snapshot.world.screenSide}</strong>
        </div>
        <div>
          <span>AUDITED METRICS</span>
          <strong>formation {auditedWorld.formationTimeSeconds.toFixed(3)}s · min body {displayMeters(auditedWorld.minimumBodyGap)}m</strong>
          <small>initial clearance {displayMeters(auditedWorld.initialMinimumBodyGap)}m · replans O/D {auditedWorld.offenseReplans}/{auditedWorld.defenseReplans}</small>
          <small>safe exit {auditedWorld.safeExitReason ?? "none"} · terminal {auditedWorld.terminalReason}@{auditedWorld.terminalTick}</small>
        </div>
      </div>

      <div className="p03-current-grid formation-current-grid">
        <div>
          <span>LIVE TEAM PLANS / PRIVATE ROUTES · OBSERVER</span>
          <strong>O · {snapshot.offensePlan.id} · {routePhase(snapshot.offensePlan)}</strong>
          <small>D · {snapshot.defensePlan.id} · {routePhase(snapshot.defensePlan)}</small>
          <em>O audit: {observerSummary("offense")}</em>
          <em>D audit: {observerSummary("defense")}</em>
        </div>
        <div>
          <span>LIVE ROLE OWNERSHIP</span>
          <strong>{snapshot.roles.map((role) => `${role.playerId}:${role.roleCode}`).join(" · ")}</strong>
          <small>{snapshot.roles.map((role) => `${role.playerId}→${role.owner}`).join(" · ")}</small>
          <em>Observer display only；不回流至球队规划输入。</em>
        </div>
        <div>
          <span>CAUSAL TIMELINE</span>
          <strong>set {ticks.screenSet ?? "—"} · ready {ticks.jointReady ?? "—"} · branch {ticks.branch ?? "—"}</strong>
          <small>screen_cleared {ticks.screenCleared ?? "—"} · terminal {ticks.terminal ?? "—"}</small>
          <div className="p03-event-line">
            {keyEvents.map((event) => <i key={`${event.type}/${event.tick}`}>{event.type}@{event.tick}</i>)}
          </div>
        </div>
      </div>

      {!summary.passed && (
        <div className="g01-failures">
          {failureReasons.map((reason) => <p key={reason}>{reason}</p>)}
        </div>
      )}
    </section>
  );
}
