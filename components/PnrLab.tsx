"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  COURT,
  FIXED_DT,
  PLAYER_IDS,
  PnrSimulation,
  mirrorPointAcrossCenterline,
  type CandidateEvaluation,
  type PlayerId,
  type PlanningRecord,
  type RoleAssignment,
  type ScreenSide,
  type TeamPlan,
  type Vec2,
  type WorldEvent,
  type WorldState,
} from "@/lib/pnr-core";
import {
  DEFAULT_SCENARIO_ID,
  PNR_SCENARIOS,
  getPnrScenario,
  makeScenarioConfig,
  type ScenarioId,
} from "@/lib/pnr-scenarios";
import {
  G01_BASE_CONFIG,
  createG01Replay,
  scanG01SpeedBoundary,
  type G01AuditResult,
  type G01ReplayId,
  type G01ScanRow,
} from "@/lib/pnr-generalization";
import {
  G02_BASE_CONFIG,
  createG02Replay,
  scanG02FrontReactionBoundary,
  type G02AuditResult,
  type G02ReplayId,
  type G02ScanRow,
} from "@/lib/pnr-g02-generalization";
import {
  G03_BASE_CONFIG,
  createG03Replay,
  scanG03PostCatchRecoveryBoundary,
  type G03AuditResult,
  type G03CandidateAudit,
  type G03ReplayId,
  type G03ScanRow,
} from "@/lib/pnr-g03-generalization";
import {
  G05_BASE_CONFIG,
  createG05Replay,
  scanG05SpatialBoundary,
  type G05AuditResult,
  type G05CandidateAudit,
  type G05ReplayId,
  type G05SimulatedRow,
} from "@/lib/pnr-g05-spatial-generalization";
import {
  createG06Replay,
  scanG06Combinations,
  type G06AuditResult,
  type G06Row,
} from "@/lib/pnr-g06-combinations";
import {
  createG07Replay,
  makeG07Config,
  scanG07Mirrors,
  type G07AuditResult,
  type G07ReplayId,
} from "@/lib/pnr-g07-mirroring";
import {
  createG08Replay,
  scanG08Heldout,
  type G08AuditResult,
  type G08CandidateAudit,
  type G08ReplaySelection,
} from "@/lib/pnr-g08-heldout-audit";
import {
  G08_MANIFEST_GENERATION,
  G08_MANIFEST_SEED,
} from "@/lib/pnr-g08-heldout-manifest";

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
type LabMode = "scenarios" | "g01" | "g02" | "g03" | "g05" | "g06" | "g07" | "g08";

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
  BACKSIDE_CONTEST: "BEHIND · D1 身后干扰",
  STAY_HOME_POST: "STAY · D5 留守 O1",
  DIG_POST: "DIG · D5 下沉协防",
  PRESSURE_MISMATCH: "PRESSURE · 贴身施压",
  POST_FINISH: "FINISH · O5 转身攻筐",
  KICK_OUT: "KICK · O5 分回 O1",
  REJECT_SLIP_PASS: "SLIP · 拒绝后分 O5",
  UNDER: "UNDER · D1 走下方",
  TAG_REJECT: "TAG · D5 协防拒绝",
};

const G01_AUDIT = scanG01SpeedBoundary();
const G02_AUDIT = scanG02FrontReactionBoundary();
const G03_AUDIT = scanG03PostCatchRecoveryBoundary();
const G05_AUDIT = scanG05SpatialBoundary();
const G06_AUDIT = scanG06Combinations();
const G07_AUDIT = scanG07Mirrors();
const G08_AUDIT = scanG08Heldout();

function planShort(id: string, side: ScreenSide): string {
  if (side === "left" && id === "USE_RIGHT_SCREEN") return "USE · 左侧使用";
  if (side === "left" && id === "REJECT_LEFT") return "REJECT · 右侧拒绝";
  return PLAN_SHORT[id] ?? id;
}

function sideText(value: string, side: ScreenSide): string {
  if (side === "right") return value;
  return value
    .replaceAll("右", "\uE000")
    .replaceAll("左", "右")
    .replaceAll("\uE000", "左");
}

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
      postCatch: { ...simulation.world.postCatch },
      under: { ...simulation.world.under },
      reject: { ...simulation.world.reject },
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

function lowSideDigPoint(o5: Vec2, o1: Vec2): Vec2 {
  const pass = { x: o1.x - o5.x, y: o1.y - o5.y };
  const passMagnitude = Math.hypot(pass.x, pass.y) || 1;
  const sideA = { x: pass.y / passMagnitude, y: -pass.x / passMagnitude };
  const sideB = { x: -sideA.x, y: -sideA.y };
  const hoop = { x: COURT.hoop.x - o5.x, y: COURT.hoop.y - o5.y };
  const useA = sideA.x * hoop.x + sideA.y * hoop.y >= sideB.x * hoop.x + sideB.y * hoop.y;
  const lowSide = useA ? sideA : sideB;
  return { x: o5.x + lowSide.x * 0.82, y: o5.y + lowSide.y * 0.82 };
}

function towardHoop(from: Vec2, distance: number): Vec2 {
  const delta = { x: COURT.hoop.x - from.x, y: COURT.hoop.y - from.y };
  const magnitude = Math.hypot(delta.x, delta.y) || 1;
  return {
    x: from.x + (delta.x / magnitude) * distance,
    y: from.y + (delta.y / magnitude) * distance,
  };
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
  const sidePoint = (value: Vec2): Vec2 =>
    simulation.world.screenSide === "right"
      ? value
      : mirrorPointAcrossCenterline(value);

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

  const screenSpot = point(sidePoint(COURT.screenSpot));
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
  const tacticalO1 = sidePoint(o1Now);
  const tacticalO5 = sidePoint(o5Now);
  const shoulderRadius =
    simulation.world.players.O1.radius + simulation.world.players.O5.radius + 0.085;
  const shoulderPoint = (degrees: number): Vec2 => {
    const radians = (degrees * Math.PI) / 180;
    return {
      x: tacticalO5.x + Math.cos(radians) * shoulderRadius,
      y: tacticalO5.y + Math.sin(radians) * shoulderRadius,
    };
  };
  const relative = {
    x: tacticalO1.x - tacticalO5.x,
    y: tacticalO1.y - tacticalO5.y,
  };
  let shoulderAngle = Math.atan2(relative.y, relative.x);
  if (shoulderAngle < 0) shoulderAngle += Math.PI * 2;
  const remainingArc: Vec2[] = [];
  if (!simulation.world.facts.ballHandlerClearedScreen) {
    if (shoulderAngle > (105 * Math.PI) / 180 && shoulderAngle < (330 * Math.PI) / 180) {
      remainingArc.push(sidePoint(shoulderPoint(90)));
    }
    if (shoulderAngle > (75 * Math.PI) / 180 && shoulderAngle < (330 * Math.PI) / 180) {
      remainingArc.push(sidePoint(shoulderPoint(60)));
    }
    if (shoulderAngle > (45 * Math.PI) / 180 && shoulderAngle < (330 * Math.PI) / 180) {
      remainingArc.push(sidePoint(shoulderPoint(30)));
    }
    if (shoulderAngle > (15 * Math.PI) / 180 && shoulderAngle < (330 * Math.PI) / 180) {
      remainingArc.push(sidePoint(shoulderPoint(0)));
    }
  }
  if (
    simulation.offensePlan.id === "POST_FINISH" ||
    simulation.offensePlan.id === "KICK_OUT"
  ) {
    drawPlanPath(
      [o5Now, simulation.offensePlan.primaryTarget ?? COURT.hoop],
      "rgba(255, 194, 139, 0.9)",
    );
    drawPlanPath(
      [o1Now, simulation.offensePlan.secondaryTarget ?? o1Now],
      "#fff3df",
    );
    if (simulation.offensePlan.id === "KICK_OUT") {
      drawPlanPath([o5Now, o1Now], "rgba(247, 220, 142, 0.82)");
    }
  } else if (
    simulation.offensePlan.id === "ATTACK_BIG" ||
    simulation.offensePlan.id === "FEED_SEAL" ||
    simulation.offensePlan.id === "RESET_MISMATCH" ||
    simulation.offensePlan.id === "REJECT_SLIP_PASS"
  ) {
    drawPlanPath(
      [o1Now, simulation.offensePlan.primaryTarget ?? COURT.hoop],
      "#fff3df",
    );
    drawPlanPath(
      [o5Now, simulation.offensePlan.secondaryTarget ?? o5Now],
      "rgba(255, 194, 139, 0.9)",
    );
    if (
      simulation.offensePlan.id === "FEED_SEAL" ||
      simulation.offensePlan.id === "REJECT_SLIP_PASS"
    ) {
      drawPlanPath([o1Now, o5Now], "rgba(247, 220, 142, 0.82)");
    }
  } else {
    drawPlanPath(
      simulation.offensePlan.id === "REJECT_LEFT"
        ? simulation.offensePlan.primaryTarget
          ? [o1Now, simulation.offensePlan.primaryTarget]
          : [o1Now, sidePoint(COURT.rejectGate), sidePoint({ x: 4.46, y: 1.08 })]
        : [o1Now, ...remainingArc, sidePoint(COURT.useGate), sidePoint({ x: 5.72, y: 1.05 })],
      "#fff3df",
    );
  }
  if (simulation.defensePlan.id === "UNDER") {
    drawPlanPath([current.D1, towardHoop(current.O5, 0.86), current.O1], "rgba(46, 91, 181, 0.78)");
    drawPlanPath([current.D5, towardHoop(current.O5, 0.42)], "rgba(46, 91, 181, 0.78)");
  } else if (simulation.defensePlan.id === "TAG_REJECT") {
    drawPlanPath([current.D1, current.O1], "rgba(46, 91, 181, 0.78)");
    drawPlanPath(
      [
        current.D5,
        {
          x: current.O5.x + (simulation.world.screenSide === "right" ? -0.58 : 0.58),
          y: current.O5.y + 0.78,
        },
        simulation.defensePlan.primaryTarget ?? current.O1,
      ],
      "rgba(46, 91, 181, 0.78)",
    );
  } else if (simulation.defensePlan.id === "SWITCH") {
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
  } else if (simulation.defensePlan.id === "BACKSIDE_CONTEST") {
    const behindDirection = {
      x: current.O5.x - COURT.hoop.x,
      y: current.O5.y - COURT.hoop.y,
    };
    const behindMagnitude = Math.hypot(behindDirection.x, behindDirection.y) || 1;
    const behindPoint = {
      x: current.O5.x + (behindDirection.x / behindMagnitude) * 0.73,
      y: current.O5.y + (behindDirection.y / behindMagnitude) * 0.73,
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
    drawPlanPath([current.D1, behindPoint], "rgba(46, 91, 181, 0.78)");
    drawPlanPath([current.D5, containPoint], "rgba(46, 91, 181, 0.78)");
  } else if (
    simulation.defensePlan.id === "STAY_HOME_POST" ||
    simulation.defensePlan.id === "DIG_POST"
  ) {
    const behindDirection = {
      x: current.O5.x - COURT.hoop.x,
      y: current.O5.y - COURT.hoop.y,
    };
    const behindMagnitude = Math.hypot(behindDirection.x, behindDirection.y) || 1;
    const behindPoint = {
      x: current.O5.x + (behindDirection.x / behindMagnitude) * 0.73,
      y: current.O5.y + (behindDirection.y / behindMagnitude) * 0.73,
    };
    const d5Target =
      simulation.defensePlan.id === "DIG_POST"
        ? lowSideDigPoint(current.O5, current.O1)
        : (() => {
            const hoopDirection = {
              x: COURT.hoop.x - current.O1.x,
              y: COURT.hoop.y - current.O1.y,
            };
            const magnitude = Math.hypot(hoopDirection.x, hoopDirection.y) || 1;
            return {
              x: current.O1.x + (hoopDirection.x / magnitude) * 0.72,
              y: current.O1.y + (hoopDirection.y / magnitude) * 0.72,
            };
          })();
    drawPlanPath([current.D1, behindPoint], "rgba(46, 91, 181, 0.78)");
    drawPlanPath([current.D5, d5Target], "rgba(46, 91, 181, 0.78)");
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
  if (simulation.world.ball.inFlight) {
    context.strokeStyle =
      simulation.world.ball.kind === "kick_out"
        ? "rgba(190, 233, 255, 0.82)"
        : "rgba(255, 241, 176, 0.72)";
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

function PlanCard({
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
        <span>短推演 {plan.chosenScore.toFixed(2)}</span>
        <span>最短承诺 {remaining.toFixed(2)}s</span>
      </div>
    </article>
  );
}

function RoleRow({ role, screenSide }: { role: RoleAssignment; screenSide: ScreenSide }) {
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

function CandidateRow({
  candidate,
  screenSide,
}: {
  candidate: CandidateEvaluation;
  screenSide: ScreenSide;
}) {
  const label = sideText(candidate.label, screenSide);
  return (
    <div className={"candidate " + (candidate.feasible ? "" : "is-vetoed")}>
      <div>
        <span>{label}</span>
        <strong>{candidate.feasible && candidate.score !== null ? candidate.score.toFixed(2) : "VETO"}</strong>
      </div>
      <p>
        {sideText(
          candidate.vetoes[0] ?? candidate.evidence.slice(1, 3).join(" · "),
          screenSide,
        )}
      </p>
    </div>
  );
}

function DecisionTrace({
  record,
  screenSide,
}: {
  record?: PlanningRecord;
  screenSide: ScreenSide;
}) {
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
          <CandidateRow candidate={candidate} key={candidate.id} screenSide={screenSide} />
        ))}
      </div>
      <p className="boundary-note">{record.observationBoundary}</p>
    </div>
  );
}

function EventItem({ event, screenSide }: { event: WorldEvent; screenSide: ScreenSide }) {
  return (
    <li>
      <time>{event.at.toFixed(2)}</time>
      <span>
        <strong>{sideText(event.label, screenSide)}</strong>
        <small>{sideText(event.detail, screenSide)}</small>
      </span>
    </li>
  );
}

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

function G01ProbePanel({
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

function G02ProbePanel({
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

function G03ProbePanel({
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

function G05ProbePanel({
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

function G06ProbePanel({
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

function G07ProbePanel({
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

function G08ProbePanel({
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

export default function PnrLab() {
  const [labMode, setLabMode] = useState<LabMode>("scenarios");
  const [scenarioId, setScenarioId] = useState<ScenarioId>(DEFAULT_SCENARIO_ID);
  const [g01ReplayId, setG01ReplayId] = useState<G01ReplayId>("stable-high");
  const [g02ReplayId, setG02ReplayId] = useState<G02ReplayId>("last-deflection");
  const [g03ReplayId, setG03ReplayId] = useState<G03ReplayId>("last-stay");
  const [g05ReplayId, setG05ReplayId] = useState<G05ReplayId>("baseline");
  const [g06ReplayId, setG06ReplayId] = useState("real-deflection");
  const [g07ReplayId, setG07ReplayId] = useState<G07ReplayId>("switch");
  const [g07Side, setG07Side] = useState<ScreenSide>("right");
  const [g08ReplayId, setG08ReplayId] =
    useState<G08ReplaySelection["id"]>("closest-boundary");
  const [initialSimulation] = useState(
    () => new PnrSimulation(makeScenarioConfig(DEFAULT_SCENARIO_ID)),
  );
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

  const installSimulation = useCallback((simulation: PnrSimulation, shouldPlay: boolean): void => {
    simulationRef.current = simulation;
    previousRef.current = copyPositions(simulation);
    currentRef.current = copyPositions(simulation);
    trailsRef.current = freshTrails(simulation);
    playingRef.current = shouldPlay;
    setPlaying(shouldPlay);
    setSnapshot(takeSnapshot(simulation));
  }, []);

  const replaceSimulation = useCallback((nextScenarioId: ScenarioId, shouldPlay: boolean): void => {
    installSimulation(new PnrSimulation(makeScenarioConfig(nextScenarioId)), shouldPlay);
  }, [installSimulation]);

  const replaceG01Simulation = useCallback((nextReplayId: G01ReplayId, shouldPlay: boolean): void => {
    const replay = G01_AUDIT.replays.find((candidate) => candidate.id === nextReplayId);
    if (!replay) throw new Error(`Unknown G01 replay: ${nextReplayId}`);
    installSimulation(createG01Replay(replay.speed), shouldPlay);
  }, [installSimulation]);

  const replaceG02Simulation = useCallback((nextReplayId: G02ReplayId, shouldPlay: boolean): void => {
    const replay = G02_AUDIT.replays.find((candidate) => candidate.id === nextReplayId);
    if (!replay) throw new Error(`Unknown G02 replay: ${nextReplayId}`);
    installSimulation(createG02Replay(replay.delay), shouldPlay);
  }, [installSimulation]);

  const replaceG03Simulation = useCallback((nextReplayId: G03ReplayId, shouldPlay: boolean): void => {
    const replay = G03_AUDIT.replays.find((candidate) => candidate.id === nextReplayId);
    if (!replay) throw new Error(`Unknown G03 replay: ${nextReplayId}`);
    installSimulation(createG03Replay(replay.delay), shouldPlay);
  }, [installSimulation]);

  const replaceG05Simulation = useCallback((nextReplayId: G05ReplayId, shouldPlay: boolean): void => {
    const replay = G05_AUDIT.replays.find((candidate) => candidate.id === nextReplayId);
    if (!replay) throw new Error(`Unknown G05 replay: ${nextReplayId}`);
    installSimulation(createG05Replay(replay.sampleId), shouldPlay);
  }, [installSimulation]);

  const replaceG06Simulation = useCallback((nextReplayId: string, shouldPlay: boolean): void => {
    const replay = G06_AUDIT.replays.find((candidate) => candidate.id === nextReplayId);
    if (!replay) throw new Error(`Unknown G06 replay: ${nextReplayId}`);
    installSimulation(createG06Replay(replay.sampleId), shouldPlay);
  }, [installSimulation]);

  const replaceG07Simulation = useCallback((
    nextReplayId: G07ReplayId,
    nextSide: ScreenSide,
    shouldPlay: boolean,
  ): void => {
    const replay = G07_AUDIT.replays.find((candidate) => candidate.id === nextReplayId);
    if (!replay) throw new Error(`Unknown G07 replay: ${nextReplayId}`);
    installSimulation(createG07Replay(replay.specId, nextSide), shouldPlay);
  }, [installSimulation]);

  const replaceG08Simulation = useCallback((
    nextReplayId: G08ReplaySelection["id"],
    shouldPlay: boolean,
  ): void => {
    const replay = G08_AUDIT.replays.find((candidate) => candidate.id === nextReplayId);
    if (!replay) throw new Error(`Unknown G08 replay: ${nextReplayId}`);
    installSimulation(createG08Replay(replay.manifestId), shouldPlay);
  }, [installSimulation]);

  const replaceCurrentSimulation = useCallback((shouldPlay: boolean): void => {
    if (labMode === "g01") {
      replaceG01Simulation(g01ReplayId, shouldPlay);
    } else if (labMode === "g02") {
      replaceG02Simulation(g02ReplayId, shouldPlay);
    } else if (labMode === "g03") {
      replaceG03Simulation(g03ReplayId, shouldPlay);
    } else if (labMode === "g05") {
      replaceG05Simulation(g05ReplayId, shouldPlay);
    } else if (labMode === "g06") {
      replaceG06Simulation(g06ReplayId, shouldPlay);
    } else if (labMode === "g07") {
      replaceG07Simulation(g07ReplayId, g07Side, shouldPlay);
    } else if (labMode === "g08") {
      replaceG08Simulation(g08ReplayId, shouldPlay);
    } else {
      replaceSimulation(scenarioId, shouldPlay);
    }
  }, [
    g01ReplayId,
    g02ReplayId,
    g03ReplayId,
    g05ReplayId,
    g06ReplayId,
    g07ReplayId,
    g07Side,
    g08ReplayId,
    labMode,
    replaceG01Simulation,
    replaceG02Simulation,
    replaceG03Simulation,
    replaceG05Simulation,
    replaceG06Simulation,
    replaceG07Simulation,
    replaceG08Simulation,
    replaceSimulation,
    scenarioId,
  ]);

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
        replaceCurrentSimulation(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [replaceCurrentSimulation]);

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
  const postCatch = snapshot.world.postCatch;
  const under = snapshot.world.under;
  const reject = snapshot.world.reject;
  const ball = snapshot.world.ball;
  const causalGateOpen = facts.pnrLinked && (facts.contact || facts.routeExposure);
  const planCommitRemaining = Math.max(
    0,
    Math.min(snapshot.offensePlan.commitUntil, snapshot.defensePlan.commitUntil) - snapshot.world.time,
  );
  const currentScenario = getPnrScenario(scenarioId);
  const currentG01Replay =
    G01_AUDIT.replays.find((replay) => replay.id === g01ReplayId) ?? G01_AUDIT.replays[0];
  const currentG02Replay =
    G02_AUDIT.replays.find((replay) => replay.id === g02ReplayId) ?? G02_AUDIT.replays[0];
  const currentG03Replay =
    G03_AUDIT.replays.find((replay) => replay.id === g03ReplayId) ?? G03_AUDIT.replays[0];
  const currentG05Replay =
    G05_AUDIT.replays.find((replay) => replay.id === g05ReplayId) ?? G05_AUDIT.replays[0];
  const currentG06Replay =
    G06_AUDIT.replays.find((replay) => replay.id === g06ReplayId) ?? G06_AUDIT.replays[0];
  const currentG07Replay =
    G07_AUDIT.replays.find((replay) => replay.id === g07ReplayId) ?? G07_AUDIT.replays[0];
  const currentG08Replay =
    G08_AUDIT.replays.find((replay) => replay.id === g08ReplayId) ?? G08_AUDIT.replays[0];

  return (
    <main className="lab-shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark">2×2</span>
          <div>
            <p className="kicker">{snapshot.world.screenSide.toUpperCase()}-SIDE READ · MINIMAL LOOP</p>
            <h1>挡拆因果实验台</h1>
          </div>
        </div>
        <div className="run-signals" aria-label="运行状态">
          <span><i className="signal-dot" /> 固定步长 {(FIXED_DT * 1000).toFixed(2)}ms</span>
          <span>SEED 17</span>
          {labMode === "g01" && <span>G01 · O1 {currentG01Replay.speed.toFixed(2)}m/s</span>}
          {labMode === "g02" && <span>G02 · D1 delay {currentG02Replay.delay.toFixed(2)}s</span>}
          {labMode === "g03" && <span>G03 · recovery {currentG03Replay.delay.toFixed(2)}s</span>}
          {labMode === "g05" && <span>G05 · {currentG05Replay.sampleId}</span>}
          {labMode === "g06" && <span>G06 · {currentG06Replay.sampleId}</span>}
          {labMode === "g07" && <span>G07 · {g07Side.toUpperCase()} · {currentG07Replay.specId}</span>}
          {labMode === "g08" && currentG08Replay && <span>G08 · {currentG08Replay.manifestId} · {snapshot.world.screenSide.toUpperCase()}</span>}
          <span>HASH {snapshot.world.stateHash}</span>
        </div>
      </header>

      <nav className="catalog-tabs" aria-label="场景与泛化探针">
        <button
          aria-pressed={labMode === "scenarios"}
          className={labMode === "scenarios" ? "is-active" : ""}
          onClick={() => {
            setLabMode("scenarios");
            replaceSimulation(scenarioId, false);
          }}
          type="button"
        >
          S01–S08 · 保留场景
        </button>
        <button
          aria-pressed={labMode === "g01"}
          className={labMode === "g01" ? "is-active" : ""}
          onClick={() => {
            setLabMode("g01");
            replaceG01Simulation(g01ReplayId, false);
          }}
          type="button"
        >
          G01 · 速度边界探针
        </button>
        <button
          aria-pressed={labMode === "g02"}
          className={labMode === "g02" ? "is-active" : ""}
          onClick={() => {
            setLabMode("g02");
            replaceG02Simulation(g02ReplayId, false);
          }}
          type="button"
        >
          G02 · 绕前时间边界
        </button>
        <button
          aria-pressed={labMode === "g03"}
          className={labMode === "g03" ? "is-active" : ""}
          onClick={() => {
            setLabMode("g03");
            replaceG03Simulation(g03ReplayId, false);
          }}
          type="button"
        >
          G03 · 接球后恢复边界
        </button>
        <button
          aria-pressed={labMode === "g05"}
          className={labMode === "g05" ? "is-active" : ""}
          onClick={() => {
            setLabMode("g05");
            replaceG05Simulation(g05ReplayId, false);
          }}
          type="button"
        >
          G04–G05 · 空间探针
        </button>
        <button
          aria-pressed={labMode === "g06"}
          className={labMode === "g06" ? "is-active" : ""}
          onClick={() => {
            setLabMode("g06");
            replaceG06Simulation(g06ReplayId, false);
          }}
          type="button"
        >
          G06 · 参数交叉
        </button>
        <button
          aria-pressed={labMode === "g07"}
          className={labMode === "g07" ? "is-active" : ""}
          onClick={() => {
            setLabMode("g07");
            replaceG07Simulation(g07ReplayId, g07Side, false);
          }}
          type="button"
        >
          G07 · 左右镜像
        </button>
        <button
          aria-pressed={labMode === "g08"}
          className={labMode === "g08" ? "is-active" : ""}
          onClick={() => {
            setLabMode("g08");
            replaceG08Simulation(g08ReplayId, false);
          }}
          type="button"
        >
          G08 · held-out 检查点
        </button>
      </nav>

      {labMode === "scenarios" ? (
        <section className="read-selector" aria-label="挡拆场景目录">
          <div className="scenario-copy">
            <span className="eyebrow">SCENARIO CATALOG · {PNR_SCENARIOS.length} SAVED</span>
            <p>{currentScenario.question}</p>
          </div>
          <label className="scenario-picker" htmlFor="scenario-select">
            <span>选择保留局面</span>
            <select
              id="scenario-select"
              value={scenarioId}
              onChange={(event) => {
                const nextScenario = getPnrScenario(event.currentTarget.value);
                setScenarioId(nextScenario.id);
                replaceSimulation(nextScenario.id, false);
              }}
            >
              {PNR_SCENARIOS.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.code} · {scenario.label}
                </option>
              ))}
            </select>
            <small aria-live="polite">{currentScenario.expected}</small>
          </label>
        </section>
      ) : labMode === "g01" ? (
        <G01ProbePanel
          activeReplayId={g01ReplayId}
          audit={G01_AUDIT}
          onReplaySelect={(nextReplayId) => {
            setG01ReplayId(nextReplayId);
            replaceG01Simulation(nextReplayId, false);
          }}
        />
      ) : labMode === "g02" ? (
        <G02ProbePanel
          activeReplayId={g02ReplayId}
          audit={G02_AUDIT}
          onReplaySelect={(nextReplayId) => {
            setG02ReplayId(nextReplayId);
            replaceG02Simulation(nextReplayId, false);
          }}
        />
      ) : labMode === "g03" ? (
        <G03ProbePanel
          activeReplayId={g03ReplayId}
          audit={G03_AUDIT}
          onReplaySelect={(nextReplayId) => {
            setG03ReplayId(nextReplayId);
            replaceG03Simulation(nextReplayId, false);
          }}
        />
      ) : labMode === "g05" ? (
        <G05ProbePanel
          activeReplayId={g05ReplayId}
          audit={G05_AUDIT}
          onReplaySelect={(nextReplayId) => {
            setG05ReplayId(nextReplayId);
            replaceG05Simulation(nextReplayId, false);
          }}
        />
      ) : labMode === "g06" ? (
        <G06ProbePanel
          activeReplayId={g06ReplayId}
          audit={G06_AUDIT}
          onReplaySelect={(nextReplayId) => {
            setG06ReplayId(nextReplayId);
            replaceG06Simulation(nextReplayId, false);
          }}
        />
      ) : labMode === "g07" ? (
        <G07ProbePanel
          activeReplayId={g07ReplayId}
          audit={G07_AUDIT}
          onReplaySelect={(nextReplayId) => {
            setG07ReplayId(nextReplayId);
            replaceG07Simulation(nextReplayId, g07Side, false);
          }}
          onSideChange={(nextSide) => {
            setG07Side(nextSide);
            replaceG07Simulation(g07ReplayId, nextSide, false);
          }}
          side={g07Side}
          sideLocked={playing || snapshot.world.tick > 0}
        />
      ) : (
        <G08ProbePanel
          activeReplayId={g08ReplayId}
          audit={G08_AUDIT}
          onReplaySelect={(nextReplayId) => {
            setG08ReplayId(nextReplayId);
            replaceG08Simulation(nextReplayId, false);
          }}
        />
      )}

      <div className="workspace-grid">
        <section className="court-panel">
          <div className="court-panel__head">
            <div className="plan-pills">
              <span className="plan-pill offense">{planShort(snapshot.offensePlan.id, snapshot.world.screenSide)}</span>
              <span className="plan-pill defense">{planShort(snapshot.defensePlan.id, snapshot.world.screenSide)}</span>
            </div>
            <div className="timecode">
              <span>T+{snapshot.world.time.toFixed(2)}</span>
              <small>tick {snapshot.world.tick}</small>
            </div>
          </div>

          <div className="court-wrap">
            <canvas
              ref={canvasRef}
              aria-label={`2v2 ${snapshot.world.screenSide === "right" ? "右侧" : "左侧"}挡拆连续运动画面`}
            />
            <div className="court-legend" aria-hidden="true">
              <span><i className="legend-dot offense" /> 进攻</span>
              <span><i className="legend-dot defense" /> 防守</span>
              <span>虚线 = 当前队级意图</span>
            </div>
            {snapshot.world.terminal && (
              <div className="terminal-card">
                <span className="eyebrow">LOOP CLOSED · {snapshot.world.time.toFixed(2)}s</span>
                <strong>{sideText(snapshot.world.terminal.label, snapshot.world.screenSide)}</strong>
                <p>世界已冻结在第一个判断点；重放可验证相同输入是否复现。</p>
                <button onClick={() => replaceCurrentSimulation(true)} type="button">从头重放</button>
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
            <button onClick={() => replaceCurrentSimulation(true)} type="button">↻ 重放</button>
            <button onClick={() => replaceCurrentSimulation(false)} type="button">重置</button>
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
                : under.active || snapshot.defensePlan.id === "UNDER"
                  ? "is-stay"
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
                : under.active || snapshot.defensePlan.id === "UNDER"
                  ? "走下方覆盖 · 保持 D1→O1 / D5→O5"
                : facts.ballHandlerClearedScreen
                  ? "O1 已越肩 · 正在交换对位"
                  : snapshot.world.branch === "reject"
                    ? "拒绝掩护 · 保持 D1→O1 / D5→O5"
                    : "等待 O1 通过 O5 外肩"}
            </strong>
            <p>
              {under.active || snapshot.defensePlan.id === "UNDER"
                ? "D1 从 O5 与篮筐之间绕行，D5 留守 O5；越肩不会自动触发对位交换。"
                : "越肩事实在下一决策边界消费；换防前后始终保持四名球员单一角色所有权。"}
            </p>
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
              "post-catch-strip coverage-strip " +
              (ball.kind === "slip_pass" && ball.outcome === "caught"
                ? "is-open"
                : ball.kind === "slip_pass" && ball.inFlight
                  ? "is-open"
                  : reject.passWindow || under.pullupWindow
                    ? "is-open"
                    : reject.d5HelpCommitted
                      ? "is-help"
                      : under.active
                        ? "is-under"
                        : reject.d1Beaten
                          ? "is-active"
                          : "")
            }
          >
            <span>{reject.active ? "REJECT HELP / SLIP" : "SCREEN COVERAGE"}</span>
            <strong>
              {ball.kind === "slip_pass" && ball.outcome === "caught"
                ? "O5 已合法接到拒绝后分球"
                : ball.kind === "slip_pass" && ball.inFlight
                  ? "顺下分球飞行中 · 球权为空"
                  : reject.passWindow
                    ? "O1–O5 顺下传球窗已开放"
                    : reject.d5HelpCommitted
                      ? "D5 已真实协防 · O1 读取 O5 顺下"
                      : reject.d1Beaten
                        ? "D1 已落后拒绝路线 · 等待 D5 响应"
                        : under.pullupWindow
                          ? "D1 尚未追回 · O1 获得急停处理窗"
                          : under.active
                            ? "D1 走下方 · D5 短收并留守 O5"
                            : snapshot.defensePlan.id === "UNDER"
                              ? "D1 已准备从掩护下方通过"
                              : "等待公开覆盖或拒绝协防事实"}
            </strong>
            <p>
              {reject.active
                ? sideText(
                    `强踩右资格 ${reject.helpEligible ? "是" : "否"} · D5–O1 ${reject.d5O1Distance.toFixed(2)}m · D5–O5 ${reject.d5O5Distance.toFixed(2)}m · 净空 ${reject.passLaneClearance.toFixed(2)}m`,
                    snapshot.world.screenSide,
                  )
                : under.active || snapshot.defensePlan.id === "UNDER"
                  ? `D1–O1 ${under.d1O1Distance.toFixed(2)}m · D5–O5 ${under.d5O5Distance.toFixed(2)}m · 原子换防 ${facts.matchupExchange ? "是" : "否"}`
                  : "覆盖判断只读取公开起手深度、局部距离、速度与已解析事件。"}
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
            <span>
              {ball.kind === "kick_out"
                ? "KICKOUT PASS"
                : ball.kind === "slip_pass"
                  ? "REJECT SLIP PASS"
                  : "SEAL / LOB ENTRY"}
            </span>
            <strong>
              {ball.kind === "slip_pass" && ball.outcome === "caught"
                ? "O5 合法接到拒绝后分球"
                : ball.kind === "slip_pass" && ball.outcome === "deflected"
                  ? "防守先触球 · 顺下分球被破坏"
                  : ball.kind === "slip_pass" && ball.inFlight
                    ? "O1 已分球 · 顺下传球飞行中"
              : ball.kind === "kick_out" && ball.outcome === "caught"
                ? "O1 合法接到回传"
                : ball.kind === "kick_out" && ball.outcome === "deflected"
                  ? "防守先触球 · 回传被破坏"
                  : ball.kind === "kick_out" && ball.inFlight
                    ? "O5 已分球 · 回传飞行中"
                : ball.outcome === "caught"
                  ? "O5 先触球 · 深位接球"
                : ball.outcome === "deflected"
                  ? "D1 先触球 · 传球被破坏"
                  : ball.outcome === "missed"
                    ? "高吊球未进入接球半径"
                    : ball.inFlight
                      ? "高吊球飞行中 · 球权为空"
                      : seal.d1Fronting
                        ? "D1 已抢到 O1–O5 传球侧"
                        : snapshot.defensePlan.id === "BACKSIDE_CONTEST"
                          ? "D1 绕前来不及 · 留在身后干扰"
                        : seal.passWindow
                          ? "O5 卡位成立 · 高吊窗口开放"
                          : seal.established
                            ? "O5 已压住 D1 · 等待合法角度"
                            : seal.active
                              ? "等待 O5 进入低位卡位"
                              : "等待换防完成"}
            </strong>
            <p>
              {ball.kind === "kick_out"
                ? `回传净空 ${postCatch.kickoutLaneClearance.toFixed(2)}m · D5–O5 ${postCatch.d5O5Distance.toFixed(2)}m · 飞行时球权为空`
                : ball.kind === "slip_pass"
                  ? `顺下净空 ${reject.passLaneClearance.toFixed(2)}m · D5–O1 ${reject.d5O1Distance.toFixed(2)}m · 飞行时球权为空`
                : seal.established
                ? `绕前 ETA ${seal.frontEta.toFixed(3)}s / 高吊 ${seal.entryFlightTime.toFixed(3)}s · ${seal.frontFeasible ? "可行" : "否决"} · 反应 ${seal.frontReactionDelay.toFixed(2)}s`
                : seal.active
                  ? `O5 篮筐侧 ${seal.o5GoalSide ? "是" : "否"} · D1 绕前 ${seal.d1Fronting ? "是" : "否"} · 走廊净空 ${seal.laneClearance.toFixed(2)}m`
                : "高吊球可越过近身 D5；D1 仍可按实际触球顺序破坏。"}
            </p>
          </div>
          <div
            className={
              "post-catch-strip " +
              (ball.kind === "kick_out" && ball.outcome === "caught" && snapshot.world.ballOwner === "O1"
                ? "is-kickout"
                : ball.kind === "kick_out" && ball.inFlight
                  ? "is-kickout"
                  : postCatch.kickoutWindow
                    ? "is-kickout"
                    : postCatch.d5HelpCommitted
                      ? "is-help"
              : postCatch.finishWindow
                ? "is-finish"
                : postCatch.attackCommitted
                  ? "is-attacking"
                  : postCatch.active
                    ? "is-active"
                    : "")
            }
          >
            <span>POST CATCH</span>
            <strong>
              {ball.kind === "kick_out" && ball.outcome === "caught" && snapshot.world.ballOwner === "O1"
                ? "O1 已接到 O5 回传 · 本场景停止"
                : ball.kind === "kick_out" && ball.inFlight
                  ? "回传飞行中 · 球权为空"
                  : postCatch.kickoutWindow
                    ? "O5–O1 回传窗已开放"
                    : postCatch.d5HelpCommitted
                      ? "D5 已真实下沉 · O5 读取后准备分球"
              : postCatch.finishWindow
                ? "O5 已形成近筐处理窗口"
                : postCatch.attackCommitted
                  ? "O5 转身推进 · D5 留守 O1"
                  : postCatch.active
                    ? "O5 已接球 · 双方重新规划"
                    : "等待 O5 建立接球球权"}
            </strong>
            <p>
              {postCatch.d5HelpCommitted
                ? `D1 恢复 ${postCatch.d1RecoveryReadyIn.toFixed(2)}s · D5–O5 ${postCatch.d5O5Distance.toFixed(2)}m · D5–O1 ${postCatch.d5O1Distance.toFixed(2)}m · 回传净空 ${postCatch.kickoutLaneClearance.toFixed(2)}m`
                : postCatch.active
                  ? `距筐 ${postCatch.o5RimDistance.toFixed(2)}m · D1 身后 ${postCatch.d1Behind ? "是" : "否"} · D5–O1 ${postCatch.d5O1Distance.toFixed(2)}m · 拉开 ${postCatch.o1Spacing.toFixed(2)}m`
                : "接球事件只在下一决策边界触发双方新计划。"}
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
            <PlanCard plan={snapshot.offensePlan} screenSide={snapshot.world.screenSide} team="offense" />
            <PlanCard plan={snapshot.defensePlan} screenSide={snapshot.world.screenSide} team="defense" />
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
              {snapshot.roles.map((role) => (
                <RoleRow key={role.playerId} role={role} screenSide={snapshot.world.screenSide} />
              ))}
            </div>
          </div>

          <div className="inspector__section">
            <div className="section-heading compact">
              <div>
                <span className="eyebrow">DECISION TRACE</span>
                <h2>选择与否决</h2>
              </div>
            </div>
            <DecisionTrace record={latestOffense} screenSide={snapshot.world.screenSide} />
            <DecisionTrace record={latestDefense} screenSide={snapshot.world.screenSide} />
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
                {[...snapshot.events].reverse().map((event) => (
                  <EventItem event={event} key={event.id} screenSide={snapshot.world.screenSide} />
                ))}
              </ol>
            )}
          </div>
        </aside>
      </div>

      <section className="architecture-strip">
        <div className="architecture-node offense">
          <span>01 · HIDDEN FROM DEFENSE</span>
          <strong>进攻队级规划器</strong>
          <p>攻击大个 / 喂卡位 / 拒绝后顺下候选、硬约束、短推演、O1/O5 角色承诺</p>
        </div>
        <div className="public-channel">
          <span>公开坐标 · 速度 · 球权 · 已解析事件</span>
          <i>→</i>
        </div>
        <div className="architecture-node neutral">
          <span>FIXED 16.67ms</span>
          <strong>中立世界与运动解析器</strong>
          <p>运动、边界、接触、覆盖几何、传球飞行、先触球与球权；不替球队选方案</p>
        </div>
        <div className="public-channel reverse">
          <span>下一决策边界才可消费</span>
          <i>←</i>
        </div>
        <div className="architecture-node defense">
          <span>03 · HIDDEN FROM OFFENSE</span>
          <strong>防守队级规划器</strong>
          <p>换防、走下方、拒绝协防与遏制候选、硬约束、短推演、D1/D5 单一角色责任</p>
        </div>
      </section>

      <footer>
        <p>
          <strong>可替换假设：</strong>
          半场坐标近似米制；高吊、回传与拒绝后顺下分球使用固定二维速度，防守仍可按局部触球顺序破坏；不模拟球的真实高度、投篮、犯规或更多人数。
        </p>
        <span>Observer UI · disposable shell</span>
      </footer>
    </main>
  );
}
