# 工作流规则

本项目采用「一项任务、一个分支、一个 worktree、一个 Pull Request」的协作方式。
`docs/` 是行为契约的权威参考；实现与文档冲突时，先确认并更新契约，不得在代码中静默绕过。

## 1. 接任务与确认范围

开始开发前，先明确：

- 问题背景、目标和验收标准。
- 涉及 Web、API、Worker 或哪些共享包。
- 是否修改接口、Schema、状态机、异步任务、权限或 AI 行为。
- 应先阅读哪些 `docs/` 契约和 `.claude/rules/` 规则。

## 2. 垂直拆分任务

大需求必须按用户或调用方可观察、可独立验收的行为垂直拆分，不得按数据库、后端、前端等
技术层横向拆分。一个垂直切片应包含交付该行为所需的契约、数据、后端、前端、测试和文档改动。

错误示例（横向拆分）：

```text
任务 1：修改 Schema
任务 2：实现 Repository 和 Service
任务 3：实现 API
任务 4：实现前端
任务 5：补测试
```

上述任务的中间状态通常无法独立使用、验证或安全回退。

正确示例（垂直拆分）：

```text
任务 1：用户可以为单个镜头生成一个视频候选版本
任务 2：用户可以在多个候选版本之间比较并批准其中一个
任务 3：生成前展示积分预估并要求确认
任务 4：界面展示生成失败状态和重试入口
```

每个切片遵循以下规则：

- 用一句话描述调用方可观察到的结果，并给出明确输入、输出和验收方式。
- 优先交付最窄的端到端 happy path，再增加边界条件、异常处理和性能优化。
- 包含完成该行为所需的全部层以及对应测试，不把「补测试」留成后续独立切片。
- 独立可构建、可测试、可审查、可合并、可回退，不依赖尚未合入的后续切片才成立。
- 数据库迁移需要先行时必须保持向后兼容，使迁移与应用版本可以安全滚动发布。
- 基础重构只有在能独立说明价值、边界和验证结果时才单独成任务；否则归入需要它的切片。
- 若一句话中需要用「以及」「顺便」连接两个无关结果，应继续拆分。

拆分完成后逐项检查：

```text
□ 用户或调用方能观察到什么变化？
□ 是否能独立写出验收测试？
□ 是否包含完成行为所需的全部技术层？
□ 合并后仓库是否仍然可运行？
□ 是否可以独立回退而不影响其他能力？
□ 是否混入第二个无关行为？
```

一个足够小的垂直切片通常对应一个原子 commit 和一个 Pull Request。若一个切片仍需要多个
commit，每个 commit 也必须满足第 8 节的原子性要求，且任一中间状态都必须可构建、可验证。

## 3. 禁止直接在 main 提交代码

`main` 是受保护的默认分支，**禁止在 `main` 上直接开发或提交**。

- 任何改动都必须从最新的 `main` 基线切出特性分支，并在独立 worktree 中完成。
- 提交前必须运行 `git branch --show-current`，输出不得为 `main`。
- 改动必须通过 Pull Request 合入 `main`，并通过 CI 质量门禁。
- 提交信息遵循 Conventional Commits，由 Husky `commit-msg` 和 commitlint 强制检查。

> 例外：仅当用户明确要求「就在 main 上提交」时才可破例。

## 4. 同步基线并检查现场

创建分支前，在主仓库检查工作区和现有 worktree：

```bash
git status --short
git branch --show-current
git fetch origin
git pull --ff-only origin main
git worktree list
```

若存在未提交改动，先确认其归属，不得覆盖、丢弃或混入当前任务。同一分支不能在多个 worktree
中同时检出。

## 5. 使用独立 worktree

worktree 必须与主仓库目录平级，命名为 `<仓库名>-<端/简述>`，不得嵌套在主仓库内部。

分支命名约定：

- `feat/<简述>`
- `fix/<简述>`
- `docs/<简述>`
- `ci/<简述>`
- `chore/<简述>`

创建示例：

```bash
git worktree add \
  -b feat/shot-approval \
  ../PlotPop-shot-approval \
  origin/main
cd ../PlotPop-shot-approval
pnpm install
git branch --show-current
```

当前有哪些 worktree 以 `git worktree list` 的实时输出为准，文档中不维护静态清单。

## 6. 小步开发与验证

遵循红—绿—重构流程：

1. 先写能够暴露目标行为或缺陷的失败测试。
2. 实现让测试通过的最小改动。
3. 重构并再次验证。
4. 同步更新受影响的契约和中文文档。

开发过程中优先运行受影响 workspace 的快速检查：

```bash
pnpm --filter @plotpop/api test
pnpm --filter @plotpop/api typecheck
```

根据实际改动替换 workspace。不要把格式化、无关重构和功能修改混入同一任务。

## 7. 提交前自检

先检查改动范围：

```bash
git status --short
git diff
git diff --stat
```

至少运行与改动相关的测试；提交 Pull Request 前运行完整质量门禁：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

涉及数据库或完整用户流程时，追加：

```bash
pnpm --filter @plotpop/api test:integration
pnpm test:e2e
```

自检还应确认：

- 未提交 `.env`、密钥、调试日志、临时文件或无关生成物。
- 数据库查询在查询本身包含 `workspace_id`。
- API 异步交接经过 Transactional Outbox，而非直接发布到 BullMQ。
- 可编辑记录的写入受 Revision 乐观锁保护，状态迁移使用条件更新。
- 积分操作遵循 Estimate → Reserve → Execute → Settle，账本只追加。
- 模型调用经过 Provider Adapter，供应商字段未泄漏到领域实体、公共 API 或前端组件。
- Web 改动只消费设计系统 Token 和已批准的组件 Variant。
- 运行时 Schema 由 Zod 定义，TypeScript 类型经 `z.infer` 推导。
- 行为、接口或运维方式变化时，相关中文文档已同步更新。

## 8. 提交规范

### 一个 commit 是一个原子任务

每个 commit 必须对应一个原子任务：只表达一个清晰意图，能够独立审查、独立验证，并可在不破坏
其他改动的前提下安全回退。

- 功能、缺陷修复、重构、格式化和文档更新不得无关地混在同一个 commit。
- 测试应与它验证的实现放在同一个 commit，保证该 commit 自身完整。
- 为当前实现所必需的契约或文档更新，应与实现放在同一个 commit。
- 大任务应按可验证的行为边界拆成多个 commit，而不是按文件或代码层机械拆分。
- 任一中间 commit 都不得故意留下无法构建、类型错误或测试失败的仓库状态。
- 如果提交说明中需要用「以及」「顺便」连接两个无关目的，应继续拆分。

例如，“增加镜头版本批准”可以作为一个原子任务，包含对应的契约、实现和测试；无关的积分页
格式调整应放入另一个 commit。

提交信息格式为 `<type>: <英文说明>`，与现有提交历史保持一致。例如：

```bash
git commit -m "feat: add shot version approval"
git commit -m "fix: release reserved credits on provider timeout"
git commit -m "test: cover credit ledger invariants"
git commit -m "docs: clarify local development setup"
```

提交前再次确认当前分支：

```bash
git branch --show-current
```

## 9. Pull Request

推送分支：

```bash
git push -u origin feat/shot-approval
```

Pull Request 描述至少包含：

```markdown
## 背景

为什么需要这个改动。

## 改动

- 修改了什么。
- 有哪些重要设计决策。

## 验证

- 运行了哪些自动化检查。
- 如何手工验证。

## 风险

数据库、兼容性、异步任务、发布或回滚风险。
```

一个 Pull Request 只交付一个可独立验收的垂直切片。大型需求应按第 2 节的用户行为拆分；
每个 Pull Request 包含完成该行为所需的契约、数据、后端、前端、测试和文档改动，并保持
仓库可构建、可测试。

## 10. Review 与 CI

- 收到 Review 意见后，先确认问题和影响范围，再在原分支修复并补充测试。
- 回复评论时说明改了什么、如何验证，不要只回复「已修改」。
- 不得为消除评论而绕过架构不变量。
- CI 全部通过、所有阻塞评论处理完毕后才能合并。

## 11. 合并后清理

清理前确认 worktree 没有未提交内容：

```bash
git -C ../PlotPop-shot-approval status --short
```

特性合并后，删除 worktree 和本地、远端特性分支：

```bash
git worktree remove ../PlotPop-shot-approval
git branch -d feat/shot-approval
git push origin --delete feat/shot-approval
git worktree prune
```

分支不长期保留。删除前若发现未提交内容，应先确认并处理，不得强制丢弃。
