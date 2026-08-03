import { readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, relative, resolve } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";

const args = {};
for (let index = 2; index < process.argv.length; index++) {
  const token = process.argv[index];
  if (!token.startsWith("--")) continue;
  const [key, ...inline] = token.slice(2).split("=");
  if (inline.length > 0) args[key] = inline.join("=");
  else if (process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) args[key] = process.argv[++index];
  else args[key] = true;
}
if (typeof args.input !== "string" && typeof args.file !== "string") {
  throw new Error("usage: bun run wildlife:audit (--input=<pack directory> | --file=<asset.gltf|asset.glb>) [--output=wildlife-pack-audit.json]");
}

const selectedFile = typeof args.file === "string" ? resolve(args.file) : null;
const input = selectedFile ? dirname(selectedFile) : resolve(args.input);
const output = resolve(typeof args.output === "string" ? args.output : "wildlife-pack-audit.json");
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder });

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
  const tokens = value.split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.some((token) => ["graze", "grazing", "eat", "eating", "feed", "feeding"].includes(token))) return "graze";
  if (/gallop|run|sprint|flee/.test(value)) return "run";
  if (/walk|trot|canter/.test(value)) return "walk";
  if (/idle|stand|breath|look/.test(value)) return "idle";
  if (/swim|float/.test(value)) return "swim";
  if (/fly|glide/.test(value)) return "fly";
  return null;
}

const assets = [];
for (const file of selectedFile ? [selectedFile] : await collect(input)) {
  try {
    const document = await io.read(file);
    const root = document.getRoot();
    const primitives = root.listMeshes().flatMap((mesh) => mesh.listPrimitives());
    const vertices = primitives.reduce((sum, primitive) => sum + (primitive.getAttribute("POSITION")?.getCount() ?? 0), 0);
    const triangles = primitives.reduce((sum, primitive) => {
      const elementCount = primitive.getIndices()?.getCount() ?? primitive.getAttribute("POSITION")?.getCount() ?? 0;
      return sum + Math.floor(elementCount / 3);
    }, 0);
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
      file: (selectedFile ? basename(file) : relative(input, file)).replaceAll("\\", "/"),
      bytes: (await stat(file)).size,
      meshes: root.listMeshes().length,
      primitives: primitives.length,
      vertices,
      triangles,
      skins: root.listSkins().length,
      clips,
      transparentMaterials,
      readyForDeerSlice:
        root.listSkins().length > 0 &&
        ["idle", "walk", "run"].every((intent) => clips.some((clip) => clip.intent === intent)),
    });
  } catch (error) {
    assets.push({
      file: (selectedFile ? basename(file) : relative(input, file)).replaceAll("\\", "/"),
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
