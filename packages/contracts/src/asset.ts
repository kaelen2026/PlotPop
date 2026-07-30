import { z } from "zod";

/**
 * An Asset: an immutable record of one file in object storage
 * (`docs/ai-comic-drama-saas-design.md` §20.4, §26; ADR-006).
 *
 * Immutable means the file, not the row. An asset row is written before the bytes
 * exist and moves from `pending` to `ready` once they have been read and checked —
 * that is a conditional state transition, which §20.6 provides for. What never
 * changes is where it points and what it hashes to: replacing a file means a new
 * Asset, because an export that recorded this one has to keep finding these bytes.
 *
 * The storage key is deliberately absent from every payload here. §26 keeps private
 * material behind short-lived signed urls, and a key is a permanent handle to an
 * object — exactly the thing that must not travel.
 */

/**
 * 10 MiB, which is a generous reference photograph and a long way below what would
 * make the confirmation read expensive.
 *
 * It is a product decision rather than a technical limit, so it lives in the contract
 * the form and the api both read: two numbers would be two answers to "too large".
 */
export const ASSET_MAX_BYTE_SIZE = 10 * 1024 * 1024;

/**
 * What the file is for.
 *
 * §26 gives source material, intermediate output and exports separate storage paths
 * and lifecycle rules, so a purpose is what decides where an object lives and how long
 * it is kept. An unknown purpose has no path, which is why this is an allowlist and not
 * free text. The rest join it as the slices that produce them land.
 */
export const assetPurposeSchema = z.enum(["character_reference"]);

export type AssetPurpose = z.infer<typeof assetPurposeSchema>;

/**
 * The formats a reference image may be in.
 *
 * Narrow on purpose: every one of these decodes everywhere in the pipeline without a
 * conversion step. HEIC is the common omission and the reason confirmation checks the
 * real bytes — a phone photo renamed `.png` is a normal mistake, not an attack.
 */
export const assetContentTypeSchema = z.enum(["image/png", "image/jpeg", "image/webp"]);

export type AssetContentType = z.infer<typeof assetContentTypeSchema>;

/**
 * Lowercase hex, fixed length. §31.3 samples assets to check they are still intact, and
 * a digest compared against a differently encoded one fails quietly rather than loudly.
 */
const checksumSha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

/** Whole bytes: a signed upload length has to match the body exactly (see the ticket). */
const assetByteSizeSchema = z.number().int().positive().max(ASSET_MAX_BYTE_SIZE);

/**
 * An asset whose bytes have been read and checked.
 *
 * There is no status field. `pending` and `rejected` describe the row's lifecycle, not
 * anything a caller receives: an upload that failed its check is an error response, and
 * a field with one possible value would only invite a client to branch on it.
 */
export const assetSchema = z.strictObject({
  id: z.uuid(),
  purpose: assetPurposeSchema,
  /** The type the bytes actually are, which is not necessarily the one declared. */
  contentType: assetContentTypeSchema,
  byteSize: assetByteSizeSchema,
  checksumSha256: checksumSha256Schema,
  createdAt: z.iso.datetime(),
});

export type Asset = z.infer<typeof assetSchema>;

/**
 * What asking for an upload url declares.
 *
 * Everything here is a claim the client makes about a file the api has not seen. The
 * api signs a url that permits exactly this type and exactly this many bytes, then
 * verifies the claim against the object at confirmation — so a false declaration
 * cannot become a stored asset, and cannot even become a successful upload.
 *
 * No filename: the storage key is derived from the asset id, because §20.4 requires
 * public identifiers to reveal neither volume nor ordering. Accepting a name from
 * outside is also how `../` ends up in a path.
 */
export const assetUploadRequestSchema = z.strictObject({
  purpose: assetPurposeSchema,
  contentType: assetContentTypeSchema,
  byteSize: assetByteSizeSchema,
  /**
   * §195 and §733: the upload flow must ask the creator to confirm they hold the rights
   * to the material. A literal `true` means the api has no branch for an unconfirmed
   * upload — the contract cannot express one.
   */
  rightsConfirmed: z.literal(true),
});

export type AssetUploadRequest = z.infer<typeof assetUploadRequestSchema>;

/**
 * Permission to write one object, for a few minutes.
 *
 * `expiresAt` is an instant rather than a duration: a duration would be counted from
 * whenever the client got round to parsing it, which is not when it was issued.
 */
export const assetUploadTicketSchema = z.strictObject({
  assetId: assetSchema.shape.id,
  uploadUrl: z.url(),
  expiresAt: z.iso.datetime(),
});

export type AssetUploadTicket = z.infer<typeof assetUploadTicketSchema>;

/**
 * An asset as it appears inside something that references it, with permission to read it.
 *
 * The url is here rather than behind a separate request because signing is a local
 * computation: fetching a cast of ten would otherwise be eleven round trips to say
 * something the first response already knew. `expiresAt` travels with it so the short life
 * §26 requires is visible to whatever renders it, instead of being discovered when an
 * image stops loading.
 */
export const assetReferenceSchema = z.strictObject({
  assetId: assetSchema.shape.id,
  contentType: assetContentTypeSchema,
  url: z.url(),
  expiresAt: z.iso.datetime(),
});

export type AssetReference = z.infer<typeof assetReferenceSchema>;
