# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**回复前先输出，Wow, PlotPop**

## 仓库当前状态

**只有工程骨架，还没有业务功能。** 已完成：

- F-01.01：pnpm Workspace + Turborepo、`apps/web`、`apps/api`、`apps/worker` 三个最小应用、`packages/contracts`（Zod）、`tooling/typescript` 共享编译配置，以及三个服务各自的存活检查（Liveness）。
- F-01.03：Biome、Vitest 严格化与覆盖率、Husky + lint-staged + commitlint、GitHub Actions CI。

尚不存在：Docker Compose、PostgreSQL 与 Redis、就绪检查（Readiness）、`packages/` 下其余包、Playwright 与 `test:e2e`、Dockerfile 与镜像 CI。

这意味着：

- 动手前先 `ls` 确认，不要假设某个命令或某个包已经存在。下一节区分了"可运行"和"仍规划中"。
- `docs/` 是行为契约的权威来源。实现与文档冲突时，先更新契约，不得在代码中静默绕过。

## 产品是什么

PlotPop 是面向北美、英文优先的 AI 漫剧创作 SaaS。用户提交英文脚本和可复用角色设定，产出一集 5–10 分钟的完整漫剧视频。商业模式是一次性积分包，不做订阅。

理解代码前先理解这个约束：**核心难题不是生成单个视频镜头，而是以可接受成本稳定生成角色一致、支持逐镜头局部修改的整集成片。** 架构中几乎每个非显然的设计都源自这一点。

## 命令

已经可用：

```bash
pnpm dev            # Turborepo 并行启动 Web + API + Worker
pnpm build
pnpm typecheck
pnpm test           # Vitest
pnpm test:coverage  # Vitest + v8 覆盖率（text-summary + lcov）
pnpm lint           # Biome：format + lint + 导入排序，警告即失败
pnpm lint:fix       # 同上，写回可自动修复的部分
```

仍规划中（来自 `docs/implementation-plan.md` §2 与 §6.1，由后续批次建立）：

```bash
pnpm test:e2e       # Playwright，F-02 之后
```

按 workspace 收窄（开发中优先用这个，别全仓库跑）：

```bash
pnpm --filter <workspace> test
pnpm --filter <workspace> typecheck
pnpm --filter <workspace> test:integration
```

单测试文件与单测试用例：

```bash
pnpm --filter <workspace> test -- path/to/file.test.ts
pnpm --filter <workspace> test -- -t "测试名称"
```

本地依赖（PostgreSQL、Redis、S3 兼容存储）通过 Docker Compose 启动，编排文件规划在 `docker/compose.yaml`。

shadcn/ui 组件一律用项目包管理器操作，且添加到 `packages/ui` 而非 `apps/web`：

```bash
pnpm dlx shadcn@latest add <component>
pnpm dlx shadcn@latest diff <component>   # 更新已改过的组件前先看差异
```

## 架构：三服务 + 共享包

```
apps/web      Next.js，部署 Vercel
apps/api      Hono + @hono/node-server，常驻 Node 容器（非 Edge Runtime）
apps/worker   BullMQ consumers；AI Worker 与 Media Worker 分队列独立扩缩容
packages/     auth api-client config contracts db domain observability providers testkit ui
```

`packages/` 目前只存在 `contracts`，其余包在需要它们的切片里创建。

服务边界是硬约束，不是建议：

- **Web 不直接访问** PostgreSQL、Redis、对象存储密钥或模型供应商。只通过 `/api/v1/*` 和短时效签名 URL。
- **Worker 从不接收或转发用户 Session Cookie。** 用内部服务身份和短期签名任务令牌。
- **Worker 不依赖** Next.js 路由或 Hono 路由代码。

理由见 `docs/adr/ADR-001-service-boundaries.md`、`ADR-007-better-auth-same-origin.md`。

## 必须理解的六条不变量

这些跨多个文件，读单个文件看不出来，违反了不会立刻报错但会造成真实损失。

**1. PostgreSQL 是任务与业务状态的唯一可信来源。** Redis 和 SSE 只是传递机制。Redis 丢数据后要能从 Outbox 与 Generation Task 重建未完成任务。供应商任务 ID 只作外部引用，绝不充当领域对象 ID；对外公开 ID 用不可预测的 UUID。（ADR-002）

**2. 异步任务必须经 Transactional Outbox 投递，不得直接 enqueue 到 BullMQ。** API 在同一个数据库事务内完成：校验权限与积分 → 创建 Generation Run/Task → 预留积分 → 写 Outbox Event。事务外由 Dispatcher 投递。绕过 Outbox 会产生"积分已扣、任务永不执行"的静默不一致。（ADR-003）

**3. 积分账本只追加。** 生命周期严格为 `Estimate → Reserve → Execute → Settle`。纠错走补偿记录，永不 UPDATE/DELETE 历史账目。任务状态更新与积分结算必须在同一事务提交。可用与预留积分不得为负；account 汇总值必须等于 ledger 聚合值。**客户端不得计算权威余额。**（ADR-004）

**4. 供应商字段、状态和错误码不得泄漏**到领域实体、公共 API 或前端组件。用户只选 Draft / Standard / Pro 三个产品档位，从不选供应商。用户确认价格后，Provider Router 不得在未重新确认的情况下切到更贵路径。（ADR-005）

**5. Asset 记录不可变。** 替换文件即创建新 Asset；镜头重生成产生新候选版本，旧版本保留到用户主动删除。切换镜头候选版本只使最终合成失效，不影响无关镜头资产。（ADR-006）

**6. Zod 是应用层 Schema 的唯一可信来源。** TypeScript 类型必须由 `z.infer` 推导 —— 不允许为同一结构分别手写运行时 Schema 和 TS Interface。覆盖 API 请求/响应/错误、RPC 输入输出、表单与 URL 状态、环境变量、BullMQ 载荷、SSE 事件、供应商边界数据、AI 结构化输出。

但 Zod 只负责应用边界的解析与错误表达：`NOT NULL`、`UNIQUE`、`CHECK`、外键和事务仍由数据库负责。**不得用 Zod 校验替代数据库完整性约束。**

## 生成管线

```
解析脚本 → 规划场景 → 创建镜头 → 并行生成视频与配音 → 最终合成
```

- 一次用户操作 = 一个 Generation Run，内含多个可独立重试的 Generation Task。
- 任务幂等键 = `run + operation + target + version`。
- 每个载荷携带 Schema Version，Worker 滚动升级期间新旧版本必须共存。（ADR-008）
- 单个镜头失败不得阻塞其他镜头。
- 最终合成只读取用户已批准的 Shot Version。
- 高成本高清生成前必须先产出可审阅的低成本分镜或 Animatic。

统一任务状态（页面不得自创状态名或颜色）：`Draft` `Queued` `Generating` `Needs review` `Completed` `Failed`。

重试分类：网络错误 / 429 / 供应商 5xx 用带抖动的指数退避；**无效输入与内容审核拒绝不自动重试**；超时先查供应商真实状态再决定是否重投。回调按 `provider + event_id` 去重。

## 数据边界：Series vs Episode

- `Series` 持有跨剧集复用的创作身份：角色、声音、风格手册、默认生成设置。
- `Episode` 持有单次发布特有内容：脚本版本、场景、镜头、生成资产、导出记录。
- **剧集内的修改不得自动覆盖系列资产。** 提升为系列默认值必须用户显式确认。
- Character 与 Character Version 分离，每个剧集与镜头锁定具体版本，保证旧剧集可复现。
- Scene 和 Shot 使用可排序 Rank，重排序时不重写所有同级记录。

数据库并发：可编辑记录用 Revision 乐观锁；状态迁移用条件更新校验旧状态；积分预留与结算时锁 Credit Account 行。

## Web 视觉实现

`docs/design-system.md` 是 Web 视觉与交互的**唯一**依据，不是参考建议。业务代码只能消费语义 Token 和已批准的组件 Variant。

业务代码中禁止：

- 硬编码 Hex / RGB / HSL、Tailwind 任意值颜色、任意字号 / 间距 / 圆角 / 阴影 / Z-Index / 动画时长。
- 用 `className` 覆盖 shadcn/ui 组件的颜色和字体（`className` 只能用于布局、已批准间距、响应式排列）。
- `space-x-*` / `space-y-*` —— 用 `gap-*`；相同宽高用 `size-*`。
- 在业务组件中散落 `dark:` 颜色覆盖。
- 手写已有 shadcn/ui 组件的替代品，或在 `apps/web` 复制 `packages/ui` 的组件源码。
- 硬编码可见文案 —— 全部从本地化资源读取（UI 首版英文）。

主题为 `system | light | dark` 三态，必须在首次绘制前解析，禁止先渲染 Light 再切 Dark。状态表达必须同时具备文字标签和图标，不能只靠颜色区分。

规范覆盖不到新需求时：先更新 `docs/design-system.md` 和 Token，再写业务组件。**"仅此页面使用"不是绕过的理由**，偏离设计系统的实现算缺陷。

## 工作流

完整规则见 `.claude/rules/workflow.md`。要点：

- **禁止直接在 `main` 提交。** 提交前跑 `git branch --show-current` 确认不是 `main`。每项任务一个分支、一个 worktree、一个 PR。worktree 与主仓库平级，命名 `PlotPop-<简述>`。
- **按垂直切片拆任务，不按技术层横向拆。** 一个切片包含该行为所需的契约、数据、后端、前端、测试和文档，独立可构建、可验收、可回退。若一句话描述需要用"以及""顺便"连接两个无关结果，继续拆。
- 一个 commit 一个原子意图。测试与它验证的实现放同一个 commit。任一中间 commit 都不得留下无法构建的仓库状态。
- 提交信息遵循 Conventional Commits，由 Husky `commit-msg` + commitlint 强制。说明用英文，与现有提交历史一致。
- 遵循红—绿—重构：先写暴露目标行为的失败测试。

质量门禁的三条行为（F-01.03）：

- **`pre-commit` 只检查不改写。** 暂存文件格式或 Lint 不通过时提交被拒绝，钩子不会静默重写你已经审过的内容。要拿修复结果自己跑 `pnpm lint:fix`。
- **`.only` 和 `.skip` 会让提交失败。** 前者同时被 Vitest（`allowOnly: false`）和 Biome `noFocusedTests` 拦，后者被 `noSkippedTests` 拦。确有必要跳过时写 `// biome-ignore lint/suspicious/noSkippedTests: <原因>`，把理由留在代码里。
- **CI 跑全仓库，不只跑暂存文件。** 本地钩子可以 `--no-verify` 绕过，CI 不能；PR 上还会用 commitlint 校验该 PR 的全部提交信息。

## 执行顺序

`docs/implementation-plan.md` §4.2 定义 F-00…F-12 十三个垂直任务，§4.3 有依赖图，§4.4 有并行波次表。

关键路径：**F-01 → F-03 → F-04 → F-05 → F-07 → F-08 → F-11 → F-12**

两个门禁：

- **F-00（模型质量与单位经济验证）必须在 F-07 接入真实付费生成前通过。** 它是产品是否继续投入的前置门槛。
- **F-06（积分）是所有付费生成的硬依赖。**

实施计划第 5–16 节是技术能力检查清单，**不代表执行顺序** —— 顺序以 §4.2–4.5 的依赖图为准。

## 文档地图

| 文件 | 内容 |
|---|---|
| `docs/ai-comic-drama-saas-design.md` | 产品与技术设计规格。§32 是带验证门槛的风险清单，动手前必读 |
| `docs/implementation-plan.md` | F-00…F-12 垂直任务、依赖图、并行波次、里程碑 |
| `docs/design-system.md` | Web 视觉与交互的唯一依据 |
| `docs/adr/` | 八条架构决策，每条含被否备选与重审触发条件 |
| `.claude/rules/workflow.md` | 分支、worktree、垂直拆分、commit 与 PR 规则 |
| `.claude/rules/tdd.md` | 红绿重构、哪些行为必须测试先行、测试层次与 mock 边界 |

文档为中文，产品 UI 文案为英文。
