import {
  mirrorPointAcrossCenterline,
  PLAYER_IDS,
  type ScreenSide,
  type TeamPlan,
} from "@/lib/pnr-core";
import type { TacticalVocabularyAudit } from "@/lib/pnr-tactical-audit";
import { TACTICAL_MANIFEST_INPUTS } from "@/lib/pnr-tactical-manifest";
import type { UiSnapshot } from "./types";

const FOCUS_LABELS = {
  deep_drop_read: "深 drop 急停读取",
  coverage_containment: "drop / chase 防守收口",
  chase_snake: "追防后的 snake",
  chase_pocket: "snake 吸引后的 pocket pass",
} as const;

function routePhase(plan: TeamPlan): string {
  if (!plan.route) return "none";
  return Object.values(plan.route.tracks).flatMap((track) => {
    if (!track) return [];
    const segment = track.segments[track.segmentIndex];
    return segment
      ? [`${track.playerId}:${segment.phase}[${track.segmentIndex + 1}/${track.segments.length}]`]
      : [`${track.playerId}:complete`];
  }).join(" · ") || plan.route.kind;
}

export function TacticalVocabularyPanel({
  activeInputId,
  audit,
  locked,
  onInputSelect,
  onSideChange,
  side,
  snapshot,
}: {
  activeInputId: string;
  audit: TacticalVocabularyAudit;
  locked: boolean;
  onInputSelect: (inputId: string) => void;
  onSideChange: (side: ScreenSide) => void;
  side: ScreenSide;
  snapshot: UiSnapshot;
}) {
  const input = TACTICAL_MANIFEST_INPUTS.find((candidate) => candidate.id === activeInputId) ??
    TACTICAL_MANIFEST_INPUTS[0];
  const row = audit.rows.find((candidate) => candidate.id === input.id);
  if (!row) throw new Error(`Missing T audit row: ${input.id}`);
  const sideAudit = side === "right" ? row.right : row.left;
  const coverage = snapshot.world.tacticalCoverage;
  const terminalFact = snapshot.world.terminal?.reason === "tactical_pocket_caught"
    ? "POCKET PASS CAUGHT"
    : snapshot.world.terminal?.reason === "tactical_pullup_window"
      ? "PULLUP WINDOW"
      : snapshot.world.terminal?.reason === "tactical_snake_advantage"
        ? "SNAKE ADVANTAGE"
        : snapshot.world.terminal?.reason === "tactical_contained"
          ? "COVERAGE CONTAINED"
          : null;
  const keyEvents = snapshot.events.filter((event) => [
    "drop_committed",
    "chase_over_committed",
    "pocket_window_open",
    "pocket_pass_launched",
    "pocket_pass_caught",
    "tactical_pullup_window",
    "tactical_snake_advantage",
    "tactical_contained",
    "terminal",
  ].includes(event.type));

  return (
    <section className="g01-probe g07-probe formation-generalization" aria-label="T00 到 T01 最小战术词汇审计">
      <div className="g01-probe__head">
        <div>
          <span className="eyebrow">T00–T01 · REAL COVERAGE → OFFENSE READ → NEUTRAL RESOLUTION</span>
          <h2>最小战术词汇：drop / chase</h2>
          <p>球队只提交覆盖与读取计划；中立世界从真实退守、越肩、追尾、急停、snake 与传球飞行发布事实。此入口是显式 T 回放，不接入 Formation / Autonomous。</p>
        </div>
        <span className={"g01-status " + (audit.passed ? "is-pass" : "is-fail")}>
          {audit.passed ? "T00–T01 AUDIT PASS" : "T00–T01 AUDIT FAIL"}
        </span>
      </div>

      <div className="g01-summary">
        <div>
          <span>INPUT-ONLY MANIFEST</span>
          <strong>{audit.inputCount} inputs / {audit.worldCount} mirrored worlds · each ×{audit.executionsPerWorld}</strong>
          <small title={audit.inputHash}>{audit.manifestVersion} · {audit.inputHash.slice(0, 24)}…</small>
        </div>
        <div>
          <span>CORE GATES</span>
          <strong>{audit.deterministic && audit.evaluationOrderStable ? "DETERMINISM / ORDER PASS" : "ORDER FAIL"}</strong>
          <small>mirror {audit.mirrored ? "PASS" : "FAIL"} · routes {audit.routesLegal ? "LEGAL" : "FAIL"} · strategy adjustment {audit.zeroStrategyAdjustment ? "0" : "FAIL"}</small>
        </div>
        <div>
          <span>CURRENT AUDIT</span>
          <strong>{row.id} · {FOCUS_LABELS[row.focus]}</strong>
          <small>{sideAudit.terminalReason} @ tick {sideAudit.terminalTick} · mirror error {row.mirrorMaximumError.toExponential(2)}m</small>
        </div>
        <div>
          <span>LIVE PUBLIC FACT</span>
          <strong>{terminalFact ?? (coverage?.pocketWindow
            ? "POCKET WINDOW"
            : coverage?.chaseOverCommitted
              ? "CHASE / OVER COMMITTED"
              : coverage?.dropCommitted
                ? "DROP / CONTAIN COMMITTED"
                : "WAITING FOR REAL COVERAGE")}</strong>
          <small>{snapshot.world.terminal
            ? `TERMINAL · ${snapshot.world.terminal.reason}`
            : locked
              ? "REPLAY LOCKED · reset to choose input or side"
              : "READY · choose an audited input and side"}</small>
        </div>
      </div>

      <div className="g07-side-row">
        <div className="g07-side-switch" aria-label="选择 T00 T01 代表回放">
          {TACTICAL_MANIFEST_INPUTS.map((candidate) => (
            <button
              aria-pressed={candidate.id === input.id}
              className={candidate.id === input.id ? "is-active" : ""}
              disabled={locked}
              key={candidate.id}
              onClick={() => onInputSelect(candidate.id)}
              type="button"
            >
              {candidate.id} · {FOCUS_LABELS[candidate.focus]}
            </button>
          ))}
        </div>
        <div className="g07-side-switch" aria-label="选择 T 镜像侧">
          {(["right", "left"] as const).map((candidateSide) => (
            <button
              aria-pressed={candidateSide === side}
              className={candidateSide === side ? "is-active" : ""}
              disabled={locked}
              key={candidateSide}
              onClick={() => onSideChange(candidateSide)}
              type="button"
            >
              {candidateSide.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="formation-input-layout">
        <div>
          <span>PUBLIC INITIAL POSITIONS</span>
          <div className="g05-positions">
            {PLAYER_IDS.map((id) => {
              const position = side === "right"
                ? input.initialPositions[id]
                : mirrorPointAcrossCenterline(input.initialPositions[id]);
              return (
                <div key={id}>
                  <span>{id}</span>
                  <strong>({position.x.toFixed(2)}, {position.y.toFixed(2)})</strong>
                  <small>{id === "O1" ? `ball handler · ${input.o1MaxSpeed.toFixed(2)}m/s` : id === "O5" ? "screener" : `guards ${id === "D1" ? "O1" : "O5"}`}</small>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <span>LIVE TEAM COMMITMENTS</span>
          <strong>O · {snapshot.offensePlan.id}</strong>
          <small>{routePhase(snapshot.offensePlan)}</small>
          <strong>D · {snapshot.defensePlan.id}</strong>
          <small>{routePhase(snapshot.defensePlan)}</small>
        </div>
        <div>
          <span>PUBLIC CAUSAL TIMELINE</span>
          <strong>{keyEvents.length
            ? keyEvents.map((event) => `${event.type}@${event.tick}`).join(" → ")
            : "等待真实 drop / chase 运动事实"}</strong>
          <small>audit: drop {sideAudit.dropCommittedTick ?? "—"} · chase {sideAudit.chaseCommittedTick ?? "—"} · pocket {sideAudit.pocketWindowTick ?? "—"}</small>
        </div>
      </div>

      <div className="p03-current-grid formation-current-grid">
        <div>
          <span>DROP / CONTAIN</span>
          <strong>{coverage?.dropCommitted ? "COMMITTED" : "not committed"}</strong>
          <small>D5 retreat {coverage?.d5RetreatProgress.toFixed(2) ?? "0.00"}m · screen depth {coverage?.d5ScreenDepth.toFixed(2) ?? "0.00"}m · contains ball {coverage?.d5ContainsBall ? "yes" : "no"}</small>
        </div>
        <div>
          <span>CHASE / SNAKE</span>
          <strong>{coverage?.chaseOverCommitted ? "OVER COMMITTED" : "waiting"}</strong>
          <small>D1 trail {coverage?.d1Trail ? "yes" : "no"} · recovered {coverage?.d1Recovered ? "yes" : "no"} · snake {coverage?.snakeCommitted ? "committed" : "no"}</small>
        </div>
        <div>
          <span>POCKET / RESOLUTION</span>
          <strong>{snapshot.world.ball.kind === "pocket_pass"
            ? `${snapshot.world.ball.inFlight ? "FLIGHT" : snapshot.world.ball.outcome.toUpperCase()}`
            : coverage?.pocketWindow
              ? "WINDOW OPEN"
              : "closed"}</strong>
          <small>lane {coverage?.pocketLaneClearance.toFixed(2) ?? "0.00"}m · pullup {coverage?.pullupWindow ? "yes" : "no"} · snake advantage {coverage?.snakeAdvantage ? "yes" : "no"} · contained {coverage?.contained ? "yes" : "no"}</small>
        </div>
      </div>

      {!audit.passed && (
        <div className="g01-failures">
          <p>{audit.firstFailure?.id}: {audit.firstFailure?.reason}</p>
        </div>
      )}
    </section>
  );
}
