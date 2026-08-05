---
title: 篮球战术空间推演器：运行时决策架构
version: 0.1.0
date_created: 2026-08-05
last_updated: 2026-08-05
owner: Project Owner
status: Proposed
tags: [architecture, simulation-core, spatial-reasoning, decision-engine]
context_level: 2
always_read: false
read_when: [simulation-loop, spatial-engine, actions, policies, replay, package-boundaries]
depends_on: [spec-design-basketball-tactical-spatial-simulator.md]
canonical_for: [runtime-semantics, module-boundaries, decision-flow, deterministic-replay]
---

# Introduction

本规格定义二维篮球战术推演的运行时架构。它只处理状态如何推进、空间关系如何派生、动作如何产生和选择、进攻与防守如何协调，以及结果如何确定性重放。

字段级结构由数据契约规格定义；AI 模型接入由 AI 规格定义；产品范围以产品意图与边界规格为准。

## 1. Purpose & Scope

本架构需要在不模拟人体物理和完整比赛的前提下，形成以下闭环：

    不可变状态快照
      → 派生空间事实
      → 双方生成动作提案
      → 合法性与战术约束过滤
      → 策略评分和选择
      → 团队协调与双方冲突处理
      → 提交领域事件
      → 状态归约
      → 下一逻辑步

本规格适用于：

- 模拟内核；
- 空间计算；
- 动作原语；
- 策略和团队协调；
- 事件、重放与无头运行；
- Web 与 AI 之外的包边界。

本规格不定义：

- JSON 字段的最终拼写；
- UI 布局和动画；
- 模型提供方或提示词；
- 比分、投篮、疲劳和人体物理。

## 2. Definitions

- **状态快照**：某一逻辑步开始时不可修改的模拟状态。
- **空间事实**：由状态快照即时计算的距离、区域、线路、优势和冲突。
- **动作原语**：具有前置、目标、推进、完成和中断语义的最小行为。
- **动作提案**：策略可选择但尚未执行的动作方案。
- **策略**：对合法动作提案进行分项评分和选择的模块。
- **团队协调器**：解决同队角色、空间和动作依赖冲突的模块。
- **双方提交**：进攻和防守基于同一快照产生意图后统一提交的过程。
- **状态归约器**：只根据已接受领域事件生成下一状态的模块。
- **动作承诺**：动作开始后，在完成或中断条件出现前保持执行。
- **确定性随机源**：由显式种子驱动并可保存当前位置的伪随机序列。
- **无进展**：连续若干决策轮没有位置、球权、动作阶段或关键空间事实变化。

## 3. Requirements, Constraints & Guidelines

### 3.1 状态与推进

- **RUN-001**：每个决策轮必须从不可变状态快照开始。
- **RUN-002**：只有状态归约器能够生成下一权威状态。
- **RUN-003**：空间引擎、动作、策略、协调器和 UI 不得直接修改权威状态。
- **RUN-004**：权威球员状态不得包含速度、朝向、身体姿态或疲劳。
- **RUN-005**：当前动作和目标属于模拟运行状态，不属于球员身体属性。
- **RUN-006**：每次成功状态转换必须递增逻辑步并产生有序领域事件。
- **RUN-007**：无状态变化的读取和解释不得递增逻辑步。

### 3.2 逻辑时间与移动

- **TIM-001**：逻辑步只表达因果顺序，不映射比赛时间或现实秒数。
- **TIM-002**：移动动作每步根据当前位置、目标点和全局移动步长计算下一位置。
- **TIM-003**：全局移动步长属于模拟配置，不属于单个球员状态。
- **TIM-004**：渲染层可以在两个权威位置之间插值，但插值结果不得进入模拟。
- **TIM-005**：动作完成由空间条件或事件判断，不由固定现实时间戳判断。
- **TIM-006**：需要同步的配合应使用事件依赖，例如 screen-ready，而不是“等待 2 秒”。

### 3.3 空间引擎

- **SPA-001**：空间引擎必须使用纯函数或等价的确定性实现。
- **SPA-002**：基础能力至少包括距离、点线距离、区域归属、边界、最近对象和区域占用。
- **SPA-003**：战术能力至少包括抽象传球线路、候选空位点、掩护准备区域、局部人数优势和空间争用。
- **SPA-004**：空间事实必须从当前快照派生，不得作为长期缓存写回权威状态。
- **SPA-005**：允许对单个决策轮缓存空间事实，但缓存键必须包含快照标识和算法版本。
- **SPA-006**：候选目标点必须具有来源、评分构成和被拒绝原因。
- **SPA-007**：初期掩护空间判断不得依赖球员朝向或身体接触。
- **SPA-008**：算法不得假设固定球场尺寸；球场几何由配置提供。

### 3.4 动作原语

- **ACT-001**：动作原语必须声明稳定 ID、版本、适用对象、前置条件、目标生成器、完成条件和中断条件。
- **ACT-002**：动作原语通过注册表发现，模拟循环不得按动作 ID 编写特例分支。
- **ACT-003**：动作状态至少包括 pending、active、completed、interrupted 和 failed。
- **ACT-004**：动作只能提出领域事件，不得写状态。
- **ACT-005**：动作目标应从空间事实动态产生；初始落位可以由场景提供。
- **ACT-006**：动作开始后必须遵守动作承诺，避免每步因微小评分变化来回切换。
- **ACT-007**：动作中断必须给出结构化原因，并请求继续、回退或重规划之一。
- **ACT-008**：初始动作目录至少支持移动、保持空间、掩护、使用或拒绝掩护、顺下、外弹、传球、跟防、绕防、换防、协防、回位、轮转、等待和请求重规划。

### 3.5 策略与评分

- **DEC-001**：策略输入必须包含快照、相关空间事实、战术目标、角色和合法动作提案。
- **DEC-002**：策略不得读取 UI 状态或直接调用远程模型。
- **DEC-003**：初始基线采用规则过滤加效用评分。
- **DEC-004**：评分至少区分目标贡献、空间变化、协调一致性、动作连续性和约束代价。
- **DEC-005**：不得只保存一个无法解释的总分。
- **DEC-006**：相同输入、配置、策略版本和随机状态必须产生相同结果。
- **DEC-007**：需要多样性时可以按种子采样，但必须记录候选排序和随机游标。
- **DEC-008**：无合法动作时必须显式选择 wait 或 request-replan。
- **DEC-009**：策略只能返回动作选择和理由，不得返回世界状态补丁。

### 3.6 进攻、防守与协调

- **COO-001**：进攻和防守必须读取同一决策轮的快照。
- **COO-002**：双方必须先独立产生意图，再进入统一协调和提交阶段。
- **COO-003**：团队协调器必须处理同队区域争用、角色缺失、动作互斥和动作依赖。
- **COO-004**：跨队冲突处理必须使用稳定规则，不得让固定阵营因执行顺序永远占优。
- **COO-005**：团队协调器可以改变、延后或拒绝提案，但必须记录原因。
- **COO-006**：团队协调器不得生成完整固定轨迹。
- **COO-007**：初始版本不模拟球员感知误差；策略读取项目允许的完整战术状态。

### 3.7 终止、事件与重放

- **REP-001**：模拟终止类型至少包括 objective-reached、stalled、deadlock、manual-stop、invalid-tactic 和 step-limit。
- **REP-002**：每次选择、协调、动作推进、完成、中断和失败必须产生结构化记录。
- **REP-003**：初始快照、版本集合、随机种子和事件序列必须足以重建结果。
- **REP-004**：重放不得重新调用策略或 AI；重放只归约已记录事件。
- **REP-005**：连续无进展必须触发 stalled 或 deadlock，不得无限循环。
- **REP-006**：浏览器帧率、暂停和丢帧不得影响事件序列和最终状态。

### 3.8 模块边界

- **ARC-001**：核心采用严格 TypeScript，能够在无 DOM 的 JavaScript 运行环境执行。
- **ARC-002**：sim-core 负责逻辑步、状态归约、事件顺序、随机源和重放。
- **ARC-003**：spatial 负责几何和派生事实。
- **ARC-004**：tactics、actions 和 policies 分别负责战术语义、动作能力和选择策略。
- **ARC-005**：application 负责组合用例，Web 和 AI 只能通过公共应用接口进入。
- **ARC-006**：sim-core 不得依赖 React、DOM、SVG、Canvas、网络或 AI SDK。
- **ARC-007**：初始渲染采用 React、Vite 和 SVG，但渲染技术不得进入核心接口。
- **ARC-008**：当前对象规模最多 10 名球员，不得提前引入物理引擎、游戏引擎或复杂 ECS。

## 4. Interfaces & Data Contracts

### 4.1 模块关系

    contracts
       ↑
    sim-core ← spatial
       ↑         ↑
    tactics   actions/policies
       ↑         ↑
       application
          ↑
        web / ai-adapters

依赖箭头表示上层可以依赖下层。sim-core 不得反向依赖任何上层模块。

### 4.2 动作接口

    ActionPrimitive
      supports(context) -> boolean
      propose(context) -> ActionProposal[]
      validate(proposal, context) -> ValidationResult
      start(proposal, snapshot) -> ActionRuntime
      advance(runtime, snapshot) -> ActionTransition
      explain(proposal, context) -> StructuredReason

ActionTransition 只能返回动作状态、领域事件提案和重规划请求。

### 4.3 策略接口

    PolicyProvider
      rank(decisionContext) -> RankedProposal[]
      select(rankedProposals, randomSource) -> Decision

任何未来学习策略都必须实现同一接口，并保持输入输出可记录。

### 4.4 状态归约接口

    StateReducer
      apply(snapshot, acceptedEvents) -> NextSnapshot

apply 必须是确定性的；事件不合法时返回结构化错误，不得部分提交。

### 4.5 运行结果

    SimulationResult
      terminalReason
      initialSnapshotId
      finalSnapshotId
      eventLogRef
      decisionTraceRefs
      completedGoals
      unmetGoals
      diagnostics

字段最终名称以数据契约规格为准。

## 5. Acceptance Criteria

- **AC-ARC-001**：Given 相同快照和版本，When 重复计算空间事实，Then 结果必须相同。
- **AC-ARC-002**：Given 相同初始状态和随机种子，When 独立运行两次，Then 事件和终止结果必须相同。
- **AC-ARC-003**：Given UI 未启动，When 执行场景，Then 模拟必须完成。
- **AC-ARC-004**：Given 进攻和防守同时决策，When 生成提案，Then 双方必须读取同一快照。
- **AC-ARC-005**：Given 动作仍在承诺条件内，When 评分轻微变化，Then 动作不得无故中断。
- **AC-ARC-006**：Given 新动作注册，When 战术允许该动作，Then 主循环无需修改即可执行。
- **AC-ARC-007**：Given 多名球员争用同一区域，When 协调，Then 必须得到稳定解决或明确重规划。
- **AC-ARC-008**：Given 连续无进展，When 达到阈值，Then 模拟必须终止并说明原因。
- **AC-ARC-009**：Given 浏览器不同帧率，When 播放同一事件日志，Then 最终权威状态必须一致。

## 6. Test Automation Strategy

- 空间纯函数：单元测试、边界测试、镜像和几何属性测试；
- 动作：前置、目标、推进、完成、中断和失败测试；
- 策略：评分分解、稳定排序、同分处理和种子测试；
- 协调器：同队冲突、跨队同时提交和动作依赖测试；
- 状态归约器：事件合法性、原子提交和顺序测试；
- 重放：原运行与事件重放最终快照比较；
- 架构：禁止 sim-core 导入 UI、网络和 AI；
- 基准：按里程碑记录固定场景的无头运行数据，不提前设置无依据性能承诺。

测试框架和具体版本在实现阶段由锁文件固定。

## 7. Rationale & Context

| 取舍 | 决定 | 影响 |
| --- | --- | --- |
| 连续物理 vs 逻辑步 | 逻辑步 | 保留先后关系，舍弃真实运动细节 |
| 个体速度 vs 全局推进 | 全局移动步长 | 不污染球员状态，暂不表现速度差异 |
| 固定路线 vs 动态目标 | 动态目标 | 能响应对方变化，需要更强目标生成 |
| 顺序执行 vs 同快照提案 | 同快照提案 | 避免固定一方占先手 |
| 完全中央控制 vs 独立球员 | 团队意图加局部选择 | 保留协作，也允许运行时变化 |
| 纯确定性 vs 不可控随机 | 带种子可控采样 | 可重放且能表达多个合理分支 |

## 8. Dependencies & External Integrations

- **ARP-001**：严格 TypeScript 运行环境。
- **ARP-002**：支持无头执行的 JavaScript 运行时。
- **ARP-003**：React、Vite 和 SVG 只用于 Web 表现层。
- **ARE-001**：核心架构不依赖外部系统。
- **ARS-001**：核心运行不依赖第三方 AI 服务。

## 9. Examples & Edge Cases

### 防守位置变化

同一挡拆战术中，只移动掩护防守人的初始位置：

- 空间引擎产生不同的掩护后空间事实；
- 防守候选和评分变化；
- 进攻在防守事件后重新规划；
- 战术文件和动作代码不变。

### 同分动作

两个动作总分相同时：

- 确定性模式使用稳定排序键；
- 采样模式使用显式随机源；
- 不得依赖对象遍历顺序。

### 无合法动作

若全部动作违反硬约束：

- 策略返回 wait 或 request-replan；
- 记录所有拒绝原因；
- 连续发生时进入 stalled，而不是抛出未处理异常。

### 表现层丢帧

UI 可以跳过插值帧并直接显示最新快照。它不得根据圆点视觉位置推算模拟状态。

## 10. Validation Criteria

- 状态修改入口唯一；
- 逻辑步没有现实时间语义；
- 球员没有速度和朝向状态；
- 空间事实可重复计算；
- 动作通过注册表扩展；
- 策略输出可解释；
- 双方基于同一快照决策；
- 随机行为可重放；
- UI 和 AI 不在核心依赖链；
- 所有循环都有显式终止方式。

## 11. Related Specifications / Further Reading

- [产品意图与边界](spec-design-basketball-tactical-spatial-simulator.md)
- [战术与模拟数据契约](spec-schema-tactic-and-simulation-contracts.md)
- [AI 原生集成边界](spec-design-ai-native-integration.md)
- [验证与评估流程](spec-process-verification-and-evaluation.md)
