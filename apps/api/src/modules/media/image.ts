import sharp from "sharp";
import { ApiError } from "../../database/client.js";
export async function normalizeImage(bytes: Buffer, cover = false) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 2 * 1024 * 1024)
    throw new ApiError(400, "Choose a PNG, JPEG or WebP image up to 2 MB.");
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp =
    bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!png && !jpeg && !webp)
    throw new ApiError(400, "Only PNG, JPEG and WebP images are supported.");
  try {
    const input = sharp(bytes, { limitInputPixels: 16000000, failOn: "warning", animated: true });
    const info = await input.metadata();
    if (
      !info.width ||
      !info.height ||
      (info.pages || 1) > 1 ||
      !["png", "jpeg", "webp"].includes(info.format || "")
    )
      throw Error("Invalid image");
    // Full decode/re-encode strips metadata and appended payloads. Never use a user-supplied path.
    return await input
      .rotate()
      .resize(cover ? 1600 : 512, cover ? 900 : 512, { fit: "cover", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new ApiError(400, "The image is invalid, animated, damaged or exceeds 16 megapixels.");
  }
}
