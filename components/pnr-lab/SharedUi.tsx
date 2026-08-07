import type {
  CandidateEvaluation,
  PlanningRecord,
  RoleAssignment,
  ScreenSide,
  TeamPlan,
  WorldEvent,
} from "@/lib/pnr-core";
import { DECISION_PHASE_LABELS } from "@/lib/pnr-strategy";
import { planShort, sideText } from "./format";

export function PlanCard({
  plan,
  team,
  screenSide,
}: {
  plan: TeamPlan;
  team: TeamPlan["team"];
  screenSide: ScreenSide;
}) {
  const remaining = Math.max(0, plan.commitUntil - plan.startedAt);
  return (
    <article className={"plan-card " + team}>
      <div className="plan-card__top">
        <span className="eyebrow">{team === "offense" ? "进攻队级规划器" : "防守队级规划器"}</span>
        <span className="version">v{plan.version}</span>
      </div>
      <h3>{planShort(plan.id, screenSide)}</h3>
      <p>{sideText(plan.rationale, screenSide)}</p>
      <div className="plan-card__meta">
        <span>有效评分 {plan.chosenScore.toFixed(2)}</span>
        <span>最短承诺 {remaining.toFixed(2)}s</span>
      </div>
    </article>
  );
}
export function RoleRow({ role, screenSide }: { role: RoleAssignment; screenSide: ScreenSide }) {
  return (
    <div className="role-row">
      <span className={"player-token " + (role.playerId.startsWith("O") ? "offense" : "defense")}>
        {role.playerId}
      </span>
      <span className="role-row__copy">
        <strong>{sideText(role.roleLabel, screenSide)}</strong>
        <small>{sideText(role.intent, screenSide)}</small>
      </span>
      <span className="owner-mark">{role.owner === "offense-planner" ? "O·OWNER" : "D·OWNER"}</span>
    </div>
  );
}

export function CandidateRow({
  candidate,
  screenSide,
  worldFrame = false,
}: {
  candidate: CandidateEvaluation;
  screenSide: ScreenSide;
  worldFrame?: boolean;
}) {
  const displayText = (value: string): string => worldFrame
    ? value
    : sideText(value, screenSide);
  const label = displayText(candidate.label);
  const scoreEquation = candidate.feasible && candidate.baseScore !== null
    ? `BASE ${candidate.baseScore.toFixed(2)} + STRATEGY ${candidate.strategyAdjustment >= 0 ? "+" : ""}${candidate.strategyAdjustment.toFixed(2)} = ${candidate.effectiveScore?.toFixed(2) ?? "VETO"}`
    : "BASE VETO + STRATEGY BLOCKED = VETO";
  return (
    <div className={"candidate " + (candidate.feasible ? "" : "is-vetoed")}>
      <div>
        <span>{label}</span>
        <strong>{scoreEquation}</strong>
      </div>
      <p>
        {displayText(
          candidate.vetoes[0] ?? candidate.evidence.slice(1, 3).join(" · "),
        )}
      </p>
      <small>{displayText(candidate.strategyReason)}</small>
    </div>
  );
}

export function DecisionTrace({
  record,
  screenSide,
}: {
  record?: PlanningRecord;
  screenSide: ScreenSide;
}) {
  if (!record) return null;
  const worldFrame = record.decisionPhase === "offense_formation" &&
    record.candidates.some((candidate) => candidate.autonomousSetup);
  return (
    <div className="decision-trace">
      <div className="decision-trace__head">
        <div>
          <span className="eyebrow">{record.team === "offense" ? "最近进攻决策" : "最近防守决策"}</span>
          <strong>{record.trigger}</strong>
          <small>{DECISION_PHASE_LABELS[record.decisionPhase]} · {record.strategy.id}@{record.strategy.version}</small>
        </div>
        <time>T+{record.at.toFixed(2)}</time>
      </div>
      <div className="candidate-list">
        {record.candidates.map((candidate, index) => (
          <CandidateRow
            candidate={candidate}
            key={`${candidate.id}/${candidate.label}/${index}`}
            screenSide={screenSide}
            worldFrame={worldFrame}
          />
        ))}
      </div>
      <p className="boundary-note">{record.observationBoundary}</p>
    </div>
  );
}

export function EventItem({ event, screenSide }: { event: WorldEvent; screenSide: ScreenSide }) {
  const worldFrame = event.type === "formation_side_committed";
  const displayText = (value: string): string => worldFrame ? value : sideText(value, screenSide);
  return (
    <li>
      <time>{event.at.toFixed(2)}</time>
      <span>
        <strong>{displayText(event.label)}</strong>
        <small>{displayText(event.detail)}</small>
      </span>
    </li>
  );
}
