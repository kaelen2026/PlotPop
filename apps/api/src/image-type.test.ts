import { describe, expect, it } from "vitest";
import { detectImageContentType, IMAGE_SIGNATURE_BYTE_COUNT } from "./image-type.js";

/**
 * Reading what a file is rather than what it says it is (§26).
 *
 * The case that motivates this is not an attack: a phone photograph renamed `.png` is an
 * ordinary mistake, the browser reports the type from the extension, and storing it as
 * png would serve HEIC bytes under a png content type to everything downstream.
 */

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array([...values, ...Array(IMAGE_SIGNATURE_BYTE_COUNT).fill(0)]).subarray(
    0,
    IMAGE_SIGNATURE_BYTE_COUNT,
  );
}

const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0);
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50);

describe("detecting an uploaded image's real type", () => {
  it("names each format the upload allowlist admits", () => {
    expect(detectImageContentType(PNG)).toBe("image/png");
    expect(detectImageContentType(JPEG)).toBe("image/jpeg");
    expect(detectImageContentType(WEBP)).toBe("image/webp");
  });

  it("accepts a jpeg whatever its fourth byte is", () => {
    // JFIF, Exif and raw JPEG differ from byte four onwards, so matching further would
    // reject files that every decoder reads.
    expect(detectImageContentType(bytes(0xff, 0xd8, 0xff, 0xdb))).toBe("image/jpeg");
    expect(detectImageContentType(bytes(0xff, 0xd8, 0xff, 0xe1))).toBe("image/jpeg");
  });

  it("does not recognise a HEIC photograph, which is the mistake this exists for", () => {
    // `ftypheic` at offset four. Common enough on macOS that the rejection has to be a
    // sentence a creator can act on rather than a 500.
    const heic = bytes(0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63);

    expect(detectImageContentType(heic)).toBeNull();
  });

  it("does not recognise something that only ends up looking like an image", () => {
    // `RIFF` alone is also a wav file; the `WEBP` marker at offset eight is what
    // distinguishes them.
    const wav = bytes(0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45);

    expect(detectImageContentType(wav)).toBeNull();
    expect(detectImageContentType(bytes(0x25, 0x50, 0x44, 0x46))).toBeNull();
  });

  it("does not read past the end of a file too short to have a signature", () => {
    // A truncated upload is a real outcome of a connection dropping mid-PUT.
    expect(detectImageContentType(new Uint8Array([0x89, 0x50]))).toBeNull();
    expect(detectImageContentType(new Uint8Array())).toBeNull();
    // `RIFF` and nothing else: the WebP marker is past the end.
    expect(detectImageContentType(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBeNull();
  });
});
