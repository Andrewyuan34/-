"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FIXED_DT,
  PLAYER_IDS,
  PnrSimulation,
  type ScreenSide,
  type TeamPlan,
} from "@/lib/pnr-core";
import {
  DEFAULT_SCENARIO_ID,
  PNR_SCENARIOS,
  getPnrScenario,
  makeScenarioConfig,
  type ScenarioId,
} from "@/lib/pnr-scenarios";
import {
  createG01Replay,
  scanG01SpeedBoundary,
  type G01ReplayId,
} from "@/lib/pnr-generalization";
import {
  createG02Replay,
  scanG02FrontReactionBoundary,
  type G02ReplayId,
} from "@/lib/pnr-g02-generalization";
import {
  createG03Replay,
  scanG03PostCatchRecoveryBoundary,
  type G03ReplayId,
} from "@/lib/pnr-g03-generalization";
import {
  createG05Replay,
  scanG05SpatialBoundary,
  type G05ReplayId,
} from "@/lib/pnr-g05-spatial-generalization";
import {
  createG06Replay,
  scanG06Combinations,
} from "@/lib/pnr-g06-combinations";
import {
  createG07Replay,
  scanG07Mirrors,
  type G07ReplayId,
} from "@/lib/pnr-g07-mirroring";
import {
  createG08Replay,
  scanG08Heldout,
  type G08ReplaySelection,
} from "@/lib/pnr-g08-heldout-audit";
import { OFFENSE_BALANCED_READ } from "@/lib/pnr-strategy";
import {
  P01_REPLAYS,
  createP01Replay,
  scanP01Calibration,
  type P01OffenseStrategyId,
  type P01ReplayId,
} from "@/lib/pnr-p01-offense-strategy";
import {
  scanP02DefenseCalibration,
  type P02DefenseStrategyId,
} from "@/lib/pnr-p02-defense-strategy";
import {
  P03_POLICY_MATCHUPS,
  createP03PolicyReplay,
  findP03PolicyMatchupId,
  scanP03PolicyMatrix,
  type P03MatchupId,
} from "@/lib/pnr-p03-policy-matrix";
import {
  createUnderR2Replay,
  type UnderR2ReplayId,
} from "@/lib/pnr-under-r2";
import {
  makeFormationGeneralizationReplayConfig,
  scanFormationGeneralization,
  type FormationGeneralizationReplayId,
} from "@/lib/pnr-formation-generalization-results";
import { drawCourt } from "./pnr-lab/court";
import { planShort, sideText } from "./pnr-lab/format";
import {
  FormationGeneralizationPanel,
  F00FormationPanel,
} from "./pnr-lab/FormationPanels";
import {
  G01ProbePanel,
  G02ProbePanel,
  G03ProbePanel,
  G05ProbePanel,
  G06ProbePanel,
  G07ProbePanel,
  G08ProbePanel,
} from "./pnr-lab/GProbePanels";
import {
  P00_REPLAYS,
  P00ProbePanel,
  P01ProbePanel,
  P03PolicyMatrixPanel,
  type P00ReplayId,
} from "./pnr-lab/PolicyProbePanels";
import {
  DecisionTrace,
  EventItem,
  PlanCard,
  RoleRow,
} from "./pnr-lab/SharedUi";
import type {
  LabMode,
  PositionMap,
  TrailMap,
  UiSnapshot,
} from "./pnr-lab/types";


const G01_AUDIT = scanG01SpeedBoundary();
const G02_AUDIT = scanG02FrontReactionBoundary();
const G03_AUDIT = scanG03PostCatchRecoveryBoundary();
const G05_AUDIT = scanG05SpatialBoundary();
const G06_AUDIT = scanG06Combinations();
const G07_AUDIT = scanG07Mirrors();
const G08_AUDIT = scanG08Heldout();
const P01_AUDIT = scanP01Calibration();
const P02_AUDIT = scanP02DefenseCalibration();
const P03_AUDIT = scanP03PolicyMatrix();
const FORMATION_GENERALIZATION_AUDIT = scanFormationGeneralization();

function clonePlan(plan: TeamPlan): TeamPlan {
  return {
    ...plan,
    roles: Object.fromEntries(
      Object.entries(plan.roles).map(([id, role]) => [id, role ? { ...role } : role]),
    ),
    route: plan.route
      ? {
          ...plan.route,
          tracks: Object.fromEntries(
            Object.entries(plan.route.tracks).map(([id, track]) => [
              id,
              track
                ? {
                    ...track,
                    reachedAtTick: [...track.reachedAtTick],
                    segments: track.segments.map((segment) => ({
                      ...segment,
                      target: { ...segment.target },
                      passageHalfPlane: segment.passageHalfPlane
                        ? {
                            ...segment.passageHalfPlane,
                            normal: { ...segment.passageHalfPlane.normal },
                          }
                        : null,
                      proof: {
                        ...segment.proof,
                        blockerIds: [...segment.proof.blockerIds],
                        ...(segment.proof.releasesExistingContactByBlocker
                          ? {
                              releasesExistingContactByBlocker: [
                                ...segment.proof.releasesExistingContactByBlocker,
                              ],
                            }
                          : {}),
                      },
                    })),
                  }
                : track,
            ]),
          ),
        }
      : undefined,
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
      under: {
        ...simulation.world.under,
        ...(simulation.world.under.o1PositionAtScreenClear
          ? {
              o1PositionAtScreenClear: {
                ...simulation.world.under.o1PositionAtScreenClear,
              },
            }
          : {}),
      },
      reject: { ...simulation.world.reject },
      landmarks: {
        screenAnchor: { ...simulation.world.landmarks.screenAnchor },
        handlerWaitingPoint: { ...simulation.world.landmarks.handlerWaitingPoint },
        useGate: { ...simulation.world.landmarks.useGate },
        rejectGate: { ...simulation.world.landmarks.rejectGate },
      },
      tacticalLandmarks: {
        screenAnchor: { ...simulation.world.tacticalLandmarks.screenAnchor },
        handlerWaitingPoint: { ...simulation.world.tacticalLandmarks.handlerWaitingPoint },
        useGate: { ...simulation.world.tacticalLandmarks.useGate },
        rejectGate: { ...simulation.world.tacticalLandmarks.rejectGate },
      },
      formation: { ...simulation.world.formation },
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
    strategies: {
      offense: simulation.getStrategyProfile("offense"),
      defense: simulation.getStrategyProfile("defense"),
    },
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
  const [p00ReplayId, setP00ReplayId] = useState<P00ReplayId>("initial-read");
  const [p01ReplayId, setP01ReplayId] = useState<P01ReplayId>("boundary-398");
  const [p01OffenseStrategyId, setP01OffenseStrategyId] =
    useState<P01OffenseStrategyId>(OFFENSE_BALANCED_READ.id);
  const [p03MatchupId, setP03MatchupId] = useState<P03MatchupId>("OB-DB");
  const [p03OffenseStrategyId, setP03OffenseStrategyId] =
    useState<P01OffenseStrategyId>(OFFENSE_BALANCED_READ.id);
  const [p03DefenseStrategyId, setP03DefenseStrategyId] =
    useState<P02DefenseStrategyId>("DEFENSE_BALANCED_COVERAGE");
  const [underR2ReplayId, setUnderR2ReplayId] =
    useState<UnderR2ReplayId>("f00-gap");
  const [f00Side, setF00Side] = useState<ScreenSide>("right");
  const [formationReplayId, setFormationReplayId] =
    useState<FormationGeneralizationReplayId>("longest-f01-arrival");
  const [initialSimulation] = useState(
    () => new PnrSimulation(makeScenarioConfig(DEFAULT_SCENARIO_ID)),
  );
  const simulationRef = useRef(initialSimulation);
  const [snapshot, setSnapshot] = useState<UiSnapshot>(() => takeSnapshot(initialSimulation));
  const [playing, setPlaying] = useState(false);
  const [strategyLocked, setStrategyLocked] = useState(false);
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
    setStrategyLocked(shouldPlay);
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

  const replaceP00Simulation = useCallback((
    nextReplayId: P00ReplayId,
    shouldPlay: boolean,
  ): void => {
    const replay = P00_REPLAYS.find((candidate) => candidate.id === nextReplayId);
    if (!replay) throw new Error(`Unknown P00 replay: ${nextReplayId}`);
    installSimulation(new PnrSimulation(makeScenarioConfig(replay.scenarioId)), shouldPlay);
  }, [installSimulation]);

  const replaceP01Simulation = useCallback((
    nextReplayId: P01ReplayId,
    nextStrategyId: P01OffenseStrategyId,
    shouldPlay: boolean,
  ): void => {
    installSimulation(
      createP01Replay(nextReplayId, nextStrategyId),
      shouldPlay,
    );
  }, [installSimulation]);

  const replaceP03Simulation = useCallback((
    nextMatchupId: P03MatchupId,
    shouldPlay: boolean,
  ): void => {
    installSimulation(createP03PolicyReplay(nextMatchupId), shouldPlay);
  }, [installSimulation]);

  const replaceF00Simulation = useCallback((
    nextReplayId: UnderR2ReplayId,
    nextSide: ScreenSide,
    shouldPlay: boolean,
  ): void => {
    installSimulation(createUnderR2Replay(nextReplayId, nextSide), shouldPlay);
  }, [installSimulation]);

  const replaceFormationSimulation = useCallback((
    nextReplayId: FormationGeneralizationReplayId,
    shouldPlay: boolean,
  ): void => {
    const replay = FORMATION_GENERALIZATION_AUDIT.replays.find(
      (candidate) => candidate.id === nextReplayId,
    );
    if (!replay) throw new Error(`Unknown Formation replay: ${nextReplayId}`);
    installSimulation(
      new PnrSimulation(makeFormationGeneralizationReplayConfig(replay)),
      shouldPlay,
    );
  }, [installSimulation]);

  const replaceCurrentSimulation = useCallback((shouldPlay: boolean): void => {
    if (labMode === "formation") {
      replaceFormationSimulation(formationReplayId, shouldPlay);
    } else if (labMode === "f00") {
      replaceF00Simulation(underR2ReplayId, f00Side, shouldPlay);
    } else if (labMode === "g01") {
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
    } else if (labMode === "p00") {
      replaceP00Simulation(p00ReplayId, shouldPlay);
    } else if (labMode === "p01") {
      replaceP01Simulation(p01ReplayId, p01OffenseStrategyId, shouldPlay);
    } else if (labMode === "p03") {
      replaceP03Simulation(p03MatchupId, shouldPlay);
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
    f00Side,
    formationReplayId,
    underR2ReplayId,
    p00ReplayId,
    p01ReplayId,
    p01OffenseStrategyId,
    p03MatchupId,
    labMode,
    replaceG01Simulation,
    replaceG02Simulation,
    replaceG03Simulation,
    replaceG05Simulation,
    replaceG06Simulation,
    replaceG07Simulation,
    replaceG08Simulation,
    replaceF00Simulation,
    replaceFormationSimulation,
    replaceP00Simulation,
    replaceP01Simulation,
    replaceP03Simulation,
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
          if (next) setStrategyLocked(true);
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
  const currentP00Replay =
    P00_REPLAYS.find((replay) => replay.id === p00ReplayId) ?? P00_REPLAYS[0];
  const currentP01Replay =
    P01_REPLAYS.find((replay) => replay.id === p01ReplayId) ?? P01_REPLAYS[0];
  const currentP03Row =
    P03_AUDIT.rows.find((row) => row.id === p03MatchupId) ?? P03_AUDIT.rows[0];
  const currentFormationReplay =
    FORMATION_GENERALIZATION_AUDIT.replays.find(
      (replay) => replay.id === formationReplayId,
    ) ?? FORMATION_GENERALIZATION_AUDIT.replays[0];

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
          {labMode === "p00" && <span>P00 · {currentP00Replay.code} · {strategyLocked ? "LOCKED" : "READY"}</span>}
          {labMode === "p01" && <span>P01 · {currentP01Replay.code} · {strategyLocked ? "LOCKED" : "READY"}</span>}
          {labMode === "p03" && <span>P02–P03 · {currentP03Row.id} · {strategyLocked ? "LOCKED" : "READY"}</span>}
          {labMode === "f00" && <span>F00-R2 · {underR2ReplayId} · {f00Side.toUpperCase()}</span>}
          {labMode === "formation" && currentFormationReplay && (
            <span>
              F01–F03 · {currentFormationReplay.sampleId} · {currentFormationReplay.side.toUpperCase()} · {playing || snapshot.world.tick > 0 ? "LOCKED" : "READY"}
            </span>
          )}
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
        <button
          aria-pressed={labMode === "p00"}
          className={labMode === "p00" ? "is-active" : ""}
          onClick={() => {
            setLabMode("p00");
            replaceP00Simulation(p00ReplayId, false);
          }}
          type="button"
        >
          P00 · 默认策略契约
        </button>
        <button
          aria-pressed={labMode === "p01"}
          className={labMode === "p01" ? "is-active" : ""}
          onClick={() => {
            setLabMode("p01");
            replaceP01Simulation(p01ReplayId, p01OffenseStrategyId, false);
          }}
          type="button"
        >
          P01 · 错位攻击优先
        </button>
        <button
          aria-pressed={labMode === "p03"}
          className={labMode === "p03" ? "is-active" : ""}
          onClick={() => {
            setLabMode("p03");
            replaceP03Simulation(p03MatchupId, false);
          }}
          type="button"
        >
          P02–P03 · 策略对局
        </button>
        <button
          aria-pressed={labMode === "f00"}
          className={labMode === "f00" ? "is-active" : ""}
          onClick={() => {
            setLabMode("f00");
            replaceF00Simulation(underR2ReplayId, f00Side, false);
          }}
          type="button"
        >
          F00-R2 · 形成 / UNDER
        </button>
        <button
          aria-pressed={labMode === "formation"}
          className={labMode === "formation" ? "is-active" : ""}
          onClick={() => {
            setLabMode("formation");
            replaceFormationSimulation(formationReplayId, false);
          }}
          type="button"
        >
          F01–F03 · Formation 泛化
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
      ) : labMode === "g08" ? (
        <G08ProbePanel
          activeReplayId={g08ReplayId}
          audit={G08_AUDIT}
          onReplaySelect={(nextReplayId) => {
            setG08ReplayId(nextReplayId);
            replaceG08Simulation(nextReplayId, false);
          }}
        />
      ) : labMode === "p00" ? (
        <P00ProbePanel
          activeReplayId={p00ReplayId}
          defenseStrategy={snapshot.strategies.defense}
          latestDefense={latestDefense}
          latestOffense={latestOffense}
          offenseStrategy={snapshot.strategies.offense}
          onReplaySelect={(nextReplayId) => {
            setP00ReplayId(nextReplayId);
            replaceP00Simulation(nextReplayId, false);
          }}
          strategyLocked={strategyLocked}
        />
      ) : labMode === "p01" ? (
        <P01ProbePanel
          activeReplayId={p01ReplayId}
          activeStrategyId={p01OffenseStrategyId}
          audit={P01_AUDIT}
          defenseStrategy={snapshot.strategies.defense}
          latestDefense={latestDefense}
          latestOffense={latestOffense}
          offenseStrategy={snapshot.strategies.offense}
          onReplaySelect={(nextReplayId) => {
            setP01ReplayId(nextReplayId);
            replaceP01Simulation(nextReplayId, p01OffenseStrategyId, false);
          }}
          onStrategySelect={(nextStrategyId) => {
            setP01OffenseStrategyId(nextStrategyId);
            replaceP01Simulation(p01ReplayId, nextStrategyId, false);
          }}
          strategyLocked={strategyLocked}
        />
      ) : labMode === "formation" ? (
        <FormationGeneralizationPanel
          activeReplayId={formationReplayId}
          locked={playing || snapshot.world.tick > 0}
          onReplaySelect={(nextReplayId) => {
            setFormationReplayId(nextReplayId);
            replaceFormationSimulation(nextReplayId, false);
          }}
          snapshot={snapshot}
          summary={FORMATION_GENERALIZATION_AUDIT}
        />
      ) : labMode === "f00" ? (
        <F00FormationPanel
          onReplayChange={(nextReplayId) => {
            setUnderR2ReplayId(nextReplayId);
            replaceF00Simulation(nextReplayId, f00Side, false);
          }}
          onSideChange={(nextSide) => {
            setF00Side(nextSide);
            replaceF00Simulation(underR2ReplayId, nextSide, false);
          }}
          replayId={underR2ReplayId}
          side={f00Side}
          sideLocked={playing || snapshot.world.tick > 0}
          snapshot={snapshot}
        />
      ) : (
        <P03PolicyMatrixPanel
          activeDefenseStrategyId={p03DefenseStrategyId}
          activeMatchupId={p03MatchupId}
          activeOffenseStrategyId={p03OffenseStrategyId}
          audit={P03_AUDIT}
          calibration={P02_AUDIT}
          defenseStrategy={snapshot.strategies.defense}
          latestDefense={latestDefense}
          latestOffense={latestOffense}
          offenseStrategy={snapshot.strategies.offense}
          onDefenseStrategySelect={(nextDefenseStrategyId) => {
            const nextMatchupId = findP03PolicyMatchupId(
              p03OffenseStrategyId,
              nextDefenseStrategyId,
            );
            setP03DefenseStrategyId(nextDefenseStrategyId);
            setP03MatchupId(nextMatchupId);
            replaceP03Simulation(nextMatchupId, false);
          }}
          onMatchupSelect={(nextMatchupId) => {
            const matchup = P03_POLICY_MATCHUPS.find(
              (candidate) => candidate.id === nextMatchupId,
            );
            if (!matchup) throw new Error(`Unknown P03 matchup: ${nextMatchupId}`);
            setP03MatchupId(nextMatchupId);
            setP03OffenseStrategyId(matchup.offenseStrategyId);
            setP03DefenseStrategyId(matchup.defenseStrategyId);
            replaceP03Simulation(nextMatchupId, false);
          }}
          onOffenseStrategySelect={(nextOffenseStrategyId) => {
            const nextMatchupId = findP03PolicyMatchupId(
              nextOffenseStrategyId,
              p03DefenseStrategyId,
            );
            setP03OffenseStrategyId(nextOffenseStrategyId);
            setP03MatchupId(nextMatchupId);
            replaceP03Simulation(nextMatchupId, false);
          }}
          strategyLocked={strategyLocked}
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
                if (next) setStrategyLocked(true);
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
                setStrategyLocked(true);
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
          <p>只读取进攻策略；硬约束后以 base score + strategy adjustment 比较可行候选</p>
        </div>
        <div className="public-channel">
          <span>公开坐标 · 速度 · 球权 · 已解析事件</span>
          <i>→</i>
        </div>
        <div className="architecture-node neutral">
          <span>FIXED 16.67ms</span>
          <strong>中立世界与运动解析器</strong>
          <p>运动、边界、接触、传球、先触球与球权；不接收策略，也不替球队选方案</p>
        </div>
        <div className="public-channel reverse">
          <span>下一决策边界才可消费</span>
          <i>←</i>
        </div>
        <div className="architecture-node defense">
          <span>03 · HIDDEN FROM OFFENSE</span>
          <strong>防守队级规划器</strong>
          <p>只读取防守策略；硬约束后以 base score + strategy adjustment 比较可行候选</p>
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
