"use client";

import { type AssetReference, CHARACTER_REFERENCE_IMAGE_MAX_COUNT } from "@plotpop/contracts";
import { Button } from "@plotpop/ui/components/ui/button";
import { Checkbox } from "@plotpop/ui/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@plotpop/ui/components/ui/field";
import { Input } from "@plotpop/ui/components/ui/input";
import { type ChangeEvent, useId, useState } from "react";
import { type UploadFailure, uploadAsset } from "@/lib/asset-upload";
import { messages } from "@/locales/en";

const COPY = messages.series.cast.referenceImages;

/**
 * Choosing the reference images one character version will pin (§26, §32.1).
 *
 * Shared by the two forms that write a version — creating a character and changing its
 * appearance — because the interaction is the same in both and the ordering it enforces is
 * not obvious: a version row is never rewritten, so an image has to be uploaded and
 * confirmed *before* the version that references it exists. Two copies of that would be two
 * chances to get it wrong.
 *
 * Controlled rather than self-contained: the parent submits the ids, so it has to hold them.
 * What this owns is everything the parent should not have to know — the rights confirmation
 * that gates the picker, the upload, the preview urls and their lifetime.
 */

/**
 * An image the version being written will pin, and where to render it from.
 *
 * A just-uploaded file has no signed url yet — confirmation returns the asset record, not
 * permission to read it back — so it is previewed from the bytes the browser already has.
 * `local` is what says the url has to be revoked when it goes away.
 */
export type PendingImage = {
  readonly assetId: string;
  readonly url: string;
  readonly local: boolean;
};

/** The images already stored on a version, as this field wants them. */
export function storedImages(images: readonly AssetReference[]): PendingImage[] {
  return images.map((image) => ({ assetId: image.assetId, url: image.url, local: false }));
}

/**
 * Drops the previews held for uploads made during this edit.
 *
 * Object urls are not garbage collected while the document lives, so a form opened and
 * abandoned a few times would keep every file it ever previewed in memory. Exported because
 * the parent decides when an edit is over.
 */
export function releasePreviews(held: readonly PendingImage[]): void {
  for (const image of held) {
    if (image.local) URL.revokeObjectURL(image.url);
  }
}

export function ReferenceImageField({
  characterName,
  images,
  onChange,
  workspaceId,
}: {
  /** Named in the alternative text: a cast of ten would otherwise all read the same. */
  characterName: string;
  images: readonly PendingImage[];
  onChange: (next: readonly PendingImage[]) => void;
  workspaceId: string;
}) {
  const pickerId = useId();
  const errorId = useId();
  const rightsId = useId();

  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const named = characterName.trim();
  /** A character being created has no name yet, and "for " with nothing after it is worse. */
  const describe = (position: number) =>
    named === "" ? COPY.altNew(position) : COPY.alt(named, position);

  function reportFailure(reason: UploadFailure): void {
    setError(COPY.errors[reason]);
  }

  /**
   * Uploads the chosen file straight away, before the version is saved.
   *
   * It has to be this order: a version row is never rewritten, so an image cannot be
   * attached to one after it exists. The upload therefore produces an asset id that the
   * version will carry when the form is submitted — and an upload the creator then abandons
   * leaves an unreferenced asset, which is the orphan §26 has a Reconciler for.
   */
  async function handleFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];

    // Clearing the picker is not an error, and neither is opening it and pressing cancel.
    if (file === undefined) return;

    setError(undefined);

    if (images.length >= CHARACTER_REFERENCE_IMAGE_MAX_COUNT) {
      setError(COPY.errors.tooMany);

      return;
    }

    setUploading(true);
    const result = await uploadAsset(file, { workspaceId });
    setUploading(false);

    // Emptied whatever the outcome, so choosing the same file again is a change the input
    // reports rather than one it swallows.
    event.target.value = "";

    if (result.outcome === "failed") {
      reportFailure(result.reason);

      return;
    }

    // Previewed from the bytes the browser already has, so the creator sees what they chose
    // without a round trip for permission to read back what they just sent.
    onChange([...images, { assetId: result.assetId, url: URL.createObjectURL(file), local: true }]);
  }

  function remove(assetId: string): void {
    releasePreviews(images.filter((held) => held.assetId === assetId));
    onChange(images.filter((held) => held.assetId !== assetId));
  }

  return (
    <>
      <Field data-invalid={error !== undefined}>
        <FieldLabel htmlFor={pickerId}>{COPY.label}</FieldLabel>
        <FieldDescription>{COPY.description}</FieldDescription>
        <Input
          accept="image/png,image/jpeg,image/webp"
          aria-describedby={error === undefined ? undefined : errorId}
          aria-invalid={error !== undefined}
          /*
           * §195 and §733: the upload has to be preceded by the creator confirming they hold
           * the rights. Disabling the picker rather than validating afterwards means nothing
           * is ever sent before the confirmation exists.
           */
          disabled={!rightsConfirmed || uploading}
          id={pickerId}
          name="referenceImage"
          onChange={handleFileChange}
          type="file"
        />
        <FieldError announce={false} id={errorId}>
          {error}
        </FieldError>
      </Field>

      <div className="flex items-center gap-2">
        <Checkbox
          checked={rightsConfirmed}
          id={rightsId}
          onCheckedChange={(checked) => setRightsConfirmed(checked === true)}
        />
        <FieldLabel htmlFor={rightsId}>{COPY.rights}</FieldLabel>
      </div>

      {uploading ? (
        <p className="text-body-sm text-muted-foreground" role="status">
          {COPY.uploading}
        </p>
      ) : null}

      {images.length === 0 ? null : (
        <div className="flex flex-col gap-2">
          {/*
           * Shown rather than counted. The new version states its images in full, so what is
           * on screen here is exactly what saving will pin — and removing one has to be a
           * visible act rather than a number quietly going down.
           */}
          <span className="text-label-sm text-muted-foreground">{COPY.keeping}</span>
          <ul className="flex flex-wrap gap-2">
            {images.map((image, index) => (
              <li className="flex flex-col items-center gap-1" key={image.assetId}>
                {/* biome-ignore lint/performance/noImgElement: a signed url must not be cached by the image optimiser, and a blob url has nothing to optimise. */}
                <img
                  alt={describe(index + 1)}
                  className="size-16 rounded-md object-cover stroke-hairline"
                  src={image.url}
                />
                <Button onClick={() => remove(image.assetId)} type="button" variant="ghost">
                  {COPY.remove}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
