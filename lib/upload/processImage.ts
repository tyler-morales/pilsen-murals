/**
 * Process uploaded image: full-resolution WebP display + thumbnail, dominant color, optional EXIF metadata.
 */
import ExifReader, { type ExpandedTags } from "exifreader";
import sharp from "sharp";

const THUMB_MAX_WIDTH = 400;
const WEBP_QUALITY_DISPLAY = 85;
const WEBP_QUALITY_THUMB = 82;
const DOMINANT_COLOR_SAMPLE_SIZE = 64;
const QUANTIZE_BITS = 5;
const FALLBACK_DOMINANT_COLOR = "#333333";
const FALLBACK_COORDINATES: [number, number] = [-87.6621, 41.8579];

const METADATA_LABELS: Record<string, string> = {
  DateTimeOriginal: "Date taken",
  CreateDate: "Created",
  ModifyDate: "Modified",
  Make: "Camera make",
  Model: "Camera model",
  ExposureTime: "Exposure",
  FNumber: "Aperture",
  ISO: "ISO",
  FocalLength: "Focal length",
  "Image Width": "Width",
  "Image Height": "Height",
  Orientation: "Orientation",
  Software: "Software",
  LensModel: "Lens",
  ExposureProgram: "Exposure program",
  WhiteBalance: "White balance",
};

function getCoordinatesFromTags(tags: ExpandedTags): [number, number] | null {
  const gps = tags?.gps;
  if (!gps) return null;
  const lat = gps.Latitude;
  const lng = gps.Longitude;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return [lng, lat];
}

function getTagDescription(tag: unknown): string | null {
  if (!tag || typeof tag !== "object") return null;
  if (!("description" in tag)) return null;
  const raw = (tag as { description?: unknown }).description;
  if (raw == null) return null;
  const value = String(raw).trim();
  return value === "" ? null : value;
}

function setMetadataValue(
  out: Record<string, string>,
  key: string,
  value: string,
  group: string
): void {
  const existing = out[key];
  if (!existing) {
    out[key] = value;
    return;
  }
  if (existing === value) return;
  out[`${key} (${group})`] = value;
}

function buildImageMetadata(tags: ExpandedTags): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  const groups = ["exif", "file", "iptc", "xmp"] as const;
  for (const group of groups) {
    const groupTags = tags?.[group] as Record<string, { description?: string }> | undefined;
    if (!groupTags || typeof groupTags !== "object") continue;
    for (const [key, tag] of Object.entries(groupTags)) {
      const description = getTagDescription(tag);
      if (!description) continue;
      const normalizedKey = METADATA_LABELS[key] ?? key;
      setMetadataValue(out, normalizedKey, description, group);
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

async function getDominantColor(buffer: Buffer): Promise<string> {
  try {
    const { data, info } = await sharp(buffer)
      .resize(DOMINANT_COLOR_SAMPLE_SIZE, DOMINANT_COLOR_SAMPLE_SIZE, { fit: "cover" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const channels = info.channels;
    const step = channels;
    const shift = 8 - QUANTIZE_BITS;
    const buckets = new Map<number, number>();
    for (let i = 0; i < data.length; i += step) {
      const r = data[i]! >> shift;
      const g = data[i + 1]! >> shift;
      const b = data[i + 2]! >> shift;
      const key = (r << (2 * QUANTIZE_BITS)) | (g << QUANTIZE_BITS) | b;
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    let maxCount = 0;
    let bestKey = 0;
    for (const [key, count] of buckets) {
      if (count > maxCount) {
        maxCount = count;
        bestKey = key;
      }
    }
    const r = (bestKey >> (2 * QUANTIZE_BITS)) << shift;
    const g = ((bestKey >> QUANTIZE_BITS) & ((1 << QUANTIZE_BITS) - 1)) << shift;
    const b = (bestKey & ((1 << QUANTIZE_BITS) - 1)) << shift;
    const hex = [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
    return `#${hex}`;
  } catch {
    return FALLBACK_DOMINANT_COLOR;
  }
}

export interface ProcessedImage {
  displayBuffer: Buffer;
  thumbBuffer: Buffer;
  dominantColor: string;
  imageMetadata?: Record<string, string>;
  coordinatesFromExif: [number, number] | null;
}

export async function processUploadedImage(input: Buffer): Promise<ProcessedImage> {
  let imageMetadata: Record<string, string> | undefined;
  let coordinatesFromExif: [number, number] | null = null;
  try {
    const tags = ExifReader.load(input, { expanded: true }) as ExpandedTags;
    imageMetadata = buildImageMetadata(tags);
    const coords = getCoordinatesFromTags(tags);
    if (coords) coordinatesFromExif = coords;
  } catch {
    // EXIF optional
  }

  const dominantColor = await getDominantColor(input);
  const pipeline = sharp(input);

  const [displayBuffer, thumbBuffer] = await Promise.all([
    pipeline
      .clone()
      .webp({ quality: WEBP_QUALITY_DISPLAY })
      .toBuffer(),
    pipeline
      .clone()
      .resize(THUMB_MAX_WIDTH, null, { withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY_THUMB })
      .toBuffer(),
  ]);

  return {
    displayBuffer,
    thumbBuffer,
    dominantColor,
    ...(imageMetadata && { imageMetadata }),
    coordinatesFromExif,
  };
}

export { FALLBACK_COORDINATES };
