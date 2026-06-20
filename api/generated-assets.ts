import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const contentTypes: Record<string, string> = {
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bmp": "image/bmp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
};

export function generatedAssetRoot(): string {
  return configuredAssetRoot(
    process.env.TELLUS_GENERATED_ASSET_DIR?.trim() ||
      "Z:\\3d\\assets\\tellus",
  );
}

function configuredAssetRoot(value: string): string {
  const windowsDrivePath = /^([a-zA-Z]):[\\/](.*)$/.exec(value);
  if (!windowsDrivePath) return resolve(value);
  if (process.platform === "win32") return resolve(value);

  const [, drive, rest] = windowsDrivePath;
  return resolve(
    `/mnt/${drive.toLowerCase()}/${rest.replace(/[\\/]+/g, "/")}`,
  );
}

function safeAssetPath(pathname: string): string | null {
  const prefix = "/generated-assets/";
  if (!pathname.startsWith(prefix)) return null;
  const relativePath = normalize(decodeURIComponent(pathname.slice(prefix.length)));
  if (
    !relativePath ||
    relativePath === "." ||
    relativePath.startsWith("..") ||
    relativePath.includes("/../")
  ) {
    return null;
  }
  return join(generatedAssetRoot(), relativePath);
}

export async function generatedAssetsHandler(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const url = new URL(request.url);
  const assetPath = safeAssetPath(url.pathname);
  if (!assetPath) {
    return new Response("Bad asset path", { status: 400 });
  }

  try {
    const body = request.method === "HEAD" ? null : await readFile(assetPath);
    return new Response(body, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type":
          contentTypes[extname(assetPath).toLowerCase()] ??
          "application/octet-stream",
      },
    });
  } catch {
    return new Response("Generated asset not found", { status: 404 });
  }
}

export default generatedAssetsHandler;
