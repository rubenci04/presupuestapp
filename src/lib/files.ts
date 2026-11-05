// Utilidades para archivos (Blob) que se guardan en IndexedDB y se exportan en la copia.

const CHUNK = 0x8000;

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  // String.fromCharCode(...bytes) revienta la pila con archivos grandes: va de a pedazos.
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBlob(data: string, type: string): Blob {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return `data:${blob.type};base64,${await blobToBase64(blob)}`;
}

/** Achica una imagen al lado máximo indicado. Si el navegador no puede, devuelve la original. */
export async function resizeImage(
  file: Blob,
  maxSide: number,
  outputType: "image/jpeg" | "image/png",
  quality = 0.8,
): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, outputType, quality));
    if (blob) return blob;
  } catch {
    // Formato que el navegador no decodifica: se usa tal cual.
  }
  return file;
}
