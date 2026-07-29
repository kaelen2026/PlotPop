-- The ownership boundary every business resource hangs off, and the credit
-- account that pays for its generations.
--
-- Applied after the `auth` source: `owner_user_id` and `user_id` reference Better
-- Auth's `user` (ADR-007, `docs/ai-comic-drama-saas-design.md` §20.1).

create table workspace (
  -- Unpredictable rather than sequential: §20.4 requires public ids to reveal
  -- neither volume nor ordering.
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null references "user" (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  -- MVP gives each user exactly one workspace (§20.1). The flag is what the
  -- uniqueness below is scoped to, so team workspaces can arrive later without
  -- either dropping the guarantee or rewriting existing rows.
  is_personal boolean not null default true,
  -- §20.6: optimistic locking for editable records.
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- This index is the idempotency of sign-up provisioning: a repeated or concurrent
-- attempt loses to it rather than producing a second workspace.
create unique index workspace_personal_owner_key
  on workspace (owner_user_id)
  where is_personal;

create table workspace_member (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace (id) on delete cascade,
  user_id text not null references "user" (id) on delete cascade,
  -- Reserved for team capability; MVP only ever writes 'owner' (§20.1).
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

-- Answering "which workspaces may this caller see" is on the path of every
-- authenticated request.
create index workspace_member_user_id_idx on workspace_member (user_id);

create table credit_account (
  id uuid primary key default gen_random_uuid(),
  -- One account per workspace, enforced here rather than in application code.
  workspace_id uuid not null unique references workspace (id) on delete cascade,
  -- ADR-004: neither balance may go negative, and the ledger that explains every
  -- change to them arrives with the credits slice. This table starts at zero and
  -- is only read until then.
  available_credits bigint not null default 0 check (available_credits >= 0),
  reserved_credits bigint not null default 0 check (reserved_credits >= 0),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
