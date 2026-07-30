-- Characters, and the versions of them a shot can be pinned to
-- (`docs/ai-comic-drama-saas-design.md` §20.2, §32.7).
--
-- Two tables rather than one because improving a character must not rewrite the
-- episodes that already used it: the identity stays put, the appearance is versioned,
-- and an episode or shot locks the version it generated with. §32.7 names losing that
-- as the risk this shape controls.

create table character (
  -- Unpredictable rather than sequential: §20.4 requires public ids to reveal neither
  -- volume nor ordering.
  id uuid primary key default gen_random_uuid(),
  -- Characters belong to a series, which is what makes them reusable across its
  -- episodes (§6.1). The cascade makes deleting a series a complete act.
  series_id uuid not null references series (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  -- §20.6: optimistic locking for editable records.
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Matches the only read there is: one series' cast, in the order it was written.
create index character_series_id_created_at_idx
  on character (series_id, created_at, id);

create table character_version (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references character (id) on delete cascade,
  -- Counts from 1 within one character, so a creator can refer to "version 2" and a
  -- shot can record which one it used. The uniqueness is what stops two writers from
  -- both claiming the same number.
  version integer not null check (version > 0),
  -- The structured appearance §32.1 requires; reference images, clothing and voice
  -- configuration join it in the slices that give a creator somewhere to set them.
  appearance text not null check (length(btrim(appearance)) > 0),
  created_at timestamptz not null default now(),
  unique (character_id, version)
);

-- "The current version" is the highest number a character has, which is how both the
-- cast list and the next version's number are read.
create index character_version_character_id_version_idx
  on character_version (character_id, version desc);
