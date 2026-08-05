---
title: 篮球战术空间推演器：验证与评估流程
version: 0.1.0
date_created: 2026-08-05
last_updated: 2026-08-05
owner: Project Owner
status: Proposed
tags: [process, verification, testing, evaluation, milestone-gates]
context_level: 2
always_read: false
read_when: [testing, acceptance, code-review, milestone-review, golden-scenarios, ai-evaluation]
depends_on: [spec-design-basketball-tactical-spatial-simulator.md]
canonical_for: [acceptance-gates, test-strategy, golden-scenarios, milestone-completion]
---

# Introduction

本规格定义如何证明系统仍然符合产品边界、运行时行为正确、数据契约稳定、动态战术响应可解释，以及每个里程碑何时可以完成。

该文件只在测试、评审和里程碑验收时读取。具体状态和动作语义由对应专项规格负责。

## 1. Purpose & Scope

验证目标分为五类：

1. 范围正确：没有滑向完整比赛、人体物理或游戏化；
2. 确定性正确：同输入和种子可重放；
3. 战术动态正确：空间变化能够改变候选或决策；
4. 契约正确：非法、未知和旧版本数据受到明确处理；
5. AI 边界正确：模型不可用或输出非法时核心仍安全运行。

本规格覆盖自动化测试、黄金场景、人工战术评审、性能基准、AI 离线评估和里程碑门禁。

## 2. Definitions

- **范围守卫**：阻止明确非目标进入基础状态和核心依赖的测试或评审。
- **黄金场景**：固定初始状态、战术、策略版本和随机种子的版本化场景。
- **不变量**：所有合法运行都必须保持的性质。
- **行为断言**：允许实现细节变化，但要求某类候选、事件或终止结果存在。
- **快照断言**：对完整结构进行精确比较；只在结构稳定且精确值有意义时使用。
- **变形测试**：对输入进行镜像或局部变化后验证预期关系，而非固定输出。
- **决策评审**：检查 DecisionTrace 是否能够解释候选、拒绝和选择。
- **里程碑门禁**：进入下一阶段前必须满足的可验证条件。

## 3. Requirements, Constraints & Guidelines

### 3.1 范围和架构守卫

- **QAL-001**：契约测试必须拒绝速度、朝向、疲劳、比赛时间、比分和犯规等非目标字段。
- **QAL-002**：架构测试必须阻止 sim-core 依赖 UI、网络和 AI。
- **QAL-003**：评审新增字段时必须先判断它能否由现有状态派生。
- **QAL-004**：评审新增功能时必须说明它服务的战术问题。
- **QAL-005**：M3 前不得验收 3v3、5v5、投篮结果或在线 AI 控制功能。

### 3.2 确定性与重放

- **DET-001**：相同初始状态、版本和随机种子必须产生相同事件序列。
- **DET-002**：随机测试失败必须输出可复现种子。
- **DET-003**：事件重放必须得到与原运行相同的最终权威状态。
- **DET-004**：UI 帧率和动画开关不得影响模拟结果。
- **DET-005**：测试不得依赖对象遍历顺序、系统时间或未固定的全局随机源。

### 3.3 空间、动作和决策

- **SIM-001**：空间纯函数必须覆盖正常、边界、镜像和退化几何。
- **SIM-002**：每个动作原语必须测试前置、目标、推进、完成、中断和失败。
- **SIM-003**：策略测试必须验证全部候选、拒绝原因、评分分解和稳定同分处理。
- **SIM-004**：协调测试必须覆盖同队区域争用、动作互斥和双方同快照提交。
- **SIM-005**：无合法动作和连续无进展必须产生明确结果，不得无限循环。
- **SIM-006**：黄金场景优先断言关键事件和不变量，不应过度锁死每个中间坐标。

### 3.4 数据契约

- **QDT-001**：每个公共 schema 必须有合法、非法、未知字段和边界样例。
- **QDT-002**：所有文档 JSON 示例必须在持续集成中校验。
- **QDT-003**：schema 与生成类型必须有自动一致性检查。
- **QDT-004**：迁移必须测试成功路径、拒绝路径和语义保持。
- **QDT-005**：CapabilityManifest 的所有引用必须可解析。

### 3.5 AI 验证

- **AIT-001**：CI 不得调用真实模型服务。
- **AIT-002**：AI Adapter 必须使用固定夹具测试合法输出、非法结构、未知引用、超时、拒绝和截断。
- **AIT-003**：ContextBuilder 必须测试按任务路由和预算裁剪。
- **AIT-004**：AI 失败必须验证确定性回退。
- **AIT-005**：模型对比必须使用同一版本评估集，并输出可保存报告。

### 3.6 评审和指标

- **MET-001**：不设置与当前风险无关的统一覆盖率数字。
- **MET-002**：状态归约、确定性、schema 校验和安全边界必须达到完整关键路径覆盖。
- **MET-003**：UI 评估以关键交互行为为主，不以截图或行覆盖率代替。
- **MET-004**：每个实现里程碑记录固定场景下的无头性能基线，不提前承诺任意硬件 SLA。
- **MET-005**：黄金结果变化必须由评审者说明原因；不得无条件刷新快照。
- **MET-006**：自动化测试不能证明篮球合理性时，必须安排结构化人工评审并保存结论。

### 3.7 里程碑门禁

| 里程碑 | 必须交付 | 明确不验收 |
| --- | --- | --- |
| M0 规格与边界 | 分层规格、阅读路由、产品范围和 AI 边界 | 业务代码 |
| M1 确定性空间内核 | 球场、圆点、球权、逻辑步、事件、重放、基础空间函数 | 自动战术决策 |
| M2 动作与策略框架 | 动作注册、候选、评分、协调、DecisionTrace、无头运行 | 复杂战术 |
| M3 2v2 挡拆闭环 | 动态攻防、位置变化响应、SVG 推演、解释和黄金场景 | 3v3、命中结果 |
| M4 3v3 协防轮转 | 弱侧空间、协防、回位、轮转和多球员冲突 | 完整 5v5 |
| M5 AI 辅助 | 战术编辑、受校验自然语言编译、解释和回退 | AI 逐步控制 |
| M6 5v5 与校准接口 | 角色和协调扩展、外部校准接口 | 完整比赛模拟 |

进入下一里程碑前，当前里程碑必须有可运行结果、自动化测试、至少一个黄金场景和更新后的契约。

## 4. Interfaces & Data Contracts

### 4.1 ScenarioFixture

    ScenarioFixture
      scenarioId
      schemaVersion
      purpose
      initialSnapshot
      offenseTacticRef
      defenseTacticRef
      policyVersions
      randomSeed
      maxLogicalSteps
      expectedInvariants
      expectedEvents
      allowedTerminalReasons

expectedEvents 应表达关键事件类型和因果关系，只有必要时才固定精确逻辑步。

### 4.2 VerificationReport

    VerificationReport
      runId
      codeRevision
      schemaVersions
      scenarios
      passed
      failures
      randomSeeds
      performanceBaseline
      manualReviewRefs

### 4.3 AI Evaluation Report

    AIEvaluationReport
      evaluationSetVersion
      adapterVersion
      modelId
      promptTemplateVersion
      schemaCompliance
      semanticCompliance
      unknownReferenceRate
      acceptanceRate
      latency
      usage
      failures

具体字段以未来数据 schema 为准；本接口只定义必须保留的评估维度。

## 5. Acceptance Criteria

### 5.1 跨项目核心验收

- **AC-QA-001**：Given 相同输入和种子，When 独立运行两次，Then 事件、决策和结果必须相同。
- **AC-QA-002**：Given 事件日志，When 不调用策略进行重放，Then 最终状态必须与原运行一致。
- **AC-QA-003**：Given 非目标字段，When 校验状态，Then 必须失败并指出路径。
- **AC-QA-004**：Given AI 服务不可用，When 运行已有场景，Then 核心模拟必须完成。
- **AC-QA-005**：Given 浏览器不同帧率，When 播放相同运行，Then 权威结果必须相同。

### 5.2 M3 的 2v2 挡拆验收

- **AC-PNR-001**：系统至少支持持球人、掩护人、持球防守人和掩护防守人四个角色。
- **AC-PNR-002**：掩护人到达动态目标区域后必须产生 screen-ready 或等价事件。
- **AC-PNR-003**：持球人至少能够比较 use-screen、reject-screen、wait 和 pass 中当前合法的候选。
- **AC-PNR-004**：掩护人至少能够在条件允许时比较 roll、pop 和 rescreen。
- **AC-PNR-005**：防守至少能够表达 follow、go-over-screen、switch、help 和 recover 中当前适用的候选。
- **AC-PNR-006**：只改变一名防守人的初始位置时，相关空间事实和至少一项候选评分必须变化。
- **AC-PNR-007**：防守发生 switch 后，进攻必须重规划，不能继续固定路径。
- **AC-PNR-008**：用户必须能查看某个选择的候选、拒绝原因和评分分解。
- **AC-PNR-009**：场景必须以目标达成、停滞、死锁、手动停止或步数上限之一结束。
- **AC-PNR-010**：M3 不要求投篮命中、犯规、身体接触和现实秒数。

## 6. Test Automation Strategy

### 6.1 测试层次

- 单元测试：几何、空间事实、动作和状态归约；
- 属性测试：数值有限、距离非负、事件有序、状态转换合法；
- 变形测试：镜像、位置扰动和无关输入变化；
- 集成测试：完整决策轮和双方协调；
- 黄金场景：固定 2v2 和后续 3v3 典型场景；
- 重放测试：原运行与事件重放对比；
- 架构测试：禁止依赖；
- UI 行为测试：加载、运行、暂停、逐步、拖动、重跑和查看解释；
- AI 契约测试：固定夹具和失败回退；
- 人工评审：对战术合理性进行结构化审核。

### 6.2 测试数据

- 场景必须版本化并有明确目的；
- 随机数据失败时保存最小反例和种子；
- 黄金场景不得依赖未保存的随机生成；
- AI 夹具不得包含密钥；
- 未来真实跟踪数据必须通过独立授权数据集进入。

### 6.3 持续集成

CI 至少运行：

- 格式和静态检查；
- TypeScript 类型检查；
- schema 与示例校验；
- 单元、属性和集成测试；
- 黄金场景；
- 重放与确定性测试；
- 架构依赖测试；
- 固定 AI 夹具测试。

浏览器端到端和大型性能基准可以按风险在独立任务运行。

## 7. Rationale & Context

### 7.1 为什么不保留统一覆盖率数字

覆盖率数字容易让 Agent 编写低价值测试以满足阈值。项目更需要保证高风险不变量、重放、schema 和边界完整覆盖。覆盖率可以作为观察指标，但不是脱离风险的产品要求。

### 7.2 为什么黄金场景不锁死全部坐标

动态策略和评分合理调整后，中间坐标可能变化，而关键战术关系仍正确。黄金场景应固定必须发生的事实和不变量，避免每次合理优化都导致大面积脆弱快照更新。

### 7.3 为什么自动化之外还需要人工评审

系统可以自动证明确定性和契约正确，却不能仅靠代码断言证明某个篮球选择“合理”。人工评审必须使用结构化问题，例如：

- 选择是否由当前空间事实支持；
- 是否存在明显被遗漏的合法候选；
- 防守是否获得了不合理的先手信息；
- 解释是否与实际评分一致。

## 8. Dependencies & External Integrations

- **QIN-001**：能够运行类型、schema、测试和黄金场景的持续集成环境。
- **QDD-001**：版本化场景夹具和评估集。
- **QPL-001**：支持单元、属性、浏览器和架构测试的工具能力。
- **QEX-001**：核心 CI 不依赖外部模型服务。
- **QCO-001**：未来使用真实比赛数据时必须确认授权。

## 9. Examples & Edge Cases

### 合理黄金断言

- screen-ready 在 use-screen 之前发生；
- switch 后存在 offense-replan；
- 同一区域争用得到解决；
- 模拟在有限步内终止。

### 过度脆弱断言

- O1 在第 13 步必须位于小数点后六位完全相同的坐标；
- 所有候选分数必须永久等于某个常数；
- UI 每一帧截图完全一致。

除非精确值本身是契约，否则不应使用后一类断言。

### 防守位置扰动

把 D5 横向移动一个小距离后：

- 不要求最终一定选择不同动作；
- 必须要求相关空间事实重新计算；
- 若评分完全不变，测试应检查该位置是否未被策略使用或存在缺陷。

### 模型升级

新模型 schema 合规率提高但未知动作率也提高时，不能只依据单一指标升级。必须综合语义合规、人工接受、成本和失败模式。

## 10. Validation Criteria

- 范围守卫覆盖明确非目标；
- 确定性和重放有独立测试；
- 动作和决策测试覆盖失败路径；
- 黄金场景关注战术不变量；
- 2v2 挡拆具有独立验收条件；
- AI 测试无需在线模型；
- 无依据的统一覆盖率和性能承诺已移除；
- 每个里程碑有进入下一阶段的门禁；
- 自动化无法判断的战术合理性有人工评审流程。

## 11. Related Specifications / Further Reading

- [规格阅读入口](README.md)
- [产品意图与边界](spec-design-basketball-tactical-spatial-simulator.md)
- [运行时决策架构](spec-architecture-runtime-decision-engine.md)
- [战术与模拟数据契约](spec-schema-tactic-and-simulation-contracts.md)
- [AI 原生集成边界](spec-design-ai-native-integration.md)
