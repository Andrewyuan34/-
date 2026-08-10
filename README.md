# 2v2 挡拆算法最小闭环

这是一个独立、确定性、可观看且可解释的 2v2 挡拆算法实验台。它不是预录轨迹：两支球队分别产生队级计划，中立世界以固定时间步解析运动、身体几何、球权、传球和事件。

当前稳定检查点已经覆盖 S01–S08 战术证人、G01–G08 受限域泛化、P00–P03 的两套进攻策略 × 三套防守策略、Formation F00–F03、Autonomous Setup A00–A01、T00–T01，以及已由用户验收的 Integrated Possession I00–I03。I00–I01 连续交接基线为 `676176c`，I02–I03 行为提交为 `6f7af55`；V00 的集成 held-out 合同只在本地锁定，V01 结果不属于稳定检查点。实时状态见 [`docs/CURRENT.md`](./docs/CURRENT.md)。

## 新 agent 从哪里开始

不要从头通读所有历史：

1. 自动入口：[`AGENTS.md`](./AGENTS.md)
2. 当前交接：[`docs/CURRENT.md`](./docs/CURRENT.md)
3. 文档路由：[`docs/README.md`](./docs/README.md)
4. 决策与原因：[`docs/DECISIONS.md`](./docs/DECISIONS.md)

只有改变路线、调查旧回归或扩大战术覆盖时，才按需读取长篇进度账本与战术覆盖模型。

## 运行与验证

需要 Node.js `>=22.13.0`。

```bash
npm install
npm run dev
```

打开终端显示的本地地址。验证命令：

```bash
npm run context:check
npm test
npm run lint
npm run build
```

`npm test` 与聚焦测试默认使用紧凑 dot reporter，并自动发现各阶段的 `tests/*.test.mjs`。开发中先运行 `npm run test:focus -- "<name pattern>"`；只有失败时才用 `npm run test:focus:detail -- "<name pattern>"` 展开对应失败。`npm run test:detail` 可展开整套测试。源文件变化后先运行 `npm run context:map` 更新派生地图；`npm run check` 会依次验证地图与架构边界、测试、lint 和 build。

V01 只能在 V00 lock commit 后、工作树无 tracked 改动时运行一次锁定入口：`npm run validate:v01`。命令只消费已锁定 manifest，并把聚合证据写到被忽略的 `outputs/v01-integrated-validation.json`；不得用它改 seed、阈值或筛掉失败 cell。

## 架构

```text
公开世界 + 进攻策略                     公开世界 + 防守策略
          ↓                                      ↓
    进攻队级规划器                         防守队级规划器
          ↓ 两名进攻球员角色与意图               ↓ 两名防守球员角色与意图
          └──────────────────┬───────────────────┘
                             ↓
              中立世界与运动解析器（1/60s）
                             ↓
       真实位置 / 接触 / 球权 / 传球 / 事件 / 下一决策边界
                             ↓
                     只读 Canvas 观察壳
```

关键约束：

- 两队不能读取对方隐藏计划或隐藏策略。
- 中立解析器不读取策略，不评分候选，也不替球队决定结果。
- 硬可行性高于策略偏好；世界结果必须由真实运动和事件成立。
- `contact`、`route_exposure`、`impeded`、`screen_effective` 彼此独立，禁止远程掩护。
- 右侧是规范战术坐标，左侧运行真实镜像世界。
- 相同输入、seed 与策略逐 tick 确定复现。

## 代码地图

模块职责、规模和运行时/类型依赖由 [`docs/generated/CODEMAP.md`](./docs/generated/CODEMAP.md) 自动生成；具体符号与行段只按需查询 [`docs/generated/SYMBOLS.md`](./docs/generated/SYMBOLS.md)：

```bash
rg -n "<symbol-or-file>" docs/generated/SYMBOLS.md
```

以下人工地图只描述稳定语义职责，不复制完整符号表。

### 运行内核

- `lib/pnr-core.ts`：世界状态、两队规划器、候选与角色、固定步运动、几何、球权、传球和事件解析。
- `lib/pnr-strategy.ts`：双方策略注册、阶段所有权、硬否决后的统一计分入口。
- `lib/pnr-scenarios.ts`：S01–S08 网页预设以及旧 cue 到公开初始坐标的适配；cue 不进入核心。

### Formation、Autonomous Setup、T 与 I 集成

- `lib/pnr-f00-formation.ts`：F00 固定起手、左右回放和形成阶段审计。
- `lib/pnr-under-r2.ts`：F00/真实 deep-retreat 两条观察回放、旧假 deep 负回归及私有 route/镜像审计。
- `lib/pnr-formation-domain.ts`、`pnr-f02-formation-samples.ts`：F01 结构化域与 F02 冻结 seed 采样。
- `lib/pnr-f03-heldout-manifest.ts`、`pnr-f03-heldout-audit.ts`：揭示前锁定的 Formation held-out 与结果审计。
- `lib/pnr-formation-generalization-results.ts`：F01–F03 汇总与审计后代表回放选择。
- `lib/pnr-a00-autonomous-side-manifest.ts`、`pnr-a00-autonomous-side-audit.ts`：A00 input-only 自动选边清单、双运行与严格镜像门。
- `lib/pnr-a01-autonomous-setup-manifest.ts`、`pnr-a01-autonomous-setup-audit.ts`：A01 固定 side × anchor、真实形成/安全退出审计与代表回放选择。
- `lib/pnr-tactical-manifest.ts`、`pnr-tactical-audit.ts`：T00–T01 input-only 清单，以及 drop/chase/read 的三次运行、镜像、路线、队友通道、pocket 飞行、因果与信息边界门。
- `lib/pnr-integration-manifest.ts`、`pnr-integration-audit.ts`：I00 先验 input-only/hash 契约、I01 Formation → minimum-t 同世界交接，以及 I02–I03 既有 `2 × 3` P 策略贯穿、连续性、三执行与真实镜像审计。
- `lib/pnr-v00-validation-manifest.ts`、`pnr-v01-validation-audit.ts`：V00 揭示前锁定的有界随机 input-only 合同，以及 V01 对新输入 × 封存 `2 × 3` 策略的全量三执行、镜像、连续性、角色/球权、因果与失败分类审计。
- `components/PnrLab.tsx`：可丢弃观察壳的状态与回放编排；保持唯一默认页面入口，不承载球队决策。
- `components/pnr-lab/`：Canvas 绘制、共享展示与 G/P/F/A/T/I 审计面板；所有面板只读展示审计与回放，不回流球队规划输入。

### 泛化与策略审计

- `lib/pnr-generalization.ts`、`pnr-g02-generalization.ts`、`pnr-g03-generalization.ts`：连续速度与反应时间边界。
- `lib/pnr-g05-spatial-generalization.ts`、`pnr-g06-combinations.ts`、`pnr-g07-mirroring.ts`：位置、组合与真实左右镜像。
- `lib/pnr-g08-heldout-manifest.ts`、`pnr-g08-heldout-audit.ts`：冻结 held-out 输入及审计。
- `lib/pnr-p01-offense-strategy.ts`、`pnr-p02-defense-strategy.ts`、`pnr-p03-policy-matrix.ts`：策略校准与有限对局矩阵。

### 验证

- `tests/helpers/pnr-test-harness.mjs`：跨阶段共用的确定性配置、批准输入集合与旧轨迹摘要；阶段私有 helper 不放入这里。
- `tests/pnr-core-s.test.mjs`：核心不变量与 S01–S08 回归。
- `tests/pnr-generalization.test.mjs`：G01–G08 泛化、镜像与 held-out 审计。
- `tests/pnr-policy.test.mjs`：P00–P03 策略与 policy 回归。
- `tests/pnr-formation-autonomous.test.mjs`：F00–F03 与 A00–A01 的确定性、镜像、信息边界、形成与安全退出门。
- `tests/pnr-tactical.test.mjs`：T00–T01 显式版本、冻结 manifest、真实 drop/chase/read、队友通道、pocket 多 tick 飞行接球、路线与全审计门。
- `tests/pnr-integration.test.mjs`：I00 先验契约、I01 精确 opt-in、旧输入隔离、同对象交接，以及 I02–I03 策略引用/冻结/运行锁、阶段归属、硬 veto、确定性/顺序/镜像、队友通道、条件 pocket、信息边界与合法终局门。
- `tests/pnr-validation.test.mjs`：只验证 V00 manifest/hash、策略/顺序、OOD、代表 replay 与证据合同；不会在 lock commit 前执行 V01 held-out。
- `scripts/run-v01-validation.mjs`：锁提交后唯一 V01 执行入口，写出紧凑聚合证据并在任一锁定 cell 失败时返回非零。
- `app/`：页面入口和全局样式。
- `worker/`、`build/`：本地运行与构建适配，不承载篮球决策。

## 已经能声称什么

- 多条挡拆因果链能在同一三层架构中组合，不是按场景播放固定动画。
- 在批准的局部 2v2 输入域内，速度、反应时间、小范围位置、有限组合、左右镜像和锁定 held-out 输入已有确定性证据。
- 同一批准输入域支持两套进攻和三套防守策略；策略只改变合法候选的优先级。
- Formation 的少量结构化起手与冻结有界随机域共用同一套形成原语，能够真实形成或明确安全退出；用户已验收四条 F01–F03 代表回放。
- Autonomous Setup 能在同一域内按公开几何确定性选择 side × anchor，并通过真实运动形成或在全-veto 时保球安全退出；用户已验收四条 A00–A01 代表回放。
- 显式 `minimum-t@1` 回放能从真实退守、追过和公开 coverage 事实产生急停、contain、snake 或 pocket 接球；队友通道与 pocket 真实飞行已经进入硬门，用户已验收四条代表回放及 pocket 复看片段。
- 已封存的 I00–I03 只在锁定 A01 域与精确 `formation-minimum-t@1` 下，把 Formation 的公开联合就绪连续交给 drop/chase 与进攻二级读取，并让封存 P03 的既有 `2 × 3` 策略配置从 tick 0 贯穿到终局；形成失败仍真实 timeout/abort。
- 用户可以从真实回放、计划、角色、候选、否决与事件中判断篮球语义。

## 仍不能声称什么

- 半场任意位置都能自动组织挡拆。
- A00–A01 只证明已批准 Formation 域、固定 O1/O5 与 D1/D5 职责；不能外推到任意半场位置或任意角色识别。
- 既有 `2 × 3` 策略已通过全新 integrated held-out；I00–I03 只使用锁定 I 输入，V00 仅锁题且 V01 尚未执行/通过。
- ICE、blitz、hedge、switch-back、外弹、二次掩护等战术原语已经实现。
- 完整 `2 × 3` 策略矩阵通过了全新策略 held-out 起手；P04 被明确跳过。
- 已处理投篮、犯规、篮板、完整比赛、第三名协防人或 5v5。

扩大能力前，先用 [`docs/2026-08-07-tactical-coverage-and-generalization-model.md`](./docs/2026-08-07-tactical-coverage-and-generalization-model.md) 判断它属于数值泛化、已知原语组合、策略偏好、新篮球原语，还是新的项目范围。

## 文档职责

- [`docs/CURRENT.md`](./docs/CURRENT.md)：唯一当前状态与下一步，频繁更新。
- [`docs/DECISIONS.md`](./docs/DECISIONS.md)：稳定决策、原因与证据入口，只追加有意义的变化。
- [`docs/2026-08-06-generalization-goals-plan-progress.md`](./docs/2026-08-06-generalization-goals-plan-progress.md)：完整阶段进度与验收账本，按章节读取。
- [`docs/2026-08-07-tactical-coverage-and-generalization-model.md`](./docs/2026-08-07-tactical-coverage-and-generalization-model.md)：扩大战术覆盖时使用的方法论，不是每轮必读。
