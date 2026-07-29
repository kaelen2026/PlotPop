# ADR-003 Outbox + BullMQ 的任务投递策略

- 选了什么：API 在业务事务内写入 Outbox Event（连同权限校验、创建 Generation Run/Task、预留积分），由独立 Dispatcher 领取并投递到 BullMQ，投递结果回写数据库。

- 否掉了什么 / 为什么：
  - **事务提交后直接 enqueue**。提交成功但入队失败会留下"积分已预留、Run 已创建、任务永不执行"的静默不一致。这是本产品最不能接受的失败模式，因为它同时损坏用户信任和账目。
  - **事务内直接 enqueue**。Redis 写入不在 PostgreSQL 事务里，事务回滚后队列里会留下幽灵任务，Worker 会为不存在的业务对象执行付费生成。
  - **不用队列，纯轮询任务表**。等于放弃 BullMQ 的重试、退避、并发控制和延迟投递，这些都要自己重写；轮询间隔还要在延迟与数据库负载之间反复调。

- 当时的前提：所有生成都是付费操作，一次不一致直接对应真金白银；Redis 为托管服务，不假设永不丢数据；任务幂等键（`run + operation + target + version`）能吸收重复投递。

- 已知代价：多一个 Dispatcher 进程及其租约/锁逻辑要维护；任务投递多一跳延迟。

- 何时重审：迁移到原生支持事务性投递的队列；或 Dispatcher 延迟成为用户可感知的问题。

- 相关：`docs/ai-comic-drama-saas-design.md` §22、§23、§32.4；`docs/implementation-plan.md` §10.1
