# 当前交接快照

> 快照日期：2026-08-10
> 当前交付分支：`prototype/pnr-formation-loop`
> A00–A01 行为检查点：`7ecedea1319ecf714549c1da3946d5fa3c8ed430`
> T00–T01 行为检查点：`e735f4768696bb423937c94ec3dea17a13a5ea94`；修复后已由用户重新验收
> 仓库上下文工具：自动模块/符号地图与 9 类机械架构门已实现，随当前工作树待提交
> P2/P4 基线：`dd6287b97dc3b33b8070a45ccfcb7280a24a1951`
> F01/F02 冻结核心：`90631359ba5a52eacfdbfc1434d657f8743df45e`
> F03 manifest：`ba39ef025f29d181af8c7d137d6807f7825c9717`
> F03 审计与回放：`f8163c2`
> 稳定 Policy 基线：`c4ada7d`

这份文件只回答“现在在哪里、接下来做什么”。阶段历史和决策原因分别放在[进度账本](./2026-08-06-generalization-goals-plan-progress.md)与[决策索引](./DECISIONS.md)。接手前仍须运行 `git status --short`，不得把本快照当作覆盖本地事实的许可。

跨文件定位先看 [`generated/CODEMAP.md`](./generated/CODEMAP.md)，具体符号只用 `rg` 查询 [`generated/SYMBOLS.md`](./generated/SYMBOLS.md)。两者均由 `npm run context:map` 生成；`npm run context:check` 同时拒绝陈旧地图与架构边界漂移。

当前工具门为架构/地图自测 4/4、9 类仓库架构契约零违规；与最新 T 工作树合并后，`npm test` 92/92、lint、build 与 `git diff --check` 通过。该工具增量不改变已经验收的 T 篮球行为，仍作为独立未提交工作保留。

## 一句话状态

S01–S08、G01–G08、P00–P03、Formation F00–F03、Autonomous Setup A00–A01 与 T00–T01 已封存并由用户验收。T 首轮自动门未覆盖队友时空通道，用户人眼验收据此失败；RESET、snake 与 pocket 的队级通道随后修复并通过加严自动门、本地可视复验与用户重新验收，行为检查点为 `e735f47`。当前不开始 I。

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

## T00–T01 封存事实

1. **显式输入契约。** T 只在 `preset_pnr + explicit + minimum-t@1` 下 opt-in；旧 preset、Formation 与 Autonomous 入口不自动获得 T 行为。T 不新增策略配置，双方 strategy adjustment 保持 0。
2. **T00：真实 drop/contain。** D5 通过私有连续路线真实退到球与顺下之间，D1 保持原 O1 责任；世界只从实际退守进度、掩护深度、身体几何与运动发布 `drop_committed`。进攻在公开 commit 后选择攻击 drop gap、急停窗口或安全重置。
3. **T01：真实 chase/over。** D1 只在公开掩护姿态成立后沿合法上方路线追过，D5 延续 contain；进攻根据公开追尾与双人约束事实选择 snake、pocket pass 或重置。pocket pass 必须经历真实发球、固定步飞行与 O5 第一触球，不能由计划直接写成接球结果。
4. **队友时空通道。** 持球通道优先；O5 在 snake 通道相交时等待或进入独立短顺下通道，不能绕 O1 运行。RESET 只允许 hold、清空 D1 恢复走廊或做最短间距调整。POCKET 先发展实时短顺下空档，窗口公开成立后才停位出球；健康队友净空、近距绕转、双人同动挤道、释放距离与多 tick 飞行都进入硬门。
5. **信息与解析边界。** 两队只读取公开世界、自队职责与自队计划；UI 可全知展示但不回流。T 的联合重规划边界只读取公开 `tacticalCoverage`，飞行与终局只读取公开 coverage、球状态和事件；中立世界不读取隐藏 plan id，不为球队评分或指定终局。
6. **冻结输入与修复后审计。** input-only manifest `minimum-t-inputs@1` 未改写，仍含 4 个输入、8 个左右镜像世界，每个世界运行 primary、duplicate 与 defense-first 三次；hash 为 `sha256:eccf50dbfaa532412bf854afaffcb6277d3b0908a3b882a2d94fa686c8e296f8`。修复后代表终局为 T00-C01 pullup tick 181、T00-C02 contained tick 230、T01-C01 snake tick 260、T01-C02 pocket caught tick 231；左右完全镜像。四案 O1/O5 最小身体净空为 0.0681–0.0690m，低于 5cm 的连续 tick 为 0，双人近距同动挤道为 0；T00-C02 的实际 RESET 相对绕转 5.36° 且无 roll/tangent。T01-C02 以 1.448m 中心释放距离在 tick 226 出球，飞行 5 ticks 后于 tick 231 接球。

首轮 T 聚焦 10/10、完整 86/86 与当时的本地可视检查，只证明旧门没有捕捉“各自合法但队级通道冲突”；用户随后在 T00-C02、T01-C01、T01-C02 人眼验收中确认该轮失败，旧 tick 与可视结论不能作为 T 验收证据。修复后 T 聚焦 12/12、`npm test` 88/88、lint、build 与 `git diff --check` 通过；本地浏览器重新跑通四个代表终局，并逐步确认 T01-C02 right 的 tick 226/228 仍为真实飞行、tick 231 才接球，left 同 tick 镜像接球，控制台无 warning/error。用户复看 pocket 出球画面后确认该停止点在 T 当前范围内可接受，并正式通过 T 人工验收。T 面板仍是显式只读回放入口；行为检查点为 `e735f47`。

## 不可扩大范围

- A 仍只在 F01/F02/F03 已批准的 Formation 输入域工作；T 也只证明 4 个冻结显式 preset 输入及其真实镜像，不等于任意半场站位或 A/F/T 已集成。
- 不增加 ICE、blitz、hedge、switch-back、外弹、二次掩护、拖拽、手动控制或任意角色识别。
- 不模拟投篮命中率、篮板、犯规、完整比赛、更多人数或 5v5。
- 不重开 P04，不改写 G08/F03 manifest，不增加 ML/RL 或生产级 UI。
- 不开始 I；Formation、Autonomous、T、Policy 与 held-out 的串联必须另行定义输入、自动门与停止点。

## 下一停止点

T00–T01 已完成首轮人工失败所揭示的队友通道修复、加严审计、自动门、本地浏览器复验与用户重新验收，并以 `e735f47` 封存。未获得 I 的独立实现授权前不得开始 I；仓库上下文工具仍是独立未提交增量，不得混入 T 检查点。
