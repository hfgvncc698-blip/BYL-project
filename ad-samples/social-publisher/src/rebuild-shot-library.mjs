import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = resolve(root, "../..");
const creativeStudioRoot = resolve(root, "creative-studio");
const libraryDir = resolve(root, "media-library");
const libraryPath = resolve(libraryDir, "shot-library.json");

function projectRelative(path = "") {
  return relative(projectRoot, path).replaceAll("\\", "/");
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir) {
  const entries = [];
  let items = [];
  try {
    items = await readdir(dir, { withFileTypes: true });
  } catch {
    return entries;
  }
  for (const item of items) {
    const path = resolve(dir, item.name);
    if (item.isDirectory()) entries.push(...await walk(path));
    else entries.push(path);
  }
  return entries;
}

function tagsFor(sourceImage = "", sceneSet = "") {
  const tags = [sceneSet].filter(Boolean);
  if (/frames-mobile/i.test(sourceImage)) tags.push("interface_mobile", "preuve_produit");
  if (/coach|client/i.test(`${sourceImage} ${sceneSet}`)) tags.push("coach", "client_suivi");
  if (/studio|manager|opening/i.test(`${sourceImage} ${sceneSet}`)) tags.push("studio", "pilotage");
  return [...new Set(tags)];
}

function dateFromPath(path = "") {
  return path.match(/creative-studio\/(\d{4}-\d{2}-\d{2})\//)?.[1] || "";
}

async function main() {
  await mkdir(libraryDir, { recursive: true });
  const files = (await walk(creativeStudioRoot)).filter((path) => path.endsWith("-quality.json"));
  const entries = [];
  const createdAt = new Date().toISOString();

  for (const file of files) {
    const report = await readJson(file).catch(() => null);
    const selected = report?.selected;
    const rendered = selected?.rendered || {};
    const sourceImages = rendered.sourceImages || [];
    const finalizer = rendered.finalizerConfigPath || selected?.finalizerConfigPath || "";
    if (!selected?.relativePath || !sourceImages.length || !finalizer) continue;

    const base = finalizer.split("/").pop()?.replace(/-finalizer\.json$/, "");
    const date = dateFromPath(file) || report.productionId?.slice(0, 10) || "";
    const premiumBaseDir = resolve(creativeStudioRoot, date, "premium-base");
    const prompt = selected.promptPackage || {};

    for (let index = 0; index < sourceImages.length; index += 1) {
      const shotPath = resolve(premiumBaseDir, `${base}-premium-${index}.mp4`);
      if (!(await fileExists(shotPath))) continue;
      const size = (await stat(shotPath).catch(() => ({ size: 0 }))).size;
      const sourceImage = sourceImages[index] || "";
      entries.push({
        id: `${report.slotId}:${report.platform}:${selected.relativePath}:shot-${index + 1}`,
        date,
        createdAt,
        slotId: report.slotId || "",
        productionId: report.productionId || "",
        variantId: "",
        platform: report.platform || "",
        audienceSegment: prompt.audienceSegment || "",
        subject: prompt.subject || "",
        hook: prompt.hook || "",
        angle: prompt.angle || "",
        scenario: prompt.scenario || "",
        finalMediaUrl: selected.relativePath,
        finalMediaPath: projectRelative(selected.outputPath || resolve(projectRoot, "public", selected.relativePath)),
        shotIndex: index + 1,
        shotPath: projectRelative(shotPath),
        shotBytes: size,
        sourceImage,
        sceneSet: rendered.sourceSceneSet || "",
        renderer: rendered.renderer || "",
        renderStyleVersion: rendered.renderStyleVersion || "",
        qualityScore: selected.review?.score || 0,
        reusable: true,
        tags: tagsFor(sourceImage, rendered.sourceSceneSet || ""),
        notes:
          /frames-mobile/i.test(sourceImage)
            ? "Plan d'interface mobile reutilisable comme preuve produit courte."
            : "Plan humain reutilisable si l'angle reste coherent et que le montage final reste inedit.",
      });
    }
  }

  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const library = {
    version: "1.0.0",
    updatedAt: createdAt,
    entries: [...byId.values()].sort((a, b) =>
      `${a.date}:${a.slotId}:${a.platform}:${a.shotIndex}`.localeCompare(`${b.date}:${b.slotId}:${b.platform}:${b.shotIndex}`),
    ),
  };
  await writeFile(libraryPath, `${JSON.stringify(library, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, libraryPath, entries: library.entries.length }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exitCode = 1;
});
