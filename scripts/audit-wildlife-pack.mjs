import { readdir, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { NodeIO } from "@gltf-transform/core";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, "").split("=");
  return [key, rest.join("=") || true];
}));
if (typeof args.input !== "string") {
  throw new Error("usage: bun run wildlife:audit --input=<pack directory> [--output=wildlife-pack-audit.json]");
}

const input = resolve(args.input);
const output = resolve(typeof args.output === "string" ? args.output : "wildlife-pack-audit.json");
const io = new NodeIO();

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(path));
    else if ([".glb", ".gltf"].includes(extname(entry.name).toLowerCase())) files.push(path);
  }
  return files;
}

function inferredIntent(name) {
  const value = name.toLowerCase();
  if (/graz|eat|feed/.test(value)) return "graze";
  if (/gallop|run|sprint|flee/.test(value)) return "run";
  if (/walk|trot|canter/.test(value)) return "walk";
  if (/idle|stand|breath|look/.test(value)) return "idle";
  if (/swim|float/.test(value)) return "swim";
  if (/fly|glide/.test(value)) return "fly";
  return null;
}

const assets = [];
for (const file of await collect(input)) {
  try {
    const document = await io.read(file);
    const root = document.getRoot();
    const clips = root.listAnimations().map((animation) => ({
      name: animation.getName() || "unnamed",
      intent: inferredIntent(animation.getName() || ""),
      channels: animation.listChannels().length,
      samplers: animation.listSamplers().length,
    }));
    const transparentMaterials = root.listMaterials()
      .filter((material) => material.getAlphaMode() !== "OPAQUE" || material.getBaseColorFactor()[3] < 0.999)
      .map((material) => ({
        name: material.getName() || "unnamed",
        alphaMode: material.getAlphaMode(),
        alpha: material.getBaseColorFactor()[3],
      }));
    assets.push({
      file: file.slice(input.length + 1).replaceAll("\\", "/"),
      meshes: root.listMeshes().length,
      primitives: root.listMeshes().reduce((sum, mesh) => sum + mesh.listPrimitives().length, 0),
      skins: root.listSkins().length,
      clips,
      transparentMaterials,
      readyForDeerSlice:
        root.listSkins().length > 0 &&
        ["idle", "walk", "run"].every((intent) => clips.some((clip) => clip.intent === intent)),
    });
  } catch (error) {
    assets.push({
      file: file.slice(input.length + 1).replaceAll("\\", "/"),
      error: error instanceof Error ? error.message : String(error),
      readyForDeerSlice: false,
    });
  }
}

const report = {
  schemaVersion: 1,
  input,
  generatedAt: new Date().toISOString(),
  requirements: {
    requiredIntents: ["idle", "walk", "run"],
    preferredIntents: ["graze"],
    materialRule: "opaque unless transparency is intentional",
  },
  assetCount: assets.length,
  readyCount: assets.filter((asset) => asset.readyForDeerSlice).length,
  assets,
};
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Audited ${report.assetCount} wildlife assets; ${report.readyCount} meet the deer vertical-slice minimum.`);
console.log(output);
