import { createHash } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { IMAGE_SIGNATURE_BYTE_COUNT } from "./image-type.js";
import type { ObjectInspection, ObjectStore, SignedUrl, UploadPermission } from "./object-store.js";

/**
 * The S3-compatible implementation of `ObjectStore` (§26).
 *
 * Two clients, because the api and the browser reach storage at different addresses and
 * SigV4 signs the host. Inside Compose the api talks to `minio:9000`, which resolves on
 * that network and nowhere else, while the browser has to be sent to the published port.
 * One client would either make the api's own reads fail or sign urls a browser cannot use.
 */

export type StorageConfig = {
  /** The address this process reads and writes through. */
  readonly endpoint: string;
  /** The address a browser is sent to. `packages/config` requires it separately. */
  readonly publicEndpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
};

/**
 * Long enough to choose a file and upload it on a slow connection, short enough that a
 * url captured from a log is worthless by the time anyone reads it (§29.4).
 */
export const UPLOAD_URL_TTL_SECONDS = 300;

/**
 * Longer than an upload url, because a rendered page holds these for as long as it is
 * open. §26 forbids a permanent public address, so the cost of it being short is a reload
 * and the cost of it being long is a url that outlives the session that fetched it.
 */
export const DOWNLOAD_URL_TTL_SECONDS = 900;

function createClient(config: StorageConfig, endpoint: string): S3Client {
  return new S3Client({
    endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    /*
     * MinIO addresses buckets by path. Virtual-host style would turn the bucket into a
     * subdomain of `localhost`, which resolves nowhere.
     */
    forcePathStyle: true,
  });
}

function expiresAt(seconds: number): Date {
  return new Date(Date.now() + seconds * 1000);
}

/** Whether the failure means "no such object" rather than "storage is broken". */
function isMissing(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;

  const candidate = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };

  return (
    candidate.name === "NoSuchKey" ||
    candidate.name === "NotFound" ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

export function createS3ObjectStore(config: StorageConfig): ObjectStore {
  const internal = createClient(config, config.endpoint);
  const external = createClient(config, config.publicEndpoint);

  return {
    async presignUpload(permission: UploadPermission): Promise<SignedUrl> {
      const url = await getSignedUrl(
        external,
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: permission.key,
          ContentType: permission.contentType,
          ContentLength: permission.byteSize,
        }),
        {
          expiresIn: UPLOAD_URL_TTL_SECONDS,
          /*
           * Both headers are pulled into the signature, which is what makes the declared
           * type and size limits rather than suggestions: the request has to carry exactly
           * these values or the signature does not verify. `content-length` works even
           * though scripts cannot set it — the browser fills in the real body length, so
           * signing it pins the body to that many bytes.
           */
          signableHeaders: new Set(["content-length", "content-type"]),
        },
      );

      return { url, expiresAt: expiresAt(UPLOAD_URL_TTL_SECONDS) };
    },

    async presignDownload({ key }): Promise<SignedUrl> {
      const url = await getSignedUrl(
        external,
        new GetObjectCommand({ Bucket: config.bucket, Key: key }),
        { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
      );

      return { url, expiresAt: expiresAt(DOWNLOAD_URL_TTL_SECONDS) };
    },

    async inspect({ key }): Promise<ObjectInspection | null> {
      let body: AsyncIterable<Uint8Array>;

      try {
        const response = await internal.send(
          new GetObjectCommand({ Bucket: config.bucket, Key: key }),
        );

        if (response.Body === undefined) return null;

        body = response.Body as AsyncIterable<Uint8Array>;
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }

      const digest = createHash("sha256");
      const leading: number[] = [];
      let byteSize = 0;

      /*
       * Streamed rather than buffered. A reference image is a few megabytes, but this is
       * the api rather than a worker and the number of concurrent confirmations is not
       * ours to bound — so peak memory here is the hash state and sixteen bytes,
       * whatever the file turns out to be.
       */
      for await (const chunk of body) {
        digest.update(chunk);
        byteSize += chunk.byteLength;

        if (leading.length < IMAGE_SIGNATURE_BYTE_COUNT) {
          leading.push(...chunk.subarray(0, IMAGE_SIGNATURE_BYTE_COUNT - leading.length));
        }
      }

      return {
        leadingBytes: new Uint8Array(leading),
        byteSize,
        checksumSha256: digest.digest("hex"),
      };
    },
  };
}
