import {
  COURT,
  PLAYER_IDS,
  mirrorPointAcrossCenterline,
  type PlayerId,
  type PnrSimulation,
  type TeamPlan,
  type Vec2,
} from "@/lib/pnr-core";
import type { PositionMap, TrailMap } from "./types";

const PLAYER_COLORS: Record<PlayerId, string> = {
  O1: "#ff6b35",
  O5: "#ff9f54",
  D1: "#4f8cff",
  D5: "#7aa7ff",
};

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

export function drawCourt(
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
  context.arc(
    hoop.x,
    hoop.y,
    COURT.threePointArcRadius * scale,
    0.18 * Math.PI,
    0.82 * Math.PI,
  );
  context.stroke();

  const screenSpot = point(simulation.world.landmarks.screenAnchor);
  context.save();
  context.setLineDash([5, 6]);
  context.lineWidth = 1.2;
  context.strokeStyle = "rgba(255, 241, 200, 0.58)";
  context.beginPath();
  context.arc(screenSpot.x, screenSpot.y, 0.48 * scale, 0, Math.PI * 2);
  context.stroke();
  if (simulation.config.startMode === "form_pnr") {
    const waitingPoint = point(simulation.world.landmarks.handlerWaitingPoint);
    context.fillStyle = "rgba(255, 243, 223, 0.9)";
    context.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.fillText("SCREEN ANCHOR", screenSpot.x + 8, screenSpot.y - 8);
    context.strokeStyle = "rgba(255, 243, 223, 0.72)";
    context.strokeRect(
      waitingPoint.x - 0.16 * scale,
      waitingPoint.y - 0.16 * scale,
      0.32 * scale,
      0.32 * scale,
    );
    context.fillText("O1 WAIT", waitingPoint.x + 8, waitingPoint.y - 8);
  }
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
  const drawCommittedTeamRoute = (
    plan: TeamPlan,
    playerIds: readonly PlayerId[],
    color: string,
  ): boolean => {
    if (!plan.route) return false;
    for (const playerId of playerIds) {
      const track = plan.route.tracks[playerId];
      if (!track) continue;
      const remainingTargets = track.segments
        .slice(track.segmentIndex)
        .map((segment) => segment.target);
      if (remainingTargets.length > 0) {
        drawPlanPath([current[playerId], ...remainingTargets], color);
      }
    }
    return true;
  };
  const offenseCommittedRouteDrawn = drawCommittedTeamRoute(
    simulation.offensePlan,
    ["O1", "O5"],
    "#fff3df",
  );
  if (offenseCommittedRouteDrawn) {
    // UNDER paths are planner-owned payloads; Canvas observes the committed
    // segments instead of reconstructing or choosing a tactical route.
  } else if (simulation.offensePlan.id === "FORM_SCREEN") {
    drawPlanPath(
      [o1Now, simulation.offensePlan.primaryTarget ?? simulation.world.landmarks.handlerWaitingPoint],
      "#fff3df",
    );
    drawPlanPath(
      [o5Now, simulation.offensePlan.secondaryTarget ?? simulation.world.landmarks.screenAnchor],
      "rgba(255, 194, 139, 0.9)",
    );
  } else if (
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
          : [o1Now, simulation.world.landmarks.rejectGate, sidePoint({ x: 4.46, y: 1.08 })]
        : [o1Now, ...remainingArc, simulation.world.landmarks.useGate, sidePoint({ x: 5.72, y: 1.05 })],
      "#fff3df",
    );
  }
  const defenseCommittedRouteDrawn = drawCommittedTeamRoute(
    simulation.defensePlan,
    ["D1", "D5"],
    "rgba(46, 91, 181, 0.78)",
  );
  if (defenseCommittedRouteDrawn) {
    // See offense note above: this is observer-only route visualization.
  } else if (simulation.defensePlan.id === "TRACK_FORMATION") {
    drawPlanPath([current.D1, current.O1], "rgba(46, 91, 181, 0.78)");
    drawPlanPath([current.D5, current.O5], "rgba(46, 91, 181, 0.78)");
  } else if (simulation.defensePlan.id === "UNDER") {
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
