# 当前交接快照

> 快照日期：2026-08-07
> 当前分支：`prototype/pnr-formation-loop`
> 远程分支：`origin/prototype/pnr-formation-loop`
> F00/F00-R2 行为提交：`fb9bea56e9b14c7532e6684acbdb2b39e61c470e`
> 稳定 Policy 基线：`c4ada7d`

这份文件只回答“现在在哪里、接下来做什么”。阶段历史和决策原因分别放在[进度账本](./2026-08-06-generalization-goals-plan-progress.md)与[决策索引](./DECISIONS.md)。接手前仍须运行 `git status --short`，不得把本快照当作覆盖本地事实的许可。

## 一句话状态

S01–S08、G01–G08、P00–P03 与 F00/F00-R2 已封存。用户已验收固定偏移 Formation、D1 身体外恢复和真实 deep-retreat pull-up；下一批准增量是合并完成 F01–F03，尚未开始，也不得提前进入 A 自动选边。

## F00 封存事实

- `form_pnr` 仍为显式 opt-in；缺省 `preset_pnr` 与既有 170 输入保持原语义。
- O1/O5 联合就绪后才在下一合法边界接入旧挡拆；D1/D5 在 Formation 中保持原责任。
- UNDER 的清屏前/后路线属于双方各自的私有 `TeamPlan`；中立世界只凭真实坐标、速度、接触和公开事件确认 `screen_cleared`、恢复、遏制与 pull-up。
- F00 回放终止于 `under_drive_advantage@277`；deep 正证人为 `screen_cleared@98 → pullup_window@133`，O1 清屏后向筐推进 `0.758m` 并无碰撞减速。
- 用户已完成两条完整回放复验；行为提交为 `fb9bea56e9b14c7532e6684acbdb2b39e61c470e`。
- 提交前门为 `npm test` 63/63、lint、build 与 `git diff --check` 全部通过。170 个批准输入中只有 `S/S07` 与 `G07/scenario/S07` 按通用 UNDER 语义改变；其余 168 个逐 tick 不变，G08 manifest 未修改。

## 下一批准增量：F01–F03

用户批准把剩余 Formation 工作放在同一个增量内连续完成，但三段必须依次通过内部停止门：

1. **F01：少量结构化形成起手。** 只扩大距离和方向等公开 Formation 输入，验证同一角色、相对地标、分段路径与安全失败原语可复用；不得按样本 ID 增加路线或结果补丁。
2. **F02：有界 seed 随机合法位置。** 只有 F01 通过后，才能从 F01 已证明的合法域采样；生成器只能按输入几何拒绝，不能按方案、终局或“是否好看”筛选。
3. **F03：冻结 Formation held-out。** 只有 F02 通过并冻结输入域后，才以新 seed 生成不含输出标签的 manifest；必须在运行任何 held-out 世界前锁定并提交 manifest。揭示后失败则保留输入和核心，不能按 case ID 修补同一批样本。

F01 失败即停止；F02 失败即停止；F03 失败按 held-out 协议报告。三段全部完成后提供少量代表回放并等待用户验收，不自动开始 A00/A01。

## 不可扩大范围

- F02 不代表任意半场站位；不增加拖拽或手动控制。
- 不自动选择掩护侧或生成任意 anchor；这些属于 A 阶段。
- 不新增 drop、chase、ICE、夹击等战术原语；最小战术词汇属于 T 阶段。
- 不模拟投篮命中率、篮板、犯规、完整比赛、更多人数或 5v5。
- 不重开 P04，不改写 G08 manifest，不增加 ML/RL 或生产级 UI。

## 下一停止点

F01–F03 的自动门、冻结证据和代表回放形成后立即停止，等待用户判断结构化与有界随机起手是否仍像同一套 Formation。未经确认，不 commit/push 最终审计结果，也不开始 A 阶段。
