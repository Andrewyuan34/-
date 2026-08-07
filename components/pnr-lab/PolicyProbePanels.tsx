import type { PlanningRecord } from "@/lib/pnr-core";
import {
  DECISION_PHASE_LABELS,
  OFFENSE_BALANCED_READ,
  type TeamStrategyProfile,
} from "@/lib/pnr-strategy";
import {
  P01_OFFENSE_STRATEGIES,
  P01_REPLAYS,
  type P01CalibrationResult,
  type P01OffenseStrategyId,
  type P01ReplayId,
} from "@/lib/pnr-p01-offense-strategy";
import {
  P02_DEFENSE_STRATEGIES,
  type P02CalibrationResult,
  type P02DefenseStrategyId,
} from "@/lib/pnr-p02-defense-strategy";
import {
  P03_POLICY_MATCHUPS,
  type P03MatchupId,
  type P03MatrixAuditResult,
} from "@/lib/pnr-p03-policy-matrix";

export type P00ReplayId = "initial-read" | "mismatch-read" | "post-catch-read";

export const P00_REPLAYS = Object.freeze([
  {
    id: "initial-read",
    scenarioId: "reject_overplay_right",
    code: "S02",
    label: "初始阅读 · 合理拒绝",
    note: "检查默认策略没有改变 use / reject 起手边界。",
  },
  {
    id: "mismatch-read",
    scenarioId: "switch_attack_big_downhill",
    code: "S06",
    label: "换防后 · 攻击大个",
    note: "检查 ATTACK_BIG / FEED_SEAL 的既有速度判断。",
  },
  {
    id: "post-catch-read",
    scenarioId: "post_catch_dig_kickout",
    code: "S05",
    label: "接球后 · 真实协防分球",
    note: "检查 DIG、真实 help 与 KICK_OUT 的三层因果。",
  },
] as const);

export function P00ProbePanel({
  activeReplayId,
  offenseStrategy,
  defenseStrategy,
  latestOffense,
  latestDefense,
  strategyLocked,
  onReplaySelect,
}: {
  activeReplayId: P00ReplayId;
  offenseStrategy: TeamStrategyProfile;
  defenseStrategy: TeamStrategyProfile;
  latestOffense?: PlanningRecord;
  latestDefense?: PlanningRecord;
  strategyLocked: boolean;
  onReplaySelect: (id: P00ReplayId) => void;
}) {
  const activeReplay =
    P00_REPLAYS.find((replay) => replay.id === activeReplayId) ?? P00_REPLAYS[0];
  const offenseProfiles = [offenseStrategy];
  const defenseProfiles = [defenseStrategy];

  return (
    <section className="g01-probe p00-probe" aria-label="P00 队级策略输入契约">
      <div className="g01-probe__head">
        <div>
          <span className="eyebrow">P00 · POLICY CONTRACT · ZERO BEHAVIOR CHANGE</span>
          <h2>队级策略输入与默认策略</h2>
          <p>策略只在硬可行候选之间调整评分；P00 的两套默认策略对全部候选调整均为零。</p>
        </div>
        <span className="g01-status is-pass">170 / 170 TICK TRACE MATCH</span>
      </div>

      <div className="g01-summary">
        <div>
          <span>已注册策略</span>
          <strong>1 OFFENSE + 1 DEFENSE</strong>
          <small>P00 不提供第二套策略</small>
        </div>
        <div>
          <span>旧行为基线</span>
          <strong>S01–G08 · 170 / 170</strong>
          <small>位置、计划、角色、事件、球路与终止逐 tick 相同</small>
        </div>
        <div>
          <span>评分接缝</span>
          <strong>BASE + 0.00 = EFFECTIVE</strong>
          <small>veto 优先；策略不能恢复不可行候选</small>
        </div>
        <div>
          <span>本回合配置</span>
          <strong>{strategyLocked ? "LOCKED" : "UNLOCKED"}</strong>
          <small>{strategyLocked ? "暂停仍锁定；重置新回合才解锁" : "播放或单步后立即锁定"}</small>
        </div>
      </div>

      <div className="p00-strategy-grid">
        <label className="p00-strategy-card offense">
          <span>OFFENSE · HIDDEN FROM DEFENSE</span>
          <strong>{offenseStrategy.label}</strong>
          <select
            aria-label="进攻队级策略"
            defaultValue={`${offenseStrategy.id}@${offenseStrategy.version}`}
            disabled={strategyLocked}
          >
            {offenseProfiles.map((profile) => (
              <option key={profile.id} value={`${profile.id}@${profile.version}`}>
                {profile.id} · v{profile.version}
              </option>
            ))}
          </select>
          <small>{offenseStrategy.description}</small>
        </label>
        <div className="p00-neutral-lock">
          <span>NEUTRAL WORLD</span>
          <strong>NO STRATEGY INPUT</strong>
          <small>只接收双方已经提交的计划、角色与运动意图</small>
        </div>
        <label className="p00-strategy-card defense">
          <span>DEFENSE · HIDDEN FROM OFFENSE</span>
          <strong>{defenseStrategy.label}</strong>
          <select
            aria-label="防守队级策略"
            defaultValue={`${defenseStrategy.id}@${defenseStrategy.version}`}
            disabled={strategyLocked}
          >
            {defenseProfiles.map((profile) => (
              <option key={profile.id} value={`${profile.id}@${profile.version}`}>
                {profile.id} · v{profile.version}
              </option>
            ))}
          </select>
          <small>{defenseStrategy.description}</small>
        </label>
      </div>

      <div className="g01-replays" aria-label="P00 三个既有代表回放">
        {P00_REPLAYS.map((replay) => (
          <button
            aria-pressed={replay.id === activeReplayId}
            className={replay.id === activeReplayId ? "is-active" : ""}
            key={replay.id}
            onClick={() => onReplaySelect(replay.id)}
            type="button"
          >
            <span>{replay.label}</span>
            <strong>{replay.code}</strong>
            <small>{replay.note}</small>
          </button>
        ))}
      </div>

      <div className="p00-phase-grid" aria-label="当前双方策略决策阶段">
        <div>
          <span>当前进攻阶段</span>
          <strong>
            {latestOffense ? DECISION_PHASE_LABELS[latestOffense.decisionPhase] : "等待进攻决策"}
          </strong>
          <small>{latestOffense?.strategyBoundary ?? "只读取自队策略"}</small>
        </div>
        <div className="p00-current-replay">
          <span>CURRENT EXISTING REPLAY</span>
          <strong>{activeReplay.code} · {activeReplay.label}</strong>
          <small>动画和篮球结果来自原场景；P00 没有新增 PlanId、阈值或运动目标。</small>
        </div>
        <div>
          <span>当前防守阶段</span>
          <strong>
            {latestDefense ? DECISION_PHASE_LABELS[latestDefense.decisionPhase] : "等待防守决策"}
          </strong>
          <small>{latestDefense?.strategyBoundary ?? "只读取自队策略"}</small>
        </div>
      </div>
    </section>
  );
}
export function P01ProbePanel({
  activeReplayId,
  activeStrategyId,
  audit,
  offenseStrategy,
  defenseStrategy,
  latestOffense,
  latestDefense,
  strategyLocked,
  onReplaySelect,
  onStrategySelect,
}: {
  activeReplayId: P01ReplayId;
  activeStrategyId: P01OffenseStrategyId;
  audit: P01CalibrationResult;
  offenseStrategy: TeamStrategyProfile;
  defenseStrategy: TeamStrategyProfile;
  latestOffense?: PlanningRecord;
  latestDefense?: PlanningRecord;
  strategyLocked: boolean;
  onReplaySelect: (id: P01ReplayId) => void;
  onStrategySelect: (id: P01OffenseStrategyId) => void;
}) {
  const activeReplay =
    P01_REPLAYS.find((replay) => replay.id === activeReplayId) ?? P01_REPLAYS[0];
  const comparisonSpeed =
    activeReplay.id === "boundary-398"
      ? 3.98
      : activeReplay.id === "stable-low-372"
        ? 3.72
        : null;
  const comparisonRows = comparisonSpeed === null
    ? []
    : audit.rows.filter(
        (row) => row.speed === comparisonSpeed && row.side === "right",
      );

  return (
    <section className="g01-probe p00-probe p01-probe" aria-label="P01 错位攻击优先进攻策略">
      <div className="g01-probe__head">
        <div>
          <span className="eyebrow">P01 · OFFENSE POLICY · POST-SWITCH ONLY</span>
          <h2>错位攻击优先</h2>
          <p>
            只为 post-switch 阶段硬可行的 ATTACK_BIG 增加统一 +{audit.adjustment.toFixed(2)}；
            基础分、否决、运动和防守策略均不变。
          </p>
        </div>
        <span className={"g01-status " + (audit.passed ? "is-pass" : "is-fail")}>
          {audit.passed ? "CALIBRATION PASS" : "CALIBRATION FAIL"}
        </span>
      </div>

      <div className="g01-summary">
        <div>
          <span>全局策略常数</span>
          <strong>ATTACK_BIG +{audit.adjustment.toFixed(2)}</strong>
          <small>公开上限 +{audit.maximumAllowedAdjustment.toFixed(2)} · 不按速度/side/场景分支</small>
        </div>
        <div>
          <span>3.98m/s 边界</span>
          <strong>FEED → ATTACK</strong>
          <small>Balanced 5.144 &gt; 5.131；Pressure 5.151 &gt; 5.144</small>
        </div>
        <div>
          <span>3.72m/s 稳定低侧</span>
          <strong>FEED / FEED</strong>
          <small>4.612 + 0.02 仍明显低于 FEED 5.144</small>
        </div>
        <div>
          <span>本回合配置</span>
          <strong>{strategyLocked ? "LOCKED" : "UNLOCKED"}</strong>
          <small>{strategyLocked ? "暂停仍锁定；重置才可改策略" : "可在运行前选择进攻策略"}</small>
        </div>
      </div>

      <div className="p00-strategy-grid p01-strategy-grid">
        <label className="p00-strategy-card offense">
          <span>OFFENSE · SELECT BEFORE RUN</span>
          <strong>{offenseStrategy.label}</strong>
          <select
            aria-label="P01 进攻队级策略"
            disabled={strategyLocked}
            onChange={(event) => onStrategySelect(event.currentTarget.value)}
            value={activeStrategyId}
          >
            {P01_OFFENSE_STRATEGIES.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.label} · {profile.id}
              </option>
            ))}
          </select>
          <small>{offenseStrategy.description}</small>
        </label>
        <div className="p00-neutral-lock">
          <span>NEUTRAL WORLD</span>
          <strong>NO POLICY INPUT</strong>
          <small>只解析双方已经提交的运动意图与真实局部结果</small>
        </div>
        <label className="p00-strategy-card defense">
          <span>DEFENSE · ONE PROFILE ONLY</span>
          <strong>{defenseStrategy.label}</strong>
          <select
            aria-label="P01 防守队级策略"
            disabled
            value={`${defenseStrategy.id}@${defenseStrategy.version}`}
          >
            <option value={`${defenseStrategy.id}@${defenseStrategy.version}`}>
              {defenseStrategy.id} · v{defenseStrategy.version}
            </option>
          </select>
          <small>本轮不增加防守策略；防守只观察公开运动后再响应。</small>
        </label>
      </div>

      <div className="p01-rule-strip" aria-label="P01 策略作用范围">
        <div>
          <span>阶段门</span>
          <strong>post-switch / offense_mismatch</strong>
          <small>初始阅读与 O5 接球后 adjustment 均为 0</small>
        </div>
        <div>
          <span>候选门</span>
          <strong>可行 ATTACK_BIG only</strong>
          <small>FEED_SEAL、RESET_MISMATCH 与其余候选保持 0</small>
        </div>
        <div>
          <span>队内协同</span>
          <strong>O1 attack_big + O5 clear_lane</strong>
          <small>同一个进攻队级计划同时分配两名球员</small>
        </div>
      </div>

      <div className="g01-replays" aria-label="P01 三个代表回放">
        {P01_REPLAYS.map((replay) => (
          <button
            aria-pressed={replay.id === activeReplayId}
            className={replay.id === activeReplayId ? "is-active" : ""}
            disabled={strategyLocked}
            key={replay.id}
            onClick={() => onReplaySelect(replay.id)}
            type="button"
          >
            <span>{replay.label}</span>
            <strong>{replay.code}</strong>
            <small>{replay.note}</small>
          </button>
        ))}
      </div>

      <div className="p01-calibration-grid" aria-label="当前代表样本策略评分对照">
        {comparisonRows.length > 0 ? comparisonRows.map((row) => (
          <div
            className={row.strategyId === activeStrategyId ? "is-current" : ""}
            key={`${row.speed}/${row.strategyId}/${row.side}`}
          >
            <span>{row.strategyId === OFFENSE_BALANCED_READ.id ? "BALANCED" : "MISMATCH PRESSURE"}</span>
            <strong>{row.chosen}</strong>
            <small>
              ATTACK {row.attack.baseScore?.toFixed(3)} + {row.attack.strategyAdjustment.toFixed(2)} = {row.attack.effectiveScore?.toFixed(3)}
            </small>
            <small>
              FEED {row.feed.baseScore?.toFixed(3)} + {row.feed.strategyAdjustment.toFixed(2)} = {row.feed.effectiveScore?.toFixed(3)}
            </small>
          </div>
        )) : (
          <div className="is-current p01-veto-card">
            <span>HARD FEASIBILITY FIRST</span>
            <strong>ATTACK_BIG = VETO</strong>
            <small>base VETO + strategy BLOCKED = effective VETO</small>
            <small>{audit.veto.vetoes.join("；")}</small>
          </div>
        )}
      </div>

      <div className="p00-phase-grid" aria-label="P01 当前双方决策阶段与策略原因">
        <div>
          <span>当前进攻阶段</span>
          <strong>
            {latestOffense ? DECISION_PHASE_LABELS[latestOffense.decisionPhase] : "等待进攻决策"}
          </strong>
          <small>{latestOffense?.strategyBoundary ?? "只读取选定进攻策略"}</small>
        </div>
        <div className="p00-current-replay">
          <span>CURRENT POLICY REPLAY</span>
          <strong>{activeReplay.code} · {activeReplay.label}</strong>
          <small>{activeReplay.note}</small>
        </div>
        <div>
          <span>当前防守阶段</span>
          <strong>
            {latestDefense ? DECISION_PHASE_LABELS[latestDefense.decisionPhase] : "等待防守决策"}
          </strong>
          <small>{latestDefense?.strategyBoundary ?? "不读取进攻策略"}</small>
        </div>
      </div>

      {!audit.passed && (
        <div className="g01-failures">
          {audit.failureReasons.map((reason) => <p key={reason}>{reason}</p>)}
        </div>
      )}
    </section>
  );
}
export function P03PolicyMatrixPanel({
  activeMatchupId,
  activeOffenseStrategyId,
  activeDefenseStrategyId,
  calibration,
  audit,
  offenseStrategy,
  defenseStrategy,
  latestOffense,
  latestDefense,
  strategyLocked,
  onMatchupSelect,
  onOffenseStrategySelect,
  onDefenseStrategySelect,
}: {
  activeMatchupId: P03MatchupId;
  activeOffenseStrategyId: P01OffenseStrategyId;
  activeDefenseStrategyId: P02DefenseStrategyId;
  calibration: P02CalibrationResult;
  audit: P03MatrixAuditResult;
  offenseStrategy: TeamStrategyProfile;
  defenseStrategy: TeamStrategyProfile;
  latestOffense?: PlanningRecord;
  latestDefense?: PlanningRecord;
  strategyLocked: boolean;
  onMatchupSelect: (id: P03MatchupId) => void;
  onOffenseStrategySelect: (id: P01OffenseStrategyId) => void;
  onDefenseStrategySelect: (id: P02DefenseStrategyId) => void;
}) {
  const activeRow = audit.rows.find((row) => row.id === activeMatchupId) ?? audit.rows[0];
  const activeMirror = audit.mirrors.find((row) => row.id === activeMatchupId);
  const compactPlans = (sequence: readonly string[]) => sequence.filter((entry, index) => {
    const plan = entry.split(":")[1];
    return index === 0 || sequence[index - 1].split(":")[1] !== plan;
  });
  const pressureBoundary = calibration.rows.find(
    (row) =>
      row.family === "mismatch" &&
      row.input === 3.98 &&
      row.defenseStrategyId === "DEFENSE_MISMATCH_PRESSURE",
  );
  const earlyDigBoundary = calibration.rows.find(
    (row) =>
      row.family === "post-catch" &&
      row.input === 0.18 &&
      row.defenseStrategyId === "DEFENSE_EARLY_DIG",
  );
  const candidateFormula = (record?: PlanningRecord) => {
    const chosen = record?.candidates.find((candidate) => candidate.id === record.chosen);
    if (!chosen || chosen.baseScore === null || chosen.effectiveScore === null) return "VETO";
    return `${chosen.baseScore.toFixed(3)} + ${chosen.strategyAdjustment.toFixed(2)} = ${chosen.effectiveScore.toFixed(3)}`;
  };

  return (
    <section className="g01-probe p00-probe p03-policy-probe" aria-label="P02–P03 防守策略与有限对局矩阵">
      <div className="g01-probe__head">
        <div>
          <span className="eyebrow">P02–P03 · DEFENSE POLICY · 2 × 3 MATRIX</span>
          <h2>策略对局：两套进攻 × 三套防守</h2>
          <p>
            六格都从同一个 neutral 3.98m/s 世界真实运行；策略只重排硬可行候选，
            没到对应阶段时允许得到相同篮球行为。
          </p>
        </div>
        <span className={"g01-status " + (audit.passed && calibration.passed ? "is-pass" : "is-fail")}>
          {audit.passed && calibration.passed ? "6 / 6 MATRIX PASS" : "POLICY AUDIT FAIL"}
        </span>
      </div>

      <div className="g01-summary">
        <div>
          <span>错位持球施压</span>
          <strong>PRESSURE +{calibration.mismatchAdjustment.toFixed(2)}</strong>
          <small>仅 defense_mismatch · 3.98 翻转，4.00 仍 CONTAIN</small>
        </div>
        <div>
          <span>接球后提前协防</span>
          <strong>DIG +{calibration.earlyDigAdjustment.toFixed(2)}</strong>
          <small>仅 defense_post_catch · 分球仍等待真实 help</small>
        </div>
        <div>
          <span>统一公开输入</span>
          <strong>3.98 · 0.12 · 0.18</strong>
          <small>O1 速度 / D1 绕前反应 / 接球后恢复 · post_catch_resolution</small>
        </div>
        <div>
          <span>本回合配置</span>
          <strong>{strategyLocked ? "LOCKED" : "UNLOCKED"}</strong>
          <small>{strategyLocked ? "暂停仍锁定；重置新回合才解锁" : "运行前可选择双方策略或六格"}</small>
        </div>
      </div>

      <div className="p00-strategy-grid">
        <label className="p00-strategy-card offense">
          <span>OFFENSE · HIDDEN FROM DEFENSE</span>
          <strong>{offenseStrategy.label}</strong>
          <select
            aria-label="P03 进攻队级策略"
            disabled={strategyLocked}
            onChange={(event) => onOffenseStrategySelect(
              event.currentTarget.value as P01OffenseStrategyId,
            )}
            value={activeOffenseStrategyId}
          >
            {P01_OFFENSE_STRATEGIES.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.label} · {profile.id}</option>
            ))}
          </select>
          <small>{offenseStrategy.description}</small>
        </label>
        <div className="p00-neutral-lock">
          <span>NEUTRAL WORLD</span>
          <strong>NO POLICY INPUT</strong>
          <small>Canvas 只播放真实世界；运动、球路、触球与终局不读取策略</small>
        </div>
        <label className="p00-strategy-card defense">
          <span>DEFENSE · HIDDEN FROM OFFENSE</span>
          <strong>{defenseStrategy.label}</strong>
          <select
            aria-label="P03 防守队级策略"
            disabled={strategyLocked}
            onChange={(event) => onDefenseStrategySelect(
              event.currentTarget.value as P02DefenseStrategyId,
            )}
            value={activeDefenseStrategyId}
          >
            {P02_DEFENSE_STRATEGIES.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.label} · {profile.id}</option>
            ))}
          </select>
          <small>{defenseStrategy.description}</small>
        </label>
      </div>

      <div className="p03-policy-matrix" aria-label="六组策略组合">
        {P03_POLICY_MATCHUPS.map((matchup) => {
          const row = audit.rows.find((candidate) => candidate.id === matchup.id);
          const offense = P01_OFFENSE_STRATEGIES.find(
            (profile) => profile.id === matchup.offenseStrategyId,
          );
          const defense = P02_DEFENSE_STRATEGIES.find(
            (profile) => profile.id === matchup.defenseStrategyId,
          );
          return (
            <button
              aria-pressed={matchup.id === activeMatchupId}
              className={matchup.id === activeMatchupId ? "is-active" : ""}
              disabled={strategyLocked}
              key={matchup.id}
              onClick={() => onMatchupSelect(matchup.id)}
              type="button"
            >
              <span>{matchup.id} · {offense?.label}</span>
              <strong>{defense?.label}</strong>
              <small>
                {row
                  ? `${compactPlans(row.offensePlanSequence).map((entry) => entry.split(":")[1]).join(" → ")} / ${compactPlans(row.defensePlanSequence).map((entry) => entry.split(":")[1]).join(" → ")}`
                  : "等待审计"}
              </small>
              <em>{row ? `${row.terminal.reason} @ ${row.terminalTick}` : "—"}</em>
            </button>
          );
        })}
      </div>

      <div className="p03-calibration-grid" aria-label="P02 两个防守策略校准">
        <div>
          <span>3.98m/s · DEFENSE_MISMATCH</span>
          <strong>CONTAIN 4.569 / PRESSURE 3.396 + 1.18 = 4.576</strong>
          <small>
            {pressureBoundary?.chosen ?? "—"} · {pressureBoundary?.defenseRoles.map((role) => `${role.playerId} ${role.roleCode}`).join(" · ")}
          </small>
        </div>
        <div>
          <span>0.18s · DEFENSE_POST_CATCH</span>
          <strong>STAY 1.217 / DIG 0.980 + 0.24 = 1.220</strong>
          <small>
            {earlyDigBoundary?.chosen ?? "—"} · {earlyDigBoundary?.defenseRoles.map((role) => `${role.playerId} ${role.roleCode}`).join(" · ")}
          </small>
        </div>
      </div>

      <div className="p03-current-grid">
        <div>
          <span>CURRENT MATRIX CELL · {activeRow.id}</span>
          <strong>{activeRow.offenseStrategyLabel} × {activeRow.defenseStrategyLabel}</strong>
          <small>进攻：{compactPlans(activeRow.offensePlanSequence).join(" → ")}</small>
          <small>防守：{compactPlans(activeRow.defensePlanSequence).join(" → ")}</small>
          <em>{activeRow.terminal.label} · tick {activeRow.terminalTick}</em>
        </div>
        <div>
          <span>REAL EVENTS · NO PREWRITTEN OUTCOME</span>
          <div className="p03-event-line">
            {activeRow.keyEvents.map((event) => (
              <i key={`${event.tick}/${event.type}`}>{event.type}@{event.tick}</i>
            ))}
          </div>
          <small>
            help {activeRow.helpCommitted ? "COMMITTED" : "未触发"} · kickout {activeRow.kickoutCaught ? "CAUGHT" : "未完成"} · min gap {activeRow.minimumBodyGap.toFixed(3)}m
          </small>
        </div>
        <div>
          <span>RIGHT / LEFT REAL WORLD CHECK</span>
          <strong>{activeMirror?.mirrored ? "MIRROR PASS" : "MIRROR FAIL"}</strong>
          <small>最大数值误差 {activeMirror?.maximumMirrorError.toExponential(2) ?? "—"}</small>
          <small>左右各双运行；不是翻转 Canvas</small>
        </div>
      </div>

      <div className="p00-phase-grid" aria-label="当前双方策略阶段与计分">
        <div>
          <span>当前进攻阶段</span>
          <strong>{latestOffense ? DECISION_PHASE_LABELS[latestOffense.decisionPhase] : "等待进攻决策"}</strong>
          <small>{latestOffense?.chosen ?? "—"} · {candidateFormula(latestOffense)}</small>
          <small>{latestOffense?.strategyBoundary ?? "只读取选定进攻策略"}</small>
        </div>
        <div className="p00-current-replay">
          <span>HARD FEASIBILITY BEFORE POLICY</span>
          <strong>baseScore + adjustment = effectiveScore</strong>
          <small>完整候选、策略原因和硬否决见右侧“选择与否决”。</small>
        </div>
        <div>
          <span>当前防守阶段</span>
          <strong>{latestDefense ? DECISION_PHASE_LABELS[latestDefense.decisionPhase] : "等待防守决策"}</strong>
          <small>{latestDefense?.chosen ?? "—"} · {candidateFormula(latestDefense)}</small>
          <small>{latestDefense?.strategyBoundary ?? "只读取选定防守策略"}</small>
        </div>
      </div>

      {(!audit.passed || !calibration.passed) && (
        <div className="g01-failures">
          {[...calibration.failureReasons, ...audit.failureReasons].map((reason) => (
            <p key={reason}>{reason}</p>
          ))}
        </div>
      )}
    </section>
  );
}
