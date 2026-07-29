-- Better Auth's own tables.
--
-- ADR-007 keeps these on a separate migration boundary from the business tables:
-- the shapes here are dictated by Better Auth's core schema, so they change when
-- the library changes rather than when PlotPop's domain does. The business tables
-- reference "user" and therefore live in a source applied after this one.
--
-- Column names are snake case while `src/schema.ts` keeps Better Auth's camelCase
-- field keys, which is the only mapping the drizzle adapter needs.

create table "user" (
  id text primary key,
  name text not null,
  -- Better Auth normalises addresses before writing, so plain equality and this
  -- unique index agree with how sign-in looks a user up.
  email text not null unique,
  email_verified boolean not null default false,
  image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table "session" (
  id text primary key,
  user_id text not null references "user" (id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Signing out of every device and expiring stale sessions both scan by user.
create index session_user_id_idx on "session" (user_id);
create index session_expires_at_idx on "session" (expires_at);

create table "account" (
  id text primary key,
  user_id text not null references "user" (id) on delete cascade,
  account_id text not null,
  provider_id text not null,
  -- Only ever a hash for the credential provider. §28 keeps OAuth tokens
  -- application-encrypted; no social provider is wired up yet.
  password text,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index account_user_id_idx on "account" (user_id);
create index account_provider_idx on "account" (provider_id, account_id);

create table "verification" (
  id text primary key,
  identifier text not null,
  value text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Every lookup is by identifier, and expired rows are swept by date.
create index verification_identifier_idx on "verification" (identifier);
create index verification_expires_at_idx on "verification" (expires_at);
