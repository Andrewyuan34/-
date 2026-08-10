// Shared deterministic fixtures used by more than one phase test suite.

import { createHash } from "node:crypto";
import {
  PLAYER_IDS,
  PnrSimulation,
} from "../../lib/pnr-core.ts";
import {
  PNR_SCENARIOS,
  makeInitialPositionsForCue,
  makeScenarioConfig,
} from "../../lib/pnr-scenarios.ts";
import {
  G01_SPEEDS,
  makeG01Config,
} from "../../lib/pnr-generalization.ts";
import {
  G02_DELAYS,
  makeG02Config,
} from "../../lib/pnr-g02-generalization.ts";
import {
  G03_DELAYS,
  makeG03Config,
} from "../../lib/pnr-g03-generalization.ts";
import {
  G05_CANDIDATES,
  makeG05Config,
} from "../../lib/pnr-g05-spatial-generalization.ts";
import {
  G06_SPECS,
  makeG06Config,
} from "../../lib/pnr-g06-combinations.ts";
import {
  G07_SPECS,
  makeG07Config,
} from "../../lib/pnr-g07-mirroring.ts";
import { G08_HELDOUT_MANIFEST } from "../../lib/pnr-g08-heldout-manifest.ts";
import { makeG08Config } from "../../lib/pnr-g08-heldout-audit.ts";
import { makeDefaultTeamStrategySelection } from "../../lib/pnr-strategy.ts";

export function makeTestConfig(cue = "neutral", overrides = {}) {
  return {
    strategies: makeDefaultTeamStrategySelection(),
    initialPositions: makeInitialPositionsForCue(cue),
    screenSide: "right",
    seed: 17,
    maxTime: 7.4,
    d1FrontReactionDelay: 0,
    d1PostCatchRecoveryDelay: 0,
    o1MaxSpeed: 3.72,
    horizon: "pnr_resolution",
    ...overrides,
  };
}

export function runScenarioToStop(scenarioId) {
  const simulation = new PnrSimulation(makeScenarioConfig(scenarioId));
  for (let i = 0; i < 600 && !simulation.world.terminal; i += 1) {
    simulation.step();
  }
  return simulation;
}

export function p00LegacyPlanFrame(plan) {
  return {
    team: plan.team,
    id: plan.id,
    label: plan.label,
    version: plan.version,
    startedAt: plan.startedAt,
    startedTick: plan.startedTick,
    commitUntil: plan.commitUntil,
    watchdogAt: plan.watchdogAt,
    roles: plan.roles,
    rationale: plan.rationale,
    chosenScore: plan.chosenScore,
    primaryTarget: plan.primaryTarget,
    secondaryTarget: plan.secondaryTarget,
    passTarget: plan.passTarget,
  };
}

export function p00LegacyPlanningFrame(record) {
  return {
    tick: record.tick,
    at: record.at,
    team: record.team,
    trigger: record.trigger,
    triggerEventIds: record.triggerEventIds,
    chosen: record.chosen,
    chosenLabel: record.chosenLabel,
    candidates: record.candidates.map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
      feasible: candidate.feasible,
      score: candidate.score,
      vetoes: candidate.vetoes,
      evidence: candidate.evidence,
    })),
    observationBoundary: record.observationBoundary,
  };
}

export function p00LegacyTickFrame(simulation, planning, events) {
  return {
    tick: simulation.world.tick,
    time: simulation.world.time,
    stateHash: simulation.world.stateHash,
    players: PLAYER_IDS.map((id) => {
      const player = simulation.world.players[id];
      return [id, player.pos, player.vel, player.radius, player.maxSpeed];
    }),
    ballOwner: simulation.world.ballOwner,
    ball: simulation.world.ball,
    branch: simulation.world.branch,
    facts: simulation.world.facts,
    mismatch: simulation.world.mismatch,
    seal: simulation.world.seal,
    postCatch: simulation.world.postCatch,
    under: simulation.world.under,
    reject: simulation.world.reject,
    offensePlan: p00LegacyPlanFrame(simulation.offensePlan),
    defensePlan: p00LegacyPlanFrame(simulation.defensePlan),
    roles: simulation.getRoles(),
    events,
    planning: planning.map(p00LegacyPlanningFrame),
    terminal: simulation.world.terminal,
  };
}

export function p00LegacyTraceDigest(config) {
  const simulation = new PnrSimulation(config);
  const hash = createHash("sha256");
  hash.update(
    JSON.stringify(p00LegacyTickFrame(simulation, [...simulation.planningLog], [])),
  );
  for (let index = 0; index < 600 && !simulation.world.terminal; index += 1) {
    const planningStart = simulation.planningLog.length;
    const eventStart = simulation.eventLog.length;
    simulation.step();
    hash.update(
      JSON.stringify(
        p00LegacyTickFrame(
          simulation,
          simulation.planningLog.slice(planningStart),
          simulation.eventLog.slice(eventStart),
        ),
      ),
    );
  }
  return hash.digest("hex");
}

export function p00LegacyGroupDigest(entries) {
  const hash = createHash("sha256");
  for (const [id, config] of entries) {
    hash.update(`${id}:${p00LegacyTraceDigest(config)}\n`);
  }
  return hash.digest("hex");
}

export function approvedConfigGroups() {
  const legalG05 = G05_CANDIDATES.filter(
    ({ id }) => id !== "O1.y/-0.24" && id !== "D1.y/+0.24",
  );
  return {
    S: PNR_SCENARIOS.map((scenario) => [scenario.code, makeScenarioConfig(scenario.id)]),
    G01: G01_SPEEDS.map((speed) => [speed.toFixed(2), makeG01Config(speed)]),
    G02: G02_DELAYS.map((delay) => [delay.toFixed(2), makeG02Config(delay)]),
    G03: G03_DELAYS.map((delay) => [delay.toFixed(2), makeG03Config(delay)]),
    G05: legalG05.map((candidate) => [candidate.id, makeG05Config(candidate.id)]),
    G06: G06_SPECS.map((spec) => [spec.id, makeG06Config(spec.id)]),
    G07: G07_SPECS.map((spec) => [spec.id, makeG07Config(spec.id, "left")]),
    G08: G08_HELDOUT_MANIFEST.map((item) => [item.id, makeG08Config(item.id)]),
  };
}
