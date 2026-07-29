# ADR-001 Web、API、Worker 三服务边界

- 选了什么：拆成 `apps/web`（Next.js，Vercel）、`apps/api`（Hono，常驻 Node 容器）、`apps/worker`（BullMQ，AI 与 Media 分队列），代码组织为共享 packages 的模块化单体。

- 否掉了什么 / 为什么：
  - **全部塞进 Next.js**，用 API Routes 和 Vercel 函数跑生成。单集合成是分钟级的 FFmpeg 任务，超出 serverless 执行时限；而且 Web 会直接持有数据库、对象存储和供应商密钥，与"Web 只通过版本化 API 和签名 URL 操作数据"这条边界直接冲突。
  - **一开始就拆微服务**。团队规模小，领域边界尚未稳定，跨服务契约与部署成本远大于收益。模块化单体保留了后续按 package 边界切分的可能。
  - **Web 与 API 合一、只让 Worker 独立**。两者运行时形态不同：Web 要 Vercel 的边缘分发，API 要常驻进程、SSE 长连接、非 Edge Runtime。绑在一起就得放弃其中一个。

- 当时的前提：首发单一北美区域；媒体合成 CPU 与临时磁盘密集且耗时分钟级；Web 部署在 Vercel；开发者人数少。

- 已知代价：需要维护同源 rewrite 代理层；三套部署与 CI 流水线；本地开发必须用 Docker Compose 起全套依赖。

- 何时重审：Web 不再适合放在 Vercel（例如转自托管）；或 AI Worker 与 Media Worker 的扩缩容、发布节奏分化到需要独立仓库；或引入非 TypeScript 服务。

- 相关：`docs/ai-comic-drama-saas-design.md` §18、§18.1–18.3；`docs/implementation-plan.md` §3、§6
