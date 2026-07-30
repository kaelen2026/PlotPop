import { createHash } from "node:crypto";
import { IMAGE_SIGNATURE_BYTE_COUNT } from "../image-type.js";
import type {
  ObjectInspection,
  ObjectStore,
  SignedUrl,
  UploadPermission,
} from "../object-store.js";

/*
 * An in-memory `ObjectStore`.
 *
 * `.claude/rules/tdd.md` §6 makes object storage a system boundary, so it is one of the
 * few things that is faked. What these tests are about is what the api does with what it
 * finds — an unfinished upload, bytes that are not what was declared, two confirmations
 * racing — and none of that is easier to arrange against real storage. Whether a signed
 * url actually works is proved once, by the browser, in the end-to-end suite.
 */

export type FakeObjectStore = ObjectStore & {
  /** Puts bytes where an upload would have put them. */
  put(key: string, bytes: Uint8Array): void;
  /** Every upload permission signed, so a test can assert what the url was for. */
  readonly signed: readonly UploadPermission[];
};

/** Fixed rather than derived from the clock, because no test asserts on the duration. */
const TTL_SECONDS = 300;

export function createFakeObjectStore(): FakeObjectStore {
  const objects = new Map<string, Uint8Array>();
  const signed: UploadPermission[] = [];

  function url(key: string, operation: string): SignedUrl {
    return {
      url: `https://storage.test/${key}?operation=${operation}&signature=fake`,
      expiresAt: new Date(Date.now() + TTL_SECONDS * 1000),
    };
  }

  return {
    signed,

    put(key, bytes) {
      objects.set(key, bytes);
    },

    async presignUpload(permission: UploadPermission): Promise<SignedUrl> {
      signed.push(permission);

      return url(permission.key, "put");
    },

    async presignDownload({ key }): Promise<SignedUrl> {
      return url(key, "get");
    },

    async inspect({ key }): Promise<ObjectInspection | null> {
      const bytes = objects.get(key);

      if (bytes === undefined) return null;

      return {
        leadingBytes: bytes.subarray(0, IMAGE_SIGNATURE_BYTE_COUNT),
        byteSize: bytes.byteLength,
        checksumSha256: createHash("sha256").update(bytes).digest("hex"),
      };
    },
  };
}

/** A byte sequence with a real signature, padded to whatever length a test wants. */
export function fakeImageBytes(
  format: "png" | "jpeg" | "webp" | "heic",
  byteSize: number,
): Uint8Array {
  const signatures = {
    png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    jpeg: [0xff, 0xd8, 0xff, 0xe0],
    webp: [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50],
    // `ftypheic`: what a phone photograph renamed `.png` actually starts with.
    heic: [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63],
  }[format];

  const bytes = new Uint8Array(byteSize);
  bytes.set(signatures.slice(0, byteSize));

  return bytes;
}
