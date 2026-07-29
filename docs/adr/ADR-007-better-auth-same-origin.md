# ADR-007 Better Auth 同源代理与 Session 边界

- 选了什么：Better Auth 实例由 Hono API 持有，挂载在 `/api/auth/*`；Web 通过 Vercel Rewrite 同源代理访问，使用 Better Auth Client，不自行签发或验证 Session。Worker 使用内部服务身份和短期签名任务令牌，不接收也不转发用户 Cookie。

- 否掉了什么 / 为什么：
  - **Better Auth 跑在 Next.js 侧**。鉴权会依赖 Web 的部署与运行时，而 API 和 Worker 仍需另一套服务端校验，结果是两个身份来源、两处要同步的会话语义。
  - **Web 跨域直连 API，依赖第三方 Cookie**。Safari ITP 与各浏览器对第三方 Cookie 的持续收紧会不断制造随机登录失效，而首发市场是北美，Safari 占比不可忽略。
  - **自签 JWT 传给 Worker**。Worker 一旦持有用户凭据就扩大了爆炸半径，且吊销困难。Worker 只需要"我有权处理这个任务"，不需要"我是这个用户"。

- 当时的前提：Web 在 Vercel、API 在独立域名的常驻容器上；Better Auth 表与业务表同库但分别管理迁移边界；Better Auth User 与业务 Workspace 分离，注册后幂等创建默认 Workspace 与积分账户。

- 已知代价：多一层代理及其超时与流式（SSE）配置要调；`trustedOrigins` 白名单需随环境维护，生产不得含 localhost。

- 何时重审：Web 与 API 合并到同一域名部署；或需要为第三方客户端、移动端签发独立 Token。

- 相关：`docs/ai-comic-drama-saas-design.md` §19、§28；`docs/implementation-plan.md` §8.2
