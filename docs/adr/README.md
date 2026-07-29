# 决策记录

每条记录只回答三件事：当时选了什么、认真考虑过又否掉了什么及为什么、什么条件下该回来重审。

规则：

- 只追加。旧决策被推翻时写新记录并注明取代关系，不回头改旧的。
- 引用不复制。设计规格、代码位置用路径指过去，避免记录与真相漂移。
- 显然的、无取舍的、改起来零成本的决策不记。

| 编号 | 决策 | 重审触发条件 |
|---|---|---|
| [ADR-001](ADR-001-service-boundaries.md) | Web、API、Worker 三服务边界 | Web 不再适合 Vercel；或 Worker 需要独立仓库 |
| [ADR-002](ADR-002-postgres-source-of-truth.md) | PostgreSQL 作为业务与任务状态唯一可信来源 | 任务状态写入成为 PG 瓶颈；或需要多区域 |
| [ADR-003](ADR-003-outbox-bullmq.md) | Outbox + BullMQ 的任务投递策略 | 换用支持事务性投递的队列；或 Dispatcher 延迟可感知 |
| [ADR-004](ADR-004-append-only-credit-ledger.md) | 只追加积分账本 | 引入订阅制；或账本规模影响查询 |
| [ADR-005](ADR-005-provider-adapter-tiers.md) | 供应商适配器与产品质量档位 | 某档位只剩单一供应商且无降级路径 |
| [ADR-006](ADR-006-immutable-assets.md) | 对象存储资产不可变 | 存储成本成为单位经济显著项 |
| [ADR-007](ADR-007-better-auth-same-origin.md) | Better Auth 同源代理与 Session 边界 | Web 与 API 合并到同一域名；或需要为移动端签发 Token |
| [ADR-008](ADR-008-job-payload-versioning.md) | 任务载荷版本与 Worker 滚动升级策略 | 任务时长缩短到可安全排空队列 |

以上八条决策的技术依据见 `docs/ai-comic-drama-saas-design.md`，落地顺序见 `docs/implementation-plan.md`。
