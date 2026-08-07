# AGENTS.md

这是本仓库给新 agent 的自动入口。目标是用最少上下文安全接手，而不是在第一轮读完全部历史。

## 首轮接手顺序

1. 先运行 `git status --short`，确认当前分支和未提交文件；不得覆盖、迁移或清理不属于本任务的改动。
2. 阅读 [`docs/CURRENT.md`](./docs/CURRENT.md)，只获取当前阶段、已知问题、下一停止点和交付门。
3. 阅读根目录 [`README.md`](./README.md) 的运行、架构和代码地图。
4. 按 [`docs/README.md`](./docs/README.md) 的任务路由，只加载与当前任务有关的决策或历史章节。默认不要通读两份长文。

代码与测试是当前行为事实；`docs/CURRENT.md` 是当前进度事实；[`docs/DECISIONS.md`](./docs/DECISIONS.md) 解释为什么这样做。若三者冲突，先停下并报告，不要凭猜测统一它们。

## 不可破坏的内核契约

- 架构保持为进攻队级规划器、防守队级规划器、中立世界与运动解析器。
- 两队只读取公开世界事实、自队职责和自队策略；不得读取对方隐藏计划或隐藏策略。
- UI 可以全知展示，但显示对象不得回流为球队规划输入。
- 中立解析器只执行固定步运动、身体几何、边界、球权、传球飞行、第一触球和事件归属；不替球队评分、选方案或指定结果。
- 世界按 `1/60s` 固定步推进；只在事件、终止条件或有限看门狗处重规划，并保留最短承诺与滞回。
- `contact`、`route_exposure`、`impeded`、`screen_effective` 分别成立；没有局部接触或合理移动走廊时不得产生远程阻挡。
- 硬可行性先于基础评分和策略偏好；计划意图必须经过真实运动与世界事件才能变成结果。
- 右侧是唯一规范战术坐标；左侧必须是真实世界镜像，不得复制 left planner、镜像 Canvas 或增加 side 特判。
- 相同公开输入、seed 与双方策略必须逐 tick 复现；不得读取 scenario ID、held-out ID 或预设终局补丁结果。

## 已封存检查点

- S01–S08、G01–G08 与 P00–P03 已完成并由用户验收；Policy 收口提交是 `c4ada7d`。
- Formation F00–F03 已完成并由用户验收；F01/F02 冻结核心为 `9063135`，F03 manifest 为 `ba39ef0`，最终审计与回放提交为 `f8163c2`。
- G08 manifest 与冻结输入不得改写；失败时报告最早失败轨迹，不能按 case ID 调参。
- P00 默认策略 adjustment 必须保持 0；策略只能重排硬可行候选，不能恢复 veto 候选。
- 既有 170 个批准输入、G08/F03 manifest、真实左右镜像和核心不变量是 Autonomous Setup 改动的回归基线。
- P04 被明确跳过，不得写成已完成，也不得借其他阶段顺手重开。

具体历史数字、校准点和提交证据只在相关回归失败时按需读取：见 [`docs/2026-08-06-generalization-goals-plan-progress.md`](./docs/2026-08-06-generalization-goals-plan-progress.md)。

## 当前范围与停止点

- 下一批准增量是在新分支 `prototype/pnr-autonomous-setup` 合并完成 A00–A01：先按公开几何自动选掩护侧，再从少量 canonical 候选中自动选合法 anchor，并在全部组合不可行时安全退出。A00 自动门失败不得开始 A01。
- 新 setup 模式必须显式区分 `explicit | auto`；字段缺省仍为 `explicit`，所有 S/G/P/F00–F03 逐 tick 行为保持不变。`auto` 不得接受或偷读调用方遗留的 side、anchor、样本 ID或预期结果。
- side、anchor 与 waypoint 属于进攻私有 `TeamPlan`；防守只从真实公开运动和后续公开 commit 事件响应，中立世界不评分、不选 side/anchor，也不从隐藏 target 宣布成功。
- A 只在 F01/F02/F03 已证明的合法 Formation 域内工作，O1/O5 与 D1/D5 职责固定；不扩到任意位置、角色识别、拖拽、手动控制、新战术、投篮结果、更多人数、5v5、ML/RL 或生产化。
- 完整 A00–A01 闭环、自动门与代表回放形成后立即停止等待用户验收；验收前不 commit/push A 的实现、测试与 UI，也不开始 T 阶段。

实时细节和工作树状态以 [`docs/CURRENT.md`](./docs/CURRENT.md) 为准。

## 修改、验证与文档纪律

- 一轮只解决一个可观看的篮球问题；失败先保留最小反例，不堆场景或补丁。
- 行为改动同步维护紧凑的因果/不变量测试。完成前运行 `npm test`、`npm run lint` 和 `npm run build`。
- 只暂存本任务明确拥有的路径；不使用 `git add .` 或 `git add -A`。
- 当前状态改变时更新 `docs/CURRENT.md`；范围、架构或验收原则改变时追加 `docs/DECISIONS.md`。不要把每个实现细节写成决策。
- 长篇阶段证据保留在历史文档；README 和 AGENTS 只保留导航、稳定契约与当前一句话状态。
