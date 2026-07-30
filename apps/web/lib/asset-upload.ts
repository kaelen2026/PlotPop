import {
  ASSET_MAX_BYTE_SIZE,
  type AssetContentType,
  assetContentTypeSchema,
  assetUploadTicketSchema,
} from "@plotpop/contracts";
import { browserApi } from "./api-client";

/**
 * Uploading one file (`docs/ai-comic-drama-saas-design.md` §26).
 *
 * Three steps, because the browser writes to object storage directly and the api never sees
 * the bytes: ask for a ticket, PUT to the signed url, then confirm so the api reads what
 * arrived. A caller gets back an asset id only if all three succeeded — there is no partial
 * result worth handing on, since an unconfirmed asset cannot be pinned to anything.
 */

/** Why an upload did not produce an asset. Each one maps to copy the creator can act on. */
export type UploadFailure = "tooLarge" | "unsupported" | "failed";

export type UploadResult =
  | { readonly outcome: "uploaded"; readonly assetId: string }
  | { readonly outcome: "failed"; readonly reason: UploadFailure };

/**
 * What the browser says the file is, if it is a type we accept.
 *
 * Only a claim: the type comes from the extension on most platforms, which is why the api
 * reads the bytes at confirmation rather than trusting this. Checking it here is still worth
 * doing — it turns the common mistake into an immediate answer instead of a round trip.
 */
function declaredContentType(file: File): AssetContentType | null {
  const parsed = assetContentTypeSchema.safeParse(file.type);

  return parsed.success ? parsed.data : null;
}

export async function uploadAsset(
  file: File,
  location: { readonly workspaceId: string },
): Promise<UploadResult> {
  const contentType = declaredContentType(file);

  if (contentType === null) return { outcome: "failed", reason: "unsupported" };
  if (file.size > ASSET_MAX_BYTE_SIZE) return { outcome: "failed", reason: "tooLarge" };
  if (file.size === 0) return { outcome: "failed", reason: "unsupported" };

  const assets = browserApi.api.v1.workspaces[":workspaceId"].assets;
  const requested = await assets.$post({
    param: { workspaceId: location.workspaceId },
    json: {
      purpose: "character_reference",
      contentType,
      byteSize: file.size,
      rightsConfirmed: true,
    },
  });

  if (requested.status !== 201) return { outcome: "failed", reason: "failed" };

  const ticket = assetUploadTicketSchema.parse(await requested.json());

  /*
   * Straight to object storage, outside the api (§26). `fetch` rather than the typed client
   * because this is not our origin and there is no contract on the other end — what comes
   * back is S3's answer, and all that matters is whether it accepted the bytes.
   *
   * `Content-Length` is signed but deliberately not set here: scripts are not allowed to,
   * and the browser fills in the true body length, which is exactly the value the signature
   * requires. Sending a different number of bytes therefore fails the signature rather than
   * storing something we did not permit.
   */
  const stored = await fetch(ticket.uploadUrl, {
    method: "PUT",
    headers: { "content-type": contentType },
    body: file,
  });

  if (!stored.ok) return { outcome: "failed", reason: "failed" };

  const confirmed = await assets[":assetId"].confirmation.$post({
    param: { workspaceId: location.workspaceId, assetId: ticket.assetId },
  });

  // 422 is the api having read the bytes and disagreed with the declared type, which is the
  // renamed-photograph case the extension could not reveal.
  if (confirmed.status === 422) return { outcome: "failed", reason: "unsupported" };
  if (confirmed.status !== 200) return { outcome: "failed", reason: "failed" };

  return { outcome: "uploaded", assetId: ticket.assetId };
}
