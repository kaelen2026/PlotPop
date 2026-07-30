import { describe, expect, it } from "vitest";
import {
  ASSET_MAX_BYTE_SIZE,
  assetSchema,
  assetUploadRequestSchema,
  assetUploadTicketSchema,
} from "./asset.js";

/**
 * The Asset contract (`docs/ai-comic-drama-saas-design.md` §20.4, §26; ADR-006).
 *
 * An asset names an immutable file. The two payloads either side of an upload are
 * deliberately different shapes: a ticket describes a file that does not exist yet, and
 * an asset describes one whose bytes have been read and checked.
 */

const asset = {
  id: "6d0b2f19-3a5c-4e8e-9b2a-71f0c4d5e6a7",
  purpose: "character_reference",
  contentType: "image/png",
  byteSize: 40_512,
  checksumSha256: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  createdAt: "2026-07-30T09:00:00.000Z",
};

describe("asset", () => {
  it("describes a file whose bytes have been read", () => {
    expect(assetSchema.parse(asset)).toEqual(asset);
  });

  it("carries no status, because an asset a caller can see is one that is usable", () => {
    // `pending` and `rejected` are lifecycle states of the row, not of anything a
    // caller receives: an upload that failed its check is an error response, not an
    // asset with a flag on it. A field with one possible value would only invite a
    // client to branch on it.
    expect(assetSchema.safeParse({ ...asset, status: "ready" }).success).toBe(false);
  });

  it("refuses a storage key, which is ours and not the caller's to name", () => {
    // §26 keeps private material behind short-lived signed urls. A key in a payload is
    // a permanent handle to an object, which is the thing that must not exist.
    expect(assetSchema.safeParse({ ...asset, storageKey: "source/w/a" }).success).toBe(false);
  });

  it("refuses a checksum that is not a sha-256 digest", () => {
    // A checksum is only worth storing if its shape is fixed: §31.3 samples assets for
    // integrity, and a comparison against a differently encoded digest silently fails.
    expect(assetSchema.safeParse({ ...asset, checksumSha256: "9F86D081" }).success).toBe(false);
    expect(
      assetSchema.safeParse({ ...asset, checksumSha256: asset.checksumSha256.toUpperCase() })
        .success,
    ).toBe(false);
  });

  it("refuses a content type no generation step can read", () => {
    expect(assetSchema.safeParse({ ...asset, contentType: "image/heic" }).success).toBe(false);
    expect(assetSchema.safeParse({ ...asset, contentType: "application/pdf" }).success).toBe(false);
  });

  it("refuses a purpose it has no path for", () => {
    // §26 gives source material, intermediate output and exports separate paths and
    // lifecycles. An unknown purpose has no path, so it cannot be stored.
    expect(assetSchema.safeParse({ ...asset, purpose: "final_export" }).success).toBe(false);
  });
});

describe("asset upload request", () => {
  const request = {
    purpose: "character_reference",
    contentType: "image/png",
    byteSize: 40_512,
    rightsConfirmed: true,
  };

  it("declares what is about to be uploaded", () => {
    expect(assetUploadRequestSchema.parse(request)).toEqual(request);
  });

  it("cannot be expressed without confirming the right to use the file", () => {
    // §195 and §733: the upload flow has to ask. A literal `true` means the api has no
    // branch for an unconfirmed upload — it cannot receive one.
    expect(assetUploadRequestSchema.safeParse({ ...request, rightsConfirmed: false }).success).toBe(
      false,
    );

    const { rightsConfirmed: _confirmed, ...unconfirmed } = request;

    expect(assetUploadRequestSchema.safeParse(unconfirmed).success).toBe(false);
  });

  it("holds the declared size to the documented cap", () => {
    expect(
      assetUploadRequestSchema.safeParse({ ...request, byteSize: ASSET_MAX_BYTE_SIZE }).success,
    ).toBe(true);
    expect(
      assetUploadRequestSchema.safeParse({ ...request, byteSize: ASSET_MAX_BYTE_SIZE + 1 }).success,
    ).toBe(false);
  });

  it("refuses an empty file, which is not an image whatever it claims", () => {
    expect(assetUploadRequestSchema.safeParse({ ...request, byteSize: 0 }).success).toBe(false);
  });

  it("refuses a fractional size, because a signed length has to match the bytes exactly", () => {
    expect(assetUploadRequestSchema.safeParse({ ...request, byteSize: 40_512.5 }).success).toBe(
      false,
    );
  });

  it("refuses a filename, which would decide a storage key from outside", () => {
    // The key is derived from the asset id (§20.4: public ids reveal neither volume nor
    // ordering). Accepting a name here is how "../" ends up in a path.
    expect(assetUploadRequestSchema.safeParse({ ...request, filename: "ada.png" }).success).toBe(
      false,
    );
  });
});

describe("asset upload ticket", () => {
  const ticket = {
    assetId: "6d0b2f19-3a5c-4e8e-9b2a-71f0c4d5e6a7",
    uploadUrl: "http://localhost:9000/plotpop-local/source/w/a?X-Amz-Signature=abc",
    expiresAt: "2026-07-30T09:05:00.000Z",
  };

  it("hands back the id to confirm against and the url to upload to", () => {
    expect(assetUploadTicketSchema.parse(ticket)).toEqual(ticket);
  });

  it("states when the url stops working rather than how long it lasts", () => {
    // An absolute instant survives the round trip; a duration would be counted from
    // whenever the client happened to parse it.
    expect(assetUploadTicketSchema.safeParse({ ...ticket, expiresIn: 300 }).success).toBe(false);
  });
});
