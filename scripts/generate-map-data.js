/**
 * Reads photos from raw-photos, extracts EXIF GPS and full image metadata,
 * dominant color per image, and writes murals.json for the Mapbox map.
 * Run: npm run generate-map-data
 */

const fs = require("fs");
const path = require("path");
const ExifReader = require("exifreader");
const sharp = require("sharp");

const INPUT_DIR = "raw-photos";
const OUTPUT_PATH = "public/data/murals.json";
const FALLBACK_COORDINATES = [-87.6621, 41.8579];
const FALLBACK_DOMINANT_COLOR = "#333333";
const SUPPORTED_EXTENSIONS = [".jpg", ".jpeg", ".heic"];
const DOMINANT_COLOR_SAMPLE_SIZE = 64;
const QUANTIZE_BITS = 5; // 32 levels per channel -> 32^3 buckets

/** Display label for each EXIF tag we expose in the slide-out. */
const METADATA_LABELS = {
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

function getCoordinatesFromTags(tags) {
  const gps = tags?.gps;
  if (!gps) return null;
  const lat = gps.Latitude;
  const lng = gps.Longitude;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return [lng, lat];
}

/**
 * Build a flat { label -> value } object from EXIF (and file) tags for the modal.
 * Uses expanded tag structure: tags.exif, tags.file, etc. Only includes allowed keys.
 */
function buildImageMetadata(tags) {
  const out = {};
  const groups = ["exif", "file", "iptc", "xmp"];
  for (const group of groups) {
    const groupTags = tags && tags[group];
    if (!groupTags || typeof groupTags !== "object") continue;
    for (const [key, tag] of Object.entries(groupTags)) {
      const label = METADATA_LABELS[key];
      if (!label) continue;
      const desc = tag && typeof tag === "object" && tag.description;
      if (desc != null && String(desc).trim() !== "") {
        out[label] = String(desc).trim();
      }
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function getImageFiles(dir) {
  if (!fs.existsSync(dir)) {
    console.error(`Error: Directory "${dir}" does not exist. Create it and add photos.`);
    process.exit(1);
  }
  const names = fs.readdirSync(dir);
  return names
    .filter((name) => {
      const ext = path.extname(name).toLowerCase();
      return SUPPORTED_EXTENSIONS.includes(ext);
    })
    .sort();
}

/**
 * Extract dominant color from image by sampling, quantizing, and taking the
 * most frequent bucket. Returns hex (e.g. "#333333") or FALLBACK_DOMINANT_COLOR on failure.
 */
async function getDominantColor(filePath) {
  try {
    const { data, info } = await sharp(filePath)
      .resize(DOMINANT_COLOR_SAMPLE_SIZE, DOMINANT_COLOR_SAMPLE_SIZE, { fit: "cover" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const channels = info.channels;
    const step = channels; // 3 for rgb, 4 for rgba
    const shift = 8 - QUANTIZE_BITS;
    const buckets = new Map();
    for (let i = 0; i < data.length; i += step) {
      const r = data[i] >> shift;
      const g = data[i + 1] >> shift;
      const b = data[i + 2] >> shift;
      const key = (r << (2 * QUANTIZE_BITS)) | (g << QUANTIZE_BITS) | b;
      buckets.set(key, (buckets.get(key) || 0) + 1);
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
  } catch (err) {
    console.warn(`  Dominant color failed: ${err.message}`);
    return FALLBACK_DOMINANT_COLOR;
  }
}

async function main() {
  const inputDir = path.resolve(process.cwd(), INPUT_DIR);
  const files = getImageFiles(inputDir);

  if (files.length === 0) {
    console.warn(`No supported images (${SUPPORTED_EXTENSIONS.join(", ")}) in ${INPUT_DIR}.`);
  }

  const murals = await Promise.all(
    files.map(async (filename, index) => {
      const filePath = path.join(inputDir, filename);
      const basename = path.basename(filename);
      let coordinates = FALLBACK_COORDINATES;
      let usedFallback = true;
      let imageMetadata;

      try {
        const buffer = fs.readFileSync(filePath);
        const tags = ExifReader.load(buffer, { expanded: true });
        const coords = getCoordinatesFromTags(tags);
        if (coords) {
          coordinates = coords;
          usedFallback = false;
        }
        imageMetadata = buildImageMetadata(tags);
      } catch (err) {
        console.warn(`  ${filename}: EXIF read failed — ${err.message}`);
      }

      if (usedFallback) {
        console.warn(`  ${filename}: no GPS data, using fallback coordinates`);
      }

      const dominantColor = await getDominantColor(filePath);

      const webpBasename = path.basename(filename, path.extname(filename)) + ".webp";
      const displayPath = `/images/murals/display/${webpBasename}`;
      const thumbnailPath = `/images/murals/thumbnails/${webpBasename}`;

      const mural = {
        id: `mural-${index + 1}`,
        title: `Pilsen Mural ${index + 1}`,
        artist: "Unknown Artist",
        coordinates,
        bearing: 0,
        image: displayPath,
        thumbnail: thumbnailPath,
        dominantColor,
        originalFile: basename,
        imageUrl: displayPath,
        address: "",
      };
      if (imageMetadata) mural.imageMetadata = imageMetadata;
      return mural;
    })
  );

  const outPath = path.resolve(process.cwd(), OUTPUT_PATH);
  const outDir = path.dirname(outPath);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(murals, null, 2), "utf8");

  console.log(`Wrote ${murals.length} murals to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
