const MAX_SIDE = 1600;

// Redimensiona y recomprime a JPEG en el navegador: las fotos del móvil pesan varios MB.
export async function toJpeg(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => {
    throw new Error(`No se puede leer "${file.name}". Prueba con otra foto (JPG, PNG o WebP).`);
  });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  for (const q of [0.85, 0.7, 0.55]) {
    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", q));
    if (blob && blob.size <= 3.4 * 1024 * 1024) return blob;
  }
  throw new Error(`"${file.name}" es demasiado grande.`);
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(new Error("No se pudo leer la imagen"));
    r.readAsDataURL(blob);
  });
}
