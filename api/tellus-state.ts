import { Buffer } from "node:buffer";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generatedAssetRoot } from "./generated-assets.ts";

const stateFilename = "tellus-state.json";

// Cap the persisted body so an unauthenticated writer can't fill the disk. A legitimate
// terrain-state payload (sculpt offsets + paint arrays) is well under this.
const MAX_STATE_BODY_BYTES = 512 * 1024;

async function statePath(): Promise<string> {
  const root = generatedAssetRoot();
  await mkdir(root, { recursive: true });
  return join(root, stateFilename);
}

// Strict shape check before persisting: must be a plain JSON object carrying the terrain-state
// fields the client writes. Rejects arrays, primitives, and unrelated blobs.
function isValidTellusState(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  // terrainSculptOffsets is the anchor field every real save carries; it must be an array.
  if (!Array.isArray(record.terrainSculptOffsets)) return false;
  // version, when present, is a number.
  if ("version" in record && typeof record.version !== "number") return false;
  // terrainPaint, when present, is a plain object (per-key number[] map).
  if (
    "terrainPaint" in record &&
    (typeof record.terrainPaint !== "object" ||
      record.terrainPaint === null ||
      Array.isArray(record.terrainPaint))
  ) {
    return false;
  }
  return true;
}

export async function tellusStateHandler(request: Request): Promise<Response> {
  if (request.method === "GET") {
    try {
      return new Response(await readFile(await statePath(), "utf8"), {
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "application/json; charset=utf-8",
        },
      });
    } catch {
      return Response.json({ version: 1, terrainSculptOffsets: [] });
    }
  }

  if (request.method === "PUT" || request.method === "POST") {
    // Reject oversized bodies before reading/persisting them (disk-fill DoS guard).
    const declaredLength = Number(request.headers.get("content-length") ?? "");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_STATE_BODY_BYTES) {
      return Response.json(
        { error: "Tellus state payload too large" },
        { status: 413 },
      );
    }
    const body = await request.text();
    if (Buffer.byteLength(body, "utf8") > MAX_STATE_BODY_BYTES) {
      return Response.json(
        { error: "Tellus state payload too large" },
        { status: 413 },
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(body) as unknown;
    } catch {
      return Response.json(
        { error: "Tellus state payload is not valid JSON" },
        { status: 400 },
      );
    }
    if (!isValidTellusState(parsed)) {
      return Response.json(
        { error: "Tellus state payload has an invalid shape" },
        { status: 422 },
      );
    }
    if ((parsed.terrainSculptOffsets as unknown[]).length === 0) {
      return Response.json(
        { error: "Refusing to overwrite Tellus terrain with empty state" },
        { status: 422 },
      );
    }
    const finalPath = await statePath();
    const tempPath = `${finalPath}.tmp`;
    await writeFile(tempPath, body, "utf8");
    await rename(tempPath, finalPath);
    return Response.json({ ok: true });
  }

  return new Response("Method Not Allowed", { status: 405 });
}

export default tellusStateHandler;
