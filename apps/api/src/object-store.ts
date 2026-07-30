/**
 * The narrow view of object storage the routes are given
 * (`docs/ai-comic-drama-saas-design.md` §26).
 *
 * An interface rather than a client because `.claude/rules/tdd.md` §6 makes object storage
 * a system boundary: it is mocked, unlike Postgres. The api's integration tests inject an
 * in-memory implementation and the end-to-end suite drives the real one through a browser,
 * which is the only place a signed url is worth proving.
 *
 * It is also the shape this moves out in. When the Media Worker takes over media
 * parameters and safety scanning (§26, once the queue exists) both services need these
 * operations, and that is the slice where this becomes `packages/storage`.
 */

/** Permission to perform one operation on one object, for a few minutes. */
export type SignedUrl = {
  readonly url: string;
  readonly expiresAt: Date;
};

export type UploadPermission = {
  readonly key: string;
  /** Signed, so the upload cannot store bytes under a different type than declared. */
  readonly contentType: string;
  /** Signed too: the body has to be exactly this long, which is what bounds the size. */
  readonly byteSize: number;
};

/**
 * What one pass over an object tells us about it.
 *
 * One pass rather than a HEAD followed by a GET: the size a HEAD reports is metadata,
 * and the thing worth knowing is what the bytes are. The leading bytes come off the same
 * stream that feeds the digest, so peak memory is the hash state rather than the file.
 */
export type ObjectInspection = {
  /** The first `IMAGE_SIGNATURE_BYTE_COUNT` bytes, or fewer if the object is shorter. */
  readonly leadingBytes: Uint8Array;
  readonly byteSize: number;
  readonly checksumSha256: string;
};

export type ObjectStore = {
  /** A url the browser may PUT exactly these bytes to. */
  presignUpload(permission: UploadPermission): Promise<SignedUrl>;
  /** A url that reads one object. §26 forbids a permanent public address for private material. */
  presignDownload(input: { readonly key: string }): Promise<SignedUrl>;
  /** `null` if the object is not there, which is what an unfinished upload looks like. */
  inspect(input: { readonly key: string }): Promise<ObjectInspection | null>;
};
