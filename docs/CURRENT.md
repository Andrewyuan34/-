# 当前交接快照

> 快照日期：2026-08-10
> 当前交付分支：`prototype/pnr-formation-loop`
> A00–A01 行为检查点：`7ecedea1319ecf714549c1da3946d5fa3c8ed430`
> T00–T01 行为检查点：`e735f4768696bb423937c94ec3dea17a13a5ea94`；修复后已由用户重新验收
> I00–I01 连续交接基线：`676176c`；已提交并推送
> I02–I03 行为检查点：`6f7af556823f372b012053b7eaa8ea194be7b5df`；已由用户验收
> V00 input-only manifest：`sha256:1fef82a37a1d610dcd8e5b91b00a123fd46312c8bb71c46566093cd4c57dd27a`；本地 lock commit `f1eb7786b24677ba3264f7b2433fd069401fa4a4`，未 push
> 仓库上下文工具：自动模块/符号地图与 9 类机械架构门已由 `7eb4bd2` 提交并推送
> P2/P4 基线：`dd6287b97dc3b33b8070a45ccfcb7280a24a1951`
> F01/F02 冻结核心：`90631359ba5a52eacfdbfc1434d657f8743df45e`
> F03 manifest：`ba39ef025f29d181af8c7d137d6807f7825c9717`
> F03 审计与回放：`f8163c2`
> 稳定 Policy 基线：`c4ada7d`

这份文件只回答“现在在哪里、接下来做什么”。阶段历史和决策原因分别放在[进度账本](./2026-08-06-generalization-goals-plan-progress.md)与[决策索引](./DECISIONS.md)。接手前仍须运行 `git status --short`，不得把本快照当作覆盖本地事实的许可。

跨文件定位先看 [`generated/CODEMAP.md`](./generated/CODEMAP.md)，具体符号只用 `rg` 查询 [`generated/SYMBOLS.md`](./generated/SYMBOLS.md)。两者均由 `npm run context:map` 生成；`npm run context:check` 同时拒绝陈旧地图与架构边界漂移。

仓库上下文工具的架构/地图自测与 9 类机械契约已作为独立提交 `7eb4bd2` 推送，不改变已经验收的篮球行为。本轮 I00–I03 聚焦 12/12、仓库总门 98/98、9 类架构契约、context check、lint、build 与 `git diff --check` 全部通过。

## 一句话状态

S01–S08、G01–G08、P00–P03、Formation F00–F03、Autonomous Setup A00–A01、T00–T01 与 I00–I03 均已封存并由用户验收。V00 已在揭示前锁定；V01 唯一执行的 12 inputs / 72 cells / 144 worlds / 432 simulations 全部通过，0 失败、0 OOD，聚合结果由后续 result checkpoint 记录，当前正在完成 V03 封存。

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

1. **显式输入契约。** 独立 T 只在 `preset_pnr + explicit + minimum-t@1` 下 opt-in；旧 preset、Formation 与 Autonomous 入口不自动获得 T 行为。唯一例外是 I01 的精确 `formation-minimum-t@1 + auto + form_pnr + F01-v1 + tactical_resolution` 版本元组。T 不新增策略配置，双方 strategy adjustment 保持 0。
2. **T00：真实 drop/contain。** D5 通过私有连续路线真实退到球与顺下之间，D1 保持原 O1 责任；世界只从实际退守进度、掩护深度、身体几何与运动发布 `drop_committed`。进攻在公开 commit 后选择攻击 drop gap、急停窗口或安全重置。
3. **T01：真实 chase/over。** D1 只在公开掩护姿态成立后沿合法上方路线追过，D5 延续 contain；进攻根据公开追尾与双人约束事实选择 snake、pocket pass 或重置。pocket pass 必须经历真实发球、固定步飞行与 O5 第一触球，不能由计划直接写成接球结果。
4. **队友时空通道。** 持球通道优先；O5 在 snake 通道相交时等待或进入独立短顺下通道，不能绕 O1 运行。RESET 只允许 hold、清空 D1 恢复走廊或做最短间距调整。POCKET 先发展实时短顺下空档，窗口公开成立后才停位出球；健康队友净空、近距绕转、双人同动挤道、释放距离与多 tick 飞行都进入硬门。
5. **信息与解析边界。** 两队只读取公开世界、自队职责与自队计划；UI 可全知展示但不回流。T 的联合重规划边界只读取公开 `tacticalCoverage`，飞行与终局只读取公开 coverage、球状态和事件；中立世界不读取隐藏 plan id，不为球队评分或指定终局。
6. **冻结输入与修复后审计。** input-only manifest `minimum-t-inputs@1` 未改写，仍含 4 个输入、8 个左右镜像世界，每个世界运行 primary、duplicate 与 defense-first 三次；hash 为 `sha256:eccf50dbfaa532412bf854afaffcb6277d3b0908a3b882a2d94fa686c8e296f8`。修复后代表终局为 T00-C01 pullup tick 181、T00-C02 contained tick 230、T01-C01 snake tick 260、T01-C02 pocket caught tick 231；左右完全镜像。四案 O1/O5 最小身体净空为 0.0681–0.0690m，低于 5cm 的连续 tick 为 0，双人近距同动挤道为 0；T00-C02 的实际 RESET 相对绕转 5.36° 且无 roll/tangent。T01-C02 以 1.448m 中心释放距离在 tick 226 出球，飞行 5 ticks 后于 tick 231 接球。

首轮 T 聚焦 10/10、完整 86/86 与当时的本地可视检查，只证明旧门没有捕捉“各自合法但队级通道冲突”；用户随后在 T00-C02、T01-C01、T01-C02 人眼验收中确认该轮失败，旧 tick 与可视结论不能作为 T 验收证据。修复后 T 聚焦 12/12、`npm test` 88/88、lint、build 与 `git diff --check` 通过；本地浏览器重新跑通四个代表终局，并逐步确认 T01-C02 right 的 tick 226/228 仍为真实飞行、tick 231 才接球，left 同 tick 镜像接球，控制台无 warning/error。用户复看 pocket 出球画面后确认该停止点在 T 当前范围内可接受，并正式通过 T 人工验收。T 面板仍是显式只读回放入口；行为检查点为 `e735f47`。

## I00–I03 封存事实

1. **I00 先验契约保持不变。** `formation-minimum-t-contract@1` 与 `formation-minimum-t-inputs@1` 在运行任何集成结果前锁定 13 个 A01 输入、seed、A/T 版本、P00 默认零 adjustment 策略、许可终局、自动门与回退点 `7eb4bd2`；input-only hash 仍为 `sha256:e4b0bec29c54b51157ae0b82681eb7f7ad01c5222f2e6802eab7ee0cd27d7554`，不含 expected outcome、case 定向或隐藏 side/anchor/plan/result。I02 没有改写该 manifest 或 hash。
2. **I01 连续交接基线。** `formation_ready` 在 tick N 成为公开事实后，同一个 `PnrSimulation`、world、固定时钟、球权、位置与速度在 tick N+1 的规划边界同时交给防守 drop/chase 与进攻二级读取；交接前没有 T 版本、coverage 或 T 读取，不重建 simulation，不重置 tick，不瞬移。该基线已由 `676176c` 提交推送。
3. **I02 复用既有策略。** 每个集成回合从 tick 0 到合法终局始终复用同一个已注册、复制并冻结的 `TeamStrategySelection`；覆盖封存 P03 的两套进攻 × 三套防守，不新增策略值、权重、P04 或 held-out。Formation、coverage 与二级读取的 planning record 均携带正确的自队 strategy 引用；运行开始后配置锁定，硬可行性、路线、球权和信息边界始终先于 adjustment，策略不能恢复 veto 候选或指定 coverage/terminal。
4. **I03 有界组合审计。** 13 个锁定输入 × 6 个既有 matchup 形成 78 个 cells、156 个真实镜像世界；每个世界运行 primary、duplicate 与 defense-first，共 468 次 simulation。同 simulation、单调 tick、next-boundary 交接、交接前无 T 读取、位置/速度/球权连续、确定性、规划顺序、镜像、双方信息隔离、策略引用/冻结/运行锁、phase ownership、hard veto、队友通道、条件 pocket 飞行/第一触球、安全退出与许可终局全部通过。逐 tick 行为 trace 同时要求零 adjustment 不得产生隐式策略效果；I01 默认 26 世界全轨迹以 `sha256:01803c9f2a1a09a83543c6edd6ae124444fda822975e66605548f1f36a5ef868` 锁定到 `676176c`。
5. **如实保留零差异。** 当前锁定 I 域中，六种策略组合相对默认策略产生真实行为差异的 input 数为 0，实际观察到的 strategy adjustment 也全部为 0；这是已有策略在这些合法候选边界上的真实结果，不是失败。实现没有为制造视觉差异修改基础篮球评分，独立 T 已封存的队友通道与 pocket 多 tick 飞行非空证据继续作为回归基线。
6. **只读验收入口。** I 面板只从完成后的审计事实选择连续终局、策略携带、真实镜像与安全退出代表回放，并展示合同、策略引用与锁定状态；UI 不回流规划输入。本地浏览器已跑通 I00-C01 right 的 `formation_ready@147 → handoff@148 → tactical_contained@294`、同案 left 镜像同 tick 终止、I00-C03 OM-DE 的 `formation_ready@71 → handoff@72 → tactical_contained@221` 且 Formation/coverage/read 全程保持自队策略引用，以及 I00-C13 OM-DE 的 `formation_aborted@1` 且未进入 T；控制台 warning/error 为 0。用户已完成上述代表回放的人眼验收，I00–I03 以行为提交 `6f7af55` 正式封存。

## V00 锁定合同

1. **起点与回退。** V 只能从 I 封存检查点 `28cf70e8c95710665f7ee2322a2dca8ff57e1951`（行为 `6f7af55`）启动；V00 为仅本地 lock commit，不 push。
2. **输入与 seed。** 从冻结 `F01-v1` 域使用 `mulberry32-v1`、manifest seed `20260811` 按顺序接受 12 个未出现在既有 F01/F02/F03/A01/I00 canonical 集合或其镜像中的 right-canonical 合法输入；simulation seeds 固定为 `20261001..20261012`。S/G/P/T 的 preset 输入不是同一 Formation 起手语义，不参与该重复键。V01 对每个输入运行真实 left mirror，不预写 side/anchor/result。
3. **矩阵与执行顺序。** 只复用 P03/I02 的 `OB-DB → OB-DM → OB-DE → OM-DB → OM-DM → OM-DE`。每个 cell 固定构造 `right-primary → right-duplicate → right-defense-first → left-primary → left-duplicate → left-defense-first` 六个 simulation，并逐 tick lockstep 推进；先终止的一项只记录首个 mismatch，其余非终止项继续到各自终局或锁定 watchdog。共 72 cells、144 worlds、432 simulations。
4. **通过门。** 全部 cell 必须通过确定性、真实镜像、同 simulation 连续阶段/球权、合法状态与动作、策略引用/冻结、planner 顺序与双方信息隔离、角色归属、路线/球权、hard veto、公开事件因果、战术完成或真实安全退出、队友通道/pocket 与无远程 screen；镜像误差上限 `1e-9`，O1/O5 最小身体净空下限 `0.059999m`。
5. **OOD 与失败纪律。** 只在生成阶段排除参数越界、非法几何、重复或旧输入；一旦锁入 manifest 即视为 in-domain。V01 若发现锁后域失败，记录为 OOD 合同失败并整体失败，不替换；`formation_aborted` / `formation_timeout` 是合法安全退出。其他失败只记候选通用缺陷，禁止在 V01 修代码、调参、改题或挑选重跑。
6. **回放与证据。** 通过时按最长终局、最窄队友通道、首个形成成功的非默认策略携带、最长终局真实镜像四条固定规则选 replay；失败时前两槽固定替换为首失败及其镜像。完整聚合、所有失败复现键与 cell 摘要写入忽略目录 `outputs/v01-integrated-validation.json`，不提交 V01 结果。

## V01 唯一执行结果

1. **规模与分类。** 从 V00 lock commit 唯一执行 12 inputs × 6 matchups = 72 cells、144 个真实镜像 worlds、每 world 三次，共 432 simulations；72/72 cells 通过，候选通用缺陷 0、OOD 合同失败 0、失败复现键 0。144 worlds 全部形成，安全退出样本为 0。
2. **终局与阈值。** 36 worlds 终止于 `tactical_pocket_caught`，108 worlds 终止于 `tactical_contained`；最小 O1/O5 身体净空 `0.06793875835737445m`，最大镜像误差 `1.221974324176267e-13`。确定性、镜像、连续阶段/球权、合法状态/动作、策略引用携带、planner 顺序、信息隔离、角色/路线/球权、hard veto、公开因果、战术完成/安全退出、队友通道/pocket、局部 screen 与零 adjustment 策略因果门全部通过。
3. **代表 replay。** `V00-C04/OB-DB` right `tactical_pocket_caught@332`（最长终局）；`V00-C01/OB-DB` right `tactical_pocket_caught@256`（最窄通道）；`V00-C01/OB-DM` right `tactical_pocket_caught@256`（非默认防守策略携带）；`V00-C04/OB-DB` left `tactical_pocket_caught@332`（最长终局真实镜像）。
4. **证据纪律。** 完整证据只写入忽略文件 `outputs/v01-integrated-validation.json`；runner 已拒绝覆盖，因此不得重跑。聚合结果由 result checkpoint 记录，raw artifact 仍按仓库约定保持 ignored，等待 V03 固定其摘要与复核边界。

## 不可扩大范围

- I00–I03 只证明 13 个锁定 A01 输入 × 封存 P03 的六种策略组合及其真实镜像在精确版本元组下的 A→T 连续回合；不等于任意半场站位、通用 A/F/T 集成或全新 held-out 验证。
- 不增加 ICE、blitz、hedge、switch-back、外弹、二次掩护、拖拽、手动控制或任意角色识别。
- 不模拟投篮命中率、篮板、犯规、完整比赛、更多人数或 5v5。
- 不重开 P04，不改写 G08/F03 manifest，不增加 ML/RL 或生产级 UI。
- V01 通过只证明锁定 bounded Formation 域内、既有 `2 × 3` 策略的 integrated held-out；不得写成 P04、新策略 held-out、任意起手泛化或已经完成 V03 封存。

## 下一停止点

V01 已按 V00 合同唯一执行并通过，无需进入 V02 修复。用户已授权完成 V03；当前只允许只读回放 QA、证据摘要、权威文档与 Git 封存，不得重跑 V01 或修改篮球行为。
