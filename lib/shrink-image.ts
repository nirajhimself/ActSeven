/**
 * Prepares a photo for upload in the browser: at most `maxEdge` pixels on its
 * long side, re-encoded (WebP, or JPEG where WebP encoding isn't supported)
 * until it's under `maxBytes`. A phone photo of several MB becomes ~200–400 KB.
 * Returns the file unchanged if the browser can't decode it.
 */
export async function shrinkImage(file: File, maxEdge = 2000, maxBytes = 900 * 1024): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.85, 0.75, 0.65, 0.5]) {
    for (const type of ["image/webp", "image/jpeg"]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
      if (blob && blob.type === type && blob.size <= maxBytes) return blob;
    }
  }
  return file;
}
