import sharp from "sharp";

// Pochettes : Apple, Spotify et Deezer demandent une image de 1400 à 3000 pixels, et les applications la
// chargent d'autant plus vite qu'elle est légère. Une pochette de plus de ~1 Mo est donc ramenée à environ 1 Mo
// (JPG, 3000 pixels au plus). Une image déjà légère est gardée telle quelle.
const TARGET_BYTES = 1_000_000;

export interface OptimizedImage {
  buffer: Buffer;
  mimeType: string;
  ext: string;
  converted: boolean;
}

export async function optimizeCover(input: Buffer, mimeType: string): Promise<OptimizedImage> {
  const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  if (input.length <= TARGET_BYTES) return { buffer: input, mimeType, ext, converted: false };

  for (const maxSide of [3000, 2400, 2000, 1600]) {
    for (const quality of [88, 80, 72, 64, 56]) {
      const out = await sharp(input)
        .rotate()
        .flatten({ background: "#ffffff" })
        .resize(maxSide, maxSide, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
      if (out.length <= TARGET_BYTES * 1.05) return { buffer: out, mimeType: "image/jpeg", ext: "jpg", converted: true };
    }
  }
  // Image exceptionnellement lourde : dernier essai, le plus compressé.
  const last = await sharp(input).rotate().flatten({ background: "#ffffff" }).resize(1400, 1400, { fit: "inside" }).jpeg({ quality: 50, mozjpeg: true }).toBuffer();
  return { buffer: last, mimeType: "image/jpeg", ext: "jpg", converted: true };
}
