const fs = require("node:fs");
const path = require("node:path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const IMAGE_DIR = path.join(PROJECT_ROOT, "public", "nutrition", "meal-images");
const BANK_FILE = path.join(PROJECT_ROOT, "src", "utils", "recipeImageBank.js");

const HELP = `
Usage:
  node scripts/registerRecipeImageAsset.cjs --src /path/image.png --id main-poultry-starch-veg --title "Assiette volaille" --tags plat,volaille,feculent,legume

Options:
  --src      Image source file generated or curated locally.
  --id       Stable image id. Also used as the destination filename.
  --title    Human-readable label for maintainers.
  --tags     Comma-separated tags used for matching recipes.
  --force    Replace the image file if it already exists.
`;

const parseArgs = (argv) => {
  const parsed = { force: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--force") {
      parsed.force = true;
      continue;
    }
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    parsed[key] = argv[index + 1];
    index += 1;
  }
  return parsed;
};

const stripDiacritics = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const toSlug = (value) =>
  stripDiacritics(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const toTag = (value) =>
  stripDiacritics(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const escapeJsString = (value) =>
  String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');

const fail = (message) => {
  console.error(message);
  console.error(HELP.trim());
  process.exit(1);
};

const args = parseArgs(process.argv.slice(2));
if (!args.src) fail("Missing --src.");
if (!args.id) fail("Missing --id.");
if (!args.title) fail("Missing --title.");
if (!args.tags) fail("Missing --tags.");

const sourcePath = path.resolve(args.src);
if (!fs.existsSync(sourcePath)) fail(`Image not found: ${sourcePath}`);

const imageId = toSlug(args.id);
if (!imageId) fail("Invalid --id.");

const tags = [...new Set(String(args.tags).split(",").map(toTag).filter(Boolean))];
if (!tags.length) fail("Invalid --tags.");

const extension = path.extname(sourcePath).toLowerCase();
if (![".jpg", ".jpeg", ".png", ".webp"].includes(extension)) {
  fail("Unsupported image extension. Use jpg, png, or webp.");
}

const destinationFile = `${imageId}${extension}`;
const destinationPath = path.join(IMAGE_DIR, destinationFile);
const publicSrc = `/nutrition/meal-images/${destinationFile}`;

fs.mkdirSync(IMAGE_DIR, { recursive: true });
if (fs.existsSync(destinationPath) && !args.force) {
  fail(`Destination already exists: ${destinationPath}. Use --force to replace the file.`);
}
fs.copyFileSync(sourcePath, destinationPath);

const bankSource = fs.readFileSync(BANK_FILE, "utf8");
const entryId = imageId.replace(/-/g, "_");
const entry = `  {
    id: "${entryId}",
    ready: true,
    source: "generated",
    src: "${publicSrc}",
    title: "${escapeJsString(args.title)}",
    tags: ${JSON.stringify(tags)},
  },
`;

let nextBankSource = bankSource;
if (bankSource.includes(`id: "${entryId}"`)) {
  const existingEntryPattern = new RegExp(`  \\{\\n    id: "${entryId}",[\\s\\S]*?\\n  \\},`);
  nextBankSource = bankSource.replace(existingEntryPattern, entry.trimEnd());
} else {
  nextBankSource = bankSource.replace("export const RECIPE_IMAGE_BANK = [\n", `export const RECIPE_IMAGE_BANK = [\n${entry}`);
}
if (nextBankSource === bankSource) fail("Could not find RECIPE_IMAGE_BANK insertion point.");

fs.writeFileSync(BANK_FILE, nextBankSource);
console.log(`Image copied to ${destinationPath}`);
console.log(`Bank entry "${entryId}" saved with tags: ${tags.join(", ")}`);
