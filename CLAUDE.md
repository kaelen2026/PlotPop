# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**回复前先输出，Wow, PlotPop**

## 仓库当前状态

**F-01 与 F-02 已完成，F-03 与 F-04 进行中。真实业务链路已经通了：系列与角色从浏览器经 API 读写 PostgreSQL，其余页面仍是占位数据。**

F-01 已全部完成：

- F-01.01：pnpm Workspace + Turborepo、`apps/web`、`apps/api`、`apps/worker` 三个最小应用、`packages/contracts`（Zod）、`tooling/typescript` 共享编译配置，以及三个服务各自的存活检查（Liveness）。
- F-01.02：`packages/config` 用 Zod 在启动时解析各服务环境变量，缺凭据直接启动失败。
- F-01.03：Biome、Vitest 严格化与覆盖率、Husky + lint-staged + commitlint、GitHub Actions CI。
- F-01.04：API 与 Worker 多阶段镜像（非 Root）、Docker Compose 本地依赖（PostgreSQL + Redis + MinIO）、依赖就绪检查（Readiness），以及构建镜像并做启动健康验证的 CI 任务。

**F-02 已收尾。** 两项移交 F-11：镜头检查器的编辑表单与小屏审阅批准布局 —— 它们要操作的字段契约属 F-04 / F-05，动作语义依赖 ADR-003 / ADR-004 / ADR-006，在那之前只能对着占位数据做一套需要重写的表单。理由与移交记录见 `docs/implementation-plan.md` §4.5。

- F-02.01：`packages/ui` 从零创建，`docs/design-system.md` 的三层 Token 落进 `src/styles/theme.css`（Tailwind v4 CSS-first，无 `tailwind.config`）；Outfit / Inter / JetBrains Mono 经 `next/font` 自托管并预加载；主题在首次绘制前由 `<head>` 内联脚本解析成 `data-theme`，`data-theme-preference` 单独记录 `system | light | dark`。两个门禁随之建立：`packages/ui/src/styles/theme.test.ts` 解析 `theme.css` 并逐对验证 94 组 WCAG 2.2 AA 对比度，`apps/web/design-system.test.ts` 扫描业务源码里的视觉硬编码。
- F-02.02：`system | light | dark` 切换器。shadcn/ui 接入 `packages/ui`（`components.json`、`cn()`、`toggle`/`toggle-group`/`skeleton`），Vitest + Testing Library 组件测试，以及 `apps/web/locales/en.ts` 本地化骨架。切换写 `localStorage` 并即时改根属性，不刷新页面；选 `system` 时持续跟随操作系统。
- F-02.03：Creator Home 空状态。`apps/web/components/app-shell.tsx` 是登录后页面的外壳（Skip 链接 + Header + `container-app`），`/home` 是空状态（`empty`、`button`），`/` 是通向它的临时落地页。路由集中在 `apps/web/lib/routes.ts`。
- F-02.04：剧集列表与统一状态表达。`generationStatusSchema` 进 `packages/contracts`，`GenerationStatusBadge` 进 `packages/ui`（Badge 补了 `success`/`warning`/`info` 三个语义 Variant）。Creator Home 现在按 `episodes` 长度在列表与空状态之间切换，数据来自 `apps/web/lib/prototype-episodes.ts`（占位，接 API 时删掉）。
- F-02.05：五步创作向导。`/episodes/new` 出现，Creator Home 的入口不再悬空。脚本步骤有真实表单与 Zod 校验（`episodeDraftInputSchema` 在 `packages/contracts`），其余四步可走通但只展示该步要做什么，表单随后续切片补齐。新增注册表组件：`field`、`input`、`textarea`、`label`、`separator`、`alert`。
- F-02.06：Episode Studio 三栏工作台。`/episodes/[id]` 出现，剧集列表的标题成为进入它的链接。§8.4 的三栏宽度实现为 `studio-grid` utility（业务代码不写任意值），Scene Navigator 可浏览场景与镜头并选中镜头，Preview 与 Inspector 作为稳定区域存在但内容随后续切片补齐。无障碍门禁扩展到全部四个页面，视觉基线新增 Studio 的 Light/Dark × 两个层级。
- F-02.07：生成前的积分预估与确认（§12.5）。`creditEstimateSchema` 进 `packages/contracts`，含 `coversEstimate`（按**上界**判断，不是下界）与 `requiresReconfirmation`。`CreditCost` 组件进 `packages/ui`，动画步骤用它，余额不足时按钮直接禁用。
- F-02.08：Studio 时间线。§13 的四个 Component Token（Track / Clip / Selection / Playhead）落进 `theme.css` 并纳入对比度验证；时间线按时长比例排布镜头，Medium 以下不渲染（§8.4）。当前镜头的选中表达统一为 accent 边界（§6.2），场景导航区同步改过来。

**F-03 进行中（最窄端到端 happy path 已完成）：**

- `packages/db` 从零创建：Postgres 客户端与仓库第一个迁移运行器。迁移是纯 SQL，命名 `<四位版本>_<lower_snake_case>.sql`，按版本升序应用，应用后记校验和且**不得再改**；账本键是 `(source, version)`，多个 source 按声明顺序应用 —— ADR-007 要求 Better Auth 表与业务表分属不同迁移边界。顺序在 `apps/api/src/migrations.ts` 声明（只有它同时看得见两个包）。
- `packages/auth` 从零创建：Better Auth 实例、drizzle Schema 与自己的迁移。挂在 `apps/api` 的 `/api/auth/*`，转发原始 Request。API 只依赖窄接口 `AuthService`，不让 Better Auth 的推导类型进入 RPC 客户端预计算的类型树。
- 邮箱密码注册与登录；注册后幂等创建 Workspace、Owner 成员与空 Credit Account（同事务）。幂等由 `workspace (owner_user_id) where is_personal` 的部分唯一索引保证。**积分账本逻辑属 F-06，这里只有余额的 `CHECK (>= 0)`。**
- Session 中间件与 Workspace 隔离：`/api/v1/workspaces`、`/current`、`/:workspaceId`。归属条件写在查询里（`listWorkspacesForUser`、`findWorkspaceForMember`），别人的 Workspace 一律 404 而非 403。
- Web `/sign-in`、`/sign-up`，以及 `next.config.ts` 里 `/api/*` 的同源 Rewrite（ADR-007）。表单用 `packages/contracts` 的同一组 Zod Schema 校验。

**F-03 尚未做**：邮箱验证邮件与账户恢复、社交登录、账户级主题偏好与跨设备同步（`docs/design-system.md` §5.1）、Creator Home 页面、`/api/v1/workspaces` 自身的写操作。跨 Workspace **写**拒绝现在有端到端测试了 —— 由 F-04.01 的 `POST .../series` 覆盖。

**F-04 进行中：**

- F-04.05：给角色上传参考图。浏览器经短时效签名 URL **直传对象存储**（§26），所以一次请求预留存储键并签发写权限，第二次确认真的到了什么。中间没有任何一步被信任：签名把声明的类型与字节数**签进去**（`content-length` 脚本不能设，浏览器填真实体积，于是签名等于把请求体钉死在那个长度），确认时读回字节验魔数 + 长度 + SHA-256 才让 Asset 变成 `ready`。
  - 迁移 `0004_asset.sql` 与 `0005_character_version_asset.sql`。**Asset 的「不可变」指文件不指行**：行先于字节存在（不然没人给对象命名），`pending → ready` 是 §20.6 的条件状态迁移；永不变的是 `storage_key` 与 `checksum_sha256`。`declared_*` 与不带前缀的两列刻意分开 —— 「客户端说是 png」和「我们读出是 png」不是同一件事。`asset_ready_is_verified` 让「ready 但没验过」在数据库层不可表达。
  - **§26 把检查交给 Media Worker，这一版由 API 同步做完整性那一半**，理由与分工写在新增的 §26.1：交给 Worker 必须经 Outbox（ADR-003），而 Outbox 属 F-05。媒体参数与安全扫描等队列落地后搬走。读取是流式的（范围读前 16 字节嗅探 + 流式哈希），峰值内存是哈希状态而不是文件。
  - 参考图挂在**版本**上：换一张更好的照片不得改写已经用旧版本出过片的剧集（§32.7）。因此顺序被数据形状锁死 —— 先上传确认 Asset，再追加引用它的版本。每个 pin 都在写版本的同一事务里校验归属与 `ready`，不可用的 id 让整个写入回滚（连角色一起），否则创作者会拿到一个「图被静默丢掉」的角色且无从察觉。答案统一是 404。
  - `character_version_asset.asset_id` **不级联删除**。代价是删 workspace 必须先清 pin —— 测试清理已经这么做，将来的 workspace 删除切片也必须。响亮地失败胜过悄悄留下孤儿。
  - 签名下载 URL 直接进角色载荷（签名是本地 HMAC，十个角色不该多十次往返），存储键止步于 API。
  - `STORAGE_PUBLIC_ENDPOINT` 是 API 独有且**必填**：SigV4 把 host 签进签名，回退到 `STORAGE_ENDPOINT` 会签出浏览器解析不了的地址 —— 把一个缺配置变成所有人上传失败，而不是运维一次启动失败。
  - Web：`apps/web/lib/asset-upload.ts` 是三步上传，`character-row.tsx` 的编辑表单加文件选择与权利确认勾选（§195 / §733，未勾选时选择器禁用，所以不存在「先发再校验」）。**新版本的图是全量声明而不是增量**，所以表单必须把已有的图带上 —— 漏掉就是静默丢数据，`character-row.test.tsx` 有一条专门钉它。刚上传的图用本地 object URL 预览（确认接口返回的是 Asset 记录，不是读回它的权限）。新增注册表组件 `checkbox`（三处偏离写在文件头注释里）。签名 URL 用原生 `<img>` 而不是 `next/image` —— 优化器会缓存一份比读取权限活得更久的副本。
  - `apps/web/vitest.setup.ts` 多了两个 jsdom 补丁：`ResizeObserver`（Radix 的 checkbox 会量自己）与 `URL.createObjectURL`（预览用）。两者都是桩而不是实现 —— 没有断言依赖测量值。
  - `apps/web/locales/en.test.ts` 现在也看得进函数型文案：`referenceImages.alt` 是本项目第一处插值文案，而一个读不到值的模板会在句子中间渲染出 `undefined`，那正是这个门禁存在的目的。
  - **`e2e/characters.spec.ts` 是唯一打真实 MinIO 的地方。** 其余层按 `.claude/rules/tdd.md` §6 用内存 `ObjectStore`（对象存储是被 mock 的边界）。只有浏览器能证明纯配置的那部分：API 为浏览器可达的 origin 签名、MinIO 接受带签名长度与类型的跨源 PUT、载荷里回来的签名 GET 真的能取到字节。这几环都不会在单元测试里错。
  - **尚未做**：创建角色的表单没有上传入口（先用文字建角色，再编辑加图）；孤立对象的 Reconciler 与保留周期仍未做（ADR-006 已记）。

- F-04.04：改角色外观 → 追加新版本，旧版本保留可读。因为版本是追加的，接口是 `POST .../characters/:characterId/versions` 而不是 PATCH —— 用版本 2 出过片的剧集必须永远还能找到版本 2（§32.7），所以**没有任何写入会改已有的版本行**。
  - 事务里**先做身份行的条件更新**（`revision` 匹配则 +1），它拿到行锁，所以第二个写入者会等、然后发现 revision 变了并得到 `stale`，而不是去追加第二个「版本 2」。`unique (character_id, version)` 是这条保证背后的兜底，不是机制本身。
  - 版本号在事务内取 `max(version) + 1`。
  - 角色行成为客户端组件 `character-row.tsx`：编辑外观、以及**按需**读取历史版本（一个角色会积累版本，十个角色的首屏不该把它们全带上）。冲突处理与系列重命名一致 —— 提示 + 保留已打的字 + 一个刷新按钮，不背着人重读。
  - 历史列表把当前版本滤掉：它已经在上面了，重复一遍什么也没说明。只有一个版本时给一句话，而不是给一个只有一项的列表。

- F-04.03：系列里的角色。迁移 `0003_character.sql` 建 `character` 与 `character_version` 两张表 —— §32.7 要求身份与外观分离：改进一个角色的长相**不得**重写已经用它出片的剧集，所以剧集与镜头锁的是版本。创建角色时**同一事务里写身份与第一个版本**，没有版本的角色生成不出任何东西，是一行看起来像进展的空记录。
  - 「当前版本」定义为该角色最大的 version 号，没有指针列可以走神；列表用相关子查询在 JOIN 里选出它，十个角色不会读一百行。`character_version (character_id, version)` 唯一约束保证「版本 2」只有一个含义。
  - 归属现在有两层：`/api/v1/workspaces/:workspaceId/series/:seriesId/characters`。两层条件都在查询里 —— 「自己的 workspace + 别人的 series」这种配对不能靠前一半通过（API 与仓库两层都有针对它的测试）。
  - Web `/series/[seriesId]` 出现，剧集列表行的标题成为进入它的链接。无障碍门禁的页面清单现在支持「先建出数据再审」的条目（`e2e/support/library.ts`）。

- F-04.02：系列重命名与 Revision 乐观锁。`seriesRenameInputSchema`（名字 + **必填** revision）进 `packages/contracts`；`renameSeries` 是条件更新 —— 成员身份、workspace 与 revision 全在 `where` 里，陈旧或越权的写匹配不到行，而不是先写后报。三个结果 `renamed | stale | missing` 对应 200 / 409 / 404：`stale` 说「重新读一遍」，别人的系列一律 `missing`，陌生人不会被告知自己猜错了 revision。
  - `apiErrorActionSchema` 新增 `reload`。revision 冲突用 `retry` 是错的 —— 同一个请求体带着同一个陈旧 revision，重试必然同样失败。
  - 列表行变成客户端组件 `series-row.tsx`（重命名是交互，外面的列表仍是服务端读）。冲突时**不自动刷新**：背着人重读会把刚打的字冲掉，所以刷新是一个按钮而不是一个副作用。
  - `series.name` 的 label 与两条错误文案在本地化资源里只有一份，创建与重命名共用 —— 两份「太长了」就是对同一个问题的两个答案。

- F-04.01：系列的创建与列表。`seriesSchema` / `seriesListSchema` / `seriesCreateInputSchema` 进 `packages/contracts`；迁移 `0002_series.sql` 与 `packages/db/src/series.ts`；`/api/v1/workspaces/:workspaceId/series` 的 GET 与 POST；Web `/series` 是**第一个读真实数据的页面**。§6.1 里只落了名字 —— 角色、声音、风格手册与默认生成设置随后续切片，一列没有页面能写的字段，含义会被第一个碰它的人决定。
  - 归属条件写在查询里：`listSeriesForWorkspace` 用 `workspace_member` 内连接，`createSeries` 在同一事务里先确认成员身份、再用**校验查询返回的** workspace id 写入。别人的 Workspace 一律 404 而非 403，读写都是。
  - 服务端渲染读数据经 `apps/web/lib/api-server.ts`（手动转发 Cookie —— 服务端渲染是另一个请求，没人替它带上），浏览器写数据经 `apps/web/lib/api-client.ts`（base url 为空，走同源 Rewrite）。写成功后 `router.refresh()` 让服务端重读，表单不留第二份列表。
  - `statusOf()` 的存在是因为 Hono 不把中间件的响应折进路由类型：RPC 客户端以为业务路由只会返回 200，拿它和 401 比较是类型错误。要区分「没登录」和「坏了」就得把状态读成 number。
  - AppShell 长出导航（Home / Series），当前页由 `aria-current="page"` 与字重表达，不只靠颜色（§15）。

此外已有 `packages/observability`（结构化日志 + 就绪检查）与 `packages/api-client`（预编译 Hono RPC 客户端）。

对象存储的客户端还**不是**一个包：`apps/api/src/object-store.ts` 是路由拿到的窄接口，`storage.ts` 是它的 S3 实现（两个客户端 —— API 与浏览器在不同地址访问存储，而 SigV4 签 host；`forcePathStyle` 因为 MinIO 按路径寻址）。只有 API 签名和读回，等 Media Worker 也需要这些操作时（也就是队列落地的那个切片）再抽成 `packages/storage`。

尚不存在：`packages/domain`、`packages/providers`、`packages/testkit`、Outbox 与队列、优雅停机（属 §16）。测试工厂目前放在各自的测试里，包内共享的放包自己的 `testing/`（`@plotpop/db/testing` 的 `identityFixtureSource`）；`packages/testkit` 在第一个需要跨 workspace 共享工厂的切片里建立。

Web 侧的原型边界，动手前要知道：

- **除系列的两个页面（`/series` 与 `/series/[seriesId]`）之外，页面数据都是占位的**，来自 `apps/web/lib/prototype-*.ts`。Web 不读数据库（ADR-001），真实数据要等 F-04 / F-05 的 API；接上时删掉这些文件。`/series` 是接法的样板：Server Component 读、客户端表单写、写完 `router.refresh()`。
- 向导只有脚本步骤有表单，其余四步可走通但只展示该步要做什么。
- Studio 做到浏览与时间线。**镜头检查器的编辑表单、局部重生成、顶栏的积分余额与导出入口不在这里** —— 前两项已移交 F-11（见上），后两项属 F-06 / F-09。
- §12.4 表里的**操作入口（取消 / 重试 / 编辑）还没实现**。
- 参考图的上传入口只在角色行的编辑表单里，**创建角色的表单还没有** —— 先用文字建角色，再编辑加图。
- 预估与余额是占位值；真实报价由服务端产生（§10：**客户端不得计算权威余额**），属 F-06。
- **主题的账户偏好与跨设备同步（`docs/design-system.md` §5.1）还没有** —— 需要账户接口，本次 F-03 切片没做，见上面的「F-03 尚未做」。

鉴权页面是在 `Field` / `Input` / `Label` / `Alert` 进入 `packages/ui` 之前写的，所以**用带语义 Token 的原生元素搭成**。这些组件现在已经有了（F-02.05 带进来的），下一个碰鉴权页面的切片应当替换过去；替换不会改变视觉，因为页面里没有任何非 Token 值。

这意味着：

- 动手前先 `ls` 确认，不要假设某个命令或某个包已经存在。下一节区分了"可运行"和"仍规划中"。
- `docs/` 是行为契约的权威来源。实现与文档冲突时，先更新契约，不得在代码中静默绕过。

## 产品是什么

PlotPop 是面向北美、英文优先的 AI 漫剧创作 SaaS。用户提交英文脚本和可复用角色设定，产出一集 5–10 分钟的完整漫剧视频。商业模式是一次性积分包，不做订阅。

理解代码前先理解这个约束：**核心难题不是生成单个视频镜头，而是以可接受成本稳定生成角色一致、支持逐镜头局部修改的整集成片。** 架构中几乎每个非显然的设计都源自这一点。

## 命令

已经可用：

```bash
pnpm docker:up      # 起本地依赖 + API/Worker 容器，等到全部 healthy
pnpm docker:down    # 停止，保留数据卷
pnpm dev            # Turborepo 并行启动 Web + API + Worker（读仓库根 .env）
pnpm build
pnpm typecheck
pnpm test           # Vitest，只跑不需要数据库的测试
pnpm test:integration  # Vitest，跑真实 PostgreSQL 的测试（先 pnpm docker:up）
pnpm test:coverage  # Vitest + v8 覆盖率（text-summary + lcov）
pnpm test:e2e       # Playwright 行为与无障碍门禁（先 pnpm docker:up）
pnpm test:e2e:visual   # 视觉回归，跑在钉住的 Playwright 容器里
pnpm db:migrate     # 应用待处理迁移（= pnpm --filter @plotpop/api migrate）
pnpm lint           # Biome：format + lint + 导入排序，警告即失败
pnpm lint:fix       # 同上，写回可自动修复的部分
```

首次准备环境：`cp .env.example .env`，`pnpm docker:up`，然后 `pnpm db:migrate`。`.env.example` 被 `packages/config` 的测试解析，新增环境变量必须同步写进去，否则测试失败。

迁移只在发布步骤里跑，不在服务进程里跑 —— 迁移失败不该顺带让 API 起不来。文件名 `<0000>_<lower_snake_case>.sql`，只向前，不写 down；已应用的文件被校验和锁住，改历史会让整次运行失败而不是让环境悄悄分叉。补一个编号更低的迁移也会被拒绝：那意味着两个分支抢了同一个号。

**`*.integration.test.ts` 通过包导出解析工作区依赖（也就是 `dist`），不是源码。** 直接 `pnpm --filter @plotpop/api test:integration` 会跑在上一次构建的 `packages/db` 上，改了源码却没重建时结果是假的。根命令 `pnpm test:integration` 走 Turborepo 的 `^build`，所以它总是先构建；单包跑之前请自己 `pnpm --filter @plotpop/db build`。

注意：只有 API 与 Worker 用 `--env-file-if-exists=../../.env` 读仓库根 `.env`。Web 侧 `next.config.ts` 用 `@next/env` 的 `loadEnvConfig` 指向仓库根，**必须带 `forceReload`**：Next 在加载配置前已经为 `apps/web` 读过一次环境，加载器会缓存第一次的结果。目录取自 `process.cwd()` 而不是 `import.meta.url`，因为 Next 会把配置编译到别处再执行。

只要本地依赖、不要容器化的 API/Worker：`docker compose -f docker/compose.yaml stop api worker`。

**`pnpm test:e2e` 起的是真实 API + 真实数据库，因此它需要 PostgreSQL**（`pnpm docker:up`）。`playwright.config.ts` 自己在 3101 起 API、在 3100 起 Web，端口与 `pnpm dev` 不冲突；命令本身会先构建 API 并跑一次 `pnpm db:migrate`。它用的是 `.env` 里的那个数据库 —— e2e 只往里追加注册用户（邮箱每次随机），不改别的。两个服务都**不复用**已在监听的进程：Next 把 rewrite 目标烤进构建产物，复用一个别处留下的服务等于把 `/api/*` 指向未知的 API，而那会表现成登录失败而不是配置错误。

**`API_BASE_URL` 必须留在 `turbo.json` 的 `@plotpop/web#build` 里。** Turborepo 2.x 默认 strict env，没声明的变量根本不会进入构建进程；而 Next 的 rewrite 目标是 build 时写进 `routes-manifest.json` 的。删掉这条声明，e2e 的 Web 构建就会拿 `.env` 里的地址去代理，测试转而打向你本地正在跑的那个 API。同一条声明里的 `$TURBO_ROOT$/.env` 是为了改了根 `.env` 之后不会命中旧构建缓存。

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

镜像与容器验证：

```bash
# 重画视觉基线要直接调脚本，pnpm 不会把 --update-snapshots 转发进去：
e2e/visual.sh --update-snapshots          # 之后必须逐张肉眼检查

docker build -f docker/api.Dockerfile -t plotpop-api .
docker/smoke.sh plotpop-api:latest api 3001   # CI 用的同一个脚本
```

发布端口默认只绑 loopback，且可覆盖（机器上已有 PostgreSQL 时）：`POSTGRES_HOST_PORT=5433 pnpm docker:up`。

shadcn/ui 组件一律用项目包管理器操作，且添加到 `packages/ui` 而非 `apps/web`：

```bash
cd packages/ui
pnpm dlx shadcn@latest add <component>
pnpm dlx shadcn@latest diff <component>   # 更新已改过的组件前先看差异
```

CLI 必须在 `packages/ui` 里跑（`components.json` 在那里）。它写出的源码通常不满足 `docs/design-system.md`：注册表用 `text-sm`、3px 焦点 Ring 和 `px-1.5` 这类未批准值。改动写在组件文件顶部注释里并注明条款，`diff` 才能区分「我们的决定」和「上游漂移」。

## 架构：三服务 + 共享包

```
apps/web      Next.js，部署 Vercel
apps/api      Hono + @hono/node-server，常驻 Node 容器（非 Edge Runtime）
apps/worker   BullMQ consumers；AI Worker 与 Media Worker 分队列独立扩缩容
packages/     auth api-client config contracts db domain observability providers testkit ui
```

`packages/` 目前存在 `api-client`、`auth`、`config`、`contracts`、`db`、`observability`、`ui`，其余包在需要它们的切片里创建。

- `contracts`：跨服务的 Zod 契约（服务名、Liveness、Readiness、日志级别、统一错误载荷、Workspace、凭据规则）。**同一结构不得在别处再手写一遍** —— 密码最小长度只在这里，`packages/auth` 与 Web 表单都读它。
- `config`：各服务环境变量的 Zod Schema 与解析。Web 的 Schema 里**没有**数据库、队列、存储字段，Worker 的 Schema 里**没有** Better Auth 密钥 —— 这是 ADR-001 与 ADR-007 的边界，不要往里加。
- `db`：Postgres 客户端、业务表的 drizzle 定义、迁移运行器与仓库函数。**归属条件写在查询里**（`listWorkspacesForUser`、`findWorkspaceForMember`），路由不得自己拼查询再补一层权限判断。测试专用助手在 `@plotpop/db/testing`，不在主入口。
- `auth`：Better Auth 实例、它的 drizzle Schema 与自己的迁移边界（ADR-007）。对外只暴露窄接口 `AuthService`（`handler` + `getSession`）；**不要把 Better Auth 的推导实例类型放进 Hono 路由树**，那会把它整个插件表面拖进 RPC 客户端的类型计算。业务概念不进这个包：注册后的 Workspace provisioning 由 `apps/api/src/auth-service.ts` 以回调注入。
- `observability`：结构化日志与就绪检查探针。业务代码不要再写 `console.log`。
- `api-client`：`hc<AppType>` 的预编译类型客户端；Web 侧只导入 `ApiClient`，不要在业务文件里重新 `hc<AppType>()`。
- `ui`：设计 Token、主题与 shadcn/ui 组件，`docs/design-system.md` 的实现处。色值只在这里出现，业务代码只消费 Utility。API 与 Worker **不得**依赖它。

`packages/ui` 与其他包有两点不同，改它之前要知道：

- 它**导出 TSX 源码而不是 `dist`**（`apps/web` 用 `transpilePackages` 转译），这样改组件不用先构建就能热更新。因此它没有 `build` 脚本，`typecheck` 是 `tsc --noEmit`。
- 因为走打包器解析，包内相对导入**不带 `.js` 后缀**。Turbopack 不会把 `.js` 映射到 `.ts`，加后缀会让 `next build` 直接失败。其他包仍是 nodenext + `.js`，别互相套用。

`packages/ui` 里的组件可见文案一律走 props，不写在组件里（§14）。`apps/web/components/` 下的外壳与页面组件属应用组合，不是基础组件，可以直接读 `apps/web/locales/en.ts`。

`apps/web` 的 `tsconfig.json` 用 `jsx: preserve`（Next 自己编译 JSX），所以 Vitest 侧要在 `vitest.config.ts` 里用 `oxc.jsx` 补上转换，`@/*` 别名也要在那里重复一遍 —— Vitest 不读 tsconfig 的 paths。两处必须同时改。

依赖方向：`api-client` → `apps/api`（**仅类型**，`import type`，不得让服务端运行时代码进入浏览器包）。

服务边界是硬约束，不是建议：

- **Web 不直接访问** PostgreSQL、Redis、对象存储密钥或模型供应商。只通过 `/api/v1/*` 和短时效签名 URL。
- **Worker 从不接收或转发用户 Session Cookie。** 用内部服务身份和短期签名任务令牌。
- **Worker 不依赖** Next.js 路由或 Hono 路由代码。

理由见 `docs/adr/ADR-001-service-boundaries.md`、`ADR-007-better-auth-same-origin.md`。

### 存活检查与就绪检查不能混用

- `/health`（三个服务都有）：**只报进程自身是否活着，绝不碰依赖。** 数据库不可达时它必须仍返回 200 —— 重启容器不会让 PostgreSQL 恢复，让编排器据此重启只会加长故障时间。
- `/ready`（API 与 Worker）：报"该不该给我发流量"，逐个探测依赖，任一不可达返回 503 与 `degraded`。
- 探针必须**说协议**，不能只 `connect`：容器运行时会接受发往已停止容器的连接，只连不说话会把死掉的依赖报成健康。见 `packages/observability/src/probes.ts`。
- 就绪响应里**不放** 主机名、凭据和失败原因；原因写日志。

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

统一任务状态（页面不得自创状态名或颜色）：`draft` `queued` `generating` `needs_review` `completed` `failed`。取值在 `packages/contracts` 的 `generationStatusSchema`（API 写、Worker 改、Web 渲染，三处引用同一个 Schema）；对应的 Label / Icon / Semantic Color 见 `docs/design-system.md` §12.4，渲染只走 `packages/ui` 的 `GenerationStatusBadge`。数组顺序是生命周期顺序，列表分组与筛选依赖它，**不要排序**。

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

上面这几条不靠自觉：`apps/web/design-system.test.ts` 扫描 `apps/web/app` 与 `apps/web/components`，命中即失败，并在失败信息里指出对应条款。它同时限制 §8.1 的间距档位（只允许 1 2 3 4 6 8 12 16 24）和 §8.2 的断点（页面布局只用 `md:` 与 `xl:`）。被它挡住时应调整布局层级或补 Token，不要改扫描规则。

Token 与主题实现在 `packages/ui/src/styles/theme.css`，`apps/web/app/globals.css` 只引入它。Tailwind v4 CSS-first，没有 `tailwind.config`。改任何色值都要跑 `pnpm --filter @plotpop/ui test` —— `theme.test.ts` 会重算全部 94 组对比度，并回填 `docs/design-system.md` §6.6。

主题为 `system | light | dark` 三态，由 `<head>` 内联脚本在首次绘制前解析成 `data-theme`，禁止先渲染 Light 再切 Dark；`<html>` 上的 `suppressHydrationWarning` 是这条约束的必要结果，不要删。状态表达必须同时具备文字标签和图标，不能只靠颜色区分。

规范覆盖不到新需求时：先更新 `docs/design-system.md` 和 Token，再写业务组件。**"仅此页面使用"不是绕过的理由**，偏离设计系统的实现算缺陷。

## 工作流

完整规则见 `.claude/rules/workflow.md`。要点：

- **禁止直接在 `main` 提交，并且已被强制。** `.husky/pre-commit` 拒绝在 `main` 上的提交，`.husky/pre-push` 拒绝推向 `main`，GitHub `protect-main` Ruleset 拒绝一切不走 PR 的 `main` 写入。每项任务一个分支、一个 worktree、一个 PR。worktree 与主仓库平级，命名 `PlotPop-<简述>`。
- **按垂直切片拆任务，不按技术层横向拆。** 一个切片包含该行为所需的契约、数据、后端、前端、测试和文档，独立可构建、可验收、可回退。若一句话描述需要用"以及""顺便"连接两个无关结果，继续拆。
- 一个 commit 一个原子意图。测试与它验证的实现放同一个 commit。任一中间 commit 都不得留下无法构建的仓库状态。
- 提交信息遵循 Conventional Commits，由 Husky `commit-msg` + commitlint 强制。说明用英文，与现有提交历史一致。
- 遵循红—绿—重构：先写暴露目标行为的失败测试。

质量门禁的四条行为（前三条来自 F-01.03）：

- **`main` 的写入路径只有一条：PR。** 本地两个钩子给即时反馈，GitHub `protect-main` Ruleset 是不依赖本地文件的底线 —— 它同时禁止 force-push 与删除 `main`，并要求 CI 通过。两层机制与绕过方式见 `.claude/rules/workflow.md` §3。
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
