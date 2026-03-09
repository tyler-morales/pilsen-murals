/**
 * Sync pipeline: raw-photos is a staging folder. Add new photos there, run
 *   npm run sync-murals
 * New photos are converted to WebP (display, thumb only), merged into
 * existing murals.json (new entries get next IDs; same originalFile replaces
 * existing). Existing mural images are never deleted. After sync, raw-photos
 * is emptied. Only sources that need conversion are re-processed.
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
/** Max length of the long edge for modal/enlarged view; keeps file size down while staying sharp on retina. */
const DISPLAY_MAX_LONG_EDGE = 1600;
const WEBP_QUALITY_DISPLAY = 85;
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

function needsWebPConversion(displayPath, thumbPath, srcMtimeMs) {
  try {
    const displayStat = fs.statSync(displayPath);
    const thumbStat = fs.statSync(thumbPath);
    return displayStat.mtimeMs < srcMtimeMs || thumbStat.mtimeMs < srcMtimeMs;
  } catch {
    return true;
  }
}

/**
 * Merge murals from generate-map-data output (new only) into existing
 * murals.json. New murals get next IDs; same originalFile replaces existing.
 */
function mergeNewMuralsIntoExisting(appDataPath, generatedPath) {
  let existing = [];
  if (fs.existsSync(appDataPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(appDataPath, "utf8"));
      if (Array.isArray(data)) existing = data;
    } catch {
      existing = [];
    }
  }
  let newMurals = [];
  if (fs.existsSync(generatedPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(generatedPath, "utf8"));
      if (Array.isArray(data)) newMurals = data;
    } catch {
      newMurals = [];
    }
  }
  const result = [...existing];
  const byOriginal = new Map();
  for (const m of existing) {
    const key = m.originalFile || (m.imageUrl && path.basename(m.imageUrl));
    if (key) byOriginal.set(key, m);
  }
  let maxId = 0;
  for (const m of existing) {
    const n = parseInt(m.id && m.id.replace(/^mural-/, ""), 10);
    if (!Number.isNaN(n) && n > maxId) maxId = n;
  }
  for (const m of newMurals) {
    const key = m.originalFile || (m.imageUrl && path.basename(m.imageUrl));
    if (key && byOriginal.has(key)) {
      Object.assign(byOriginal.get(key), m);
    } else {
      maxId += 1;
      result.push({ ...m, id: `mural-${maxId}` });
      if (key) byOriginal.set(key, result[result.length - 1]);
    }
  }
  fs.writeFileSync(appDataPath, JSON.stringify(result, null, 2), "utf8");
  if (fs.existsSync(path.dirname(generatedPath))) {
    fs.writeFileSync(generatedPath, JSON.stringify(result, null, 2), "utf8");
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

  const files = Object.keys(currentManifest);
  if (files.length === 0) {
    fs.writeFileSync(
      cachePath,
      JSON.stringify({ ...currentManifest, version: CACHE_VERSION }, null, 2)
    );
    console.log("2. raw-photos is empty; nothing to convert. Done.");
    return;
  }

  console.log("2. Merging new murals into murals.json...");
  fs.mkdirSync(path.dirname(generatedPath), { recursive: true });
  mergeNewMuralsIntoExisting(appDataPath, generatedPath);

  const displayDir = path.join(cwd, "public", "images", "murals", "display");
  const thumbDir = path.join(cwd, "public", "images", "murals", "thumbnails");
  fs.mkdirSync(displayDir, { recursive: true });
  fs.mkdirSync(thumbDir, { recursive: true });

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
    const webpName = path.basename(name, path.extname(name)) + ".webp";
    const displayPath = path.join(displayDir, webpName);
    const thumbPath = path.join(thumbDir, webpName);
    return needsWebPConversion(displayPath, thumbPath, currentManifest[name]);
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
    const displayPath = path.join(displayDir, webpName);
    const thumbPath = path.join(thumbDir, webpName);
    if (!needsWebPConversion(displayPath, thumbPath, currentManifest[name])) {
      continue;
    }
    const pipeline = sharp(src);
    await Promise.all([
      pipeline
        .clone()
        .resize(DISPLAY_MAX_LONG_EDGE, DISPLAY_MAX_LONG_EDGE, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: WEBP_QUALITY_DISPLAY })
        .toFile(displayPath),
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
