import {
  copyInitialPlayerPositions,
  mirrorInitialPlayerPositions,
  type Branch,
  type InitialPlayerPositions,
  type PlayerId,
  type ScreenSide,
  type SimulationConfig,
  type TerminalState,
} from "./pnr-core.ts";

export type ScenarioCue =
  | "neutral"
  | "overplay_right"
  | "overplay_hard_right"
  | "under_gap";

export const NEUTRAL_INITIAL_POSITIONS = Object.freeze({
  O1: Object.freeze({ x: 4.35, y: 6.58 }),
  O5: Object.freeze({ x: 6.62, y: 5.32 }),
  D1: Object.freeze({ x: 4.2, y: 5.76 }),
  D5: Object.freeze({ x: 6.25, y: 4.26 }),
}) satisfies Readonly<InitialPlayerPositions>;

const D1_START_BY_CUE: Readonly<Record<ScenarioCue, Readonly<{ x: number; y: number }>>> = {
  neutral: NEUTRAL_INITIAL_POSITIONS.D1,
  overplay_right: Object.freeze({ x: 5.24, y: 5.86 }),
  overplay_hard_right: Object.freeze({ x: 5.8, y: 5.72 }),
  under_gap: Object.freeze({ x: 4.5, y: 5 }),
};

export function makeInitialPositionsForCue(cue: ScenarioCue): InitialPlayerPositions {
  const positions = copyInitialPlayerPositions(NEUTRAL_INITIAL_POSITIONS);
  positions.D1 = { ...D1_START_BY_CUE[cue] };
  return positions;
}

export interface ScenarioCheckpoint {
  branch: Branch;
  terminalReason: TerminalState["reason"];
  ballOwner: PlayerId | null;
}

interface ScenarioDefinition {
  id: string;
  code: `S${number}`;
  cue: ScenarioCue;
  label: string;
  question: string;
  expected: string;
  publicInput: Readonly<SimulationConfig>;
  checkpoint: Readonly<ScenarioCheckpoint>;
}

export const PNR_SCENARIOS = [
  {
    id: "switch_feed_front_denied",
    code: "S01",
    cue: "neutral",
    label: "换防 · 喂 O5 · 绕前成功",
    question: "D1 能否凭真实路线与触球顺序破坏高吊球？",
    expected: "预期观察：O1 使用掩护，防守换防，D1 绕前并先触球。",
    publicInput: {
      initialPositions: makeInitialPositionsForCue("neutral"),
      screenSide: "right",
      seed: 17,
      maxTime: 7.4,
      d1FrontReactionDelay: 0,
      d1PostCatchRecoveryDelay: 0,
      o1MaxSpeed: 3.72,
      horizon: "pnr_resolution",
    },
    checkpoint: {
      branch: "use",
      terminalReason: "pass_denied",
      ballOwner: "D1",
    },
  },
  {
    id: "reject_overplay_right",
    code: "S02",
    cue: "overplay_right",
    label: "D1 提前踩右 · O1 拒绝",
    question: "D1 提前封住掩护侧时，O1 是否会合理拒绝掩护？",
    expected: "预期观察：O1 向左拒绝，D1、D5 保持原对位，不发生换防。",
    publicInput: {
      initialPositions: makeInitialPositionsForCue("overplay_right"),
      screenSide: "right",
      seed: 17,
      maxTime: 7.4,
      d1FrontReactionDelay: 0,
      d1PostCatchRecoveryDelay: 0,
      o1MaxSpeed: 3.72,
      horizon: "pnr_resolution",
    },
    checkpoint: {
      branch: "reject",
      terminalReason: "reject_advantage",
      ballOwner: "O1",
    },
  },
  {
    id: "switch_feed_front_late_catch",
    code: "S03",
    cue: "neutral",
    label: "换防 · 喂 O5 · 绕前迟到",
    question: "D1 失去合法绕前时机后，O5 能否凭真实触球顺序接到同一类高吊球？",
    expected: "预期观察：FRONT 被时间硬约束否决，D1 留在身后干扰，O5 先触球。",
    publicInput: {
      initialPositions: makeInitialPositionsForCue("neutral"),
      screenSide: "right",
      seed: 17,
      maxTime: 7.4,
      d1FrontReactionDelay: 0.12,
      d1PostCatchRecoveryDelay: 0,
      o1MaxSpeed: 3.72,
      horizon: "pnr_resolution",
    },
    checkpoint: {
      branch: "use",
      terminalReason: "seal_catch_advantage",
      ballOwner: "O5",
    },
  },
  {
    id: "post_catch_stay_home_finish",
    code: "S04",
    cue: "neutral",
    label: "O5 接球 · D5 留守 · 转身窗口",
    question: "O5 接球后，D5 留守 O1 时，四人能否自然接续到 O5 的近筐处理窗口？",
    expected: "预期观察：接球事件触发重规划，D5 留守 O1，O1 外移，O5 转身推进后停止。",
    publicInput: {
      initialPositions: makeInitialPositionsForCue("neutral"),
      screenSide: "right",
      seed: 17,
      maxTime: 7.4,
      d1FrontReactionDelay: 0.12,
      d1PostCatchRecoveryDelay: 0,
      o1MaxSpeed: 3.72,
      horizon: "post_catch_finish",
    },
    checkpoint: {
      branch: "use",
      terminalReason: "post_catch_finish_window",
      ballOwner: "O5",
    },
  },
  {
    id: "post_catch_dig_kickout",
    code: "S05",
    cue: "neutral",
    label: "D5 下沉 · O5 分球 · O1 接球",
    question: "D1 身后恢复稍慢时，D5 能否真实下沉，而 O5 只在观察到协防后才分回 O1？",
    expected: "预期观察：O5 先准备转身；D5 进入局部协防半径后，回传窗公开成立，O5 分球并由 O1 合法接住。",
    publicInput: {
      initialPositions: makeInitialPositionsForCue("neutral"),
      screenSide: "right",
      seed: 17,
      maxTime: 7.4,
      d1FrontReactionDelay: 0.12,
      d1PostCatchRecoveryDelay: 0.36,
      o1MaxSpeed: 3.72,
      horizon: "post_catch_kickout",
    },
    checkpoint: {
      branch: "use",
      terminalReason: "post_catch_kickout_caught",
      ballOwner: "O1",
    },
  },
  {
    id: "switch_attack_big_downhill",
    code: "S06",
    cue: "neutral",
    label: "换防 · O1 小打大 · 过髋窗口",
    question: "更快的 O1 面对换防 D5 时，能否放弃喂球、清空队友并真实突破外侧髋部？",
    expected: "预期观察：换防完成后 ATTACK_BIG 击败 FEED_SEAL；O5 清空，D5 遏制，O1 过髋后形成近筐窗口。",
    publicInput: {
      initialPositions: makeInitialPositionsForCue("neutral"),
      screenSide: "right",
      seed: 17,
      maxTime: 7.4,
      d1FrontReactionDelay: 0.12,
      d1PostCatchRecoveryDelay: 0,
      o1MaxSpeed: 4.08,
      horizon: "mismatch_attack",
    },
    checkpoint: {
      branch: "use",
      terminalReason: "mismatch_advantage",
      ballOwner: "O1",
    },
  },
  {
    id: "under_screen_pullup_window",
    code: "S07",
    cue: "under_gap",
    label: "D1 走下方 · D5 短收 · 急停窗口",
    question: "D1 从掩护下方通过且 D5 留守 O5 时，能否保持原对位并让 O1 获得真实中距离空间？",
    expected: "预期观察：UNDER 从公开起手深度胜出；没有换防，D1 合法绕下方，D5 短收 O5，O1 在追回前获得处理窗。",
    publicInput: {
      initialPositions: makeInitialPositionsForCue("under_gap"),
      screenSide: "right",
      seed: 17,
      maxTime: 7.4,
      d1FrontReactionDelay: 0,
      d1PostCatchRecoveryDelay: 0,
      o1MaxSpeed: 3.72,
      horizon: "under_pullup",
    },
    checkpoint: {
      branch: "use",
      terminalReason: "under_pullup_window",
      ballOwner: "O1",
    },
  },
  {
    id: "reject_help_slip_catch",
    code: "S08",
    cue: "overplay_hard_right",
    label: "强踩右侧 · O1 拒绝 · O5 顺下接球",
    question: "D1 被拒绝路线甩开后，D5 能否先真实协防，而 O1 只在观察到协防后分给顺下 O5？",
    expected: "预期观察：拒绝分支不换防；D1 落后后 D5 局部协防，O5 顺下，传球窗成立后由 O5 合法接球。",
    publicInput: {
      initialPositions: makeInitialPositionsForCue("overplay_hard_right"),
      screenSide: "right",
      seed: 17,
      maxTime: 7.4,
      d1FrontReactionDelay: 0,
      d1PostCatchRecoveryDelay: 0,
      o1MaxSpeed: 3.72,
      horizon: "reject_slip",
    },
    checkpoint: {
      branch: "reject",
      terminalReason: "reject_slip_caught",
      ballOwner: "O5",
    },
  },
] as const satisfies readonly ScenarioDefinition[];

export type PnrScenario = (typeof PNR_SCENARIOS)[number];
export type ScenarioId = PnrScenario["id"];

export const DEFAULT_SCENARIO_ID: ScenarioId = PNR_SCENARIOS[0].id;

export function getPnrScenario(id: string): PnrScenario {
  const scenario = PNR_SCENARIOS.find((candidate) => candidate.id === id);
  if (!scenario) throw new Error(`Unknown PnR scenario: ${id}`);
  return scenario;
}

export function makeScenarioConfig(
  id: ScenarioId,
  screenSide: ScreenSide = "right",
): SimulationConfig {
  const input = getPnrScenario(id).publicInput;
  const rightPositions = copyInitialPlayerPositions(input.initialPositions);
  return {
    ...input,
    screenSide,
    initialPositions:
      screenSide === "right" ? rightPositions : mirrorInitialPlayerPositions(rightPositions),
  };
}
