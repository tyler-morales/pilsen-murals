/**
 * Full pipeline: generate murals.json from raw-photos EXIF, copy to app data,
 * and sync images to public as WebP. Run after adding new photos to raw-photos:
 *   npm run sync-murals
 *
 * Uses a cache so running again with no changes skips EXIF work. Only converts
 * source images to WebP when output is missing or older than source. Public
 * image dirs are mirrored from raw-photos (orphaned files removed). After a
 * successful sync, raw-photos is emptied. Outputs .webp for smaller size and
 * faster loading.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const sharp = require("sharp");

const INPUT_DIR = "raw-photos";
const CACHE_FILE = ".sync-murals-cache.json";
const CACHE_VERSION = 2; // bump when output format changes (e.g. jpg → webp)
const SUPPORTED_EXTENSIONS = [".jpg", ".jpeg", ".heic"];
const THUMB_MAX_WIDTH = 400;
const WEBP_QUALITY_HIGHRES = 88;
const WEBP_QUALITY_THUMB = 82;

function getImageFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) =>
      SUPPORTED_EXTENSIONS.includes(path.extname(name).toLowerCase())
    )
    .sort();
}

function getSourceManifest(inputDir) {
  const files = getImageFiles(inputDir);
  const manifest = {};
  for (const name of files) {
    const stat = fs.statSync(path.join(inputDir, name));
    manifest[name] = stat.mtimeMs;
  }
  return manifest;
}

function manifestEqual(a, b) {
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    if (keysA[i] !== keysB[i] || a[keysA[i]] !== b[keysA[i]]) return false;
  }
  return true;
}

function needsWebPConversion(srcPath, highResPath, thumbPath, srcMtimeMs) {
  try {
    const highResStat = fs.statSync(highResPath);
    const thumbStat = fs.statSync(thumbPath);
    return (
      highResStat.mtimeMs < srcMtimeMs || thumbStat.mtimeMs < srcMtimeMs
    );
  } catch {
    return true;
  }
}

async function main() {
  const cwd = process.cwd();
  const scriptDir = path.join(cwd, "scripts");
  const inputDir = path.join(cwd, INPUT_DIR);
  const generatedPath = path.join(cwd, "public", "data", "murals.json");
  const appDataPath = path.join(cwd, "data", "murals.json");
  const cachePath = path.join(cwd, CACHE_FILE);

  const currentManifest = getSourceManifest(inputDir);
  let cache = null;
  if (fs.existsSync(cachePath)) {
    try {
      cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    } catch {
      cache = null;
    }
  }

  const cacheManifest = cache && cache.version === CACHE_VERSION ? { ...cache } : null;
  if (cacheManifest) delete cacheManifest.version;
  const skipRegenerate =
    cacheManifest &&
    manifestEqual(cacheManifest, currentManifest) &&
    fs.existsSync(generatedPath);

  if (!skipRegenerate) {
    console.log("1. Generating murals.json from EXIF...");
    const gen = spawnSync("node", [path.join(scriptDir, "generate-map-data.js")], {
      cwd,
      stdio: "inherit",
    });
    if (gen.status !== 0) {
      process.exit(gen.status || 1);
    }
    if (!fs.existsSync(generatedPath)) {
      console.error("Generated file not found:", generatedPath);
      process.exit(1);
    }
  } else {
    console.log("1. No changes in raw-photos, skipping EXIF read (cached).");
  }

  console.log("2. Copying murals.json to app data...");
  fs.mkdirSync(path.dirname(generatedPath), { recursive: true });
  if (fs.existsSync(generatedPath)) {
    fs.copyFileSync(generatedPath, appDataPath);
  }

  const files = Object.keys(currentManifest);
  if (files.length === 0) {
    console.log("3. No images to sync.");
    fs.writeFileSync(
      cachePath,
      JSON.stringify({ ...currentManifest, version: CACHE_VERSION }, null, 2)
    );
    console.log("Done.");
    return;
  }

  const highResDir = path.join(cwd, "public", "images", "murals", "high-res");
  const thumbDir = path.join(cwd, "public", "images", "murals", "thumbnails");
  fs.mkdirSync(highResDir, { recursive: true });
  fs.mkdirSync(thumbDir, { recursive: true });

  const expectedWebpNames = new Set(
    files.map((name) => path.basename(name, path.extname(name)) + ".webp")
  );
  for (const dir of [highResDir, thumbDir]) {
    if (fs.existsSync(dir)) {
      for (const name of fs.readdirSync(dir)) {
        if (!expectedWebpNames.has(name)) {
          fs.unlinkSync(path.join(dir, name));
        }
      }
    }
  }

  const barWidth = 24;
  function progressBar(current, total, label = "") {
    const p = total ? current / total : 1;
    const filled = Math.min(barWidth, Math.round(barWidth * p));
    const tail = filled < barWidth ? 1 : 0;
    const spaces = Math.max(0, barWidth - filled - tail);
    const bar = "=".repeat(filled) + ">".repeat(tail) + " ".repeat(spaces);
    const line = `  [${bar}] ${current}/${total}${label ? " " + label : ""}`;
    process.stdout.write("\r" + line.slice(0, 80).padEnd(80));
  }

  const toConvert = files.filter((name) => {
    const src = path.join(inputDir, name);
    const webpName = path.basename(name, path.extname(name)) + ".webp";
    const highResPath = path.join(highResDir, webpName);
    const thumbPath = path.join(thumbDir, webpName);
    return needsWebPConversion(src, highResPath, thumbPath, currentManifest[name]);
  });
  const skipCount = files.length - toConvert.length;
  if (skipCount > 0) {
    console.log(`3. Converting ${toConvert.length} images to WebP (${skipCount} already up to date)...`);
  } else {
    console.log(`3. Converting ${files.length} images to WebP...`);
  }
  for (let i = 0; i < files.length; i++) {
    const name = files[i];
    progressBar(i, files.length, path.basename(name));
    const src = path.join(inputDir, name);
    const webpName = path.basename(name, path.extname(name)) + ".webp";
    const highResPath = path.join(highResDir, webpName);
    const thumbPath = path.join(thumbDir, webpName);
    if (!needsWebPConversion(src, highResPath, thumbPath, currentManifest[name])) {
      continue;
    }
    const pipeline = sharp(src);
    await Promise.all([
      pipeline.clone().webp({ quality: WEBP_QUALITY_HIGHRES }).toFile(highResPath),
      pipeline
        .clone()
        .resize(THUMB_MAX_WIDTH, null, { withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY_THUMB })
        .toFile(thumbPath),
    ]);
  }
  progressBar(files.length, files.length);
  process.stdout.write("\n");
  const cacheToWrite = { ...currentManifest, version: CACHE_VERSION };
  fs.writeFileSync(cachePath, JSON.stringify(cacheToWrite, null, 2));
  for (const name of files) {
    const p = path.join(inputDir, name);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  console.log("4. Emptied raw-photos.");
  console.log("Done. App data and images are up to date.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
