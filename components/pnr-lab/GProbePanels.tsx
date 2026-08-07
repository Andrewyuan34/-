import { PLAYER_IDS, type ScreenSide } from "@/lib/pnr-core";
import {
  G01_BASE_CONFIG,
  type G01AuditResult,
  type G01ReplayId,
  type G01ScanRow,
} from "@/lib/pnr-generalization";
import {
  G02_BASE_CONFIG,
  type G02AuditResult,
  type G02ReplayId,
  type G02ScanRow,
} from "@/lib/pnr-g02-generalization";
import {
  G03_BASE_CONFIG,
  type G03AuditResult,
  type G03CandidateAudit,
  type G03ReplayId,
  type G03ScanRow,
} from "@/lib/pnr-g03-generalization";
import {
  G05_BASE_CONFIG,
  type G05AuditResult,
  type G05CandidateAudit,
  type G05ReplayId,
  type G05SimulatedRow,
} from "@/lib/pnr-g05-spatial-generalization";
import type { G06AuditResult, G06Row } from "@/lib/pnr-g06-combinations";
import {
  makeG07Config,
  type G07AuditResult,
  type G07ReplayId,
} from "@/lib/pnr-g07-mirroring";
import type {
  G08AuditResult,
  G08CandidateAudit,
  G08ReplaySelection,
} from "@/lib/pnr-g08-heldout-audit";
import {
  G08_MANIFEST_GENERATION,
  G08_MANIFEST_SEED,
} from "@/lib/pnr-g08-heldout-manifest";
import { planShort, sideText } from "./format";

function G01CandidateDetail({
  label,
  candidate,
}: {
  label: string;
  candidate: G01ScanRow["attack"];
}) {
  return (
    <div className={"g01-candidate " + (candidate.feasible ? "is-feasible" : "is-vetoed")}>
      <span>{label}</span>
      <strong>
        {candidate.feasible && candidate.score !== null
          ? candidate.score.toFixed(3)
          : "VETO"}
      </strong>
      <small>
        {candidate.vetoes.length > 0
          ? candidate.vetoes.join(" · ")
          : `可行 · ${candidate.evidence.slice(1, 3).join(" · ")}`}
      </small>
    </div>
  );
}
export function G01ProbePanel({
  audit,
  activeReplayId,
  onReplaySelect,
}: {
  audit: G01AuditResult;
  activeReplayId: G01ReplayId;
  onReplaySelect: (id: G01ReplayId) => void;
}) {
  const activeReplay =
    audit.replays.find((replay) => replay.id === activeReplayId) ?? audit.replays[0];
  const activeRow = audit.rows.find((row) => row.speed === activeReplay?.speed) ?? audit.rows[0];

  return (
    <section className="g01-probe" aria-label="G01 O1 速度决策边界泛化探针">
      <div className="g01-probe__head">
        <div>
          <span className="eyebrow">G01 · GENERALIZATION PROBE · NOT A SAVED SCENARIO</span>
          <h2>{audit.label}</h2>
          <p>
            neutral · seed {G01_BASE_CONFIG.seed} · D1 绕前反应 {G01_BASE_CONFIG.d1FrontReactionDelay.toFixed(2)}s ·
            仅改变 O1 最高速度
          </p>
        </div>
        <span className={"g01-status " + (audit.passed ? "is-pass" : "is-fail")}>
          {audit.passed ? "AUDIT PASS" : "AUDIT FAIL"}
        </span>
      </div>

      <div className="g01-summary">
        <div>
          <span>扫描</span>
          <strong>3.72–4.08 m/s</strong>
          <small>步长 0.02 · 19 样本 × 2 次</small>
        </div>
        <div>
          <span>低侧</span>
          <strong>≤ {audit.lastFeedSpeed?.toFixed(2) ?? "—"} FEED_SEAL</strong>
          <small>最后一个喂 O5 样本</small>
        </div>
        <div>
          <span>高侧</span>
          <strong>≥ {audit.firstAttackSpeed?.toFixed(2) ?? "—"} ATTACK_BIG</strong>
          <small>第一个攻击 D5 样本</small>
        </div>
        <div>
          <span>稳定性</span>
          <strong>{audit.deterministic && audit.monotonic ? "逐 tick 复现 · 无回跳" : "发现失败区间"}</strong>
          <small>决策只在换防事件后的边界读取</small>
        </div>
      </div>

      <div className="g01-replays" aria-label="G01 三个可播放回放">
        {audit.replays.map((replay) => (
          <button
            className={replay.id === activeReplayId ? "is-active" : ""}
            key={replay.id}
            onClick={() => onReplaySelect(replay.id)}
            type="button"
            aria-pressed={replay.id === activeReplayId}
          >
            <span>{replay.label}</span>
            <strong>{replay.speed.toFixed(2)} m/s · {replay.chosen}</strong>
            <small>{replay.note}</small>
          </button>
        ))}
      </div>

      <div className="g01-table-wrap">
        <table className="g01-table">
          <thead>
            <tr>
              <th>O1 m/s</th>
              <th>首次换防后选择</th>
              <th>ATTACK_BIG</th>
              <th>FEED_SEAL</th>
              <th>可行性 / 否决</th>
              <th>tick</th>
              <th>复现</th>
            </tr>
          </thead>
          <tbody>
            {audit.rows.map((row) => (
              <tr
                className={row.speed === activeRow.speed ? "is-selected" : ""}
                key={row.speed.toFixed(2)}
              >
                <td>{row.speed.toFixed(2)}</td>
                <td><span className={"g01-plan " + (row.chosen === "ATTACK_BIG" ? "attack" : "feed")}>{row.chosen}</span></td>
                <td>{row.attack.score?.toFixed(3) ?? "VETO"}</td>
                <td>{row.feed.score?.toFixed(3) ?? "VETO"}</td>
                <td title={[...row.attack.vetoes, ...row.feed.vetoes].join(" · ")}>
                  {row.attack.feasible && row.feed.feasible
                    ? "A / F 均可行"
                    : [...row.attack.vetoes, ...row.feed.vetoes].join(" · ")}
                </td>
                <td>{row.decisionTick}</td>
                <td>{row.deterministic ? "2 / 2" : "失败"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="g01-active-read">
        <div>
          <span className="eyebrow">SELECTED REPLAY · {activeRow.speed.toFixed(2)}m/s</span>
          <strong>{activeRow.chosen} · switch tick {activeRow.switchTick} → decision tick {activeRow.decisionTick}</strong>
        </div>
        <G01CandidateDetail label="ATTACK_BIG" candidate={activeRow.attack} />
        <G01CandidateDetail label="FEED_SEAL" candidate={activeRow.feed} />
      </div>

      {!audit.passed && (
        <div className="g01-failures">
          {audit.failureIntervals.map((failure) => (
            <p key={`${failure.fromSpeed}-${failure.toSpeed}-${failure.reason}`}>
              {failure.fromSpeed.toFixed(2)}–{failure.toSpeed.toFixed(2)}m/s · {failure.reason}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
function G02CandidateDetail({
  label,
  candidate,
}: {
  label: string;
  candidate: G02ScanRow["front"];
}) {
  return (
    <div className={"g01-candidate " + (candidate.feasible ? "is-feasible" : "is-vetoed")}>
      <span>{label}</span>
      <strong>
        {candidate.feasible && candidate.score !== null
          ? candidate.score.toFixed(3)
          : "VETO"}
      </strong>
      <small>
        {candidate.vetoes.length > 0
          ? candidate.vetoes.join(" · ")
          : `可行 · ${candidate.evidence.slice(1, 3).join(" · ")}`}
      </small>
    </div>
  );
}

export function G02ProbePanel({
  audit,
  activeReplayId,
  onReplaySelect,
}: {
  audit: G02AuditResult;
  activeReplayId: G02ReplayId;
  onReplaySelect: (id: G02ReplayId) => void;
}) {
  const activeReplay =
    audit.replays.find((replay) => replay.id === activeReplayId) ?? audit.replays[0];
  const activeRow = audit.rows.find((row) => row.delay === activeReplay?.delay) ?? audit.rows[0];
  const outcomeLabel = (row: G02ScanRow): string =>
    row.outcome === "D1_DEFLECTION" ? "D1 真实先触球" : "O5 真实接球";

  return (
    <section className="g01-probe g02-probe" aria-label="G02 D1 绕前反应时间边界泛化探针">
      <div className="g01-probe__head">
        <div>
          <span className="eyebrow">G02 · GENERALIZATION PROBE · NOT A SAVED SCENARIO</span>
          <h2>{audit.label}</h2>
          <p>
            neutral · seed {G02_BASE_CONFIG.seed} · O1 {G02_BASE_CONFIG.o1MaxSpeed.toFixed(2)}m/s ·
            仅改变 D1 绕前反应成本
          </p>
        </div>
        <span className={"g01-status " + (audit.passed ? "is-pass" : "is-fail")}>
          {audit.passed ? "AUDIT PASS" : "AUDIT FAIL"}
        </span>
      </div>

      <div className="g01-summary">
        <div>
          <span>扫描</span>
          <strong>0.00–0.16s</strong>
          <small>步长 0.01 · 17 样本 × 2 次</small>
        </div>
        <div>
          <span>最后破坏</span>
          <strong>{audit.lastDeflectionDelay?.toFixed(2) ?? "—"}s · D1</strong>
          <small>合法绕前后真实先触球</small>
        </div>
        <div>
          <span>首次接球</span>
          <strong>{audit.firstCatchDelay?.toFixed(2) ?? "—"}s · O5</strong>
          <small>D1 留在身后，O5 走完球路</small>
        </div>
        <div>
          <span>稳定性</span>
          <strong>{audit.deterministic && audit.monotonic ? "逐 tick 复现 · 无回跳" : "发现失败区间"}</strong>
          <small>ETA 不直接指定最终触球者</small>
        </div>
      </div>

      <div className="g01-replays" aria-label="G02 三个可播放回放">
        {audit.replays.map((replay) => (
          <button
            className={replay.id === activeReplayId ? "is-active" : ""}
            key={replay.id}
            onClick={() => onReplaySelect(replay.id)}
            type="button"
            aria-pressed={replay.id === activeReplayId}
          >
            <span>{replay.label}</span>
            <strong>{replay.delay.toFixed(2)}s · {replay.outcome === "D1_DEFLECTION" ? "D1 破坏" : "O5 接球"}</strong>
            <small>{replay.note}</small>
          </button>
        ))}
      </div>

      <div className="g01-table-wrap">
        <table className="g01-table g02-table">
          <thead>
            <tr>
              <th>delay</th>
              <th>防守方案</th>
              <th>绕前 ETA</th>
              <th>高吊 ETA</th>
              <th>FRONT</th>
              <th>BEHIND</th>
              <th>实际第一触球</th>
              <th>关键 ticks</th>
              <th>复现</th>
            </tr>
          </thead>
          <tbody>
            {audit.rows.map((row) => (
              <tr
                className={row.delay === activeRow.delay ? "is-selected" : ""}
                key={row.delay.toFixed(2)}
              >
                <td>{row.delay.toFixed(2)}s</td>
                <td>
                  <span className={"g01-plan " + (row.chosen === "FRONT_SEAL" ? "front" : "behind")}>
                    {row.chosen}
                  </span>
                </td>
                <td>{row.frontEta.toFixed(3)}s</td>
                <td>{row.entryFlightTime.toFixed(3)}s</td>
                <td title={row.front.vetoes.join(" · ")}>{row.front.score?.toFixed(3) ?? "VETO"}</td>
                <td title={row.backside.vetoes.join(" · ")}>{row.backside.score?.toFixed(3) ?? "VETO"}</td>
                <td><span className={"g02-touch " + (row.actualFirstToucher === "D1" ? "defense" : "offense")}>{outcomeLabel(row)}</span></td>
                <td>{row.sealTick} → {row.decisionTick} → {row.launchTick} → {row.touchTick}</td>
                <td>{row.deterministic ? "2 / 2" : "失败"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="g02-path-read">
        <div>
          <span className="eyebrow">REAL BALL PATH · {activeRow.delay.toFixed(2)}s</span>
          <strong>
            seal {activeRow.sealTick} → decision {activeRow.decisionTick} → launch {activeRow.launchTick} → touch {activeRow.touchTick}
          </strong>
        </div>
        <p>
          {outcomeLabel(activeRow)} · 飞行 {activeRow.flightSteps} ticks / {activeRow.flightDistance.toFixed(2)}m ·
          触球距离 {activeRow.touchDistance.toFixed(3)}m ≤ 局部阈值 {activeRow.touchThreshold.toFixed(3)}m
        </p>
      </div>

      <div className="g01-active-read">
        <div>
          <span className="eyebrow">FIRST FRONT READ · DELAY {activeRow.delay.toFixed(2)}s</span>
          <strong>
            绕前 ETA {activeRow.frontEta.toFixed(3)}s / 高吊 ETA {activeRow.entryFlightTime.toFixed(3)}s ·
            可行 {activeRow.frontFeasible ? "是" : "否"}
          </strong>
          <small>ETA 只约束防守方案；实际结果仍由后续逐 tick 球路与局部触球解析。</small>
        </div>
        <G02CandidateDetail label="FRONT_SEAL" candidate={activeRow.front} />
        <G02CandidateDetail label="BACKSIDE_CONTEST" candidate={activeRow.backside} />
      </div>

      {!audit.passed && (
        <div className="g01-failures">
          {audit.failureIntervals.map((failure) => (
            <p key={`${failure.fromDelay}-${failure.toDelay}-${failure.reason}`}>
              {failure.fromDelay.toFixed(2)}–{failure.toDelay.toFixed(2)}s · {failure.reason}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

function G03CandidateDetail({
  label,
  candidate,
}: {
  label: string;
  candidate: G03CandidateAudit;
}) {
  return (
    <div className={"g01-candidate " + (candidate.feasible ? "is-feasible" : "is-vetoed")}>
      <span>{label}</span>
      <strong>
        {candidate.feasible && candidate.score !== null
          ? candidate.score.toFixed(3)
          : "VETO"}
      </strong>
      <small>
        {candidate.vetoes.length > 0
          ? candidate.vetoes.join(" · ")
          : `可行 · ${candidate.evidence.slice(0, 2).join(" · ")}`}
      </small>
    </div>
  );
}

export function G03ProbePanel({
  audit,
  activeReplayId,
  onReplaySelect,
}: {
  audit: G03AuditResult;
  activeReplayId: G03ReplayId;
  onReplaySelect: (id: G03ReplayId) => void;
}) {
  const activeReplay =
    audit.replays.find((replay) => replay.id === activeReplayId) ?? audit.replays[0];
  const activeRow = audit.rows.find((row) => row.delay === activeReplay?.delay) ?? audit.rows[0];
  const firstKickoutDecision = activeRow.offenseDecisions.find(
    (decision) => decision.chosen === "KICK_OUT",
  );
  const outcomeLabel = (row: G03ScanRow): string =>
    row.outcome === "POST_FINISH_WINDOW" ? "O5 终结窗口" : "O1 接回传";

  return (
    <section className="g01-probe g03-probe" aria-label="G03 D1 接球后恢复时间边界泛化探针">
      <div className="g01-probe__head">
        <div>
          <span className="eyebrow">G03 · GENERALIZATION PROBE · NOT A SAVED SCENARIO</span>
          <h2>{audit.label}</h2>
          <p>
            neutral · seed {G03_BASE_CONFIG.seed} · O1 {G03_BASE_CONFIG.o1MaxSpeed.toFixed(2)}m/s ·
            绕前反应 {G03_BASE_CONFIG.d1FrontReactionDelay.toFixed(2)}s · 仅改变 D1 接球后恢复成本
          </p>
        </div>
        <span className={"g01-status " + (audit.passed ? "is-pass" : "is-fail")}>
          {audit.passed ? "AUDIT PASS" : "AUDIT FAIL"}
        </span>
      </div>

      <div className="g01-summary">
        <div>
          <span>扫描</span>
          <strong>0.00–0.60s</strong>
          <small>步长 0.03 · 21 样本 × 2 次</small>
        </div>
        <div>
          <span>防守边界</span>
          <strong>{audit.lastStayDelay?.toFixed(2) ?? "—"}s → {audit.firstDigDelay?.toFixed(2) ?? "—"}s</strong>
          <small>STAY_HOME_POST → DIG_POST</small>
        </div>
        <div>
          <span>共同前缀 / 停止</span>
          <strong>{audit.sharedCatchPrefix ? `接球 tick ${audit.commonCatchTick}` : "前缀失败"}</strong>
          <small>首次 finish window 或 kickout catch</small>
        </div>
        <div>
          <span>稳定性</span>
          <strong>{audit.deterministic && audit.monotonic ? "逐 tick 复现 · 无回跳" : "发现失败区间"}</strong>
          <small>{audit.transitionBandDelays.length === 0 ? "本次扫描无中间过渡带" : `${audit.transitionBandDelays.length} 个真实帮助未形成样本`}</small>
        </div>
      </div>

      <div className="g01-replays" aria-label="G03 三个可播放回放">
        {audit.replays.map((replay) => (
          <button
            className={replay.id === activeReplayId ? "is-active" : ""}
            key={replay.id}
            onClick={() => onReplaySelect(replay.id)}
            type="button"
            aria-pressed={replay.id === activeReplayId}
          >
            <span>{replay.label}</span>
            <strong>{replay.delay.toFixed(2)}s · {replay.phase}</strong>
            <small>{replay.note}</small>
          </button>
        ))}
      </div>

      <div className="g01-table-wrap">
        <table className="g01-table g03-table">
          <thead>
            <tr>
              <th>delay</th>
              <th>D1 恢复 / 状态</th>
              <th>首次防守</th>
              <th>STAY</th>
              <th>DIG</th>
              <th>真实帮助</th>
              <th>进攻重规划</th>
              <th>结果</th>
              <th>关键 ticks</th>
              <th>复现</th>
            </tr>
          </thead>
          <tbody>
            {audit.rows.map((row) => (
              <tr
                className={row.delay === activeRow.delay ? "is-selected" : ""}
                key={row.delay.toFixed(2)}
              >
                <td>{row.delay.toFixed(2)}s</td>
                <td>
                  t{row.recoveryReadyTick} · {row.firstDefense.d1PursuitState === "CHASE_READY" ? "可全速追防" : "身后恢复中"}
                </td>
                <td>
                  <span className={"g01-plan " + (row.firstDefense.chosen === "DIG_POST" ? "dig" : "stay")}>
                    {row.firstDefense.chosen}
                  </span>
                </td>
                <td title={row.firstDefense.stay.vetoes.join(" · ")}>{row.firstDefense.stay.score?.toFixed(3) ?? "VETO"}</td>
                <td title={row.firstDefense.dig.vetoes.join(" · ")}>{row.firstDefense.dig.score?.toFixed(3) ?? "VETO"}</td>
                <td>
                  {row.helpCommitted
                    ? `是 · t${row.helpCommittedTick} · ${row.helpD5O5Distance?.toFixed(3)}m`
                    : row.digDecided
                      ? "DIG 已选 / 尚未到位"
                      : "否 · D5 留守"}
                </td>
                <td title={row.offenseDecisions.map((decision) => `t${decision.tick} ${decision.chosen} · help ${decision.helpObserved ? "yes" : "no"}`).join(" → ")}>
                  {row.offenseDecisions.map((decision) => `t${decision.tick} ${decision.chosen === "POST_FINISH" ? "FINISH" : "KICK"}`).join(" → ")}
                </td>
                <td>{outcomeLabel(row)}</td>
                <td>
                  catch {row.catchTick} → {row.helpCommittedTick ? `help ${row.helpCommittedTick} → ` : ""}
                  stop {row.stopTick}
                </td>
                <td>{row.deterministic ? "2 / 2" : "失败"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="g03-layer-strip" aria-label="G03 三层独立因果状态">
        <div className="g03-layer is-active">
          <span>01 · 防守意图</span>
          <strong>{activeRow.firstDefense.chosen}</strong>
          <small>
            tick {activeRow.firstDefense.tick} · D1 {activeRow.firstDefense.d1PursuitState === "CHASE_READY" ? "恢复就绪" : `还需 ${activeRow.firstDefense.d1RecoveryReadyIn.toFixed(3)}s`}
          </small>
        </div>
        <i>→</i>
        <div className={"g03-layer " + (activeRow.helpCommitted ? "is-active" : "")}>
          <span>02 · 真实局部帮助</span>
          <strong>{activeRow.helpCommitted ? `D5 到位 · tick ${activeRow.helpCommittedTick}` : "未形成 help"}</strong>
          <small>
            {activeRow.helpCommitted
              ? `D5–O5 ${activeRow.helpD5O5Distance?.toFixed(3)}m / D5–O1 ${activeRow.helpD5O1Distance?.toFixed(3)}m`
              : `停止时 D5–O5 ${activeRow.stopD5O5Distance.toFixed(3)}m / D5–O1 ${activeRow.stopD5O1Distance.toFixed(3)}m`}
          </small>
        </div>
        <i>→</i>
        <div className={"g03-layer " + (activeRow.kickoutChosen ? "is-active" : "")}>
          <span>03 · 进攻观察后选择</span>
          <strong>{activeRow.kickoutChosen ? `KICK_OUT · tick ${activeRow.firstKickoutDecisionTick}` : "POST_FINISH"}</strong>
          <small>
            {activeRow.kickoutChosen
              ? `help ${activeRow.helpCommittedTick} → launch ${activeRow.kickoutLaunchedTick} → catch ${activeRow.kickoutCaughtTick}`
              : `attack ${activeRow.postCatchAttackTick} → finish ${activeRow.finishWindowTick}`}
          </small>
        </div>
      </div>

      <div className="g01-active-read">
        <div>
          <span className="eyebrow">FIRST DEFENSE READ · DELAY {activeRow.delay.toFixed(2)}s</span>
          <strong>
            catch {activeRow.catchTick} → defense {activeRow.firstDefense.tick} · {activeRow.firstDefense.d1RoleCode}
          </strong>
          <small>方案选择只产生队内意图；是否形成 help 仍由后续 D5 实际距离解析。</small>
        </div>
        <G03CandidateDetail label="STAY_HOME_POST" candidate={activeRow.firstDefense.stay} />
        <G03CandidateDetail label="DIG_POST" candidate={activeRow.firstDefense.dig} />
      </div>

      <div className="g01-active-read">
        <div>
          <span className="eyebrow">FIRST OFFENSE READ · TICK {activeRow.firstOffense.tick}</span>
          <strong>{activeRow.firstOffense.chosen} · help observed {activeRow.firstOffense.helpObserved ? "YES" : "NO"}</strong>
          <small>
            {firstKickoutDecision
              ? `真实帮助后 tick ${firstKickoutDecision.tick} 才首次选择 KICK_OUT。`
              : "本样本从未观察到真实帮助，因此分球持续被硬否决。"}
          </small>
        </div>
        <G03CandidateDetail label="POST_FINISH" candidate={activeRow.firstOffense.finish} />
        <G03CandidateDetail label="KICK_OUT" candidate={activeRow.firstOffense.kickout} />
      </div>

      <div className="g03-replans" aria-label="选中样本的接球后进攻重规划">
        {activeRow.offenseDecisions.map((decision) => (
          <span key={`${decision.tick}-${decision.chosen}`} title={decision.kickout.vetoes.join(" · ")}>
            t{decision.tick} · {decision.chosen} · help {decision.helpObserved ? "seen" : "not seen"}
          </span>
        ))}
      </div>

      {!audit.passed && (
        <div className="g01-failures">
          {audit.failureIntervals.map((failure) => (
            <p key={`${failure.fromDelay}-${failure.toDelay}-${failure.reason}`}>
              {failure.fromDelay.toFixed(2)}–{failure.toDelay.toFixed(2)}s · {failure.reason}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

function G05CandidateDetail({ candidate }: { candidate: G05CandidateAudit }) {
  return (
    <div className={"g05-candidate " + (candidate.feasible ? "is-feasible" : "is-vetoed")}>
      <span>{candidate.id}</span>
      <strong>
        {candidate.feasible && candidate.score !== null
          ? candidate.score.toFixed(3)
          : "VETO"}
      </strong>
      <small>
        {candidate.vetoes.length > 0
          ? candidate.vetoes.join(" · ")
          : `可行 · ${candidate.evidence.slice(0, 2).join(" · ")}`}
      </small>
    </div>
  );
}

export function G05ProbePanel({
  audit,
  activeReplayId,
  onReplaySelect,
}: {
  audit: G05AuditResult;
  activeReplayId: G05ReplayId;
  onReplaySelect: (id: G05ReplayId) => void;
}) {
  const activeReplay =
    audit.replays.find((replay) => replay.id === activeReplayId) ?? audit.replays[0];
  const baseline =
    audit.simulatedRows.find((row) => row.id === "baseline") ?? audit.simulatedRows[0];
  const activeRow =
    audit.simulatedRows.find((row) => row.id === activeReplay?.sampleId) ?? baseline;
  const offsetLabel =
    activeRow.id === "baseline"
      ? "无偏移"
      : `${activeRow.axis} ${activeRow.offset > 0 ? "+" : ""}${activeRow.offset.toFixed(2)}m`;
  const terminalDelta = activeRow.terminalTick - baseline.terminalTick;
  const eventLabel = (row: G05SimulatedRow): string =>
    [
      row.switchCompleted ? "switch" : null,
      row.underCommitted ? "under" : null,
      row.sealFronted ? "front" : null,
      row.passLaunched ? "pass" : null,
      row.actualFirstToucher ? `touch ${row.actualFirstToucher}` : null,
    ]
      .filter(Boolean)
      .join(" → ") || "无专项事件";

  return (
    <section className="g01-probe g05-probe" aria-label="G04–G05 显式初始位置与局部空间泛化探针">
      <div className="g01-probe__head">
        <div>
          <span className="eyebrow">G04–G05 · SPATIAL PROBE · NOT A SAVED SCENARIO</span>
          <h2>{audit.label}</h2>
          <p>
            neutral baseline · seed {G05_BASE_CONFIG.seed} · O1 {G05_BASE_CONFIG.o1MaxSpeed.toFixed(2)}m/s ·
            每次只改变一个公开初始坐标，不改变评分或战术
          </p>
        </div>
        <span className={"g01-status " + (audit.passed ? "is-pass" : "is-fail")}>
          {audit.passed ? "AUDIT PASS" : "AUDIT FAIL"}
        </span>
      </div>

      <div className="g05-ledger" role="status">
        <strong>33 candidates = 31 simulated + 2 expected rejected</strong>
        <span>两个重叠输入保留在账本中，由 G04 在创建世界前明确拒绝。</span>
      </div>

      <div className="g01-summary">
        <div>
          <span>输入账本</span>
          <strong>{audit.candidateCount} 个候选</strong>
          <small>baseline 1 + 8 轴 × 4 非零偏移</small>
        </div>
        <div>
          <span>真实运行</span>
          <strong>{audit.simulatedCount} × 2 次</strong>
          <small>{audit.deterministic ? "逐 tick 世界 / 计划 / 角色 / 事件一致" : "发现复现失败"}</small>
        </div>
        <div>
          <span>预期拒绝</span>
          <strong>{audit.expectedRejectedCount} 个 overlap</strong>
          <small>O1.y/-0.24 · D1.y/+0.24</small>
        </div>
        <div>
          <span>空间连续性</span>
          <strong>{audit.monotonic ? "8 轴无回跳" : `${audit.axisFailures.length} 个失败区间`}</strong>
          <small>{audit.invariantsPassed ? "31/31 核心不变量通过" : "存在核心不变量失败"}</small>
        </div>
      </div>

      <div className="g01-replays" aria-label="G05 三个合法代表回放">
        {audit.replays.map((replay) => (
          <button
            aria-pressed={replay.id === activeReplayId}
            className={replay.id === activeReplayId ? "is-active" : ""}
            key={replay.id}
            onClick={() => onReplaySelect(replay.id)}
            type="button"
          >
            <span>{replay.label}</span>
            <strong>{replay.sampleId}</strong>
            <small>{replay.note}</small>
          </button>
        ))}
      </div>

      <div className="g01-table-wrap">
        <table className="g01-table g05-table">
          <thead>
            <tr>
              <th>sample</th>
              <th>status</th>
              <th>初始进攻</th>
              <th>初始防守</th>
              <th>branch / 事件</th>
              <th>终止</th>
              <th>最小净空</th>
              <th>复现 / 看门狗</th>
            </tr>
          </thead>
          <tbody>
            {audit.rows.map((row) => (
              <tr
                className={
                  (row.id === activeRow.id ? "is-selected " : "") +
                  (row.status === "EXPECTED_INVALID_INITIAL_OVERLAP" ? "is-rejected" : "")
                }
                key={row.id}
              >
                <td>{row.id}</td>
                <td>
                  {row.status === "SIMULATED" ? (
                    <span className="g05-status simulated">SIMULATED</span>
                  ) : (
                    <span className="g05-status rejected" title={row.error}>EXPECTED REJECTED</span>
                  )}
                </td>
                {row.status === "SIMULATED" ? (
                  <>
                    <td>{row.initialOffense.chosen}</td>
                    <td>{row.initialDefense.chosen}</td>
                    <td>{row.branch} · {eventLabel(row)}</td>
                    <td>t{row.terminalTick} · {row.terminalReason}</td>
                    <td>{row.minimumBodyGap.toFixed(3)}m</td>
                    <td>{row.deterministic ? "2 / 2" : "失败"} · WD {row.watchdogReplans}</td>
                  </>
                ) : (
                  <td colSpan={6} title={row.error}>
                    G04 拒绝 · {row.error}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="g05-current-grid">
        <div className="g05-current-read">
          <span className="eyebrow">CURRENT LEGAL SAMPLE · {activeRow.id}</span>
          <strong>{offsetLabel}</strong>
          <small>第一帧直接使用以下公开位置；不会先生成旧站位再瞬移。</small>
          <div className="g05-positions">
            {PLAYER_IDS.map((id) => {
              const point = activeRow.initialPositions[id];
              const base = baseline.initialPositions[id];
              const dx = point.x - base.x;
              const dy = point.y - base.y;
              return (
                <div key={id}>
                  <span>{id}</span>
                  <strong>({point.x.toFixed(2)}, {point.y.toFixed(2)})</strong>
                  <small>Δ ({dx >= 0 ? "+" : ""}{dx.toFixed(2)}, {dy >= 0 ? "+" : ""}{dy.toFixed(2)})m</small>
                </div>
              );
            })}
          </div>
        </div>

        <div className="g05-comparison">
          <span className="eyebrow">BASELINE → CURRENT</span>
          <p><span>进攻</span><strong>{baseline.initialOffense.chosen} → {activeRow.initialOffense.chosen}</strong></p>
          <p><span>防守</span><strong>{baseline.initialDefense.chosen} → {activeRow.initialDefense.chosen}</strong></p>
          <p><span>结果</span><strong>{baseline.terminalReason} → {activeRow.terminalReason}</strong></p>
          <p>
            <span>时机</span>
            <strong>tick {baseline.terminalTick} → {activeRow.terminalTick} ({terminalDelta >= 0 ? "+" : ""}{terminalDelta})</strong>
          </p>
          <small>本轮没有 plan / branch 结果边界，因此只展示三个由审计事实选出的代表样本。</small>
        </div>
      </div>

      <div className="g05-causal-strip" aria-label="当前样本四层掩护事实">
        <span className={activeRow.contactSeen ? "is-active" : ""}>contact {activeRow.contactSeen ? "YES" : "NO"}</span>
        <span className={activeRow.routeExposureSeen ? "is-active" : ""}>route_exposure {activeRow.routeExposureSeen ? "YES" : "NO"}</span>
        <span className={activeRow.impededSeen ? "is-active" : ""}>impeded {activeRow.impededSeen ? "YES" : "NO"}</span>
        <span className={activeRow.screenEffectiveSeen ? "is-active" : ""}>screen_effective {activeRow.screenEffectiveSeen ? "YES" : "NO"}</span>
        <span>replans O {activeRow.offenseReplans} / D {activeRow.defenseReplans}</span>
        <span>max step {activeRow.maxStepDisplacement.toFixed(3)}m</span>
      </div>

      <div className="g05-candidate-groups">
        <div>
          <h3>首次进攻候选 · chosen {activeRow.initialOffense.chosen}</h3>
          <div className="g05-candidates">
            {activeRow.initialOffense.candidates.map((candidate) => (
              <G05CandidateDetail candidate={candidate} key={candidate.id} />
            ))}
          </div>
        </div>
        <div>
          <h3>首次防守候选 · chosen {activeRow.initialDefense.chosen}</h3>
          <div className="g05-candidates">
            {activeRow.initialDefense.candidates.map((candidate) => (
              <G05CandidateDetail candidate={candidate} key={candidate.id} />
            ))}
          </div>
        </div>
      </div>

      {!audit.passed && (
        <div className="g01-failures">
          {[...audit.failureReasons, ...audit.axisFailures.map((failure) => failure.reason)].map((reason) => (
            <p key={reason}>{reason}</p>
          ))}
        </div>
      )}
    </section>
  );
}

export function G06ProbePanel({
  audit,
  activeReplayId,
  onReplaySelect,
}: {
  audit: G06AuditResult;
  activeReplayId: string;
  onReplaySelect: (id: string) => void;
}) {
  const activeReplay =
    audit.replays.find((replay) => replay.id === activeReplayId) ?? audit.replays[0];
  const activeRow =
    audit.rows.find((row) => row.id === activeReplay?.sampleId) ?? audit.rows[0];
  const plans = (row: G06Row): string =>
    row.planning.map((record) => `t${record.tick} ${record.team[0].toUpperCase()}:${record.chosen}`).join(" → ");

  return (
    <section className="g01-probe g06-probe" aria-label="G06 有限参数交叉组合审计">
      <div className="g01-probe__head">
        <div>
          <span className="eyebrow">G06 · CROSS-PARAMETER AUDIT · EXISTING ALGORITHM ONLY</span>
          <h2>{audit.label}</h2>
          <p>只组合已经通过单轴审计的速度、反应时间与三个人眼验收位置；不增加方案、权重或结果补丁。</p>
        </div>
        <span className={"g01-status " + (audit.passed ? "is-pass" : "is-fail")}>
          {audit.passed ? "G06 GATE PASS" : "G06 GATE FAIL"}
        </span>
      </div>

      <div className="g01-summary">
        <div>
          <span>Matrix A</span>
          <strong>{audit.matrixA.length} 组合 × 2</strong>
          <small>速度 2 × 绕前 2 × 位置 3</small>
        </div>
        <div>
          <span>Matrix B</span>
          <strong>{audit.matrixB.length} 组合 × 2</strong>
          <small>恢复 3 × 位置 3</small>
        </div>
        <div>
          <span>阶段因果</span>
          <strong>{audit.stageCausalityPassed ? "共同前缀保持" : "提前泄漏"}</strong>
          <small>未进入阶段的参数不改此前运动与计划</small>
        </div>
        <div>
          <span>合法性</span>
          <strong>{audit.deterministic && audit.invariantsPassed ? "21 / 21 PASS" : "发现失败"}</strong>
          <small>ATTACK_BIG 无高吊时绕前参数不改球的结果</small>
        </div>
      </div>

      <div className="g01-replays" aria-label="G06 三个代表组合回放">
        {audit.replays.map((replay) => (
          <button
            aria-pressed={replay.id === activeReplayId}
            className={replay.id === activeReplayId ? "is-active" : ""}
            key={replay.id}
            onClick={() => onReplaySelect(replay.id)}
            type="button"
          >
            <span>{replay.label}</span>
            <strong>{replay.sampleId}</strong>
            <small>{replay.note}</small>
          </button>
        ))}
      </div>

      <div className="g01-table-wrap">
        <table className="g01-table g06-table">
          <thead>
            <tr>
              <th>matrix / position</th>
              <th>speed</th>
              <th>front / recovery</th>
              <th>阶段计划</th>
              <th>结果</th>
              <th>tick</th>
              <th>净空</th>
              <th>复现 / 因果</th>
            </tr>
          </thead>
          <tbody>
            {audit.rows.map((row) => (
              <tr className={row.id === activeRow.id ? "is-selected" : ""} key={row.id}>
                <td>{row.matrix} · {row.positionId}</td>
                <td>{row.o1MaxSpeed.toFixed(2)}m/s</td>
                <td>
                  {row.matrix === "A"
                    ? `front ${row.d1FrontReactionDelay.toFixed(2)}s`
                    : `recovery ${row.d1PostCatchRecoveryDelay.toFixed(2)}s`}
                </td>
                <td>{row.firstMismatchOffense ?? row.firstPostCatchDefense ?? "—"}</td>
                <td>{row.terminalReason}</td>
                <td>{row.terminalTick}</td>
                <td>{row.minimumBodyGap.toFixed(4)}m</td>
                <td>{row.deterministic && row.invariantFailures.length === 0 ? "2 / 2 · PASS" : "FAIL"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="g05-current-grid">
        <div className="g05-current-read">
          <span className="eyebrow">CURRENT COMBINATION · {activeRow.id}</span>
          <strong>
            {activeRow.positionId} · O1 {activeRow.o1MaxSpeed.toFixed(2)}m/s · front {activeRow.d1FrontReactionDelay.toFixed(2)}s · recovery {activeRow.d1PostCatchRecoveryDelay.toFixed(2)}s
          </strong>
          <small title={plans(activeRow)}>{plans(activeRow)}</small>
          <div className="g06-event-line">
            {activeRow.events.map((event) => (
              <span key={`${event.type}-${event.tick}`}>{event.type}@{event.tick}</span>
            ))}
          </div>
        </div>
        <div className="g05-comparison">
          <span className="eyebrow">OUTCOME / CHECKS</span>
          <p><span>结果</span><strong>{activeRow.terminalReason}</strong></p>
          <p><span>球权</span><strong>{activeRow.ballOwner ?? "飞行中"} · {activeRow.ballOutcome}</strong></p>
          <p><span>触球</span><strong>{activeRow.actualTouchers.join(" → ") || "无传球"}</strong></p>
          <p><span>重规划</span><strong>O {activeRow.offenseReplans} / D {activeRow.defenseReplans} / WD {activeRow.watchdogReplans}</strong></p>
          <small>{activeRow.explainable ? "每次选择均有可行候选、分数与公开几何证据。" : "存在无法解释的计划。"}</small>
        </div>
      </div>

      <div className="g05-candidate-groups">
        <div>
          <h3>首次进攻候选 · {activeRow.initialOffense.chosen}</h3>
          <div className="g05-candidates">
            {activeRow.initialOffense.candidates.map((candidate) => (
              <G05CandidateDetail candidate={candidate} key={candidate.id} />
            ))}
          </div>
        </div>
        <div>
          <h3>首次防守候选 · {activeRow.initialDefense.chosen}</h3>
          <div className="g05-candidates">
            {activeRow.initialDefense.candidates.map((candidate) => (
              <G05CandidateDetail candidate={candidate} key={candidate.id} />
            ))}
          </div>
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

export function G07ProbePanel({
  audit,
  activeReplayId,
  side,
  sideLocked,
  onReplaySelect,
  onSideChange,
}: {
  audit: G07AuditResult;
  activeReplayId: G07ReplayId;
  side: ScreenSide;
  sideLocked: boolean;
  onReplaySelect: (id: G07ReplayId) => void;
  onSideChange: (side: ScreenSide) => void;
}) {
  const activeReplay =
    audit.replays.find((replay) => replay.id === activeReplayId) ?? audit.replays[0];
  const activeRow =
    audit.rows.find((row) => row.id === activeReplay?.specId) ?? audit.rows[0];
  const config = makeG07Config(activeRow.id, side);

  return (
    <section className="g01-probe g07-probe" aria-label="G07 左右镜像与相对战术坐标审计">
      <div className="g01-probe__head">
        <div>
          <span className="eyebrow">G07 · REAL LEFT WORLD · SHARED TACTICAL FRAME</span>
          <h2>{audit.label}</h2>
          <p>左右两侧共享候选、评分、阈值、角色和事件解析；左侧播放的是真实世界坐标，不是 Canvas 翻转。</p>
        </div>
        <span className={"g01-status " + (audit.passed ? "is-pass" : "is-fail")}>
          {audit.passed ? "MIRROR GATE PASS" : "MIRROR GATE FAIL"}
        </span>
      </div>

      <div className="g01-summary">
        <div>
          <span>镜像输入</span>
          <strong>{audit.pairCount} 对 × 双侧 × 2</strong>
          <small>S01–S08 8 对 + G06 21 对</small>
        </div>
        <div>
          <span>最大数值误差</span>
          <strong>{audit.maxMirrorError.toExponential(2)}m</strong>
          <small>明确容差 {audit.tolerance.toExponential(0)}m</small>
        </div>
        <div>
          <span>计划 / 事件</span>
          <strong>{audit.mirrorPassed ? "逐 tick 等价" : "存在分叉"}</strong>
          <small>候选、角色、事件 tick 与终止一致</small>
        </div>
        <div>
          <span>世界 / 边界</span>
          <strong>{audit.invariantsPassed && audit.informationBoundaryPassed ? "29 / 29 PASS" : "发现失败"}</strong>
          <small>真实左侧同样无远程阻挡与非法球权</small>
        </div>
      </div>

      <div className="g07-side-row">
        <div className="g07-side-switch" aria-label="选择真实运行侧">
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
        <small>{sideLocked ? "运行已开始：side 锁定；重置到 tick 0 后可切换。" : "side 在开始前可切换，运行后锁定。"}</small>
      </div>

      <div className="g01-replays" aria-label="G07 三个镜像代表对">
        {audit.replays.map((replay) => (
          <button
            aria-pressed={replay.id === activeReplayId}
            className={replay.id === activeReplayId ? "is-active" : ""}
            key={replay.id}
            onClick={() => onReplaySelect(replay.id)}
            type="button"
          >
            <span>{replay.label}</span>
            <strong>{replay.specId}</strong>
            <small>{replay.note}</small>
          </button>
        ))}
      </div>

      <div className="g07-current">
        <div>
          <span className="eyebrow">CURRENT REAL WORLD · {side.toUpperCase()}</span>
          <strong>{activeRow.label}</strong>
          <small>
            {side === "right"
              ? "O5 在 O1 右侧设掩护；使用走右肩，拒绝攻左缝。"
              : "O5 在 O1 左侧设掩护；使用走左肩，拒绝攻右缝。"}
          </small>
        </div>
        <div className="g05-positions">
          {PLAYER_IDS.map((id) => (
            <div key={id}>
              <span>{id}</span>
              <strong>({config.initialPositions[id].x.toFixed(2)}, {config.initialPositions[id].y.toFixed(2)})</strong>
              <small>真实 {side} 起手</small>
            </div>
          ))}
        </div>
      </div>

      <div className="g03-layer-strip" aria-label="当前镜像对的等价证据">
        <div className="g03-layer is-active">
          <span>RIGHT</span>
          <strong>{activeRow.rightTerminalReason} · tick {activeRow.terminalTick}</strong>
          <small>{activeRow.rightEventSummary.slice(-5).join(" → ")}</small>
        </div>
        <i>↔</i>
        <div className="g03-layer is-active">
          <span>MIRROR ERROR</span>
          <strong>{activeRow.maxMirrorError.toExponential(2)}m</strong>
          <small>位置、速度、球路、运动目标与标量事实均在容差内</small>
        </div>
        <i>↔</i>
        <div className="g03-layer is-active">
          <span>LEFT</span>
          <strong>{activeRow.leftTerminalReason} · tick {activeRow.terminalTick}</strong>
          <small>{activeRow.leftEventSummary.slice(-5).join(" → ")}</small>
        </div>
      </div>

      <div className="g01-table-wrap">
        <table className="g01-table g07-table">
          <thead>
            <tr>
              <th>pair</th>
              <th>结果 / tick</th>
              <th>max error</th>
              <th>计划 / 候选</th>
              <th>事件 / facts</th>
              <th>双侧复现</th>
              <th>左侧不变量</th>
            </tr>
          </thead>
          <tbody>
            {audit.rows.map((row) => (
              <tr className={row.id === activeRow.id ? "is-selected" : ""} key={row.id}>
                <td>{row.id}</td>
                <td>{row.rightTerminalReason} · {row.terminalTick}</td>
                <td>{row.maxMirrorError.toExponential(1)}m</td>
                <td>{row.plansAndRolesEquivalent && row.candidatesEquivalent ? "MATCH" : "FAIL"}</td>
                <td>{row.eventsEquivalent && row.factsEquivalent ? "MATCH" : "FAIL"}</td>
                <td>{row.rightDeterministic && row.leftDeterministic ? "2 / 2 + 2 / 2" : "FAIL"}</td>
                <td>{row.leftInvariantFailures.length === 0 ? "PASS" : row.leftInvariantFailures.join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!audit.passed && (
        <div className="g01-failures">
          {audit.failureReasons.map((reason) => <p key={reason}>{reason}</p>)}
        </div>
      )}
    </section>
  );
}

function G08CandidateDetail({
  candidate,
  side,
}: {
  candidate: G08CandidateAudit;
  side: ScreenSide;
}) {
  const explanation =
    candidate.vetoes.length > 0
      ? candidate.vetoes.join(" · ")
      : `可行 · ${candidate.evidence.slice(0, 2).join(" · ")}`;

  return (
    <div className={"g05-candidate " + (candidate.feasible ? "is-feasible" : "is-vetoed")}>
      <span>{planShort(candidate.id, side)}</span>
      <strong>
        {candidate.feasible && candidate.score !== null ? candidate.score.toFixed(3) : "VETO"}
      </strong>
      <small>{sideText(explanation, side)}</small>
    </div>
  );
}

export function G08ProbePanel({
  audit,
  activeReplayId,
  onReplaySelect,
}: {
  audit: G08AuditResult;
  activeReplayId: G08ReplaySelection["id"];
  onReplaySelect: (id: G08ReplaySelection["id"]) => void;
}) {
  const activeReplay =
    audit.replays.find((replay) => replay.id === activeReplayId) ?? audit.replays[0];
  const activeRow =
    audit.rows.find((row) => row.id === activeReplay?.manifestId) ?? audit.rows[0];

  if (!activeRow) {
    return (
      <section className="g01-probe g08-probe" aria-label="G08 held-out 泛化检查点">
        <div className="g01-failures">
          <p>G08 在生成首个可播放世界前停止：{audit.failureReasons.join(" · ")}</p>
        </div>
      </section>
    );
  }

  const boundary = activeRow.closestDecisionBoundary;
  const boundaryPlanning = boundary
    ? activeRow.planning.find(
        (record) => record.tick === boundary.tick && record.team === boundary.team,
      )
    : undefined;
  const signed = (value: number): string => `${value >= 0 ? "+" : ""}${value.toFixed(3)}`;
  const offsets = activeRow.source.offsets;
  const planCount = activeRow.offenseReplans + activeRow.defenseReplans;
  const terminalSummary = Object.entries(audit.terminalCounts)
    .map(([reason, count]) => `${reason} ${count}`)
    .join(" · ");

  return (
    <section className="g01-probe g08-probe" aria-label="G08 held-out 泛化检查点">
      <div className="g01-probe__head">
        <div>
          <span className="eyebrow">G08 · LOCKED HELD-OUT · FROZEN CORE</span>
          <h2>{audit.label}</h2>
          <p>24 个输入在看见结果前锁定；此处只播放 manifest 真实世界并展示冻结审计证据。</p>
        </div>
        <span className={"g01-status " + (audit.passed ? "is-pass" : "is-fail")}>
          {audit.passed ? "24 / 24 HELD-OUT PASS" : "HELD-OUT STOPPED"}
        </span>
      </div>

      <div className="g08-lock-grid" aria-label="G08 冻结与 manifest 锁定信息">
        <div className="g08-lock-item">
          <span>FROZEN CORE</span>
          <strong>{audit.frozenCoreCommit}</strong>
        </div>
        <div className="g08-lock-item">
          <span>MANIFEST COMMIT</span>
          <strong>{audit.manifestCommit}</strong>
        </div>
        <div className="g08-lock-item">
          <span>SEED / INPUT HASH</span>
          <strong>{G08_MANIFEST_SEED} · {audit.manifestHash}</strong>
        </div>
        <div className="g08-lock-item">
          <span>GENERATION</span>
          <strong>
            {G08_MANIFEST_GENERATION.candidateCount} candidates · {G08_MANIFEST_GENERATION.geometryRejectedCount + G08_MANIFEST_GENERATION.duplicateRejectedCount} rejected · {G08_MANIFEST_GENERATION.acceptedCount} locked
          </strong>
        </div>
      </div>

      <div className="g01-summary">
        <div>
          <span>执行 / 复现</span>
          <strong>{audit.executedCount} / {audit.manifestCount} · 2 / 2</strong>
          <small>逐 tick 世界、计划、角色与事件一致</small>
        </div>
        <div>
          <span>左右真实世界</span>
          <strong>RIGHT {audit.rightSummary.count} · LEFT {audit.leftSummary.count}</strong>
          <small>双运行最大误差 {Math.max(audit.rightSummary.maxReplayNumericError, audit.leftSummary.maxReplayNumericError).toExponential(1)}m</small>
        </div>
        <div>
          <span>结果类别</span>
          <strong>D {audit.outcomeCounts["defensive-stop"]} · H {audit.outcomeCounts["handler-advantage"]} · I {audit.outcomeCounts["interior-window"]} · K {audit.outcomeCounts["kickout-catch"]}</strong>
          <small>{terminalSummary}</small>
        </div>
        <div>
          <span>核心不变量</span>
          <strong>{audit.invariantsPassed && audit.informationBoundaryPassed ? "24 / 24 PASS" : "发现失败"}</strong>
          <small>defense_contained {audit.rows.filter((row) => row.defenseContained).length} · 无远程掩护</small>
        </div>
      </div>

      <div className="g01-replays g08-replays" aria-label="G08 四个审计后自动选择的代表回放">
        {audit.replays.map((replay) => (
          <button
            aria-pressed={replay.id === activeReplayId}
            className={replay.id === activeReplayId ? "is-active" : ""}
            key={replay.id}
            onClick={() => onReplaySelect(replay.id)}
            type="button"
          >
            <span>{replay.label}</span>
            <strong>{replay.manifestId}</strong>
            <small>{replay.note}</small>
          </button>
        ))}
      </div>

      <div className="g01-table-wrap">
        <table className="g01-table g08-table">
          <thead>
            <tr>
              <th>manifest</th>
              <th>side / inputs</th>
              <th>首次 O / D</th>
              <th>branch / result</th>
              <th>tick / replans</th>
              <th>min gap</th>
              <th>pass / touch</th>
              <th>双运行 / 边界</th>
            </tr>
          </thead>
          <tbody>
            {audit.rows.map((row) => (
              <tr className={row.id === activeRow.id ? "is-selected" : ""} key={row.id}>
                <td>{row.id}</td>
                <td>{row.side} · {row.o1MaxSpeed.toFixed(3)} / {row.d1FrontReactionDelay.toFixed(3)} / {row.d1PostCatchRecoveryDelay.toFixed(3)}</td>
                <td>{planShort(row.firstOffense.chosen, row.side)} / {planShort(row.firstDefense.chosen, row.side)}</td>
                <td>{row.branch} · {row.outcomeCategory}<br />{row.terminalReason}</td>
                <td>{row.terminalTick} · {row.offenseReplans + row.defenseReplans} / WD {row.watchdogReplans}</td>
                <td>{row.minimumBodyGap.toFixed(4)}m</td>
                <td>{row.passResolutions}/{row.passLaunches} · {row.firstToucher ?? "—"}</td>
                <td>{row.deterministic && row.invariantFailures.length === 0 ? "2 / 2 · PASS" : "FAIL"}<br />Δ {row.closestDecisionBoundary?.margin.toFixed(3) ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="g08-current-grid">
        <div className="g05-current-read">
          <span className="eyebrow">CURRENT MANIFEST · {activeRow.id} · {activeRow.side.toUpperCase()}</span>
          <strong>
            O1 {activeRow.o1MaxSpeed.toFixed(3)}m/s · front {activeRow.d1FrontReactionDelay.toFixed(3)}s · recovery {activeRow.d1PostCatchRecoveryDelay.toFixed(3)}s
          </strong>
          <small>
            generator {activeRow.source.generator} · candidate #{activeRow.source.candidateIndex} · {activeRow.source.tacticalFrame}
          </small>
          <div className="g05-positions">
            {PLAYER_IDS.map((id) => (
              <div key={id}>
                <span>{id}</span>
                <strong>({activeRow.initialPositions[id].x.toFixed(3)}, {activeRow.initialPositions[id].y.toFixed(3)})</strong>
                <small>真实第一帧</small>
              </div>
            ))}
          </div>
          <div className="g08-offsets">
            <span>formation ({signed(offsets.formation.x)}, {signed(offsets.formation.y)})</span>
            <span>O5 ({signed(offsets.O5.x)}, {signed(offsets.O5.y)})</span>
            <span>D1 ({signed(offsets.D1.x)}, {signed(offsets.D1.y)})</span>
            <span>D5 ({signed(offsets.D5.x)}, {signed(offsets.D5.y)})</span>
          </div>
        </div>
        <div className="g05-comparison g08-outcome">
          <span className="eyebrow">RESULT / INVARIANTS</span>
          <p><span>结果</span><strong>{activeRow.outcomeCategory} · {activeRow.terminalReason}@{activeRow.terminalTick}</strong></p>
          <p><span>defense_contained</span><strong>{activeRow.defenseContained ? "YES" : "NO"}</strong></p>
          <p><span>重规划</span><strong>{planCount} · WD {activeRow.watchdogReplans}</strong></p>
          <p><span>最短承诺</span><strong>{activeRow.minimumCommitmentSeconds.toFixed(3)}s · urgent {activeRow.urgentCommitInterrupts}</strong></p>
          <p><span>身体净空</span><strong>{activeRow.minimumBodyGap.toFixed(4)}m</strong></p>
          <p><span>球路 / 先触球</span><strong>{activeRow.passResolutions}/{activeRow.passLaunches} · {activeRow.firstToucher ?? "—"}</strong></p>
          <small>{activeRow.invariantFailures.length === 0 ? "信息边界、角色、球权、路径、局部触球和掩护因果全部通过。" : activeRow.invariantFailures.join(" · ")}</small>
        </div>
      </div>

      <div className="g08-plan-sequence" aria-label="当前样本计划与角色序列">
        {activeRow.planning.map((record) => (
          <span key={`${record.team}-${record.tick}-${record.chosen}`} title={sideText(record.trigger, activeRow.side)}>
            t{record.tick} · {record.team === "offense" ? "O" : "D"} · {planShort(record.chosen, activeRow.side)}
          </span>
        ))}
        {activeRow.roleSequence.map((step) => (
          <span className="is-role" key={`roles-${step.tick}`} title={step.roles.map((role) => `${role.playerId}:${sideText(role.roleLabel, activeRow.side)}`).join(" · ")}>
            t{step.tick} · roles {step.roles.map((role) => `${role.playerId}:${role.roleCode}`).join(" / ")}
          </span>
        ))}
      </div>

      <div className="g05-candidate-groups g08-candidate-groups">
        <div>
          <h3>首次进攻候选 · {planShort(activeRow.firstOffense.chosen, activeRow.side)}</h3>
          <div className="g05-candidates">
            {activeRow.firstOffense.candidates.map((candidate) => (
              <G08CandidateDetail candidate={candidate} key={candidate.id} side={activeRow.side} />
            ))}
          </div>
        </div>
        <div>
          <h3>首次防守候选 · {planShort(activeRow.firstDefense.chosen, activeRow.side)}</h3>
          <div className="g05-candidates">
            {activeRow.firstDefense.candidates.map((candidate) => (
              <G08CandidateDetail candidate={candidate} key={candidate.id} side={activeRow.side} />
            ))}
          </div>
        </div>
        <div>
          <h3>
            最近决策边界 · {boundary ? `${boundary.team}@${boundary.tick} · Δ${boundary.margin.toFixed(3)}` : "无双可行候选"}
          </h3>
          <div className="g05-candidates">
            {boundaryPlanning?.candidates.map((candidate) => (
              <G08CandidateDetail candidate={candidate} key={candidate.id} side={activeRow.side} />
            )) ?? <div className="g05-candidate is-vetoed"><small>本样本没有可比较的双可行候选。</small></div>}
          </div>
        </div>
      </div>

      <div className="g06-event-line g08-event-line" aria-label="当前样本全部关键事件">
        {activeRow.events.map((event) => (
          <span key={event.id} title={sideText(event.detail, activeRow.side)}>{event.type}@{event.tick}</span>
        ))}
      </div>

      {!audit.passed && (
        <div className="g01-failures">
          {audit.failureReasons.map((reason) => <p key={reason}>{reason}</p>)}
        </div>
      )}
    </section>
  );
}
