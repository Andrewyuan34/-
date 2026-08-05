---
title: 篮球战术空间推演器：战术与模拟数据契约
version: 0.1.0
date_created: 2026-08-05
last_updated: 2026-08-05
owner: Project Owner
status: Proposed
tags: [schema, data-contracts, tactic-dsl, simulation-state]
context_level: 2
always_read: false
read_when: [world-state, serialization, tactic-dsl, events, decision-trace, import-export, ui-data, ai-output]
depends_on: [spec-design-basketball-tactical-spatial-simulator.md]
canonical_for: [field-structures, schema-versioning, tactic-format, event-format, trace-format]
---

# Introduction

本规格定义跨模块交换的结构化数据，包括球场、坐标、世界状态、模拟快照、战术 DSL、动作提案、领域事件和决策轨迹。

JSON Schema Draft 2020-12 是外部数据和 AI 输出的权威契约。本文示例用于确认语义；实现阶段必须为每种公共结构创建机器可验证 schema。

## 1. Purpose & Scope

本规格服务于：

- 模拟内核与 Web 应用之间的数据交换；
- 战术保存、加载、版本迁移和校验；
- 场景夹具、事件日志和确定性重放；
- AI 生成内容的结构验证；
- 外部工具未来可能使用的稳定接口。

本规格不定义：

- 空间事实的具体计算算法；
- 动作和策略如何选择；
- AI 是否有权执行某项操作；
- UI 如何展示字段。

## 2. Definitions

- **Schema Version**：数据结构版本，使用明确的语义版本字符串。
- **Stable ID**：保存、重放和跨文件引用时不因显示名称变化而改变的标识。
- **Tactic DSL**：用受限 JSON 数据表达战术的领域格式。
- **WorldState**：场上原始事实，不包含可派生空间事实。
- **SimulationSnapshot**：WorldState 加逻辑步、动作运行状态、随机状态和版本信息。
- **DomainEvent**：已接受并可由状态归约器应用的状态变化事实。
- **DecisionTrace**：一次决策的输入摘要、候选、评分、选择与版本记录。
- **CapabilityManifest**：当前版本支持的角色、动作、空间事实、操作符和 schema 清单。
- **Migration**：从一个 schema 版本显式转换为另一个版本的纯数据过程。

## 3. Requirements, Constraints & Guidelines

### 3.1 通用契约

- **SCH-001**：所有公共数据必须具有 schemaVersion。
- **SCH-002**：所有可长期引用的实体必须具有稳定 ID。
- **SCH-003**：schema 默认必须拒绝未知字段；扩展点必须显式声明。
- **SCH-004**：数值必须是有限值；NaN 和 Infinity 非法。
- **SCH-005**：枚举不得使用自由文本替代。
- **SCH-006**：人类说明字段不得参与权威模拟语义。
- **SCH-007**：TypeScript 类型必须从 schema 生成，或由自动测试保证完全一致。
- **SCH-008**：公共结构必须各有合法样例、非法样例和边界样例。

### 3.2 坐标和球场

- **CRT-001**：坐标使用球场局部二维笛卡尔坐标。
- **CRT-002**：单位为米。
- **CRT-003**：原点、轴方向、半场长度、宽度、篮筐和战术区域由 CourtDefinition 声明。
- **CRT-004**：算法不得把某一联赛尺寸写入数据类型。
- **CRT-005**：位置必须位于 CourtDefinition 允许范围内，除非场景明确允许边界测试。

### 3.3 世界状态

- **WST-001**：PlayerState 只保存 id、side、position 和 roleId。
- **WST-002**：PlayerState 必须拒绝 speed、acceleration、orientation、pose、fatigue、injury 和心理状态字段。
- **WST-003**：WorldState 必须拒绝 score、period、gameClock、shotClock、foul 和 substitution 字段。
- **WST-004**：BallState 至少支持 held；如实现传球推进，可以支持 in-transit。
- **WST-005**：持球状态通过 carrierId 引用球员，不重复保存可由持球人位置派生的球位置。
- **WST-006**：WorldState 可以引用进攻和防守战术，以及双方当前战术阶段。
- **WST-007**：距离、线路、空间优势、匹配关系和掩护机会不得保存到 WorldState。

### 3.4 模拟快照

- **SNP-001**：SimulationSnapshot 必须包含 logicalStep、world、activeActions、randomState 和版本集合。
- **SNP-002**：activeActions 可以包含目标、状态、开始逻辑步和承诺条件，但不得扩展球员身体属性。
- **SNP-003**：快照必须完整可序列化，并可用于错误复现。
- **SNP-004**：快照 ID 必须唯一且不依赖内存地址。
- **SNP-005**：渲染插值状态不得进入 SimulationSnapshot。

### 3.5 战术 DSL

- **TDS-001**：TacticDefinition 必须包含 id、name、side、roles、goals、constraints、actionPermissions、replanTriggers 和 completionConditions。
- **TDS-002**：战术可以定义初始落位或相对区域，不得定义完整逐步坐标轨迹。
- **TDS-003**：条件必须使用受限操作符和已注册空间事实。
- **TDS-004**：战术不得包含 JavaScript、动态 import、模型调用或任意表达式执行。
- **TDS-005**：未知角色、动作、事实、操作符和循环引用必须在加载阶段失败。
- **TDS-006**：硬约束冲突必须阻止战术进入模拟。
- **TDS-007**：显示名称可以本地化；稳定 ID 不随语言变化。

### 3.6 事件和决策轨迹

- **EVT-001**：DomainEvent 必须包含 eventId、eventType、logicalStep、actorIds、payload 和 causationId。
- **EVT-002**：事件类型和 payload 必须由 schema 判别联合定义。
- **EVT-003**：事件必须记录产生它的动作、决策或协调结果。
- **TRC-001**：DecisionTrace 必须包含策略版本、相关空间事实、全部候选、合法性、评分分解和最终选择。
- **TRC-002**：非法候选必须保留拒绝原因，不得直接从轨迹中消失。
- **TRC-003**：随机选择必须记录种子引用和随机游标。
- **TRC-004**：AI 参与时可以附加模型元数据，但模型元数据不得改变重放语义。

### 3.7 版本与迁移

- **VER-001**：读取旧版本必须显式迁移或显式拒绝，不得静默解释为新语义。
- **VER-002**：迁移函数必须确定性、可测试且不调用网络。
- **VER-003**：事件日志必须保存原始 schema 和引擎版本。
- **VER-004**：破坏性字段语义变化必须提升主版本。
- **VER-005**：CapabilityManifest 必须与 schema 和动作注册表共同版本化。

### 3.8 输入安全

- **SEC-001**：外部 JSON 必须限制字节大小、嵌套深度、数组长度和字符串长度。
- **SEC-002**：受限条件语言必须限制递归和求值预算。
- **SEC-003**：解析失败必须返回字段路径、错误代码和可操作说明。
- **SEC-004**：任何导入数据不得触发代码执行、shell、文件访问或网络访问。

## 4. Interfaces & Data Contracts

### 4.1 Vec2

    {
      "x": -2.4,
      "y": 6.8
    }

### 4.2 CourtDefinition

    {
      "schemaVersion": "0.1.0",
      "id": "half-court-default",
      "unit": "meter",
      "origin": "baseline-center",
      "xAxis": "left-to-right",
      "yAxis": "baseline-to-half-court",
      "width": 15.24,
      "halfCourtLength": 14.325,
      "basket": { "x": 0.0, "y": 1.575 },
      "regions": []
    }

尺寸仅为示例数据，不是写死的产品规则。

### 4.3 WorldState

    {
      "schemaVersion": "0.1.0",
      "courtId": "half-court-default",
      "possessionSide": "offense",
      "players": [
        {
          "id": "O1",
          "side": "offense",
          "roleId": "ball-handler",
          "position": { "x": 0.0, "y": 7.0 }
        },
        {
          "id": "O5",
          "side": "offense",
          "roleId": "screener",
          "position": { "x": 2.2, "y": 6.5 }
        },
        {
          "id": "D1",
          "side": "defense",
          "roleId": "on-ball-defender",
          "position": { "x": 0.2, "y": 6.4 }
        },
        {
          "id": "D5",
          "side": "defense",
          "roleId": "screen-defender",
          "position": { "x": 2.0, "y": 5.8 }
        }
      ],
      "ball": {
        "mode": "held",
        "carrierId": "O1"
      },
      "tacticalContext": {
        "offenseTacticId": "spread-pnr-offense",
        "defenseTacticId": "base-pnr-defense",
        "phaseIds": {
          "offense": "setup",
          "defense": "contain"
        }
      }
    }

### 4.4 SimulationSnapshot

    {
      "schemaVersion": "0.1.0",
      "snapshotId": "snapshot-000004",
      "logicalStep": 4,
      "world": {},
      "activeActions": [
        {
          "actorId": "O5",
          "actionId": "set-screen",
          "status": "active",
          "target": {
            "kind": "position",
            "position": { "x": 0.7, "y": 6.2 }
          },
          "startedAtStep": 2,
          "commitmentConditionId": "screen-ready-or-invalid"
        }
      ],
      "randomState": {
        "seed": "scenario-seed-1",
        "cursor": 17
      },
      "versions": {
        "engine": "0.1.0",
        "offensePolicy": "0.1.0",
        "defensePolicy": "0.1.0"
      }
    }

world 在实际数据中必须是完整 WorldState；示例省略仅为避免重复。

### 4.5 TacticDefinition

    {
      "schemaVersion": "0.1.0",
      "id": "spread-pnr-offense",
      "name": "Spread Pick-and-Roll Offense",
      "side": "offense",
      "roles": [
        { "id": "ball-handler", "count": 1 },
        { "id": "screener", "count": 1 }
      ],
      "goals": [
        { "factId": "create-local-advantage", "weight": 1.0 },
        { "factId": "preserve-passing-access", "weight": 0.7 }
      ],
      "constraints": [
        { "factId": "avoid-role-overlap", "severity": "hard" }
      ],
      "actionPermissions": {
        "ball-handler": ["wait", "use-screen", "reject-screen", "pass"],
        "screener": ["move-to-space", "set-screen", "roll", "pop"]
      },
      "replanTriggers": [
        "screen-ready",
        "defense-switched",
        "screen-invalid",
        "passing-lane-opened",
        "action-failed"
      ],
      "completionConditions": [
        {
          "anyOf": [
            "local-advantage-established",
            "open-passing-lane-established"
          ]
        }
      ]
    }

### 4.6 DecisionTrace

    {
      "schemaVersion": "0.1.0",
      "decisionId": "decision-000042",
      "logicalStep": 8,
      "side": "offense",
      "actorIds": ["O1"],
      "policy": {
        "id": "baseline-utility-policy",
        "version": "0.1.0"
      },
      "facts": [
        "screen-ready",
        "reject-lane-open"
      ],
      "candidates": [
        {
          "proposalId": "p1",
          "actionId": "use-screen",
          "legal": true,
          "score": 0.63,
          "breakdown": {
            "goalContribution": 0.30,
            "spacingChange": 0.08,
            "coordinationFit": 0.20,
            "continuity": 0.10,
            "constraintPenalty": -0.05
          }
        },
        {
          "proposalId": "p2",
          "actionId": "reject-screen",
          "legal": true,
          "score": 0.74,
          "breakdown": {
            "goalContribution": 0.35,
            "spacingChange": 0.15,
            "coordinationFit": 0.12,
            "continuity": 0.12,
            "constraintPenalty": 0.0
          }
        }
      ],
      "selectedProposalId": "p2",
      "randomCursor": 17
    }

### 4.7 CapabilityManifest

CapabilityManifest 至少列出：

- schema 版本；
- 角色 ID；
- 动作 ID 与版本；
- 空间事实 ID；
- 条件操作符；
- 事件类型；
- 策略接口版本；
- 已弃用项及替代项。

AI 和编辑器只能引用清单中存在的能力。

## 5. Acceptance Criteria

- **AC-SCH-001**：Given WorldState 包含 speed、orientation、fatigue 或 shotClock，When 校验，Then 必须失败并返回字段路径。
- **AC-SCH-002**：Given 未知动作或空间事实，When 加载战术，Then 必须在模拟前失败。
- **AC-SCH-003**：Given 硬约束互相矛盾，When 校验战术，Then 必须返回 constraint-conflict。
- **AC-SCH-004**：Given 旧 schema 数据，When 加载，Then 必须显式迁移或拒绝。
- **AC-SCH-005**：Given AI 输出多余字段或任意代码，When 校验，Then 必须拒绝。
- **AC-SCH-006**：Given 相同事件日志和版本，When 重放，Then 字段解释不得发生变化。
- **AC-SCH-007**：Given 显示名称改变，When 引用角色和动作，Then稳定 ID 必须保持有效。

## 6. Test Automation Strategy

- 对每个 schema 运行合法、非法、边界和未知字段测试；
- 使用生成类型与 schema 一致性测试防止漂移；
- 对受限条件语言执行递归、长度和预算测试；
- 对每条迁移路径执行输入、输出和幂等性测试；
- 对 CapabilityManifest 验证引用完整性；
- 对示例 JSON 进行持续 schema 校验；
- AI 契约测试只使用固定夹具，不调用模型服务。

## 7. Rationale & Context

| 取舍 | 决定 | 原因 |
| --- | --- | --- |
| TypeScript 类型 vs JSON Schema | JSON Schema 是交换权威 | AI、文件和外部工具都能校验 |
| 宽松扩展 vs 默认拒绝未知字段 | 默认严格 | 防止拼写错误和 AI 幻觉静默进入 |
| 派生事实持久化 vs 即时计算 | 不持久化 | 避免状态不一致和版本漂移 |
| 任意脚本 vs 受限 DSL | 受限 DSL | 安全、可解释、可迁移 |
| 静默兼容 vs 显式迁移 | 显式迁移 | 保证重放语义可靠 |

## 8. Dependencies & External Integrations

- **SCP-001**：支持 JSON Schema Draft 2020-12 的验证能力。
- **SCP-002**：TypeScript 类型生成或契约一致性验证能力。
- **SCE-001**：初始版本无外部数据依赖。
- **SCD-001**：未来跟踪数据必须先转换为独立导入格式，不得直接替代 WorldState 契约。

## 9. Examples & Edge Cases

### 非法身体字段

    {
      "id": "O1",
      "side": "offense",
      "roleId": "ball-handler",
      "position": { "x": 0, "y": 7 },
      "speed": 4.2
    }

该对象必须因为 speed 是未知字段而失败。

### 未知 AI 动作

    {
      "actionId": "teleport-behind-defense"
    }

若 CapabilityManifest 中不存在该动作，系统不得自动猜测或替换。

### 同名角色

两个显示名称都为“掩护人”的角色可以存在于不同战术，但稳定 ID 必须在其命名空间内唯一。

### 旧事件

如果旧事件 payload 的字段语义已变化，迁移必须创建新事件版本；不得只改解析器让旧日志产生新含义。

## 10. Validation Criteria

- 每个公共结构有权威 schema；
- 未知字段默认失败；
- 世界状态保持最小；
- 派生事实未进入世界状态；
- 战术不含可执行代码；
- 稳定 ID 和版本规则明确；
- 事件足以支持重放；
- DecisionTrace 足以解释选择；
- AI 只能引用 CapabilityManifest；
- 示例由自动化 schema 校验。

## 11. Related Specifications / Further Reading

- [产品意图与边界](spec-design-basketball-tactical-spatial-simulator.md)
- [运行时决策架构](spec-architecture-runtime-decision-engine.md)
- [AI 原生集成边界](spec-design-ai-native-integration.md)
- [验证与评估流程](spec-process-verification-and-evaluation.md)
- JSON Schema Specification：https://json-schema.org/specification
