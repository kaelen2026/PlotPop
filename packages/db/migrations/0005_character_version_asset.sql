-- The reference images a character version pins
-- (`docs/ai-comic-drama-saas-design.md` §20.2, §32.1, §32.7).
--
-- Pinned to the version rather than to the character, for the same reason the appearance
-- is: an episode generated from version 2 has to keep finding version 2's images. Hanging
-- them off the identity would make uploading a better photograph silently change what
-- every shipped episode was made from, which is what §32.7 exists to prevent.
--
-- A join table rather than columns on `character_version`, because an asset is a
-- workspace level record (§20.4) that more than one thing may reference — §6.1 has voices
-- and a style guide arriving on the same series.

create table character_version_asset (
  character_version_id uuid not null references character_version (id) on delete cascade,
  -- Deliberately without `on delete cascade`, and deliberately not nullable: deleting an
  -- asset that a shipped version pinned would make that episode unreproducible, so the
  -- default restrict is the behaviour we want. Removing an image means adding a version
  -- that does not pin it, never deleting the file the old version used.
  asset_id uuid not null references asset (id),
  -- The order the creator gave them in. §32.1's front and back images are distinguished
  -- by position for now; naming them would be inventing product vocabulary that no page
  -- yet writes.
  position integer not null,
  primary key (character_version_id, asset_id),
  -- One image per slot, so "the second reference image" has a single meaning.
  constraint character_version_asset_position_unique unique (character_version_id, position),
  constraint character_version_asset_position_not_negative check (position >= 0)
);

-- Both reads go from a version to its images, in order.
create index character_version_asset_version_id_position_idx
  on character_version_asset (character_version_id, position);

-- The reverse direction, which is what the foreign key above needs in order to refuse a
-- delete without scanning the table.
create index character_version_asset_asset_id_idx on character_version_asset (asset_id);
