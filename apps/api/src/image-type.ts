import type { AssetContentType } from "@plotpop/contracts";

/**
 * What an uploaded file actually is, read from its leading bytes
 * (`docs/ai-comic-drama-saas-design.md` §26).
 *
 * The declared type cannot be trusted, and not because callers are hostile: a phone
 * photograph renamed `.png` is an ordinary mistake, and the browser reports the type from
 * the extension. Storing it as png would then serve HEIC bytes under a png content type
 * to every generation step downstream.
 *
 * Only the signatures of the formats §26's allowlist admits are here. Anything else is
 * unrecognised rather than guessed at — a format we cannot name is one no pipeline step
 * has been tested against.
 */

/** Enough for the longest signature below; WebP's marker ends at byte 12. */
export const IMAGE_SIGNATURE_BYTE_COUNT = 16;

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;

  return signature.every((byte, index) => bytes[index] === byte);
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * The three bytes every JPEG starts with. The fourth varies by marker (JFIF, Exif and
 * raw JPEG all differ), so matching further would reject valid files.
 */
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

/** `RIFF`, four bytes of length, then `WEBP` — the length is skipped rather than checked. */
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46];
const WEBP_MARKER = [0x57, 0x45, 0x42, 0x50];
const WEBP_MARKER_OFFSET = 8;

export function detectImageContentType(bytes: Uint8Array): AssetContentType | null {
  if (startsWith(bytes, PNG_SIGNATURE)) return "image/png";
  if (startsWith(bytes, JPEG_SIGNATURE)) return "image/jpeg";

  if (
    startsWith(bytes, RIFF_SIGNATURE) &&
    startsWith(bytes.subarray(WEBP_MARKER_OFFSET), WEBP_MARKER)
  ) {
    return "image/webp";
  }

  return null;
}
