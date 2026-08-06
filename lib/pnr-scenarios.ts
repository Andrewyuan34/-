import type { Branch, PlayerId, SimulationConfig, TerminalState } from "./pnr-core";

export interface ScenarioCheckpoint {
  branch: Branch;
  terminalReason: TerminalState["reason"];
  ballOwner: PlayerId | null;
}

interface ScenarioDefinition {
  id: string;
  code: `S${number}`;
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
    label: "换防 · 喂 O5 · 绕前成功",
    question: "D1 能否凭真实路线与触球顺序破坏高吊球？",
    expected: "预期观察：O1 使用掩护，防守换防，D1 绕前并先触球。",
    publicInput: {
      cue: "neutral",
      seed: 17,
      maxTime: 7.4,
      d1FrontReactionDelay: 0,
      d1PostCatchRecoveryDelay: 0,
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
    label: "D1 提前踩右 · O1 拒绝",
    question: "D1 提前封住掩护侧时，O1 是否会合理拒绝掩护？",
    expected: "预期观察：O1 向左拒绝，D1、D5 保持原对位，不发生换防。",
    publicInput: {
      cue: "overplay_right",
      seed: 17,
      maxTime: 7.4,
      d1FrontReactionDelay: 0,
      d1PostCatchRecoveryDelay: 0,
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
    label: "换防 · 喂 O5 · 绕前迟到",
    question: "D1 失去合法绕前时机后，O5 能否凭真实触球顺序接到同一类高吊球？",
    expected: "预期观察：FRONT 被时间硬约束否决，D1 留在身后干扰，O5 先触球。",
    publicInput: {
      cue: "neutral",
      seed: 17,
      maxTime: 7.4,
      d1FrontReactionDelay: 0.12,
      d1PostCatchRecoveryDelay: 0,
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
    label: "O5 接球 · D5 留守 · 转身窗口",
    question: "O5 接球后，D5 留守 O1 时，四人能否自然接续到 O5 的近筐处理窗口？",
    expected: "预期观察：接球事件触发重规划，D5 留守 O1，O1 外移，O5 转身推进后停止。",
    publicInput: {
      cue: "neutral",
      seed: 17,
      maxTime: 7.4,
      d1FrontReactionDelay: 0.12,
      d1PostCatchRecoveryDelay: 0,
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
    label: "D5 下沉 · O5 分球 · O1 接球",
    question: "D1 身后恢复稍慢时，D5 能否真实下沉，而 O5 只在观察到协防后才分回 O1？",
    expected: "预期观察：O5 先准备转身；D5 进入局部协防半径后，回传窗公开成立，O5 分球并由 O1 合法接住。",
    publicInput: {
      cue: "neutral",
      seed: 17,
      maxTime: 7.4,
      d1FrontReactionDelay: 0.12,
      d1PostCatchRecoveryDelay: 0.36,
      horizon: "post_catch_kickout",
    },
    checkpoint: {
      branch: "use",
      terminalReason: "post_catch_kickout_caught",
      ballOwner: "O1",
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

export function makeScenarioConfig(id: ScenarioId): SimulationConfig {
  return { ...getPnrScenario(id).publicInput };
}
