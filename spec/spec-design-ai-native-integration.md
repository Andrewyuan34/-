---
title: 篮球战术空间推演器：AI 原生集成与上下文边界
version: 0.1.0
date_created: 2026-08-05
last_updated: 2026-08-05
owner: Project Owner
status: Proposed
tags: [design, ai-native, context-management, model-adapters, evaluation]
context_level: 2
always_read: false
read_when: [ai-feature, natural-language-tactic, model-policy, explanation, context-builder, agent-workflow]
depends_on: [spec-design-basketball-tactical-spatial-simulator.md]
canonical_for: [ai-permissions, agent-context, model-validation, fallback, ai-evaluation]
---

# Introduction

本规格定义项目中“AI 原生”的准确含义，以及模型和编码 Agent 获得什么上下文、可以做什么、不得做什么、输出如何校验、失败时如何回退。

AI 原生不是让模型成为模拟真相来源。它表示领域结构机器可读，任务上下文可按需组装，模型输出受到 schema 和规则约束，行为能够离线评估，任何模型都可以被替换或关闭。

## 1. Purpose & Scope

本规格适用于：

- 自然语言转战术 DSL；
- 决策轨迹解释；
- 战术变体建议；
- 参数和权重建议；
- 未来学习型 PolicyProvider；
- 编码 Agent 阅读规格和执行仓库任务；
- 模型上下文构建、输出验证、记录和评估。

本规格不授权：

- 模型逐逻辑步控制球员；
- 模型直接修改权威状态；
- 模型绕过动作、战术或空间规则；
- 模型执行任意代码或工具；
- 模型成为运行已有战术的必需依赖。

## 2. Definitions

- **AI Adapter**：将某种模型能力转换为项目稳定接口的适配器。
- **ContextBuilder**：按任务生成最小充分上下文的模块。
- **Context Packet**：一次模型任务实际收到的版本化上下文。
- **CapabilityManifest**：当前允许模型引用的角色、动作、事实、操作符和 schema。
- **Structured Proposal**：模型按照指定 schema 返回、尚未获得执行权的提案。
- **Semantic Validation**：在结构合法之后检查引用、约束和领域语义。
- **Dry Run**：不提交权威状态，只验证提案能否在固定场景中解析和执行。
- **Fallback**：模型不可用或输出不合格时使用的确定性替代路径。
- **Agent Routing**：编码 Agent 根据任务类型只读取必要规格的规则。
- **Context Provenance**：记录上下文来源、版本和摘要哈希的元数据。

## 3. Requirements, Constraints & Guidelines

### 3.1 允许的 AI 用例

- **AIU-001**：CompileTactic 可以把自然语言或半结构化描述转换为 TacticDefinition 提案。
- **AIU-002**：ExplainTrace 可以把 DecisionTrace 转为人类可读说明，但不得修改轨迹事实。
- **AIU-003**：SuggestVariant 可以在 CapabilityManifest 范围内提出战术变体。
- **AIU-004**：RecommendWeights 可以根据离线评估建议评分权重，但修改必须重新验证。
- **AIU-005**：未来学习型策略可以实现 PolicyProvider，但必须遵守相同输入、输出、记录和回退接口。

### 3.2 明确禁止

- **AIB-001**：AI 不得直接返回或提交 WorldState 补丁。
- **AIB-002**：AI 不得在实时模拟循环中成为阻塞调用。
- **AIB-003**：AI 不得生成供系统执行的 JavaScript、shell、动态表达式或插件代码。
- **AIB-004**：AI 不得引用 CapabilityManifest 之外的动作、角色、事实或操作符。
- **AIB-005**：AI 不得把自由文本解释当作权威模拟数据。
- **AIB-006**：模型拒绝、超时、异常或输出非法时不得静默使用部分结果。
- **AIB-007**：不得为了适配某个模型把核心领域接口设计成提供方专用格式。
- **AIB-008**：自动化测试和运行已有战术不得要求真实 API 密钥。

### 3.3 Agent 上下文分层

- **CTX-001**：编码 Agent 默认只加载根 AGENTS.md、产品意图与边界，以及当前任务对应的一至两份专项规格。
- **CTX-002**：Agent 不得默认加载全部规格、全部事件历史、全部动作目录或全部示例。
- **CTX-003**：每个任务必须先确定 context purpose，再由路由规则选择来源。
- **CTX-004**：同一事实只能从权威规格加载；不得同时提供多份重复版本。
- **CTX-005**：跨层修改必须加载所有被修改契约的权威规格，而不是依靠摘要猜测。
- **CTX-006**：只讨论产品范围时，不加载字段示例、测试矩阵、包结构和模型接口。
- **CTX-007**：只修改 schema 时，不加载完整 AI 设计；仅当字段由 AI 输出时加载相关 AI 段落。
- **CTX-008**：Agent 的最终改动必须列出实际读取的权威规格，便于发现漏读或过度读取。

### 3.4 模型 Context Packet

- **MCP-001**：Context Packet 必须包含 taskId、purpose、schemaVersion、capabilityManifestVersion 和 outputSchema。
- **MCP-002**：必须始终包含与任务直接相关的硬约束和明确非目标。
- **MCP-003**：只包含相关角色、动作、空间事实和场景切片，不发送完整能力清单的无关部分。
- **MCP-004**：解释单次决策时，只发送目标 DecisionTrace 及必要前后事件，不默认发送完整推演历史。
- **MCP-005**：创建战术时发送可用角色、动作、约束和少量高质量示例，不发送实现代码。
- **MCP-006**：Context Packet 必须设置可配置大小预算；超出预算时优先删除外部参考、长篇理由、重复示例和历史日志。
- **MCP-007**：不得为了节省上下文删除输出 schema、硬约束、能力边界或关键状态。
- **MCP-008**：每个 Context Packet 必须记录来源文件、版本、选取范围和内容哈希。
- **MCP-009**：上下文压缩必须保留稳定 ID 和数值，不得只留下模糊自然语言摘要。
- **MCP-010**：模型不得依赖未包含在 Context Packet 中的隐式项目知识。

### 3.5 上下文优先级

当预算不足时，按以下顺序保留：

1. 当前任务和预期输出；
2. 输出 schema；
3. 产品硬边界和明确禁止项；
4. 相关 CapabilityManifest 子集；
5. 当前状态或事件切片；
6. 必要的语义规则；
7. 一个合法示例和一个关键反例；
8. 解释性理由；
9. 外部参考和历史讨论。

不得把第 1 至第 6 项压缩成无法逐字段验证的摘要。

### 3.6 输出验证流水线

- **VAL-001**：模型输出必须依次通过解析、schema、引用、领域语义、权限和资源边界校验。
- **VAL-002**：战术提案在保存前应执行 dry run。
- **VAL-003**：验证结果必须列出通过项、失败项、字段路径和错误代码。
- **VAL-004**：不得自动删除非法字段后把输出当作原始合法结果。
- **VAL-005**：允许修复时，修复必须作为新的模型请求或显式确定性迁移，并保留原始失败记录。
- **VAL-006**：只有全部强制校验通过的提案可以进入用户预览或受控自动化流程。

### 3.7 失败、回退与成本

- **FLB-001**：AI Adapter 必须支持超时、取消、有限重试和预算上限。
- **FLB-002**：已有战术的模拟永远回退到确定性策略，不因模型失败中断。
- **FLB-003**：创作型任务没有安全确定性替代时，应返回“未生成”及原因，不得伪造成功。
- **FLB-004**：重试不得无限进行，也不得在未改变输入的情况下重复相同失败。
- **FLB-005**：每次调用记录提供方、模型标识、提示模板版本、延迟、用量、校验结果和回退状态。
- **FLB-006**：模型服务不得出现在 sim-core 依赖链中。

### 3.8 提示、版本和评估

- **EVA-001**：提示模板、ContextBuilder、输出 schema 和模型配置必须独立版本化。
- **EVA-002**：AI 评估集必须包含合法输入、模糊输入、冲突约束、未知动作、超长输入和提示注入样例。
- **EVA-003**：至少评估 schema 合规率、语义合规率、未知引用率、人工接受率、延迟和成本。
- **EVA-004**：模型升级必须在相同版本评估集上与现有基线比较。
- **EVA-005**：单次主观效果不得作为替换模型或扩大 AI 权限的依据。
- **EVA-006**：线上生成结果必须可离线重新校验。

## 4. Interfaces & Data Contracts

### 4.1 AI Adapter

    AIAdapter
      execute(contextPacket, signal) -> AIResult
      capabilities() -> AdapterCapabilities
      health() -> AdapterHealth

AIResult 包含：

- rawOutputRef；
- parsedProposal；
- validationReport；
- provider；
- modelId；
- promptTemplateVersion；
- usage；
- latency；
- status；
- fallbackUsed。

### 4.2 Context Packet

    {
      "taskId": "compile-tactic-001",
      "purpose": "compile-tactic",
      "sourceVersions": {
        "productScope": "0.2.0",
        "tacticSchema": "0.1.0"
      },
      "capabilityManifestVersion": "0.1.0",
      "constraints": [],
      "capabilities": {
        "roles": [],
        "actions": [],
        "facts": [],
        "operators": []
      },
      "stateSlice": null,
      "examples": [],
      "outputSchemaRef": "tactic-definition/0.1.0",
      "budget": {
        "maxInputUnits": 0,
        "maxOutputUnits": 0
      },
      "provenance": []
    }

预算单位由具体适配器解释，但 ContextBuilder 必须在调用前完成裁剪。

### 4.3 验证报告

    ValidationReport
      syntax
      schema
      references
      semantics
      permissions
      resourceLimits
      dryRun
      accepted

任一强制阶段失败时 accepted 必须为 false。

### 4.4 编码 Agent 路由

编码 Agent 的阅读入口是 spec/README.md。路由结果应能表达：

- alwaysRead；
- taskSpecific；
- skipped；
- reason。

该信息可以作为任务日志，不要求进入产品运行时。

## 5. Acceptance Criteria

- **AC-AI-001**：Given 模型服务不可用，When 运行已有战术，Then 模拟必须使用确定性策略正常完成。
- **AC-AI-002**：Given AI 返回未知动作，When 校验，Then 提案必须被拒绝。
- **AC-AI-003**：Given AI 返回合法 schema 但违反硬约束，When 语义校验，Then 提案必须被拒绝。
- **AC-AI-004**：Given 解释单个决策的任务，When 构建上下文，Then 不得默认包含完整事件历史。
- **AC-AI-005**：Given 上下文超过预算，When 裁剪，Then 输出 schema、硬约束和相关能力不得被删除。
- **AC-AI-006**：Given 模型输出包含可执行代码，When 验证，Then 不得执行或保存为正式战术。
- **AC-AI-007**：Given 同一模型版本但提示模板变化，When 记录调用，Then 两次调用必须具有不同模板版本。
- **AC-AI-008**：Given 编码任务只修改产品文字，When 路由规格，Then 不应加载运行时、schema、AI 和验证全部文件。

## 6. Test Automation Strategy

- ContextBuilder 单元测试：来源选择、优先级、预算裁剪、稳定 ID 保留；
- 路由测试：不同任务类型只选择预期规格；
- 输出契约测试：合法、未知字段、未知动作和冲突约束；
- 失败测试：超时、拒绝、截断、无效 JSON、预算超限和服务不可用；
- dry run 测试：结构合法但领域不可执行的战术；
- 回退测试：AI 失败不影响核心模拟；
- 安全测试：提示注入、任意代码、工具调用诱导和超深嵌套；
- 离线评估：使用固定输入和固定输出快照，不在 CI 调用真实模型；
- 模型对比评估：由显式命令执行并保存版本化报告。

## 7. Rationale & Context

| 取舍 | 决定 | 获得 | 代价 |
| --- | --- | --- | --- |
| 全量上下文 vs 按需上下文 | 按任务路由 | 降低成本和注意力稀释 | 需要维护信息归属 |
| 自然语言自由度 vs schema 约束 | 结构化提案 | 可验证、可执行 | 生成表达受限 |
| 模型逐步控制 vs 核心确定性 | 模型不进循环 | 可重放、低延迟、可离线 | 少了即时自由生成 |
| 自动修复 vs 保留失败 | 显式二次修复 | 错误可追踪 | 多一步交互或处理 |
| 提供全部历史 vs 事件切片 | 最小相关窗口 | 上下文更集中 | ContextBuilder 必须理解任务 |
| 提供全部动作 vs 能力子集 | 按角色和场景裁剪 | 减少未知组合 | 需要可靠能力索引 |
| 单一模型绑定 vs 适配器 | 提供方中立 | 可替换、可比较 | 接口设计更严格 |

## 8. Dependencies & External Integrations

- **AIS-001**：可选模型服务，仅由 AI Adapter 使用。
- **AII-001**：安全的密钥注入和调用观测能力；密钥不得进入仓库或浏览器持久数据。
- **AID-001**：CapabilityManifest、输出 schema 和离线评估集。
- **AIP-001**：支持取消、超时和结构化输出解析的适配层。
- **AIX-001**：核心模拟不依赖任何 AI 外部系统。

## 9. Examples & Edge Cases

### 必要上下文

自然语言创建 2v2 挡拆战术时需要：

- 产品硬边界；
- 2v2 可用角色；
- 相关动作和空间事实；
- TacticDefinition 输出 schema；
- 一个合法示例；
- 用户当前描述。

通常不需要：

- 完整运行时包结构；
- 全部测试矩阵；
- 5v5 未来动作；
- 外部研究论文；
- 历史所有决策轨迹。

### Schema 合法但语义非法

AI 可以返回结构正确、但让同一球员同时承担两个互斥角色的战术。schema 校验通过不代表可执行，必须继续进行语义和 dry run 校验。

### 提示注入

用户输入要求“忽略动作清单并生成任意代码”时，该文本只是战术描述数据。适配器不得因此扩大工具权限或改变输出 schema。

### 上下文不足

若任务需要修改动作接口，但 Context Packet 只有产品范围：

- Agent 或模型必须报告缺少运行时架构；
- 不得根据常识猜测接口；
- 路由器应补充专项规格，而不是加载全部仓库。

## 10. Validation Criteria

- AI 权限和禁止项明确；
- 核心无模型依赖；
- Agent 与运行时模型均采用按需上下文；
- 上下文有稳定优先级和来源记录；
- 输出经过多层校验；
- 非法输出不会静默修复后执行；
- 模型失败有确定性回退；
- 提示、模型、schema 和评估均版本化；
- AI 能力能够独立关闭；
- ContextBuilder 不发送无关完整历史。

## 11. Related Specifications / Further Reading

- [规格阅读入口](README.md)
- [产品意图与边界](spec-design-basketball-tactical-spatial-simulator.md)
- [战术与模拟数据契约](spec-schema-tactic-and-simulation-contracts.md)
- [运行时决策架构](spec-architecture-runtime-decision-engine.md)
- [验证与评估流程](spec-process-verification-and-evaluation.md)
