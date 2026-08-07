# 当前交接快照

> 快照日期：2026-08-07
> 当前交付分支：`prototype/pnr-formation-loop`
> A00–A01 行为检查点：`7ecedea1319ecf714549c1da3946d5fa3c8ed430`
> P2/P4 基线：`dd6287b97dc3b33b8070a45ccfcb7280a24a1951`
> F01/F02 冻结核心：`90631359ba5a52eacfdbfc1434d657f8743df45e`
> F03 manifest：`ba39ef025f29d181af8c7d137d6807f7825c9717`
> F03 审计与回放：`f8163c2`
> 稳定 Policy 基线：`c4ada7d`

这份文件只回答“现在在哪里、接下来做什么”。阶段历史和决策原因分别放在[进度账本](./2026-08-06-generalization-goals-plan-progress.md)与[决策索引](./DECISIONS.md)。接手前仍须运行 `git status --short`，不得把本快照当作覆盖本地事实的许可。

## 一句话状态

S01–S08、G01–G08、P00–P03、Formation F00–F03 与 Autonomous Setup A00–A01 已封存并由用户验收。当前没有获批的新实现增量；保持停止，不自动开始 T。

## F 阶段封存事实

- F00/F00-R2 行为提交为 `fb9bea56e9b14c7532e6684acbdb2b39e61c470e`；`form_pnr` 仍为显式 opt-in，旧 `preset_pnr` 与 170 个批准输入保持既有语义。
- F01 冻结 8 个规范起手并运行真实左右镜像：16 个世界中 14 个合法形成、2 个安全退出。
- F02 使用 seed `20260809`，16/16 个输入按公开几何接受；32 个镜像世界各双运行通过。冻结输入 hash 为 `sha256:9e92f30216aba6d76be9ba9a54197e511a03015dff68bf2b814fd54aa35f63b6`。
- F03 frozen core 为 `90631359ba5a52eacfdbfc1434d657f8743df45e`；输入-only manifest 在揭示前以 `ba39ef025f29d181af8c7d137d6807f7825c9717` 锁定，hash 为 `sha256:7d7331992d4855d0d43704f926da97a0698e4c80a3da6b494ca4f350f3eb5b68`。
- F03 运行 16 个 manifest 世界及其 16 个未标注对应镜像：32 个世界中 28 个合法形成、4 个安全退出，各双运行、镜像与核心不变量全部通过。
- 用户已人眼验收 `F01-C02 · RIGHT`、`F02-S15 · RIGHT`、`F03-R03 · RIGHT` 安全退出与 `F03-L04 · LEFT`。Formation F00–F03 正式完成。
- F 最终自动门为 `npm test` 72/72、lint、build 与 `git diff --check` 全部通过；G08 manifest、F03 manifest 与已封存输入均未改写。

## A00–A01 封存事实

1. **A00：自动选择掩护侧。** 在同一合法规划边界比较 left/right 的公开几何、ETA、边界、身体净空、连续路线、走廊与有限 watchdog；硬不可行先 veto，再以公开、确定的标量分数选择。继续使用单一 `FORM_SCREEN`，side 只进入进攻私有 `TeamPlan` payload。
2. **A01：自动生成合法 anchor。** 只有 A00 自动门通过后，才比较少量、全局固定、左右共享的 canonical side × anchor 组合；所有组合被 veto 时提交明确 formation abort/reset intent，并由中立世界在真实有限条件成立后发布安全终止。
3. **输入契约。** 新增显式 `explicit | auto` setup 模式，缺省仍为 `explicit`；所有 S/G/P/F00–F03 逐 tick 不变。`auto` 只接受四人合法初始位置、seed、双方策略、固定角色职责与 Formation 域版本；不得携带 side、anchor 或预期结果，冲突字段必须拒绝。
4. **信息边界。** 防守只能根据 O1/O5 的公开运动及后续公开 commit 事实响应，不能读取进攻私有 side、anchor、等待点或 use/reject gate；中立解析器不评分、不选 side/anchor，也不从隐藏 target 宣布成功。
5. **运行锁定。** 输入深拷贝且不可变；播放或单步后样本锁定，只有重置新回合才解锁。策略 adjustment 在自动 Formation 阶段保持 0，不增加策略菜单。

交付证据：A00 锁定 12 个输入、24 个镜像世界并各双运行，input-only hash 为 `sha256:ed568eb77c78bc62cffa0dba06aa59df660bd7df181b2eb9b254c37d4887bcc4`；A01 锁定 13 个输入、26 个镜像世界并各双运行，22 个真实形成、2 个继承 Formation timeout、2 个真实安全退出，input-only hash 为 `sha256:0518aadfcea925a6736f16bfaf4843f7c842290c1bff9c959f3c8afceaba42b6`。用户已人眼验收最晚形成、最窄走廊、不同 anchor 镜像与全-veto 安全退出四条审计回放；UI 只读，不回流规划输入。最终自动门为 A00 4/4、A01 4/4、F00–F03 16/16、`npm test` 80/80、lint、build 与 `git diff --check` 全部通过；行为提交为 `7ecedea`。

## 不可扩大范围

- A 只在 F01/F02/F03 已批准的 Formation 输入域工作，不等于任意半场站位；不增加拖拽、手动控制或任意角色识别。
- 不新增 drop、chase、ICE、夹击等战术原语；它们属于后续 T 阶段，且本轮不得启动。
- 不模拟投篮命中率、篮板、犯规、完整比赛、更多人数或 5v5。
- 不重开 P04，不改写 G08/F03 manifest，不增加 ML/RL 或生产级 UI。

## 下一停止点

A00–A01 闭环、input-only 审计、严格镜像、逐 tick 回归、全自动门、独立只读页面与四条代表回放均已通过并由用户验收。当前没有下一实现授权；保持封存状态，不开始 T00。
