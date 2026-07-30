-- Immutable file records (`docs/ai-comic-drama-saas-design.md` §20.4, §26; ADR-006).
--
-- "Immutable" is about the file, not the row. A row is written before the bytes exist,
-- because the browser uploads straight to object storage (§26) and something has to have
-- named the object first. It then moves from `pending` to `ready` once the bytes have
-- been read and checked, which is the conditional state transition §20.6 provides for.
--
-- What never changes is `storage_key` and `checksum_sha256`. Replacing a file means
-- inserting a new asset, because an export that recorded this one has to keep finding
-- these bytes — ADR-006 rejects overwriting an object key for exactly that reason.
--
-- The declared and the verified columns are kept apart on purpose. The `declared_` pair
-- is what a client claimed before uploading; the unprefixed pair is what the bytes turned
-- out to be. Collapsing them would erase the difference between "the client said png"
-- and "we read png", which is the whole point of confirming.

create table asset (
  -- Unpredictable rather than sequential: §20.4 requires public ids to reveal neither
  -- volume nor ordering. The storage key is derived from this, so the object path
  -- inherits the same property.
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace (id) on delete cascade,
  -- What the file is for, which is what decides its storage path and how long it is
  -- kept (§26 gives source material, intermediate output and exports separate
  -- lifecycles). More purposes join the check as the slices that produce them land.
  purpose text not null,
  status text not null default 'pending',
  -- Written by `packages/db/src/assets.ts` from the ids, never from client input.
  -- Unique because two rows pointing at one object would make "replace the file"
  -- silently change the other one.
  storage_key text not null,
  -- What the client said it was about to upload. The signed url permits exactly this
  -- type and exactly this many bytes, so a false declaration cannot even become a
  -- successful upload.
  declared_content_type text not null,
  declared_byte_size bigint not null,
  -- What the bytes turned out to be, filled in at confirmation. Null until then.
  content_type text,
  byte_size bigint,
  checksum_sha256 text,
  -- §195, §733: the creator confirms they hold the rights to the material. Stored
  -- rather than only asked, because a claim nobody recorded is a claim nobody made.
  rights_confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  constraint asset_storage_key_unique unique (storage_key),
  constraint asset_purpose_known check (purpose in ('character_reference')),
  constraint asset_status_known check (status in ('pending', 'ready', 'rejected')),
  constraint asset_declared_byte_size_positive check (declared_byte_size > 0),
  constraint asset_byte_size_positive check (byte_size is null or byte_size > 0),
  -- Fixed encoding, so §31.3's integrity sampling compares digests rather than
  -- discovering that two encodings of the same digest are not equal.
  constraint asset_checksum_sha256_format check (
    checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$'
  ),
  -- The one that matters: a ready asset is one whose bytes we read. Without this,
  -- "ready but never verified" is representable, and every consumer downstream has to
  -- defend against a row that claims to be usable and is not. `docs/implementation-plan.md`
  -- §2 keeps this kind of guarantee in the database rather than in Zod.
  constraint asset_ready_is_verified check (
    status <> 'ready'
    or (
      content_type is not null
      and byte_size is not null
      and checksum_sha256 is not null
      and confirmed_at is not null
    )
  )
);

-- Every read names the workspace as well as the asset, because ownership is checked in
-- the query rather than by the route (`.claude/rules/workflow.md` §7).
create index asset_workspace_id_id_idx on asset (workspace_id, id);
