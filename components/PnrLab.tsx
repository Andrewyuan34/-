"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  COURT,
  FIXED_DT,
  PLAYER_IDS,
  PnrSimulation,
  type CandidateEvaluation,
  type DefensiveCue,
  type PlayerId,
  type PlanningRecord,
  type RoleAssignment,
  type TeamPlan,
  type Vec2,
  type WorldEvent,
  type WorldState,
} from "@/lib/pnr-core";

interface UiSnapshot {
  world: WorldState;
  offensePlan: TeamPlan;
  defensePlan: TeamPlan;
  roles: RoleAssignment[];
  events: WorldEvent[];
  planning: PlanningRecord[];
}

type PositionMap = Record<PlayerId, Vec2>;
type TrailMap = Record<PlayerId, Vec2[]>;

const PLAYER_COLORS: Record<PlayerId, string> = {
  O1: "#ff6b35",
  O5: "#ff9f54",
  D1: "#4f8cff",
  D5: "#7aa7ff",
};

const PLAN_SHORT: Record<string, string> = {
  USE_RIGHT_SCREEN: "USE · 右侧使用",
  REJECT_LEFT: "REJECT · 左侧拒绝",
  ATTACK_BIG: "ATTACK · 攻击换防大个",
  FEED_SEAL: "FEED · 喂 O5 卡位",
  RESET_MISMATCH: "RESET · 拉出保留错位",
  SWITCH_READY: "READY · 预占换防出口",
  SWITCH: "SWITCH · 原子换防",
  STAY_HOME: "STAY · 保持原对位",
  CONTAIN_MISMATCH: "CONTAIN · 后撤遏制",
  FRONT_SEAL: "FRONT · D1 抢传球侧",
  PRESSURE_MISMATCH: "PRESSURE · 贴身施压",
};

function clonePlan(plan: TeamPlan): TeamPlan {
  return {
    ...plan,
    roles: Object.fromEntries(
      Object.entries(plan.roles).map(([id, role]) => [id, role ? { ...role } : role]),
    ),
  };
}

function takeSnapshot(simulation: PnrSimulation): UiSnapshot {
  return {
    world: {
      ...simulation.world,
      players: simulation.getPlayerCopies(),
      facts: { ...simulation.world.facts },
      mismatch: { ...simulation.world.mismatch },
      seal: { ...simulation.world.seal },
      ball: {
        ...simulation.world.ball,
        pos: { ...simulation.world.ball.pos },
        vel: { ...simulation.world.ball.vel },
        target: simulation.world.ball.target ? { ...simulation.world.ball.target } : null,
      },
      terminal: simulation.world.terminal ? { ...simulation.world.terminal } : null,
      pendingPlannerEvents: simulation.world.pendingPlannerEvents.map((event) => ({ ...event })),
    },
    offensePlan: clonePlan(simulation.offensePlan),
    defensePlan: clonePlan(simulation.defensePlan),
    roles: simulation.getRoles().map((role) => ({ ...role })),
    events: simulation.eventLog.slice(-10).map((event) => ({ ...event })),
    planning: simulation.planningLog.slice(-8).map((record) => ({
      ...record,
      candidates: record.candidates.map((candidate) => ({
        ...candidate,
        vetoes: [...candidate.vetoes],
        evidence: [...candidate.evidence],
      })),
    })),
  };
}

function copyPositions(simulation: PnrSimulation): PositionMap {
  return Object.fromEntries(
    PLAYER_IDS.map((id) => [id, { ...simulation.world.players[id].pos }]),
  ) as PositionMap;
}

function freshTrails(simulation: PnrSimulation): TrailMap {
  const positions = copyPositions(simulation);
  return {
    O1: [{ ...positions.O1 }],
    O5: [{ ...positions.O5 }],
    D1: [{ ...positions.D1 }],
    D5: [{ ...positions.D5 }],
  };
}

function lerp(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

function drawCourt(
  canvas: HTMLCanvasElement,
  simulation: PnrSimulation,
  previous: PositionMap,
  current: PositionMap,
  alpha: number,
  trails: TrailMap,
): void {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.round(rect.width * dpr);
  const pixelHeight = Math.round(rect.height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);

  const margin = Math.max(18, Math.min(rect.width, rect.height) * 0.035);
  const scale = Math.min(
    (rect.width - margin * 2) / COURT.width,
    (rect.height - margin * 2) / COURT.height,
  );
  const courtWidth = COURT.width * scale;
  const courtHeight = COURT.height * scale;
  const ox = (rect.width - courtWidth) / 2;
  const oy = (rect.height - courtHeight) / 2;
  const point = (value: Vec2): Vec2 => ({
    x: ox + value.x * scale,
    y: oy + value.y * scale,
  });

  context.save();
  context.shadowColor = "rgba(19, 15, 11, 0.34)";
  context.shadowBlur = 26;
  context.fillStyle = "#b47a43";
  context.fillRect(ox, oy, courtWidth, courtHeight);
  context.restore();

  context.save();
  context.beginPath();
  context.rect(ox, oy, courtWidth, courtHeight);
  context.clip();
  context.fillStyle = "#d4a060";
  context.fillRect(ox, oy, courtWidth, courtHeight);
  const plankHeight = scale * 0.42;
  for (let y = oy; y < oy + courtHeight; y += plankHeight) {
    const stripe = Math.floor((y - oy) / plankHeight);
    context.fillStyle = stripe % 2 === 0 ? "rgba(255,255,255,0.035)" : "rgba(67,35,16,0.035)";
    context.fillRect(ox, y, courtWidth, plankHeight);
    context.strokeStyle = "rgba(91, 50, 25, 0.12)";
    context.lineWidth = 0.55;
    context.beginPath();
    context.moveTo(ox, y);
    context.lineTo(ox + courtWidth, y);
    context.stroke();
  }
  for (let x = ox + scale * 1.25; x < ox + courtWidth; x += scale * 1.25) {
    context.strokeStyle = "rgba(255,255,255,0.045)";
    context.beginPath();
    context.moveTo(x, oy);
    context.lineTo(x, oy + courtHeight);
    context.stroke();
  }

  const lineColor = "rgba(250, 237, 216, 0.78)";
  context.strokeStyle = lineColor;
  context.lineWidth = Math.max(1.25, scale * 0.025);
  context.strokeRect(ox, oy, courtWidth, courtHeight);

  const paintLeft = point({ x: 3.25, y: 0 });
  const paintRight = point({ x: 6.75, y: 3.35 });
  context.fillStyle = "rgba(115, 61, 30, 0.13)";
  context.fillRect(paintLeft.x, paintLeft.y, paintRight.x - paintLeft.x, paintRight.y - paintLeft.y);
  context.strokeRect(paintLeft.x, paintLeft.y, paintRight.x - paintLeft.x, paintRight.y - paintLeft.y);

  const freeThrow = point({ x: 5, y: 3.35 });
  context.beginPath();
  context.arc(freeThrow.x, freeThrow.y, 1.18 * scale, 0, Math.PI * 2);
  context.stroke();

  const hoop = point(COURT.hoop);
  context.strokeStyle = "#f05a28";
  context.lineWidth = Math.max(2, scale * 0.055);
  context.beginPath();
  context.arc(hoop.x, hoop.y, 0.22 * scale, 0, Math.PI * 2);
  context.stroke();
  context.strokeStyle = lineColor;
  context.lineWidth = Math.max(1.25, scale * 0.025);
  context.beginPath();
  context.moveTo(point({ x: 4.28, y: 0.38 }).x, point({ x: 4.28, y: 0.38 }).y);
  context.lineTo(point({ x: 5.72, y: 0.38 }).x, point({ x: 5.72, y: 0.38 }).y);
  context.stroke();

  context.beginPath();
  context.arc(hoop.x, hoop.y, 4.72 * scale, 0.18 * Math.PI, 0.82 * Math.PI);
  context.stroke();

  const screenSpot = point(COURT.screenSpot);
  context.save();
  context.setLineDash([5, 6]);
  context.lineWidth = 1.2;
  context.strokeStyle = "rgba(255, 241, 200, 0.58)";
  context.beginPath();
  context.arc(screenSpot.x, screenSpot.y, 0.48 * scale, 0, Math.PI * 2);
  context.stroke();
  context.restore();

  const drawPlanPath = (points: Vec2[], color: string): void => {
    context.save();
    context.setLineDash([7, 8]);
    context.strokeStyle = color;
    context.globalAlpha = 0.55;
    context.lineWidth = Math.max(1.4, scale * 0.032);
    context.beginPath();
    points.forEach((pathPoint, index) => {
      const mapped = point(pathPoint);
      if (index === 0) context.moveTo(mapped.x, mapped.y);
      else context.lineTo(mapped.x, mapped.y);
    });
    context.stroke();
    context.restore();
  };

  const o1Now = current.O1;
  const o5Now = current.O5;
  const shoulderRadius =
    simulation.world.players.O1.radius + simulation.world.players.O5.radius + 0.085;
  const shoulderPoint = (degrees: number): Vec2 => {
    const radians = (degrees * Math.PI) / 180;
    return {
      x: o5Now.x + Math.cos(radians) * shoulderRadius,
      y: o5Now.y + Math.sin(radians) * shoulderRadius,
    };
  };
  const relative = { x: o1Now.x - o5Now.x, y: o1Now.y - o5Now.y };
  let shoulderAngle = Math.atan2(relative.y, relative.x);
  if (shoulderAngle < 0) shoulderAngle += Math.PI * 2;
  const remainingArc: Vec2[] = [];
  if (!simulation.world.facts.ballHandlerClearedScreen) {
    if (shoulderAngle > (105 * Math.PI) / 180 && shoulderAngle < (330 * Math.PI) / 180) {
      remainingArc.push(shoulderPoint(90));
    }
    if (shoulderAngle > (75 * Math.PI) / 180 && shoulderAngle < (330 * Math.PI) / 180) {
      remainingArc.push(shoulderPoint(60));
    }
    if (shoulderAngle > (45 * Math.PI) / 180 && shoulderAngle < (330 * Math.PI) / 180) {
      remainingArc.push(shoulderPoint(30));
    }
    if (shoulderAngle > (15 * Math.PI) / 180 && shoulderAngle < (330 * Math.PI) / 180) {
      remainingArc.push(shoulderPoint(0));
    }
  }
  if (
    simulation.offensePlan.id === "ATTACK_BIG" ||
    simulation.offensePlan.id === "FEED_SEAL" ||
    simulation.offensePlan.id === "RESET_MISMATCH"
  ) {
    drawPlanPath(
      [o1Now, simulation.offensePlan.primaryTarget ?? COURT.hoop],
      "#fff3df",
    );
    drawPlanPath(
      [o5Now, simulation.offensePlan.secondaryTarget ?? o5Now],
      "rgba(255, 194, 139, 0.9)",
    );
    if (simulation.offensePlan.id === "FEED_SEAL") {
      drawPlanPath([o1Now, o5Now], "rgba(247, 220, 142, 0.82)");
    }
  } else {
    drawPlanPath(
      simulation.offensePlan.id === "REJECT_LEFT"
        ? [o1Now, COURT.rejectGate, { x: 4.46, y: 1.08 }]
        : [o1Now, ...remainingArc, COURT.useGate, { x: 5.72, y: 1.05 }],
      "#fff3df",
    );
  }
  if (simulation.defensePlan.id === "SWITCH") {
    drawPlanPath([current.D1, current.O5], "rgba(46, 91, 181, 0.78)");
    drawPlanPath([current.D5, current.O1], "rgba(46, 91, 181, 0.78)");
  } else if (simulation.defensePlan.id === "STAY_HOME") {
    drawPlanPath([current.D1, current.O1], "rgba(46, 91, 181, 0.78)");
    drawPlanPath([current.D5, current.O5], "rgba(46, 91, 181, 0.78)");
  } else if (simulation.defensePlan.id === "CONTAIN_MISMATCH") {
    const toHoop = {
      x: COURT.hoop.x - current.O1.x,
      y: COURT.hoop.y - current.O1.y,
    };
    const magnitude = Math.hypot(toHoop.x, toHoop.y) || 1;
    const containPoint = {
      x: current.O1.x + (toHoop.x / magnitude) * 0.74,
      y: current.O1.y + (toHoop.y / magnitude) * 0.74,
    };
    drawPlanPath([current.D1, current.O5], "rgba(46, 91, 181, 0.78)");
    drawPlanPath([current.D5, containPoint], "rgba(46, 91, 181, 0.78)");
  } else if (simulation.defensePlan.id === "FRONT_SEAL") {
    const ballSideDirection = {
      x: current.O1.x - current.O5.x,
      y: current.O1.y - current.O5.y,
    };
    const ballSideMagnitude = Math.hypot(ballSideDirection.x, ballSideDirection.y) || 1;
    const ballSidePoint = {
      x: current.O5.x + (ballSideDirection.x / ballSideMagnitude) * 0.73,
      y: current.O5.y + (ballSideDirection.y / ballSideMagnitude) * 0.73,
    };
    const hoopDirection = {
      x: COURT.hoop.x - current.O1.x,
      y: COURT.hoop.y - current.O1.y,
    };
    const hoopMagnitude = Math.hypot(hoopDirection.x, hoopDirection.y) || 1;
    const containPoint = {
      x: current.O1.x + (hoopDirection.x / hoopMagnitude) * 0.74,
      y: current.O1.y + (hoopDirection.y / hoopMagnitude) * 0.74,
    };
    drawPlanPath([current.D1, ballSidePoint], "rgba(46, 91, 181, 0.78)");
    drawPlanPath([current.D5, containPoint], "rgba(46, 91, 181, 0.78)");
  } else if (simulation.defensePlan.id === "PRESSURE_MISMATCH") {
    drawPlanPath([current.D1, current.O5], "rgba(46, 91, 181, 0.78)");
    drawPlanPath([current.D5, current.O1], "rgba(46, 91, 181, 0.78)");
  } else {
    drawPlanPath([current.D1, current.O1], "rgba(46, 91, 181, 0.78)");
    drawPlanPath(
      [current.D5, { x: current.O5.x + 0.72, y: current.O5.y - 0.52 }],
      "rgba(46, 91, 181, 0.78)",
    );
  }

  for (const id of PLAYER_IDS) {
    const trail = trails[id];
    if (trail.length < 2) continue;
    context.save();
    context.strokeStyle = PLAYER_COLORS[id];
    context.globalAlpha = 0.18;
    context.lineWidth = Math.max(1.5, scale * 0.035);
    context.beginPath();
    trail.forEach((trailPoint, index) => {
      const mapped = point(trailPoint);
      if (index === 0) context.moveTo(mapped.x, mapped.y);
      else context.lineTo(mapped.x, mapped.y);
    });
    context.stroke();
    context.restore();
  }

  if (simulation.world.facts.routeExposure) {
    const d1 = point(current.D1);
    const o1 = point(current.O1);
    context.save();
    context.strokeStyle = "rgba(255, 231, 148, 0.22)";
    context.lineWidth = 0.92 * scale;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(d1.x, d1.y);
    context.lineTo(o1.x, o1.y);
    context.stroke();
    context.restore();
  }

  for (const id of [...PLAYER_IDS].reverse()) {
    const player = simulation.world.players[id];
    const interpolated = {
      x: lerp(previous[id].x, current[id].x, alpha),
      y: lerp(previous[id].y, current[id].y, alpha),
    };
    const center = point(interpolated);
    const radius = player.radius * scale;
    context.save();
    context.shadowColor = "rgba(28, 20, 13, 0.34)";
    context.shadowBlur = 12;
    context.shadowOffsetY = 4;
    context.fillStyle = PLAYER_COLORS[id];
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.fill();
    context.restore();

    context.strokeStyle = id.startsWith("O") ? "#fff1dc" : "#e4efff";
    context.lineWidth = Math.max(1.7, scale * 0.035);
    context.beginPath();
    context.arc(center.x, center.y, radius - 1, 0, Math.PI * 2);
    context.stroke();

    if (id === "O5" && simulation.world.facts.screenLegalPose) {
      context.save();
      context.strokeStyle = simulation.world.facts.screenEffective ? "#fdf2a5" : "rgba(255,255,255,0.8)";
      context.setLineDash([3, 4]);
      context.lineWidth = 1.4;
      context.beginPath();
      context.arc(center.x, center.y, radius + 0.12 * scale, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }

    context.fillStyle = "#111b25";
    context.font = "700 " + Math.max(11, scale * 0.22) + "px ui-monospace, monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(id, center.x, center.y + 0.5);

    const speed = Math.hypot(player.vel.x, player.vel.y);
    if (speed > 0.32) {
      const direction = { x: player.vel.x / speed, y: player.vel.y / speed };
      context.strokeStyle = "rgba(22, 31, 42, 0.52)";
      context.lineWidth = 1.4;
      context.beginPath();
      context.moveTo(center.x, center.y);
      context.lineTo(
        center.x + direction.x * Math.min(speed * scale * 0.18, scale * 0.55),
        center.y + direction.y * Math.min(speed * scale * 0.18, scale * 0.55),
      );
      context.stroke();
    }
  }

  const ballOwner = simulation.world.ballOwner
    ? simulation.world.players[simulation.world.ballOwner]
    : null;
  const liveOwnedBall = ballOwner && simulation.world.ball.outcome === "live";
  const ballWorldPosition = liveOwnedBall
    ? {
        x: lerp(previous[ballOwner.id].x, current[ballOwner.id].x, alpha) + ballOwner.radius * 0.78,
        y: lerp(previous[ballOwner.id].y, current[ballOwner.id].y, alpha) + ballOwner.radius * 0.52,
      }
    : simulation.world.ball.pos;
  const ballPosition = point(ballWorldPosition);
  if (simulation.world.ball.inFlight && simulation.world.ball.kind === "lob_entry") {
    context.strokeStyle = "rgba(255, 241, 176, 0.72)";
    context.lineWidth = 1.4;
    context.beginPath();
    context.arc(ballPosition.x, ballPosition.y, 0.19 * scale, 0, Math.PI * 2);
    context.stroke();
  }
  context.fillStyle = "#b94818";
  context.strokeStyle = "#4b2415";
  context.lineWidth = 1;
  context.beginPath();
  context.arc(
    ballPosition.x,
    ballPosition.y,
    0.115 * scale,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.stroke();

  if (simulation.world.facts.contact) {
    const d1 = point(current.D1);
    const o5 = point(current.O5);
    const midpoint = { x: (d1.x + o5.x) / 2, y: (d1.y + o5.y) / 2 };
    context.fillStyle = "#fff1a8";
    context.beginPath();
    context.arc(midpoint.x, midpoint.y, Math.max(3, scale * 0.07), 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function PlanCard({ plan, side }: { plan: TeamPlan; side: TeamPlan["team"] }) {
  const remaining = Math.max(0, plan.commitUntil - plan.startedAt);
  return (
    <article className={"plan-card " + side}>
      <div className="plan-card__top">
        <span className="eyebrow">{side === "offense" ? "进攻队级规划器" : "防守队级规划器"}</span>
        <span className="version">v{plan.version}</span>
      </div>
      <h3>{PLAN_SHORT[plan.id]}</h3>
      <p>{plan.rationale}</p>
      <div className="plan-card__meta">
        <span>短推演 {plan.chosenScore.toFixed(2)}</span>
        <span>最短承诺 {remaining.toFixed(2)}s</span>
      </div>
    </article>
  );
}

function RoleRow({ role }: { role: RoleAssignment }) {
  return (
    <div className="role-row">
      <span className={"player-token " + (role.playerId.startsWith("O") ? "offense" : "defense")}>
        {role.playerId}
      </span>
      <span className="role-row__copy">
        <strong>{role.roleLabel}</strong>
        <small>{role.intent}</small>
      </span>
      <span className="owner-mark">{role.owner === "offense-planner" ? "O·OWNER" : "D·OWNER"}</span>
    </div>
  );
}

function CandidateRow({ candidate }: { candidate: CandidateEvaluation }) {
  return (
    <div className={"candidate " + (candidate.feasible ? "" : "is-vetoed")}>
      <div>
        <span>{candidate.label}</span>
        <strong>{candidate.feasible && candidate.score !== null ? candidate.score.toFixed(2) : "VETO"}</strong>
      </div>
      <p>
        {candidate.vetoes[0] ??
          candidate.evidence.slice(1, 3).join(" · ")}
      </p>
    </div>
  );
}

function DecisionTrace({ record }: { record?: PlanningRecord }) {
  if (!record) return null;
  return (
    <div className="decision-trace">
      <div className="decision-trace__head">
        <div>
          <span className="eyebrow">{record.team === "offense" ? "最近进攻决策" : "最近防守决策"}</span>
          <strong>{record.trigger}</strong>
        </div>
        <time>T+{record.at.toFixed(2)}</time>
      </div>
      <div className="candidate-list">
        {record.candidates.map((candidate) => (
          <CandidateRow candidate={candidate} key={candidate.id} />
        ))}
      </div>
      <p className="boundary-note">{record.observationBoundary}</p>
    </div>
  );
}

function EventItem({ event }: { event: WorldEvent }) {
  return (
    <li>
      <time>{event.at.toFixed(2)}</time>
      <span>
        <strong>{event.label}</strong>
        <small>{event.detail}</small>
      </span>
    </li>
  );
}

export default function PnrLab() {
  const [cue, setCue] = useState<DefensiveCue>("neutral");
  const [initialSimulation] = useState(() => new PnrSimulation({ cue: "neutral" }));
  const simulationRef = useRef(initialSimulation);
  const [snapshot, setSnapshot] = useState<UiSnapshot>(() => takeSnapshot(initialSimulation));
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const playingRef = useRef(false);
  const rateRef = useRef(1);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previousRef = useRef<PositionMap>(copyPositions(initialSimulation));
  const currentRef = useRef<PositionMap>(copyPositions(initialSimulation));
  const trailsRef = useRef<TrailMap>(freshTrails(initialSimulation));

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    rateRef.current = rate;
  }, [rate]);

  const refresh = (): void => {
    setSnapshot(takeSnapshot(simulationRef.current));
  };

  const replaceSimulation = (nextCue: DefensiveCue, shouldPlay: boolean): void => {
    const simulation = new PnrSimulation({ cue: nextCue });
    simulationRef.current = simulation;
    previousRef.current = copyPositions(simulation);
    currentRef.current = copyPositions(simulation);
    trailsRef.current = freshTrails(simulation);
    playingRef.current = shouldPlay;
    setPlaying(shouldPlay);
    setSnapshot(takeSnapshot(simulation));
  };

  useEffect(() => {
    let frameId = 0;
    let lastTimestamp = performance.now();
    let lastUiUpdate = lastTimestamp;
    let accumulator = 0;

    const frame = (timestamp: number): void => {
      const frameSeconds = Math.min((timestamp - lastTimestamp) / 1000, 0.08);
      lastTimestamp = timestamp;
      const simulation = simulationRef.current;

      if (playingRef.current && !simulation.world.terminal) {
        accumulator += frameSeconds * rateRef.current;
        while (accumulator >= FIXED_DT) {
          previousRef.current = copyPositions(simulation);
          simulation.step();
          currentRef.current = copyPositions(simulation);
          if (simulation.world.tick % 3 === 0) {
            for (const id of PLAYER_IDS) {
              trailsRef.current[id].push({ ...currentRef.current[id] });
              if (trailsRef.current[id].length > 76) trailsRef.current[id].shift();
            }
          }
          accumulator -= FIXED_DT;
          if (simulation.world.terminal) break;
        }
      }

      const canvas = canvasRef.current;
      if (canvas) {
        drawCourt(
          canvas,
          simulation,
          previousRef.current,
          currentRef.current,
          playingRef.current ? accumulator / FIXED_DT : 1,
          trailsRef.current,
        );
      }

      if (simulation.world.terminal && playingRef.current) {
        playingRef.current = false;
        setPlaying(false);
        setSnapshot(takeSnapshot(simulation));
      } else if (timestamp - lastUiUpdate >= 90) {
        setSnapshot(takeSnapshot(simulation));
        lastUiUpdate = timestamp;
      }
      frameId = requestAnimationFrame(frame);
    };

    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      if (event.code === "Space") {
        event.preventDefault();
        setPlaying((value) => {
          const next = simulationRef.current.world.terminal ? false : !value;
          playingRef.current = next;
          return next;
        });
      }
      if (event.key.toLowerCase() === "r") {
        replaceSimulation(cue, true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cue]);

  const latestOffense = useMemo(
    () => [...snapshot.planning].reverse().find((record) => record.team === "offense"),
    [snapshot.planning],
  );
  const latestDefense = useMemo(
    () => [...snapshot.planning].reverse().find((record) => record.team === "defense"),
    [snapshot.planning],
  );

  const facts = snapshot.world.facts;
  const mismatch = snapshot.world.mismatch;
  const seal = snapshot.world.seal;
  const ball = snapshot.world.ball;
  const causalGateOpen = facts.pnrLinked && (facts.contact || facts.routeExposure);
  const planCommitRemaining = Math.max(
    0,
    Math.min(snapshot.offensePlan.commitUntil, snapshot.defensePlan.commitUntil) - snapshot.world.time,
  );

  return (
    <main className="lab-shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark">2×2</span>
          <div>
            <p className="kicker">RIGHT-SIDE READ · MINIMAL LOOP</p>
            <h1>挡拆因果实验台</h1>
          </div>
        </div>
        <div className="run-signals" aria-label="运行状态">
          <span><i className="signal-dot" /> 固定步长 {(FIXED_DT * 1000).toFixed(2)}ms</span>
          <span>SEED 17</span>
          <span>HASH {snapshot.world.stateHash}</span>
        </div>
      </header>

      <section className="read-selector" aria-label="D1 起手读法">
        <div>
          <span className="eyebrow">同一右侧挡拆 · 可见防守读法</span>
          <p>只改变 D1 的公开起手站位；双方规划器仍各自独立决策。</p>
        </div>
        <div className="segmented">
          <button
            className={cue === "neutral" ? "is-active" : ""}
            onClick={() => {
              setCue("neutral");
              replaceSimulation("neutral", false);
            }}
            type="button"
          >
            中性跟防
            <small>预期：换防后喂 O5，D1 抢前</small>
          </button>
          <button
            className={cue === "overplay_right" ? "is-active" : ""}
            onClick={() => {
              setCue("overplay_right");
              replaceSimulation("overplay_right", false);
            }}
            type="button"
          >
            提前踩右侧
            <small>预期：拒绝掩护</small>
          </button>
        </div>
      </section>

      <div className="workspace-grid">
        <section className="court-panel">
          <div className="court-panel__head">
            <div className="plan-pills">
              <span className="plan-pill offense">{PLAN_SHORT[snapshot.offensePlan.id]}</span>
              <span className="plan-pill defense">{PLAN_SHORT[snapshot.defensePlan.id]}</span>
            </div>
            <div className="timecode">
              <span>T+{snapshot.world.time.toFixed(2)}</span>
              <small>tick {snapshot.world.tick}</small>
            </div>
          </div>

          <div className="court-wrap">
            <canvas ref={canvasRef} aria-label="2v2 右侧挡拆连续运动画面" />
            <div className="court-legend" aria-hidden="true">
              <span><i className="legend-dot offense" /> 进攻</span>
              <span><i className="legend-dot defense" /> 防守</span>
              <span>虚线 = 当前队级意图</span>
            </div>
            {snapshot.world.terminal && (
              <div className="terminal-card">
                <span className="eyebrow">LOOP CLOSED · {snapshot.world.time.toFixed(2)}s</span>
                <strong>{snapshot.world.terminal.label}</strong>
                <p>世界已冻结在第一个判断点；重放可验证相同输入是否复现。</p>
                <button onClick={() => replaceSimulation(cue, true)} type="button">从头重放</button>
              </div>
            )}
          </div>

          <div className="controls">
            <button
              className="primary-control"
              disabled={Boolean(snapshot.world.terminal)}
              onClick={() => {
                const next = !playing;
                playingRef.current = next;
                setPlaying(next);
              }}
              type="button"
            >
              <span>{playing ? "Ⅱ" : "▶"}</span>
              {playing ? "暂停" : "播放"}
            </button>
            <button onClick={() => replaceSimulation(cue, true)} type="button">↻ 重放</button>
            <button onClick={() => replaceSimulation(cue, false)} type="button">重置</button>
            <button
              disabled={playing || Boolean(snapshot.world.terminal)}
              onClick={() => {
                previousRef.current = copyPositions(simulationRef.current);
                simulationRef.current.step();
                currentRef.current = copyPositions(simulationRef.current);
                refresh();
              }}
              type="button"
            >
              单步
            </button>
            <label className="speed-control">
              速度
              <select value={rate} onChange={(event) => setRate(Number(event.target.value))}>
                <option value={0.5}>0.5×</option>
                <option value={1}>1.0×</option>
                <option value={1.5}>1.5×</option>
                <option value={2}>2.0×</option>
              </select>
            </label>
            <span className="shortcut">Space 播放 · R 重放</span>
          </div>

          <div className="causal-chain">
            <div className={"fact-card " + (facts.contact ? "is-active" : "")}>
              <span>01</span>
              <strong>contact</strong>
              <small>{facts.contact ? "身体几何接触" : "无身体接触"}</small>
            </div>
            <i>→</i>
            <div className={"fact-card " + (facts.routeExposure ? "is-active" : "")}>
              <span>02</span>
              <strong>route_exposure</strong>
              <small>{facts.routeExposure ? "进入有限移动走廊" : "未进入移动走廊"}</small>
            </div>
            <i>→</i>
            <div className={"fact-card " + (facts.impeded ? "is-active" : "")}>
              <span>03</span>
              <strong>impeded</strong>
              <small>{facts.impeded ? "出现真实进度损失" : "没有可测延误"}</small>
            </div>
            <i>→</i>
            <div className={"fact-card " + (facts.screenEffective ? "is-active" : "")}>
              <span>04</span>
              <strong>screen_effective</strong>
              <small>
                {facts.screenEffective
                  ? "挡拆归属与进攻优势成立"
                  : facts.matchupExchange
                    ? "换防化解，未自动记为优势"
                    : "尚未产生进攻优势"}
              </small>
            </div>
          </div>
          <div className={"causal-lock " + (causalGateOpen ? "is-open" : "")}>
            <span>{causalGateOpen ? "LOCAL CAUSAL GATE OPEN" : "REMOTE SCREEN LOCKED"}</span>
            <p>
              {causalGateOpen
                ? "D1 只有在接触或合理走廊暴露后，才可能累计延误。"
                : "没有可归属当前掩护的局部接触/走廊：O5 不会对 D1 产生掩护延误。"}
            </p>
            <strong>累计延误 {facts.accumulatedDelay.toFixed(3)}m</strong>
          </div>
          <div
            className={
              "handoff-strip " +
              (facts.matchupExchange
                ? "is-complete"
                : facts.ballHandlerClearedScreen
                  ? "is-exchanging"
                  : snapshot.world.branch === "reject"
                    ? "is-stay"
                    : "")
            }
          >
            <span>SWITCH HANDOFF</span>
            <strong>
              {facts.matchupExchange
                ? "换防完成 · D1→O5 / D5→O1"
                : facts.ballHandlerClearedScreen
                  ? "O1 已越肩 · 正在交换对位"
                  : snapshot.world.branch === "reject"
                    ? "拒绝掩护 · 保持 D1→O1 / D5→O5"
                    : "等待 O1 通过 O5 外肩"}
            </strong>
            <p>越肩事实在下一决策边界消费；换防前后始终保持四名球员单一角色所有权。</p>
          </div>
          <div
            className={
              "mismatch-strip " +
              (mismatch.advantage
                ? "is-advantage"
                : mismatch.contained
                  ? "is-contained"
                  : mismatch.active
                    ? "is-active"
                    : "")
            }
          >
            <span>MISMATCH WINDOW</span>
            <strong>
              {mismatch.advantage
                ? "O1 突破 D5 遏制线"
                : mismatch.contained
                  ? "D5 成功遏制 O1"
                : mismatch.attackCommitted
                    ? "O1 正在攻击 D5"
                    : snapshot.offensePlan.id === "FEED_SEAL"
                      ? "O5 正在建立小打大卡位"
                    : mismatch.active
                      ? "换防已落地 · 等待错位攻击"
                      : "等待 D1 / D5 完成对位交换"}
            </strong>
            <p>
              {mismatch.active
                ? `O1–D5 ${mismatch.o1D5Separation.toFixed(2)}m · D5 篮筐侧 ${mismatch.d5GoalSide ? "是" : "否"} · ${mismatch.elapsed.toFixed(2)}s`
                : "只读取公开坐标与速度；不读取任一球队隐藏计划。"}
            </p>
          </div>
          <div
            className={
              "seal-strip " +
              (ball.outcome === "caught"
                ? "is-caught"
                : ball.outcome === "deflected" || ball.outcome === "missed"
                  ? "is-denied"
                  : ball.inFlight
                    ? "is-flight"
                    : seal.d1Fronting
                      ? "is-fronted"
                      : seal.passWindow
                        ? "is-open"
                        : seal.established
                          ? "is-established"
                          : "")
            }
          >
            <span>SEAL / LOB ENTRY</span>
            <strong>
              {ball.outcome === "caught"
                ? "O5 先触球 · 深位接球"
                : ball.outcome === "deflected"
                  ? "D1 先触球 · 传球被破坏"
                  : ball.outcome === "missed"
                    ? "高吊球未进入接球半径"
                    : ball.inFlight
                      ? "高吊球飞行中 · 球权为空"
                      : seal.d1Fronting
                        ? "D1 已抢到 O1–O5 传球侧"
                        : seal.passWindow
                          ? "O5 卡位成立 · 高吊窗口开放"
                          : seal.established
                            ? "O5 已压住 D1 · 等待合法角度"
                            : seal.active
                              ? "等待 O5 进入低位卡位"
                              : "等待换防完成"}
            </strong>
            <p>
              {seal.active
                ? `O5 篮筐侧 ${seal.o5GoalSide ? "是" : "否"} · D1 绕前 ${seal.d1Fronting ? "是" : "否"} · 走廊净空 ${seal.laneClearance.toFixed(2)}m`
                : "高吊球可越过近身 D5；D1 仍可按实际触球顺序破坏。"}
            </p>
          </div>
        </section>

        <aside className="inspector">
          <div className="inspector__section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">TEAM PLANS</span>
                <h2>当前联合承诺</h2>
              </div>
              <span className={"commit-chip " + (planCommitRemaining > 0 ? "is-locked" : "")}>
                {planCommitRemaining > 0 ? "承诺中 " + planCommitRemaining.toFixed(2) + "s" : "事件可重评"}
              </span>
            </div>
            <PlanCard plan={snapshot.offensePlan} side="offense" />
            <PlanCard plan={snapshot.defensePlan} side="defense" />
          </div>

          <div className="inspector__section">
            <div className="section-heading compact">
              <div>
                <span className="eyebrow">ROLE OWNERSHIP</span>
                <h2>单一角色所有权</h2>
              </div>
              <span className="verified-mark">4 / 4 唯一</span>
            </div>
            <div className="role-list">
              {snapshot.roles.map((role) => <RoleRow key={role.playerId} role={role} />)}
            </div>
          </div>

          <div className="inspector__section">
            <div className="section-heading compact">
              <div>
                <span className="eyebrow">DECISION TRACE</span>
                <h2>选择与否决</h2>
              </div>
            </div>
            <DecisionTrace record={latestOffense} />
            <DecisionTrace record={latestDefense} />
          </div>

          <div className="inspector__section event-section">
            <div className="section-heading compact">
              <div>
                <span className="eyebrow">NEUTRAL EVENTS</span>
                <h2>中立世界事实</h2>
              </div>
              <span className="event-count">{snapshot.events.length}</span>
            </div>
            {snapshot.events.length === 0 ? (
              <p className="empty-events">等待世界解析第一项关键事实。</p>
            ) : (
              <ol className="event-list">
                {[...snapshot.events].reverse().map((event) => <EventItem event={event} key={event.id} />)}
              </ol>
            )}
          </div>
        </aside>
      </div>

      <section className="architecture-strip">
        <div className="architecture-node offense">
          <span>01 · HIDDEN FROM DEFENSE</span>
          <strong>进攻队级规划器</strong>
          <p>攻击大个 / 喂卡位候选、硬约束、短推演、O1/O5 角色承诺</p>
        </div>
        <div className="public-channel">
          <span>公开坐标 · 速度 · 球权 · 已解析事件</span>
          <i>→</i>
        </div>
        <div className="architecture-node neutral">
          <span>FIXED 16.67ms</span>
          <strong>中立世界与运动解析器</strong>
          <p>运动、边界、接触、传球飞行、先触球、球权与错位结果；不替球队选方案</p>
        </div>
        <div className="public-channel reverse">
          <span>下一决策边界才可消费</span>
          <i>←</i>
        </div>
        <div className="architecture-node defense">
          <span>03 · HIDDEN FROM OFFENSE</span>
          <strong>防守队级规划器</strong>
          <p>换防、遏制与 D1 绕前候选、硬约束、短推演、D1/D5 原子角色交换</p>
        </div>
      </section>

      <footer>
        <p>
          <strong>可替换假设：</strong>
          半场坐标近似米制；O1 给低位 O5 使用可越过近身 D5 的固定速度高吊球，D1 仍可绕前破坏；不模拟球的真实高度、投篮、犯规或更多战术。
        </p>
        <span>Observer UI · disposable shell</span>
      </footer>
    </main>
  );
}
