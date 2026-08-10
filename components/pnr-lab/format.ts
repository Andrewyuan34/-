import type { ScreenSide } from "@/lib/pnr-core";

const PLAN_SHORT: Record<string, string> = {
  FORM_SCREEN: "FORM · 到位设掩护",
  ABORT_FORMATION: "ABORT · 安全退出形成",
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
  ATTACK_UNDER_GAP: "ATTACK · 攻击 UNDER 髋部",
  TAKE_UNDER_PULLUP: "PULLUP · 真实净空急停",
  RESET_UNDER: "RESET · 安全收住 UNDER",
  ATTACK_DROP_GAP: "ATTACK · 攻击 DROP 空隙",
  TAKE_DROP_PULLUP: "PULLUP · 读取深 DROP",
  RESET_DROP: "RESET · 收住 DROP 回合",
  SNAKE_CHASE: "SNAKE · 反切追防",
  POCKET_PASS: "POCKET · 分球顺下",
  RESET_CHASE: "RESET · 收住 CHASE 回合",
  UNDER: "UNDER · D1 走下方",
  DROP_CONTAIN: "DROP · D5 沉退遏制",
  CHASE_OVER: "CHASE · D1 绕上追过",
  TAG_REJECT: "TAG · D5 协防拒绝",
  TRACK_FORMATION: "TRACK · 保持原对位",
};

export function planShort(id: string, side: ScreenSide): string {
  if (side === "left" && id === "USE_RIGHT_SCREEN") return "USE · 左侧使用";
  if (side === "left" && id === "REJECT_LEFT") return "REJECT · 右侧拒绝";
  return PLAN_SHORT[id] ?? id;
}

export function sideText(value: string, side: ScreenSide): string {
  if (side === "right") return value;
  return value
    .replaceAll("右", "\uE000")
    .replaceAll("左", "右")
    .replaceAll("\uE000", "左");
}
