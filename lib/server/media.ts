import "server-only";
import { createHash } from "node:crypto";
import { db } from "./db";

/** Uploads arrive already resized in the browser; this is a backstop under the 1 MB action limit. */
export const MAX_MEDIA_BYTES = 950 * 1024;

const TYPES = [
  { type: "image/jpeg", ext: "jpg", test: (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/png", ext: "png", test: (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: "image/webp", ext: "webp", test: (b: Buffer) => b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP" },
  { type: "image/avif", ext: "avif", test: (b: Buffer) => b.toString("latin1", 4, 12) === "ftypavif" },
];

/** Media ids are content hashes with the file extension, e.g. "3f…a1.webp". */
const ID = /^[a-f0-9]{32}\.(jpg|png|webp|avif)$/;

export const mediaUrl = (id: string) => `/media/${id}`;

/**
 * Stores an uploaded photo and returns its id. The type is taken from the
 * file's bytes, not its name, so only real JPEG/PNG/WebP/AVIF images are
 * accepted (no SVG: it can carry scripts). Uploading the same file twice
 * returns the same id.
 */
export async function saveMedia(bytes: Buffer, uploadedBy: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (bytes.length === 0) return { ok: false, error: "The file is empty." };
  if (bytes.length > MAX_MEDIA_BYTES) return { ok: false, error: "The photo is too large. Please use one under 950 KB." };
  const kind = TYPES.find((t) => t.test(bytes));
  if (!kind) return { ok: false, error: "Please upload a JPEG, PNG, WebP or AVIF photo." };
  const id = `${createHash("sha256").update(bytes).digest("hex").slice(0, 32)}.${kind.ext}`;
  await db()`
    insert into media (id, content_type, bytes, size, uploaded_by)
    values (${id}, ${kind.type}, ${bytes}, ${bytes.length}, ${uploadedBy})
    on conflict (id) do nothing`;
  return { ok: true, id };
}

export async function getMedia(id: string): Promise<{ contentType: string; bytes: Buffer } | null> {
  if (!ID.test(id)) return null;
  const [row] = await db()`select content_type, bytes from media where id = ${id}`;
  return row ? { contentType: row.content_type as string, bytes: row.bytes as Buffer } : null;
}
