# 文档导航与上下文预算

这份索引解决一个问题：新 agent 应该知道足够多才能安全工作，但不应在第一轮把全部 S/G/P/F 历史塞入上下文。

## 信息层级

| 层级 | 文档 | 用途 | 默认是否读取 |
| --- | --- | --- | --- |
| 0 | [`../AGENTS.md`](../AGENTS.md) | 稳定约束、当前范围一句话、阅读路由 | 是，自动入口 |
| 1 | [`CURRENT.md`](./CURRENT.md) | 当前分支、工作树、已知问题、下一动作和停止点 | 是 |
| 1 | [`../README.md`](../README.md) | 运行方式、架构、代码地图与能力边界 | 是，但只读相关章节 |
| 2 | [`DECISIONS.md`](./DECISIONS.md) | 重要决策、原因、替代方案和证据入口 | 需要判断或改变路线时 |
| 3 | [`2026-08-06-generalization-goals-plan-progress.md`](./2026-08-06-generalization-goals-plan-progress.md) | S/G/P/F 完整进度与验收账本 | 只读相关阶段 |
| 3 | [`2026-08-07-tactical-coverage-and-generalization-model.md`](./2026-08-07-tactical-coverage-and-generalization-model.md) | 判断泛化、组合、策略、新原语和新范围 | 扩大能力时 |
| 4 | 代码、测试、Git 提交 | 最终实现事实和历史证据 | 按任务定位 |

`CURRENT.md` 不负责保存完整历史；长文不负责表达实时工作树状态。不要把同一状态复制到多处。

## 默认接手路径

新 agent 第一轮只做：

1. `git status --short` 与 `git log -5 --oneline --decorate`。
2. 读 `AGENTS.md`。
3. 读 `CURRENT.md`。
4. 从 README 找到当前涉及的 2–4 个代码文件。
5. 先运行或读取最窄的相关测试，再决定是否需要加载决策或历史章节。

在这一步之前，不需要通读 300 多行进度账本、全部战术模型或整个核心文件。

## 按任务选择上下文

### 开始 A00–A01 Autonomous Setup 合并增量

读取：

- `AGENTS.md`
- `CURRENT.md`
- `lib/pnr-formation-domain.ts`、`pnr-formation-audit.ts` 与冻结 F01/F02/F03 输入入口
- `lib/pnr-core.ts` 中 SimulationConfig、planner observation、Formation 候选/计划、路径、readiness、事件与终止相关函数
- `lib/pnr-strategy.ts` 中硬 veto、base score、零 adjustment 与球队信息所有权入口
- `tests/pnr-core.test.mjs` 中 F00–F03、170 输入、镜像和核心不变量回归入口
- `DECISIONS.md` 的 D001–D003、D005–D006、D011–D015
- 进度账本中“F 之后的批准主线”与“当前判断与下一停止点”

A00 必须先用输入-only 固定审计集证明自动选边、双运行、镜像、最短承诺和滞回；失败即停止，不开始 A01。A01 只比较少量全局 canonical side × anchor 组合，完成后交用户验收，不开始 T。暂时不要读取全部 S01–P03 历史，只有旧回归失败时再定位对应阶段。

### 调查旧 S/G/P 回归

先读取失败测试和对应审计文件，再读取进度账本中的单个章节：

- S01–S08：第 5 节
- G01–G08：第 6 节
- P00–P04：第 7 节阶段 C–D

不要为了一个 G02 失败同时加载全部 G03–P03 历史。

### 改变总体目标、阶段或验收口径

读取：

- `CURRENT.md`
- `DECISIONS.md`
- 进度账本第 1、2、7–10 节

若改变了已批准范围、架构或停止点，先新增或更新决策，再修改代码。

### 增加战术覆盖或讨论“能否泛化到更多情况”

读取战术覆盖模型第 2、6、7、9–11 节。先判断需求属于：

```text
数值变化 → G 式审计
已知原语重组 → 组合审计
合法候选偏好 → Policy
新的角色/事件/球路 → 新篮球原语
更多人数或完整比赛 → 新项目阶段
```

不要用新增孤立场景掩盖缺失原语，也不要用策略权重伪装新篮球行为。

### 只修改 UI

读取 README 架构、`components/PnrLab.tsx` 的相关区域和公开快照类型。必须确认 UI 仍是只读观察壳；不需要加载全部泛化历史。

## 信息冲突时怎么办

优先级不是简单的“新文档覆盖旧文档”，而是按问题类型判断：

1. 当前代码实际做什么：代码与自动测试。
2. 当前应该做什么：`CURRENT.md` 与最近用户批准范围。
3. 为什么采用这条路线：`DECISIONS.md`。
4. 某个检查点当时如何验收：进度账本、审计文件和对应提交。
5. 未来如何分类新需求：战术覆盖模型。

发现冲突时记录具体文件、字段和提交，不要静默改写历史以制造一致。

## 文档维护规则

- 当前任务、工作树、阻塞点或下一停止点变化：更新 `CURRENT.md`。
- 架构、范围、验收原则或重要路线改变：追加 `DECISIONS.md`，保留被替代决定及原因。
- 一个阶段完成：在进度账本追加证据、提交和可声称范围。
- 运行命令或代码入口变化：更新 README。
- 稳定内核约束变化：更新 AGENTS，但保持它简短。
- 数值阈值、事件 tick 和样本分布优先放在测试或阶段账本，不要塞回 AGENTS/README。

每次文档更新后至少运行：

```bash
git diff --check
rg -n "CURRENT.md|DECISIONS.md|2026-08-06-generalization|2026-08-07-tactical" AGENTS.md README.md docs
```
