import {
  PnrSimulation,
  type CandidateEvaluation,
  type PlanId,
  type PlanningRecord,
  type PostCatchFacts,
  type SimulationConfig,
} from "./pnr-core.ts";

export const G03_DELAYS = Object.freeze(
  Array.from({ length: 21 }, (_, index) => Number((index * 0.03).toFixed(2))),
);

export const G03_BASE_CONFIG = Object.freeze({
  cue: "neutral",
  seed: 17,
  maxTime: 7.4,
  d1FrontReactionDelay: 0.12,
  d1PostCatchRecoveryDelay: G03_DELAYS[0],
  o1MaxSpeed: 3.72,
  horizon: "post_catch_resolution",
} satisfies SimulationConfig);

export type G03DefensePlan = Extract<PlanId, "STAY_HOME_POST" | "DIG_POST">;
export type G03OffensePlan = Extract<PlanId, "POST_FINISH" | "KICK_OUT">;
export type G03CandidateId = G03DefensePlan | G03OffensePlan;
export type G03Outcome = "POST_FINISH_WINDOW" | "KICKOUT_CAUGHT";
export type G03Phase = "STAY_FINISH" | "DIG_PENDING_HELP" | "DIG_HELP_KICKOUT";
export type G03PursuitState = "CHASE_READY" | "RECOVERING_REAR_CONTEST";
export type G03ReplayId = "last-stay" | "first-dig" | "s05-baseline";

export interface G03CandidateAudit {
  id: G03CandidateId;
  feasible: boolean;
  score: number | null;
  vetoes: string[];
  evidence: string[];
}

export interface G03DefenseDecisionAudit {
  tick: number;
  chosen: G03DefensePlan;
  triggerEventIds: string[];
  d1RecoveryReadyIn: number;
  d1PursuitState: G03PursuitState;
  d1RoleCode: string;
  d1BodyGap: number;
  d5O1Distance: number;
  d5O5Distance: number;
  stay: G03CandidateAudit;
  dig: G03CandidateAudit;
}

export interface G03OffenseDecisionAudit {
  tick: number;
  chosen: G03OffensePlan;
  triggerEventIds: string[];
  helpObserved: boolean;
  finishWindowObserved: boolean;
  kickoutWindowObserved: boolean;
  d5O1Distance: number;
  d5O5Distance: number;
  finish: G03CandidateAudit;
  kickout: G03CandidateAudit;
}

export interface G03ScanRow {
  delay: number;
  deterministic: boolean;
  catchTick: number;
  recoveryReadyTick: number;
  recoveryReadyTime: number;
  firstDefense: G03DefenseDecisionAudit;
  defenseDecisions: G03DefenseDecisionAudit[];
  firstOffense: G03OffenseDecisionAudit;
  offenseDecisions: G03OffenseDecisionAudit[];
  digDecided: boolean;
  helpCommitted: boolean;
  kickoutChosen: boolean;
  phase: G03Phase;
  outcome: G03Outcome;
  postCatchAttackTick: number;
  helpCommittedTick: number | null;
  helpD5O1Distance: number | null;
  helpD5O5Distance: number | null;
  helpWasLocal: boolean;
  firstKickoutDecisionTick: number | null;
  kickoutWindowTick: number | null;
  finishWindowTick: number | null;
  kickoutLaunchedTick: number | null;
  kickoutCaughtTick: number | null;
  kickoutAfterHelp: boolean;
  stopTick: number;
  stopTime: number;
  stopD5O1Distance: number;
  stopD5O5Distance: number;
}

export interface G03BoundaryTransition {
  fromDelay: number;
  fromPlan: G03DefensePlan;
  toDelay: number;
  toPlan: G03DefensePlan;
}

export interface G03FailureInterval {
  fromDelay: number;
  toDelay: number;
  reason: string;
}

export interface G03ReplaySample {
  id: G03ReplayId;
  label: string;
  note: string;
  delay: number;
  phase: G03Phase;
  outcome: G03Outcome;
}

export interface G03AuditResult {
  id: "G03";
  label: string;
  rows: G03ScanRow[];
  deterministic: boolean;
  sharedCatchPrefix: boolean;
  commonCatchTick: number | null;
  commonStopRule: "FIRST_FINISH_WINDOW_OR_KICKOUT_CAUGHT";
  monotonic: boolean;
  passed: boolean;
  transitions: G03BoundaryTransition[];
  failureIntervals: G03FailureInterval[];
  lastStayDelay: number | null;
  firstDigDelay: number | null;
  transitionBandDelays: number[];
  replays: G03ReplaySample[];
}

interface G03AuditRun {
  row: Omit<G03ScanRow, "deterministic">;
  tickTrace: string[];
  prefixTrace: string[];
}

const POST_DEFENSE_PLANS: G03DefensePlan[] = ["STAY_HOME_POST", "DIG_POST"];
const POST_OFFENSE_PLANS: G03OffensePlan[] = ["POST_FINISH", "KICK_OUT"];

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

export function makeG03Config(delay: number): SimulationConfig {
  if (!G03_DELAYS.includes(delay)) {
    throw new Error(`G03 delay must be one of the 21 approved samples: ${delay}`);
  }
  return { ...G03_BASE_CONFIG, d1PostCatchRecoveryDelay: delay };
}

export function createG03Replay(delay: number): PnrSimulation {
  return new PnrSimulation(makeG03Config(delay));
}

function candidateTrace(candidate: CandidateEvaluation): object {
  return {
    id: candidate.id,
    feasible: candidate.feasible,
    score: candidate.score,
    vetoes: candidate.vetoes,
    evidence: candidate.evidence,
  };
}

function planningTrace(record: PlanningRecord): object {
  return {
    tick: record.tick,
    team: record.team,
    trigger: record.trigger,
    triggerEventIds: record.triggerEventIds,
    chosen: record.chosen,
    candidates: record.candidates.map(candidateTrace),
  };
}

function captureTick(simulation: PnrSimulation, newPlanning: PlanningRecord[]): string {
  return JSON.stringify({
    tick: simulation.world.tick,
    stateHash: simulation.world.stateHash,
    ballOwner: simulation.world.ballOwner,
    offensePlan: {
      id: simulation.offensePlan.id,
      version: simulation.offensePlan.version,
      startedTick: simulation.offensePlan.startedTick,
      chosenScore: simulation.offensePlan.chosenScore,
    },
    defensePlan: {
      id: simulation.defensePlan.id,
      version: simulation.defensePlan.version,
      startedTick: simulation.defensePlan.startedTick,
      chosenScore: simulation.defensePlan.chosenScore,
    },
    roles: simulation.getRoles().map(({ playerId, roleCode, owner }) => ({
      playerId,
      roleCode,
      owner,
    })),
    events: simulation.eventLog
      .filter((event) => event.tick === simulation.world.tick)
      .map(({ id, type, order, availableAtTick, label, detail }) => ({
        id,
        type,
        order,
        availableAtTick,
        label,
        detail,
      })),
    planning: newPlanning.map(planningTrace),
  });
}

function capturePrefixTick(simulation: PnrSimulation): string {
  return JSON.stringify({
    tick: simulation.world.tick,
    players: Object.values(simulation.getPlayerCopies()).map(({ id, pos, vel }) => ({
      id,
      pos,
      vel,
    })),
    ballOwner: simulation.world.ballOwner,
    ball: simulation.world.ball,
    branch: simulation.world.branch,
    screen: simulation.world.facts,
    mismatch: simulation.world.mismatch,
    seal: simulation.world.seal,
    offensePlan: simulation.offensePlan.id,
    defensePlan: simulation.defensePlan.id,
    roles: simulation.getRoles().map(({ playerId, roleCode, owner }) => ({
      playerId,
      roleCode,
      owner,
    })),
    events: simulation.eventLog
      .filter((event) => event.tick === simulation.world.tick)
      .map(({ type, tick, order, availableAtTick }) => ({ type, tick, order, availableAtTick })),
  });
}

function cloneCandidate(record: PlanningRecord, id: G03CandidateId): G03CandidateAudit {
  const candidate = record.candidates.find((item) => item.id === id);
  if (!candidate) throw new Error(`G03 missing ${id} at tick ${record.tick}`);
  return {
    id,
    feasible: candidate.feasible,
    score: candidate.score,
    vetoes: [...candidate.vetoes],
    evidence: [...candidate.evidence],
  };
}

function cloneDefenseDecision(
  record: PlanningRecord,
  facts: PostCatchFacts,
  d1RoleCode: string,
): G03DefenseDecisionAudit {
  if (!POST_DEFENSE_PLANS.includes(record.chosen as G03DefensePlan)) {
    throw new Error(`G03 unexpected defense plan ${record.chosen} at tick ${record.tick}`);
  }
  return {
    tick: record.tick,
    chosen: record.chosen as G03DefensePlan,
    triggerEventIds: [...record.triggerEventIds],
    d1RecoveryReadyIn: facts.d1RecoveryReadyIn,
    d1PursuitState:
      facts.d1RecoveryReadyIn <= 1e-9 ? "CHASE_READY" : "RECOVERING_REAR_CONTEST",
    d1RoleCode,
    d1BodyGap: facts.d1BodyGap,
    d5O1Distance: facts.d5O1Distance,
    d5O5Distance: facts.d5O5Distance,
    stay: cloneCandidate(record, "STAY_HOME_POST"),
    dig: cloneCandidate(record, "DIG_POST"),
  };
}

function cloneOffenseDecision(
  record: PlanningRecord,
  facts: PostCatchFacts,
): G03OffenseDecisionAudit {
  if (!POST_OFFENSE_PLANS.includes(record.chosen as G03OffensePlan)) {
    throw new Error(`G03 unexpected offense plan ${record.chosen} at tick ${record.tick}`);
  }
  return {
    tick: record.tick,
    chosen: record.chosen as G03OffensePlan,
    triggerEventIds: [...record.triggerEventIds],
    helpObserved: facts.d5HelpCommitted,
    finishWindowObserved: facts.finishWindow,
    kickoutWindowObserved: facts.kickoutWindow,
    d5O1Distance: facts.d5O1Distance,
    d5O5Distance: facts.d5O5Distance,
    finish: cloneCandidate(record, "POST_FINISH"),
    kickout: cloneCandidate(record, "KICK_OUT"),
  };
}

function sameTrace(first: string[], second: string[]): boolean {
  return first.length === second.length && first.every((frame, index) => frame === second[index]);
}

function runAuditSample(delay: number): G03AuditRun {
  const simulation = createG03Replay(delay);
  const factsAtTick = new Map<number, PostCatchFacts>([
    [simulation.world.tick, { ...simulation.world.postCatch }],
  ]);
  const defenseRoleAtRecord = new Map<PlanningRecord, string>();
  const tickTrace = [captureTick(simulation, [...simulation.planningLog])];
  const prefixTrace = [capturePrefixTick(simulation)];
  let caught = false;

  for (let index = 0; index < 600 && !simulation.world.terminal; index += 1) {
    const planningStart = simulation.planningLog.length;
    simulation.step();
    const newPlanning = simulation.planningLog.slice(planningStart);
    for (const record of newPlanning) {
      if (record.team === "defense") {
        defenseRoleAtRecord.set(
          record,
          simulation.defensePlan.roles.D1?.roleCode ?? "unassigned",
        );
      }
    }
    factsAtTick.set(simulation.world.tick, { ...simulation.world.postCatch });
    tickTrace.push(captureTick(simulation, newPlanning));
    if (!caught) {
      prefixTrace.push(capturePrefixTick(simulation));
      caught = simulation.eventLog.some((event) => event.type === "pass_caught");
    }
  }

  const catchEvent = simulation.eventLog.find((event) => event.type === "pass_caught");
  if (!catchEvent) throw new Error(`G03 ${delay.toFixed(2)}s never reached the common O5 catch`);

  const defenseRecords = simulation.planningLog.filter(
    (record) =>
      record.team === "defense" &&
      record.tick >= catchEvent.availableAtTick &&
      POST_DEFENSE_PLANS.includes(record.chosen as G03DefensePlan),
  );
  const offenseRecords = simulation.planningLog.filter(
    (record) =>
      record.team === "offense" &&
      record.tick >= catchEvent.availableAtTick &&
      POST_OFFENSE_PLANS.includes(record.chosen as G03OffensePlan),
  );
  if (defenseRecords.length === 0 || offenseRecords.length === 0) {
    throw new Error(`G03 ${delay.toFixed(2)}s has no post-catch team replans`);
  }

  const defenseDecisions = defenseRecords.map((record) => {
    const facts = factsAtTick.get(record.tick);
    if (!facts) throw new Error(`G03 missing defense facts at tick ${record.tick}`);
    return cloneDefenseDecision(
      record,
      facts,
      defenseRoleAtRecord.get(record) ?? "rear_contest_post",
    );
  });
  const offenseDecisions = offenseRecords.map((record) => {
    const facts = factsAtTick.get(record.tick);
    if (!facts) throw new Error(`G03 missing offense facts at tick ${record.tick}`);
    return cloneOffenseDecision(record, facts);
  });

  const event = (type: string) => simulation.eventLog.find((item) => item.type === type) ?? null;
  const postCatchAttack = event("post_catch_attack");
  const help = event("help_committed");
  const finish = event("finish_window");
  const kickoutWindow = event("kickout_window_open");
  const kickoutLaunched = event("kickout_launched");
  const kickoutCaught = event("kickout_caught");
  if (!postCatchAttack) throw new Error(`G03 ${delay.toFixed(2)}s never committed the post attack`);

  const recoveryReady = [...factsAtTick.entries()].find(
    ([tick, facts]) =>
      tick >= catchEvent.tick && facts.active && facts.d1RecoveryReadyIn <= 1e-9,
  );
  if (!recoveryReady) throw new Error(`G03 ${delay.toFixed(2)}s never resolved D1 recovery`);

  const digDecided = defenseDecisions.some((decision) => decision.chosen === "DIG_POST");
  const helpFacts = help ? factsAtTick.get(help.tick) ?? null : null;
  const helpCommitted = Boolean(help);
  const helpWasLocal = Boolean(
    helpFacts && helpFacts.d5O5Distance <= 1.12 + 1e-9 && helpFacts.d5O1Distance >= 1.28 - 1e-9,
  );
  const firstKickout = offenseDecisions.find((decision) => decision.chosen === "KICK_OUT") ?? null;
  const kickoutChosen = Boolean(firstKickout);
  const kickoutAfterHelp = Boolean(
    !firstKickout ||
      (help && firstKickout.tick >= help.availableAtTick && firstKickout.helpObserved),
  );

  let phase: G03Phase;
  if (!digDecided) phase = "STAY_FINISH";
  else if (!helpCommitted || !kickoutChosen) phase = "DIG_PENDING_HELP";
  else phase = "DIG_HELP_KICKOUT";

  let outcome: G03Outcome;
  if (finish && !kickoutCaught) outcome = "POST_FINISH_WINDOW";
  else if (kickoutCaught && !finish) outcome = "KICKOUT_CAUGHT";
  else throw new Error(`G03 ${delay.toFixed(2)}s did not stop at exactly one common resolution`);

  return {
    row: {
      delay,
      catchTick: catchEvent.tick,
      recoveryReadyTick: recoveryReady[0],
      recoveryReadyTime: rounded(recoveryReady[0] / 60),
      firstDefense: defenseDecisions[0],
      defenseDecisions,
      firstOffense: offenseDecisions[0],
      offenseDecisions,
      digDecided,
      helpCommitted,
      kickoutChosen,
      phase,
      outcome,
      postCatchAttackTick: postCatchAttack.tick,
      helpCommittedTick: help?.tick ?? null,
      helpD5O1Distance: helpFacts ? helpFacts.d5O1Distance : null,
      helpD5O5Distance: helpFacts ? helpFacts.d5O5Distance : null,
      helpWasLocal,
      firstKickoutDecisionTick: firstKickout?.tick ?? null,
      kickoutWindowTick: kickoutWindow?.tick ?? null,
      finishWindowTick: finish?.tick ?? null,
      kickoutLaunchedTick: kickoutLaunched?.tick ?? null,
      kickoutCaughtTick: kickoutCaught?.tick ?? null,
      kickoutAfterHelp,
      stopTick: simulation.world.tick,
      stopTime: simulation.world.time,
      stopD5O1Distance: simulation.world.postCatch.d5O1Distance,
      stopD5O5Distance: simulation.world.postCatch.d5O5Distance,
    },
    tickTrace,
    prefixTrace,
  };
}

function phaseRank(phase: G03Phase): number {
  if (phase === "STAY_FINISH") return 0;
  if (phase === "DIG_PENDING_HELP") return 1;
  return 2;
}

export function scanG03PostCatchRecoveryBoundary(): G03AuditResult {
  const firstRuns: G03AuditRun[] = [];
  const rows = G03_DELAYS.map((delay) => {
    const first = runAuditSample(delay);
    const replay = runAuditSample(delay);
    firstRuns.push(first);
    return {
      ...first.row,
      deterministic: sameTrace(first.tickTrace, replay.tickTrace),
    };
  });

  const sharedCatchPrefix = firstRuns.every((run) =>
    sameTrace(firstRuns[0].prefixTrace, run.prefixTrace),
  );
  const commonCatchTick = rows.every((row) => row.catchTick === rows[0].catchTick)
    ? rows[0].catchTick
    : null;
  const transitions: G03BoundaryTransition[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (previous.firstDefense.chosen !== current.firstDefense.chosen) {
      transitions.push({
        fromDelay: previous.delay,
        fromPlan: previous.firstDefense.chosen,
        toDelay: current.delay,
        toPlan: current.firstDefense.chosen,
      });
    }
  }

  const failureIntervals: G03FailureInterval[] = [];
  let digRegionSeen = false;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const previous = rows[Math.max(0, index - 1)];
    digRegionSeen ||= row.firstDefense.chosen === "DIG_POST";
    if (digRegionSeen && row.firstDefense.chosen === "STAY_HOME_POST") {
      failureIntervals.push({
        fromDelay: previous.delay,
        toDelay: row.delay,
        reason: "恢复成本增加后，首次防守选择从 DIG_POST 无解释回跳到 STAY_HOME_POST",
      });
    }
    if (index > 0 && phaseRank(row.phase) < phaseRank(previous.phase)) {
      failureIntervals.push({
        fromDelay: previous.delay,
        toDelay: row.delay,
        reason: "最终观察层次随恢复成本增加发生无法由真实协防解释的回跳",
      });
    }
    const firstDigIndex = row.defenseDecisions.findIndex(
      (decision) => decision.chosen === "DIG_POST",
    );
    if (
      firstDigIndex >= 0 &&
      row.defenseDecisions.slice(firstDigIndex + 1).some(
        (decision) => decision.chosen === "STAY_HOME_POST",
      )
    ) {
      failureIntervals.push({
        fromDelay: row.delay,
        toDelay: row.delay,
        reason: "单一样本在已选择 DIG_POST 后又抖回 STAY_HOME_POST",
      });
    }
    if (!row.deterministic) {
      failureIntervals.push({
        fromDelay: row.delay,
        toDelay: row.delay,
        reason: "同一输入的两次逐 tick 世界、计划、角色、事件或候选记录不一致",
      });
    }
    if (row.helpCommitted && (!row.digDecided || !row.helpWasLocal)) {
      failureIntervals.push({
        fromDelay: row.delay,
        toDelay: row.delay,
        reason: "help_committed 没有来自 DIG_POST 后的真实局部移动",
      });
    }
    if (row.kickoutChosen && (!row.helpCommitted || !row.kickoutAfterHelp)) {
      failureIntervals.push({
        fromDelay: row.delay,
        toDelay: row.delay,
        reason: "O5 在观察到真实协防前选择了 KICK_OUT",
      });
    }
    if (
      row.outcome === "POST_FINISH_WINDOW" &&
      (row.helpCommitted || row.kickoutChosen || row.finishWindowTick === null)
    ) {
      failureIntervals.push({
        fromDelay: row.delay,
        toDelay: row.delay,
        reason: "终结窗口与真实协防/分球事件顺序冲突",
      });
    }
    if (
      row.outcome === "KICKOUT_CAUGHT" &&
      (!row.helpCommitted ||
        !row.kickoutChosen ||
        row.kickoutLaunchedTick === null ||
        row.kickoutCaughtTick === null ||
        row.kickoutLaunchedTick >= row.kickoutCaughtTick)
    ) {
      failureIntervals.push({
        fromDelay: row.delay,
        toDelay: row.delay,
        reason: "分球结果没有走完 help → launch → catch 的真实事件链",
      });
    }
  }
  if (!sharedCatchPrefix || commonCatchTick === null) {
    failureIntervals.push({
      fromDelay: G03_DELAYS[0],
      toDelay: G03_DELAYS[G03_DELAYS.length - 1],
      reason: "唯一变量在 O5 接球前改变了四人运动、球路、计划或事件共同前缀",
    });
  }

  const lastStay = [...rows].reverse().find(
    (row) => row.firstDefense.chosen === "STAY_HOME_POST",
  ) ?? null;
  const firstDig = rows.find((row) => row.firstDefense.chosen === "DIG_POST") ?? null;
  const s05Baseline = rows.find((row) => row.delay === 0.36) ?? rows[rows.length - 1];
  const transitionBandDelays = rows
    .filter((row) => row.phase === "DIG_PENDING_HELP")
    .map((row) => row.delay);
  const deterministic = rows.every((row) => row.deterministic);
  const monotonic = !failureIntervals.some(
    (failure) => failure.reason.includes("回跳") || failure.reason.includes("抖回"),
  );
  const passed =
    deterministic &&
    sharedCatchPrefix &&
    commonCatchTick !== null &&
    monotonic &&
    failureIntervals.length === 0 &&
    transitions.length === 1 &&
    transitions[0].fromPlan === "STAY_HOME_POST" &&
    transitions[0].toPlan === "DIG_POST" &&
    lastStay !== null &&
    firstDig !== null &&
    rows.some((row) => row.outcome === "POST_FINISH_WINDOW") &&
    rows.some((row) => row.outcome === "KICKOUT_CAUGHT");

  const replays: G03ReplaySample[] = [];
  if (lastStay) {
    replays.push({
      id: "last-stay",
      label: "最后一个留守样本",
      note: "边界低侧：D5 留守 O1，D1 自行追防，O5 形成终结窗口",
      delay: lastStay.delay,
      phase: lastStay.phase,
      outcome: lastStay.outcome,
    });
  }
  if (firstDig) {
    replays.push({
      id: "first-dig",
      label: "第一个下沉样本",
      note: "边界高侧：先决定 DIG，D5 真正到位后 O5 才允许分球",
      delay: firstDig.delay,
      phase: firstDig.phase,
      outcome: firstDig.outcome,
    });
  }
  if (s05Baseline.delay !== firstDig?.delay) {
    replays.push({
      id: "s05-baseline",
      label: "0.36s · 原始 S05",
      note: "保留原始稳定协防与回传样本，便于对照边界动作",
      delay: s05Baseline.delay,
      phase: s05Baseline.phase,
      outcome: s05Baseline.outcome,
    });
  }

  return {
    id: "G03",
    label: "D1 接球后恢复时间边界泛化探针",
    rows,
    deterministic,
    sharedCatchPrefix,
    commonCatchTick,
    commonStopRule: "FIRST_FINISH_WINDOW_OR_KICKOUT_CAUGHT",
    monotonic,
    passed,
    transitions,
    failureIntervals,
    lastStayDelay: lastStay?.delay ?? null,
    firstDigDelay: firstDig?.delay ?? null,
    transitionBandDelays,
    replays,
  };
}
