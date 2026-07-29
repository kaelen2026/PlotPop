# PlotPop

PlotPop turns an English script and a set of reusable character sheets into a finished 5 to 10 minute animated comic drama episode. It serves individual creators who publish serialized drama, launches in North America with an English-first interface, and sells one-time credit packs instead of subscriptions.

## Status

The repository holds an engineering skeleton and no product features yet. Task F-01 is done:

- **F-01.01** — a pnpm workspace driven by Turborepo, minimal `web`, `api`, and `worker` apps, a `contracts` package holding the Zod schemas, and a liveness probe on each of the three services.
- **F-01.02** — `packages/config` parses each service's environment through a Zod schema at startup, so a missing credential fails the process instead of the first request that needs it.
- **F-01.03** — Biome, Vitest with coverage, Husky hooks with lint-staged and commitlint, and a GitHub Actions pipeline running the same gates over the whole repository.
- **F-01.04** — multi-stage images for the api and worker, a Docker Compose stack covering PostgreSQL, Redis and S3-compatible storage, readiness probes that report on those dependencies, and a CI job that starts each image and health-checks it.

Also in place: `packages/observability` (structured logging and readiness) and `packages/api-client` (the precompiled Hono RPC client).

Not there yet: the domain model and database, Better Auth, every remaining `packages/` entry, Playwright, and any product feature at all.

Everything under `docs/` is the behavior contract the implementation is held to.

## The problem worth solving

Generating one good video shot is not the hard part. The hard part is producing a whole episode where the same character looks like the same character in every shot, where a creator can regenerate a single shot without paying to rebuild the episode, and where the cost per finished minute stays under a credit price creators will actually pay.

Most of the non-obvious decisions in this architecture come from that constraint.

## Planned architecture

```
apps/web      Next.js, deployed on Vercel
apps/api      Hono + @hono/node-server on a long-running Node container
apps/worker   BullMQ consumers; AI and media workers scale on separate queues
packages/     auth api-client config contracts db domain observability providers testkit ui
```

Stack: pnpm workspaces with Turborepo, TypeScript in strict mode, PostgreSQL with Drizzle ORM, Redis with BullMQ, Better Auth, Zod contracts, FFmpeg for media, S3-compatible object storage, Vitest and Playwright for tests, Biome for format and lint.

Three service boundaries are hard rules. Web never touches PostgreSQL, Redis, storage keys, or model providers, and reaches everything through `/api/v1/*` and short-lived signed URLs. Workers never receive or forward a user session cookie, and use an internal service identity with short-lived job tokens. Workers do not import Next.js or Hono routing code.

## Invariants

Six rules span many files, so reading any single file will not reveal them. Breaking one does not fail loudly, it just costs money or corrupts state later.

1. PostgreSQL is the only source of truth for job and business state. Redis and SSE are delivery mechanisms. After Redis loses data, unfinished work must be rebuildable from the outbox and generation tasks.
2. Async work is delivered through a transactional outbox, never enqueued to BullMQ directly. Permission checks, credit reservation, task creation, and the outbox event all commit in one database transaction. A dispatcher publishes afterward.
3. The credit ledger is append-only, and every charge follows Estimate, Reserve, Execute, Settle. Corrections are compensating entries. Historical rows are never updated or deleted, and the client never computes an authoritative balance.
4. Provider fields, statuses, and error codes never leak into domain entities, the public API, or frontend components. Users pick Draft, Standard, or Pro. They never pick a vendor.
5. Asset records are immutable. Replacing a file creates a new asset, regenerating a shot creates a new candidate version, and old versions survive until the user deletes them.
6. Zod is the single source of truth for application schemas, and TypeScript types come from `z.infer`. Zod handles parsing at the boundary. `NOT NULL`, `UNIQUE`, `CHECK`, foreign keys, and transactions stay in the database.

Each one has a decision record in `docs/adr/` with the alternatives that were rejected and the conditions that should reopen the question.

## Generation pipeline

```
parse script -> plan scenes -> create shots -> generate video and voice in parallel -> final composition
```

One user action is one generation run containing many independently retryable tasks. The task idempotency key is `run + operation + target + version`. A single failed shot never blocks the others. Final composition only reads shot versions the user approved, and expensive high-definition generation always follows a cheap reviewable animatic.

Every task reports one of six statuses: `Draft`, `Queued`, `Generating`, `Needs review`, `Completed`, `Failed`.

Retries back off with jitter on network errors, 429s, and provider 5xx. Invalid input and moderation rejections never retry automatically. Timeouts check the provider's real state before resubmitting. Callbacks deduplicate on `provider + event_id`.

## Delivery order

`docs/implementation-plan.md` §4.5 breaks the MVP into thirteen vertical tasks, F-00 through F-12, each one a behavior a user can observe. The critical path:

```
F-01 -> F-03 -> F-04 -> F-05 -> F-07 -> F-08 -> F-11 -> F-12
```

Two gates control everything else. F-00 validates model quality and unit economics, and has to pass before F-07 wires up real paid generation, because it decides whether the product is worth building. F-06 delivers credits and is a hard dependency for every paid operation.

## Local development

Start the dependencies first, then the services:

```bash
pnpm install
cp .env.example .env
pnpm docker:up      # PostgreSQL, Redis, storage, api and worker, waits until healthy
pnpm dev            # web + api + worker from source
```

`pnpm docker:up` also runs the api and worker as containers. To develop against the dependencies alone, stop those two: `docker compose -f docker/compose.yaml stop api worker`. Published ports bind to loopback only and can be moved when a machine already has a PostgreSQL of its own:

```bash
POSTGRES_HOST_PORT=5433 pnpm docker:up
pnpm docker:down    # stops everything, keeps the volumes
```

The rest:

```bash
pnpm build
pnpm typecheck
pnpm test           # Vitest
pnpm test:coverage  # Vitest with v8 coverage
pnpm lint           # Biome format, lint, and import sorting; warnings fail
pnpm lint:fix       # the same, writing back what can be fixed automatically
```

Still to come: `pnpm test:e2e` with Playwright.

`pre-commit` checks staged files without rewriting them, so a formatting failure rejects the commit instead of silently editing what you staged. `commit-msg` runs commitlint. A focused or skipped test fails both the suite and the linter; keeping a skip requires a `biome-ignore` comment that states why. CI reruns every gate over the whole repository, because the local hooks can be skipped with `--no-verify`.

Narrow to one workspace while developing:

```bash
pnpm --filter <workspace> test
pnpm --filter <workspace> typecheck
```

### Probes

Every service answers `/health`, and the api and worker also answer `/ready`: the api on 3001, the worker on 3002, the web app on 3000.

The two say different things on purpose. `/health` reports whether the process is alive and never consults a dependency, because restarting a container cannot make PostgreSQL reachable and an orchestrator acting on that signal would only extend the outage. `/ready` reports whether traffic should arrive, probing each dependency by speaking its protocol and answering 503 when one is unreachable. Which dependency failed and why goes to the logs, not the response.

```bash
curl localhost:3001/ready
```

### Images

```bash
docker build -f docker/api.Dockerfile -t plotpop-api .
docker/smoke.sh plotpop-api:latest api 3001
```

`docker/smoke.sh` is what CI runs against a built image: it starts the container with its dependencies pointed at a closed port and asserts the image runs unprivileged, ships no build tooling, reaches its own healthcheck, answers liveness, and refuses traffic through `/ready`.

## Working agreements

One task, one branch, one worktree, one pull request. Direct commits to `main` are not allowed. Tasks split vertically by observable behavior, never horizontally by technical layer, and each slice ships the contracts, data, backend, frontend, tests, and docs that behavior needs. Commits follow Conventional Commits and carry one atomic intent, with tests in the same commit as the code they verify.

Behavior changes go through red, green, refactor. Credit invariants, state machines, idempotency, workspace isolation, optimistic locking, and outbox atomicity are test-first with no exceptions. CI never calls a real paid generation provider.

Full rules live in `.claude/rules/workflow.md` and `.claude/rules/tdd.md`.

## Documentation

Specs are written in Chinese. Product UI copy is English.

| File | Contents |
|---|---|
| [`docs/ai-comic-drama-saas-design.md`](docs/ai-comic-drama-saas-design.md) | Product and technical design spec. §32 is the risk list with validation gates |
| [`docs/implementation-plan.md`](docs/implementation-plan.md) | F-00 to F-12 vertical tasks, dependency graph, parallel waves, milestones |
| [`docs/design-system.md`](docs/design-system.md) | The only source for web visuals and interaction |
| [`docs/adr/`](docs/adr/) | Eight architecture decisions, each with rejected alternatives and revisit triggers |
| [`CLAUDE.md`](CLAUDE.md) | Orientation for AI coding agents working in this repo |

When implementation and documentation disagree, the contract gets updated first. Working around it silently in code is a defect.
