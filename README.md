# 2v2 挡拆算法最小闭环

这是一个独立、确定性、可观看且可解释的 2v2 挡拆算法实验台。它不是预录轨迹：两支球队分别产生队级计划，中立世界以固定时间步解析运动、身体几何、球权、传球和事件。

当前稳定检查点已经覆盖 S01–S08 战术证人、G01–G08 受限域泛化、P00–P03 的两套进攻策略 × 三套防守策略，以及已验收并封存的 Formation F00–F03：固定起手、结构化起手、有界 seed 随机与冻结 held-out。下一批准增量是 A00–A01，在同一受限 Formation 域内自动选择掩护侧与合法 anchor，并在不可形成时安全退出。实时状态见 [`docs/CURRENT.md`](./docs/CURRENT.md)。

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
npm test
npm run lint
npm run build
```

`npm run check` 运行测试与构建，但不能替代单独的 lint。

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

### 运行内核

- `lib/pnr-core.ts`：世界状态、两队规划器、候选与角色、固定步运动、几何、球权、传球和事件解析。
- `lib/pnr-strategy.ts`：双方策略注册、阶段所有权、硬否决后的统一计分入口。
- `lib/pnr-scenarios.ts`：S01–S08 网页预设以及旧 cue 到公开初始坐标的适配；cue 不进入核心。

### Formation 与当前 Autonomous Setup 增量

- `lib/pnr-f00-formation.ts`：F00 固定起手、左右回放和形成阶段审计。
- `lib/pnr-under-r2.ts`：F00/真实 deep-retreat 两条观察回放、旧假 deep 负回归及私有 route/镜像审计。
- `lib/pnr-formation-domain.ts`、`pnr-f02-formation-samples.ts`：F01 结构化域与 F02 冻结 seed 采样。
- `lib/pnr-f03-heldout-manifest.ts`、`pnr-f03-heldout-audit.ts`：揭示前锁定的 Formation held-out 与结果审计。
- `lib/pnr-formation-generalization-results.ts`：F01–F03 汇总与审计后代表回放选择。
- `components/PnrLab.tsx`：可丢弃的 Canvas 观察入口；可以展示全量调试信息，但不得控制球队决策。

### 泛化与策略审计

- `lib/pnr-generalization.ts`、`pnr-g02-generalization.ts`、`pnr-g03-generalization.ts`：连续速度与反应时间边界。
- `lib/pnr-g05-spatial-generalization.ts`、`pnr-g06-combinations.ts`、`pnr-g07-mirroring.ts`：位置、组合与真实左右镜像。
- `lib/pnr-g08-heldout-manifest.ts`、`pnr-g08-heldout-audit.ts`：冻结 held-out 输入及审计。
- `lib/pnr-p01-offense-strategy.ts`、`pnr-p02-defense-strategy.ts`、`pnr-p03-policy-matrix.ts`：策略校准与有限对局矩阵。

### 验证

- `tests/pnr-core.test.mjs`：核心不变量、S/G/P 回归，以及 F00–F03 路径、真实性、冻结输入与信息边界门。
- `app/`：页面入口和全局样式。
- `worker/`、`build/`：本地运行与构建适配，不承载篮球决策。

## 已经能声称什么

- 多条挡拆因果链能在同一三层架构中组合，不是按场景播放固定动画。
- 在批准的局部 2v2 输入域内，速度、反应时间、小范围位置、有限组合、左右镜像和锁定 held-out 输入已有确定性证据。
- 同一批准输入域支持两套进攻和三套防守策略；策略只改变合法候选的优先级。
- Formation 的少量结构化起手与冻结有界随机域共用同一套形成原语，能够真实形成或明确安全退出；用户已验收四条 F01–F03 代表回放。
- 用户可以从真实回放、计划、角色、候选、否决与事件中判断篮球语义。

## 仍不能声称什么

- 半场任意位置都能自动组织挡拆。
- 系统已经能从未指定 side/anchor 的起手自动选择掩护侧和落点；这是当前 A00–A01 的待验收目标。
- 真正的沉退、追过、ICE、夹击、外弹、二次掩护等未实现原语已经存在。
- 完整 `2 × 3` 策略矩阵通过了全新策略 held-out 起手；P04 被明确跳过。
- 已处理投篮、犯规、篮板、完整比赛、第三名协防人或 5v5。

扩大能力前，先用 [`docs/2026-08-07-tactical-coverage-and-generalization-model.md`](./docs/2026-08-07-tactical-coverage-and-generalization-model.md) 判断它属于数值泛化、已知原语组合、策略偏好、新篮球原语，还是新的项目范围。

## 文档职责

- [`docs/CURRENT.md`](./docs/CURRENT.md)：唯一当前状态与下一步，频繁更新。
- [`docs/DECISIONS.md`](./docs/DECISIONS.md)：稳定决策、原因与证据入口，只追加有意义的变化。
- [`docs/2026-08-06-generalization-goals-plan-progress.md`](./docs/2026-08-06-generalization-goals-plan-progress.md)：完整阶段进度与验收账本，按章节读取。
- [`docs/2026-08-07-tactical-coverage-and-generalization-model.md`](./docs/2026-08-07-tactical-coverage-and-generalization-model.md)：扩大战术覆盖时使用的方法论，不是每轮必读。
