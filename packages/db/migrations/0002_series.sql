-- Series: the creative identity reused across episodes
-- (`docs/ai-comic-drama-saas-design.md` §6.1, §20.2).
--
-- Only the name is here. Characters, voices, the style guide and the default
-- generation settings arrive with the slices that give a creator somewhere to edit
-- them; a column no page can write is a column whose meaning is decided by
-- whoever reaches it first.

create table series (
  -- Unpredictable rather than sequential: §20.4 requires public ids to reveal
  -- neither volume nor ordering.
  id uuid primary key default gen_random_uuid(),
  -- The ownership boundary every business resource hangs off (§20.1). Every read
  -- and write of this table is scoped by it, and the cascade is what makes
  -- deleting a workspace a complete act.
  workspace_id uuid not null references workspace (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  -- §20.6: optimistic locking for editable records. Renaming carries it back.
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Matches the only read there is: one workspace's library, newest first.
create index series_workspace_id_created_at_idx
  on series (workspace_id, created_at desc, id desc);
