"use client";

import {
  type AssetReference,
  CHARACTER_REFERENCE_IMAGE_MAX_COUNT,
  type Character,
  type CharacterVersion,
  characterVersionCreateInputSchema,
} from "@plotpop/contracts";
import { Badge } from "@plotpop/ui/components/ui/badge";
import { Button } from "@plotpop/ui/components/ui/button";
import { Checkbox } from "@plotpop/ui/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@plotpop/ui/components/ui/field";
import { Input } from "@plotpop/ui/components/ui/input";
import { Textarea } from "@plotpop/ui/components/ui/textarea";
import { useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, useEffect, useId, useRef, useState } from "react";
import { browserApi } from "@/lib/api-client";
import { type UploadFailure, uploadAsset } from "@/lib/asset-upload";
import { messages } from "@/locales/en";

const COPY = messages.series.cast;

/** What the last attempt ran into. `conflict` is the one with its own recovery. */
type Refusal = "conflict" | "failed";

type History =
  | { readonly state: "closed" }
  | { readonly state: "loading" }
  | { readonly state: "failed" }
  | { readonly state: "read"; readonly earlier: CharacterVersion[] };

/**
 * A version's reference images, shown at a size a creator can recognise a face in.
 *
 * A plain `img` rather than `next/image`: the url is signed and expires, so optimising it
 * would cache a copy that outlives the permission to read it — and the optimiser would need
 * a remote pattern per environment for an origin that changes with deployment.
 */
function ReferenceImages({
  characterName,
  images,
}: {
  characterName: string;
  images: readonly AssetReference[];
}) {
  if (images.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-2">
      {images.map((image, index) => (
        <li key={image.assetId}>
          {/* biome-ignore lint/performance/noImgElement: a signed url must not be cached by the image optimiser; see the note above this component. */}
          <img
            alt={COPY.referenceImages.alt(characterName, index + 1)}
            className="size-16 rounded-md object-cover stroke-hairline"
            src={image.url}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * An image the version being edited will pin, and where to render it from.
 *
 * A just-uploaded file has no signed url yet — confirmation returns the asset record, not
 * permission to read it back — so it is previewed from the bytes the browser already has.
 * `local` is what says the url has to be revoked when it goes away.
 */
type PendingImage = {
  readonly assetId: string;
  readonly url: string;
  readonly local: boolean;
};

function storedImages(character: Character): PendingImage[] {
  return character.currentVersion.referenceImages.map((image) => ({
    assetId: image.assetId,
    url: image.url,
    local: false,
  }));
}

/**
 * One character in a series' cast (§20.2, §32.7).
 *
 * Editing an appearance appends a version rather than replacing one, so the row offers two
 * things: the change, and the history that proves the earlier looks are still there. A
 * creator who has to take that on faith has no way to reason about why last month's episode
 * looks the way it does.
 *
 * The history is read when asked for rather than with the page: a character accumulates
 * versions for as long as it is worked on, and a cast of ten should not carry all of them
 * into the first paint.
 */
export function CharacterRow({
  character,
  seriesId,
  workspaceId,
}: {
  character: Character;
  seriesId: string;
  workspaceId: string;
}) {
  const router = useRouter();
  const appearanceId = useId();
  const errorId = useId();
  const historyHeadingId = useId();
  const imageId = useId();
  const imageErrorId = useId();
  const rightsId = useId();
  const field = useRef<HTMLTextAreaElement>(null);

  const [editing, setEditing] = useState(false);
  const [appearance, setAppearance] = useState(character.currentVersion.appearance);
  const [appearanceError, setAppearanceError] = useState<string | undefined>(undefined);
  const [refusal, setRefusal] = useState<Refusal | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [history, setHistory] = useState<History>({ state: "closed" });

  /*
   * The images the version being written will pin, seeded from the version on screen.
   *
   * Carried forward on purpose: a version states its images in full rather than as a change
   * to the last one, so an appearance edit that sent nothing would quietly drop every
   * photograph the creator had uploaded. Removing one is then an explicit act.
   *
   * One list for the images that are already stored and the ones just uploaded, because a
   * remove button that worked on some of them and not others is the kind of inconsistency a
   * person notices immediately.
   */
  const [images, setImages] = useState<readonly PendingImage[]>(() => storedImages(character));
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState<string | undefined>(undefined);

  const referenceAssetIds = images.map((image) => image.assetId);

  // Focus follows the editor that just opened (§15), so the keyboard path does not jump
  // back to the top of the page.
  useEffect(() => {
    if (editing) field.current?.focus();
  }, [editing]);

  const versions =
    browserApi.api.v1.workspaces[":workspaceId"].series[":seriesId"].characters[":characterId"]
      .versions;

  const param = { workspaceId, seriesId, characterId: character.id };

  /**
   * Drops the previews held for uploads made during this edit.
   *
   * Object urls are not garbage collected while the document lives, so an edit opened and
   * abandoned a few times would keep every file it ever previewed in memory.
   */
  function releasePreviews(held: readonly PendingImage[]): void {
    for (const image of held) {
      if (image.local) URL.revokeObjectURL(image.url);
    }
  }

  function startEditing(): void {
    setAppearance(character.currentVersion.appearance);
    setAppearanceError(undefined);
    setRefusal(undefined);
    // Defensive: an editor closed by saving or cancelling has already released its previews,
    // and revoking a url twice is a no-op. Kept outside the state updater because a reducer
    // React may call twice is not a place for a side effect.
    releasePreviews(images);
    setImages(storedImages(character));
    setRightsConfirmed(false);
    setImageError(undefined);
    setEditing(true);
  }

  function stopEditing(): void {
    releasePreviews(images);
    setImages(storedImages(character));
    setEditing(false);
  }

  function reportUploadFailure(reason: UploadFailure): void {
    setImageError(COPY.referenceImages.errors[reason]);
  }

  /**
   * Uploads the chosen file straight away, before the version is saved.
   *
   * It has to be this order: a version row is never rewritten, so an image cannot be attached
   * to one after it exists. The upload therefore produces an asset id that the version will
   * carry when the form is submitted — and an upload the creator then cancels leaves an
   * unreferenced asset, which is the orphan §26 has a Reconciler for.
   */
  async function handleFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];

    // Clearing the picker is not an error, and neither is re-opening it and pressing cancel.
    if (file === undefined) return;

    setImageError(undefined);

    if (referenceAssetIds.length >= CHARACTER_REFERENCE_IMAGE_MAX_COUNT) {
      setImageError(COPY.referenceImages.errors.tooMany);

      return;
    }

    setUploading(true);
    const result = await uploadAsset(file, { workspaceId });
    setUploading(false);

    // Emptied whatever the outcome, so choosing the same file again is a change the input
    // reports rather than one it swallows.
    event.target.value = "";

    if (result.outcome === "failed") {
      reportUploadFailure(result.reason);

      return;
    }

    // Previewed from the bytes the browser already has, so the creator sees what they chose
    // without a round trip for permission to read back what they just sent.
    setImages((current) => [
      ...current,
      { assetId: result.assetId, url: URL.createObjectURL(file), local: true },
    ]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setRefusal(undefined);

    const parsed = characterVersionCreateInputSchema.safeParse({
      appearance,
      revision: character.revision,
      referenceAssetIds,
    });

    if (!parsed.success) {
      const issue = parsed.error.issues.find((candidate) => candidate.path[0] === "appearance");

      setAppearanceError(
        issue?.code === "too_big"
          ? COPY.create.appearance.errors.tooLong
          : COPY.create.appearance.errors.required,
      );

      return;
    }

    setAppearanceError(undefined);
    setPending(true);

    const response = await versions.$post({ param, json: parsed.data });

    setPending(false);

    if (response.status !== 201) {
      /*
       * What was typed stays where it is, and on a conflict the page is not refreshed
       * either: re-reading behind someone's back would replace the row and discard the
       * paragraph they just wrote, so the reload is offered rather than performed.
       */
      setRefusal(response.status === 409 ? "conflict" : "failed");

      return;
    }

    /*
     * The previews go with the editor. What replaces them is the same images re-read from
     * the api with a fresh signed url, which is also the proof they were actually stored.
     */
    releasePreviews(images);
    setImages(storedImages(character));
    setEditing(false);
    // The list is rendered by the Server Component that owns the page, so the new version
    // appears by asking the page to re-read.
    router.refresh();
  }

  async function toggleHistory(): Promise<void> {
    if (history.state !== "closed") {
      setHistory({ state: "closed" });

      return;
    }

    setHistory({ state: "loading" });

    const response = await versions.$get({ param });

    if (response.status !== 200) {
      setHistory({ state: "failed" });

      return;
    }

    const read = await response.json();

    // The current version is already on screen; the history is what is behind it.
    setHistory({
      state: "read",
      earlier: read.versions.filter((entry) => entry.version !== character.currentVersion.version),
    });
  }

  return (
    <li className="flex flex-col gap-2 stroke-hairline-b py-4 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-heading-xs">{character.name}</span>
        {/* Text, not a colour or a position: §6.8 requires a state to carry a label. */}
        <Badge variant="secondary">
          {COPY.version} {character.currentVersion.version}
        </Badge>
      </div>

      {editing ? (
        <form className="flex w-full max-w-form flex-col gap-2" noValidate onSubmit={handleSubmit}>
          {refusal === undefined ? null : (
            // Text, not a colour alone (§2.3), and announced when it appears.
            <p className="text-body-sm text-destructive" role="alert">
              {refusal === "conflict" ? COPY.update.conflict : COPY.update.failed}
            </p>
          )}

          <Field data-invalid={appearanceError !== undefined}>
            <FieldLabel htmlFor={appearanceId}>{COPY.create.appearance.label}</FieldLabel>
            <Textarea
              aria-describedby={appearanceError === undefined ? undefined : errorId}
              aria-invalid={appearanceError !== undefined}
              id={appearanceId}
              name="appearance"
              onChange={(event) => setAppearance(event.target.value)}
              ref={field}
              rows={4}
              value={appearance}
            />
            <FieldError announce={false} id={errorId}>
              {appearanceError}
            </FieldError>
          </Field>

          <Field data-invalid={imageError !== undefined}>
            <FieldLabel htmlFor={imageId}>{COPY.referenceImages.label}</FieldLabel>
            <p className="text-body-sm text-muted-foreground">{COPY.referenceImages.description}</p>
            <Input
              accept="image/png,image/jpeg,image/webp"
              aria-describedby={imageError === undefined ? undefined : imageErrorId}
              aria-invalid={imageError !== undefined}
              /*
               * §195 and §733: the upload has to be preceded by the creator confirming they
               * hold the rights. Disabling the picker rather than validating afterwards means
               * nothing is ever sent before the confirmation exists.
               */
              disabled={!rightsConfirmed || uploading}
              id={imageId}
              name="referenceImage"
              onChange={handleFileChange}
              type="file"
            />
            <FieldError announce={false} id={imageErrorId}>
              {imageError}
            </FieldError>
          </Field>

          <div className="flex items-center gap-2">
            <Checkbox
              checked={rightsConfirmed}
              id={rightsId}
              onCheckedChange={(checked) => setRightsConfirmed(checked === true)}
            />
            <FieldLabel htmlFor={rightsId}>{COPY.referenceImages.rights}</FieldLabel>
          </div>

          {uploading ? (
            <p className="text-body-sm text-muted-foreground" role="status">
              {COPY.referenceImages.uploading}
            </p>
          ) : null}

          {images.length === 0 ? null : (
            <div className="flex flex-col gap-2">
              {/*
               * Shown rather than counted. The new version states its images in full, so what
               * is on screen here is exactly what saving will pin — and removing one has to be
               * a visible act rather than a number quietly going down.
               */}
              <span className="text-label-sm text-muted-foreground">
                {COPY.referenceImages.keeping}
              </span>
              <ul className="flex flex-wrap gap-2">
                {images.map((image, index) => (
                  <li className="flex flex-col items-center gap-1" key={image.assetId}>
                    {/* biome-ignore lint/performance/noImgElement: a signed url must not be cached by the image optimiser; see the note above ReferenceImages. */}
                    <img
                      alt={COPY.referenceImages.alt(character.name, index + 1)}
                      className="size-16 rounded-md object-cover stroke-hairline"
                      src={image.url}
                    />
                    <Button
                      onClick={() =>
                        setImages((current) => {
                          releasePreviews(current.filter((held) => held.assetId === image.assetId));

                          return current.filter((held) => held.assetId !== image.assetId);
                        })
                      }
                      type="button"
                      variant="ghost"
                    >
                      {COPY.referenceImages.remove}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button disabled={pending} type="submit">
              {pending ? COPY.update.pending : COPY.update.submit}
            </Button>
            <Button onClick={stopEditing} type="button" variant="ghost">
              {COPY.update.cancel}
            </Button>
            {refusal === "conflict" ? (
              <Button onClick={() => router.refresh()} type="button" variant="outline">
                {COPY.update.reload}
              </Button>
            ) : null}
          </div>
        </form>
      ) : (
        <>
          <p className="max-w-prose text-body-sm text-muted-foreground">
            {character.currentVersion.appearance}
          </p>
          <ReferenceImages
            characterName={character.name}
            images={character.currentVersion.referenceImages}
          />
        </>
      )}

      <div className="flex flex-wrap gap-2">
        {editing ? null : (
          <Button onClick={startEditing} type="button" variant="outline">
            {COPY.update.action}
          </Button>
        )}
        <Button
          aria-expanded={history.state !== "closed"}
          onClick={toggleHistory}
          type="button"
          variant="ghost"
        >
          {history.state === "closed" ? COPY.history.show : COPY.history.hide}
        </Button>
      </div>

      {history.state === "loading" ? (
        <p className="text-body-sm text-muted-foreground">{COPY.history.loading}</p>
      ) : null}

      {history.state === "failed" ? (
        <p className="text-body-sm text-destructive" role="alert">
          {COPY.history.failed}
        </p>
      ) : null}

      {history.state === "read" ? (
        history.earlier.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">{COPY.history.only}</p>
        ) : (
          <div className="flex flex-col gap-2">
            <h4 className="text-label-md" id={historyHeadingId}>
              {COPY.history.heading}
            </h4>
            <ul aria-labelledby={historyHeadingId} className="flex flex-col gap-2">
              {history.earlier.map((entry) => (
                <li className="flex flex-col gap-1" key={entry.version}>
                  <span className="text-label-sm text-muted-foreground">
                    {COPY.version} {entry.version}
                  </span>
                  <p className="max-w-prose text-body-sm text-muted-foreground">
                    {entry.appearance}
                  </p>
                  {/* What that version was generated from, which is the point of keeping it. */}
                  <ReferenceImages characterName={character.name} images={entry.referenceImages} />
                </li>
              ))}
            </ul>
          </div>
        )
      ) : null}
    </li>
  );
}
