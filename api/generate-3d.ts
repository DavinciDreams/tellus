import { Buffer } from "node:buffer";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  prune,
  quantize,
  resample,
  simplify,
  textureCompress,
  weld,
} from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";
import { generatedAssetRoot } from "./generated-assets";

interface Generate3DRequest {
  id?: string;
  prompt?: string;
  kind?: string;
  imageUrl?: string;
  removeBackground?: boolean;
  sampleSteps?: number;
  seed?: number;
  provider?: Generation3DProvider;
  instantMeshBaseUrl?: string;
}

type Generation3DProvider =
  | "instantmesh-gradio"
  | "pixal3d-gradio"
  | "anigen-gradio";

interface Generate3DResponse {
  jobId: string;
  status?: "queued" | "generating" | "completed" | "failed";
  modelUrl?: string;
  provider: Generation3DProvider;
  rawModelUrl?: string;
  storedModelUrl?: string;
  storedModelPath?: string;
  assetStoreModelId?: string;
  assetStoreModelUrl?: string;
  assetStoreDownloadUrl?: string;
  sourceImageUrl?: string;
  sourceImagePath?: string;
  textImageProvider: string;
  manifestUrl: string;
  error?: string;
}

interface GenerationJob {
  id: string;
  provider: Generation3DProvider;
  status: "queued" | "generating" | "completed" | "failed";
  result?: Generate3DResponse;
  error?: string;
  createdAt: number;
  startedAt?: number;
}

interface LegacyPredictResponse {
  data?: unknown[];
  error?: string;
}

interface GradioConfig {
  dependencies?: Array<{
    inputs?: number[];
    outputs?: number[];
    backend_fn?: boolean;
  }>;
}

interface GradioCallResponse {
  event_id?: string;
  error?: string;
}

type FileLikeResult = {
  url?: string;
  path?: string;
  name?: string;
  data?: string;
  orig_name?: string;
};

interface GeneratedAssetManifestEntry {
  id: string;
  prompt: string;
  kind: string;
  provider: Generation3DProvider;
  rawModelUrl: string;
  modelUrl: string;
  storedModelPath: string;
  sourceImageUrl: string;
  sourceImagePath?: string;
  textImageProvider: string;
  imagePrompt: string;
  createdAt: string;
  sampleSteps: number;
  seed: number;
  rawModelSizeBytes?: number;
  storedModelSizeBytes?: number;
  optimized?: boolean;
  optimization?: string;
  assetStoreModelId?: string;
  assetStoreModelUrl?: string;
  assetStoreDownloadUrl?: string;
}

interface AssetStoreUploadResult {
  modelId: string;
  modelUrl: string;
  downloadUrl: string;
}

interface AssetStoreUploadResponse {
  success?: boolean;
  model?: {
    id?: string;
    name?: string;
  };
  uploaded?: Array<{
    id?: string;
    name?: string;
  }>;
  error?: string;
  message?: string;
}

interface TextImageResult {
  imageUrl: string;
  provider:
    | "request"
    | "openai"
    | "automatic1111"
    | "comfyui"
    | "gradio"
    | "procedural";
  imagePrompt: string;
  storedImageUrl?: string;
  storedImagePath?: string;
  upstreamImageUrl?: string;
}

interface OpenAIImageResponse {
  data?: Array<{
    b64_json?: string;
    url?: string;
  }>;
  error?: {
    message?: string;
  };
}

interface Automatic1111ImageResponse {
  images?: string[];
  error?: string;
}

interface GradioImageResponse {
  data?: [
    FileLikeResult,
    number,
    string,
    number,
    ...unknown[],
  ];
  error?: string;
}

interface ComfyPromptResponse {
  prompt_id?: string;
  error?: unknown;
}

interface ComfyImageOutput {
  filename?: string;
  subfolder?: string;
  type?: string;
}

interface ComfyHistoryResponse {
  outputs?: Record<string, { images?: ComfyImageOutput[] }>;
  status?: {
    status_str?: string;
    completed?: boolean;
  };
}

const generationJobs = new Map<string, GenerationJob>();
let generationQueueTail: Promise<void> = Promise.resolve();

function millisecondsEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const queuedJobTtlMs = millisecondsEnv(
  "TELLUS_GENERATION_QUEUED_TTL_MS",
  90 * 60 * 1000,
);
const jobExecutionTimeoutMs = millisecondsEnv(
  "TELLUS_GENERATION_JOB_TIMEOUT_MS",
  45 * 60 * 1000,
);
const runningJobTtlMs = millisecondsEnv(
  "TELLUS_GENERATION_RUNNING_TTL_MS",
  90 * 60 * 1000,
);

function generationJobExpired(job: GenerationJob, now = Date.now()): boolean {
  if (job.status === "queued") return now - job.createdAt > queuedJobTtlMs;
  if (job.status === "generating") {
    return now - (job.startedAt ?? job.createdAt) > runningJobTtlMs;
  }
  return false;
}

function pruneGenerationJobs(): void {
  const now = Date.now();
  for (const [jobId, job] of generationJobs) {
    if (generationJobExpired(job, now)) {
      job.status = "failed";
      job.error = "Generation job expired before completion";
    }
    if (
      (job.status === "completed" || job.status === "failed") &&
      now - (job.startedAt ?? job.createdAt) > runningJobTtlMs
    ) {
      generationJobs.delete(jobId);
    }
  }
}

async function withGenerationTimeout<T>(
  promise: Promise<T>,
  timeoutMs = jobExecutionTimeoutMs,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`Generation job timed out after ${Math.round(timeoutMs / 1000)}s`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function conceptImageDataUrl(prompt: string, kind: string): string {
  const width = 256;
  const height = 256;
  const rowStride = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowStride * height;
  const fileSize = 54 + pixelBytes;
  const buffer = Buffer.alloc(fileSize);
  buffer.write("BM", 0);
  buffer.writeUInt32LE(fileSize, 2);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(pixelBytes, 34);

  const hue = Array.from(`${kind}:${prompt}`).reduce(
    (sum, char) => sum + char.charCodeAt(0),
    0,
  );
  const base = [
    52 + (hue % 90),
    120 + (hue % 80),
    58 + (hue % 70),
  ] as const;

  const setPixel = (x: number, y: number, r: number, g: number, b: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const offset = 54 + (height - 1 - y) * rowStride + x * 3;
    buffer[offset] = b;
    buffer[offset + 1] = g;
    buffer[offset + 2] = r;
  };
  const fillRect = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: readonly [number, number, number],
  ) => {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) setPixel(x, y, color[0], color[1], color[2]);
    }
  };
  const fillEllipse = (
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    color: readonly [number, number, number],
  ) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) setPixel(x, y, color[0], color[1], color[2]);
      }
    }
  };
  const fillTriangle = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number,
    color: readonly [number, number, number],
  ) => {
    const minX = Math.floor(Math.min(ax, bx, cx));
    const maxX = Math.ceil(Math.max(ax, bx, cx));
    const minY = Math.floor(Math.min(ay, by, cy));
    const maxY = Math.ceil(Math.max(ay, by, cy));
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const w0 = ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / area;
        const w1 = ((cx - bx) * (y - by) - (cy - by) * (x - bx)) / area;
        const w2 = ((ax - cx) * (y - cy) - (ay - cy) * (x - cx)) / area;
        if (w0 >= 0 && w1 >= 0 && w2 >= 0) {
          setPixel(x, y, color[0], color[1], color[2]);
        }
      }
    }
  };

  fillRect(0, 0, width, height, [238, 242, 232]);
  fillEllipse(128, 204, 76, 18, [190, 202, 174]);

  if (kind === "tree" || prompt.toLowerCase().includes("tree")) {
    fillRect(116, 120, 140, 204, [112, 75, 41]);
    fillEllipse(128, 98, 70, 58, [base[0], base[1], base[2]]);
    fillEllipse(92, 124, 44, 42, [58, 135, 68]);
    fillEllipse(164, 122, 48, 44, [76, 154, 72]);
  } else if (kind === "flower") {
    fillRect(124, 112, 132, 204, [54, 132, 74]);
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      fillEllipse(128 + Math.cos(angle) * 28, 94 + Math.sin(angle) * 24, 22, 18, [
        222,
        108 + (hue % 90),
        168,
      ]);
    }
    fillEllipse(128, 96, 18, 18, [242, 199, 69]);
  } else if (kind === "animal") {
    fillEllipse(126, 142, 66, 40, [base[0], base[1], base[2]]);
    fillEllipse(184, 126, 30, 28, [base[0], base[1], base[2]]);
    fillTriangle(170, 106, 182, 78, 194, 108, [base[0], base[1], base[2]]);
    fillRect(84, 174, 98, 210, [70, 70, 62]);
    fillRect(150, 174, 164, 210, [70, 70, 62]);
  } else if (kind === "path") {
    fillTriangle(76, 212, 180, 212, 146, 62, [154, 124, 72]);
    fillTriangle(110, 212, 210, 212, 154, 86, [176, 142, 82]);
  } else if (kind === "shrine") {
    fillRect(76, 176, 180, 204, [112, 86, 66]);
    fillRect(96, 104, 160, 176, [172, 157, 134]);
    fillTriangle(74, 104, 128, 58, 182, 104, [86, 72, 92]);
  } else if (kind === "balloon" || prompt.toLowerCase().includes("balloon")) {
    fillEllipse(128, 88, 58, 66, [230, 132, 78]);
    fillEllipse(104, 90, 20, 56, [248, 188, 104]);
    fillEllipse(152, 90, 20, 56, [248, 188, 104]);
    fillRect(122, 146, 134, 174, [80, 58, 42]);
    fillRect(96, 178, 160, 210, [132, 82, 44]);
    fillRect(102, 184, 158, 190, [94, 61, 38]);
    fillTriangle(102, 144, 96, 178, 108, 178, [80, 58, 42]);
    fillTriangle(154, 144, 148, 178, 160, 178, [80, 58, 42]);
  } else {
    fillEllipse(128, 144, 72, 54, [base[0], base[1], base[2]]);
    fillEllipse(104, 116, 28, 24, [base[0] + 20, base[1] + 20, base[2] + 20]);
    fillEllipse(158, 118, 36, 30, [base[0] + 10, base[1] + 18, base[2] + 12]);
  }

  return `data:image/bmp;base64,${buffer.toString("base64")}`;
}

function collectCandidates(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectCandidates(item));
  }
  if (!value || typeof value !== "object") return [];
  const file = value as FileLikeResult;
  return [
    file.url,
    file.path,
    file.name,
    file.data,
    file.orig_name,
    ...Object.values(value).flatMap((item) => collectCandidates(item)),
  ].filter((item): item is string => typeof item === "string");
}

function resolveGradioFileUrl(baseUrl: string, candidate: string): string {
  if (/^data:/i.test(candidate)) return candidate;
  if (/^https?:/i.test(candidate)) return candidate;
  if (candidate.startsWith("/")) {
    if (candidate.startsWith("/tmp/") || candidate.startsWith("/var/")) {
      return new URL(`/file=${candidate}`, `${baseUrl}/`).toString();
    }
    return new URL(candidate, `${baseUrl}/`).toString();
  }
  return new URL(`/file=${candidate}`, `${baseUrl}/`).toString();
}

function basename(value: string): string {
  return value.split(/[\\/]/).pop() ?? "";
}

function numberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function boolEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  return !["0", "false", "no", "off"].includes(value);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function generatedFilenameBase(params: {
  createdAt: string;
  kind: string;
  prompt: string;
  id: string;
}): string {
  const timestamp = params.createdAt.replace(/[:.]/g, "-");
  return `${timestamp}-${slugify(params.kind)}-${slugify(params.prompt) || params.id}`;
}

function hostPath(value: string): string {
  const windowsDrivePath = /^([a-zA-Z]):[\\/](.*)$/.exec(value);
  if (!windowsDrivePath || process.platform === "win32") return resolve(value);
  const [, drive, rest] = windowsDrivePath;
  return resolve(
    `/mnt/${drive.toLowerCase()}/${rest.replace(/[\\/]+/g, "/")}`,
  );
}

function mimeExtension(mime: string): string {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("bmp")) return "bmp";
  return "png";
}

function dataUrlBytes(dataUrl: string): { bytes: Buffer; mime: string } | null {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  const [, mime, encoding, body] = match;
  const bytes =
    encoding === ";base64"
      ? Buffer.from(body, "base64")
      : Buffer.from(decodeURIComponent(body), "utf8");
  return { bytes, mime };
}

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(cleanUpstreamError(response.status, body));
  }
  return response.arrayBuffer();
}

async function instantMeshPredictFnIndex(baseUrl: string): Promise<number> {
  const response = await fetch(`${baseUrl}/config`);
  if (!response.ok) return 1;
  const config = (await response.json()) as GradioConfig;
  const index = config.dependencies?.findIndex((dependency) => {
    const inputs = dependency.inputs ?? [];
    const outputs = dependency.outputs ?? [];
    return (
      dependency.backend_fn &&
      inputs.length === 4 &&
      outputs.length >= 5
    );
  });
  return index !== undefined && index >= 0 ? index : 1;
}

async function fetchBytes(url: string): Promise<{ bytes: Buffer; mime: string }> {
  const dataUrl = dataUrlBytes(url);
  if (dataUrl) return dataUrl;
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(cleanUpstreamError(response.status, body));
  }
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    mime: response.headers.get("content-type") ?? "image/png",
  };
}

function imageGenerationPrompt(prompt: string, kind: string): string {
  const assetDescription = prompt.trim();
  return [
    `Generate a high quality game asset for ${assetDescription} on a plain white background.`,
    `The output must show exactly one single complete ${kind} asset.`,
    "Do not include a scene, landscape, habitat, collection, extra props, text, logo, watermark, UI, frame, or label.",
    "Center the asset, show the full object without cropping, use a clear readable silhouette, soft studio lighting, and front three-quarter view.",
    "Stylized low-poly friendly proportions, game-ready concept art, isolated subject.",
  ].join(" ");
}

async function generateOpenAIConceptImage(
  prompt: string,
  kind: string,
): Promise<TextImageResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  const baseUrl = (
    process.env.OPENAI_BASE_URL?.trim() ?? "https://api.openai.com/v1"
  ).replace(/\/+$/, "");
  const imagePrompt = imageGenerationPrompt(prompt, kind);
  const response = await fetch(`${baseUrl}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.TELLUS_TEXT_TO_IMAGE_MODEL?.trim() || "gpt-image-1",
      prompt: imagePrompt,
      size: process.env.TELLUS_TEXT_TO_IMAGE_SIZE?.trim() || "1024x1024",
      n: 1,
    }),
  });
  const body = (await response.json()) as OpenAIImageResponse;
  if (!response.ok || body.error) {
    throw new Error(
      body.error?.message ?? `OpenAI image request failed with HTTP ${response.status}`,
    );
  }
  const image = body.data?.[0];
  if (image?.b64_json) {
    return {
      imageUrl: `data:image/png;base64,${image.b64_json}`,
      provider: "openai",
      imagePrompt,
    };
  }
  if (image?.url) {
    return { imageUrl: image.url, provider: "openai", imagePrompt };
  }
  throw new Error("OpenAI image request returned no image");
}

async function generateAutomatic1111ConceptImage(
  prompt: string,
  kind: string,
): Promise<TextImageResult> {
  const baseUrl = (
    process.env.TELLUS_TEXT_TO_IMAGE_BASE_URL?.trim() ||
    process.env.AUTOMATIC1111_BASE_URL?.trim() ||
    ""
  ).replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("TELLUS_TEXT_TO_IMAGE_BASE_URL is not configured");
  }
  const imagePrompt = imageGenerationPrompt(prompt, kind);
  const response = await fetch(`${baseUrl}/sdapi/v1/txt2img`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: imagePrompt,
      negative_prompt:
        process.env.TELLUS_TEXT_TO_IMAGE_NEGATIVE_PROMPT?.trim() ||
        "text, watermark, logo, cropped, blurry, background clutter, multiple objects",
      steps: Number(process.env.TELLUS_TEXT_TO_IMAGE_STEPS || 28),
      width: Number(process.env.TELLUS_TEXT_TO_IMAGE_WIDTH || 1024),
      height: Number(process.env.TELLUS_TEXT_TO_IMAGE_HEIGHT || 1024),
      cfg_scale: Number(process.env.TELLUS_TEXT_TO_IMAGE_CFG_SCALE || 7),
      sampler_name: process.env.TELLUS_TEXT_TO_IMAGE_SAMPLER || "DPM++ 2M Karras",
    }),
  });
  const body = (await response.json()) as Automatic1111ImageResponse;
  if (!response.ok || body.error) {
    throw new Error(
      body.error ?? `Automatic1111 image request failed with HTTP ${response.status}`,
    );
  }
  const image = body.images?.[0];
  if (!image) throw new Error("Automatic1111 returned no image");
  return {
    imageUrl: image.startsWith("data:")
      ? image
      : `data:image/png;base64,${image}`,
    provider: "automatic1111",
    imagePrompt,
  };
}

async function generateGradioConceptImage(
  prompt: string,
  kind: string,
): Promise<TextImageResult> {
  const baseUrl = (
    process.env.TELLUS_TEXT_TO_IMAGE_BASE_URL?.trim() ||
    process.env.TELLUS_GRADIO_IMAGE_BASE_URL?.trim() ||
    ""
  ).replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("TELLUS_TEXT_TO_IMAGE_BASE_URL is not configured");
  }

  const imagePrompt = imageGenerationPrompt(prompt, kind);
  const negativePrompt =
    process.env.TELLUS_TEXT_TO_IMAGE_NEGATIVE_PROMPT?.trim() ||
    "text, watermark, logo, cropped, blurry, background clutter, multiple objects";
  const response = await fetch(
    `${baseUrl}/gradio_api/api/${
      process.env.TELLUS_GRADIO_IMAGE_API_NAME?.trim() || "generate_image"
    }`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [
          imagePrompt,
          Number(process.env.TELLUS_TEXT_TO_IMAGE_SEED || 42),
          Number(process.env.TELLUS_TEXT_TO_IMAGE_STEPS || 9),
          Number(process.env.TELLUS_TEXT_TO_IMAGE_WIDTH || 1024),
          Number(process.env.TELLUS_TEXT_TO_IMAGE_HEIGHT || 1024),
          Number(process.env.TELLUS_TEXT_TO_IMAGE_GUIDANCE || 0),
          negativePrompt,
        ],
      }),
    },
  );
  const body = (await response.json()) as GradioImageResponse;
  if (!response.ok || body.error) {
    throw new Error(
      body.error ?? `Gradio image request failed with HTTP ${response.status}`,
    );
  }

  const image = body.data?.[0];
  const imageUrl = image?.url || image?.path;
  if (!imageUrl) throw new Error("Gradio image request returned no image");
  return {
    imageUrl,
    provider: "gradio",
    imagePrompt,
    storedImagePath: body.data?.[2],
  };
}

function builtInComfyWorkflow(imagePrompt: string): Record<string, unknown> {
  const checkpoint = process.env.TELLUS_COMFYUI_CHECKPOINT?.trim() || "zTurbo.safetensors";
  const width = Number(process.env.TELLUS_TEXT_TO_IMAGE_WIDTH || 1024);
  const height = Number(process.env.TELLUS_TEXT_TO_IMAGE_HEIGHT || 1024);
  const steps = Number(process.env.TELLUS_TEXT_TO_IMAGE_STEPS || 8);
  const cfg = Number(process.env.TELLUS_TEXT_TO_IMAGE_CFG_SCALE || 1.5);
  const sampler = process.env.TELLUS_TEXT_TO_IMAGE_SAMPLER || "euler";
  const scheduler = process.env.TELLUS_COMFYUI_SCHEDULER || "normal";
  const negative =
    process.env.TELLUS_TEXT_TO_IMAGE_NEGATIVE_PROMPT?.trim() ||
    "text, watermark, logo, cropped, blurry, background clutter, multiple objects";

  return {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: checkpoint },
    },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: { text: imagePrompt, clip: ["1", 1] },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: { text: negative, clip: ["1", 1] },
    },
    "4": {
      class_type: "EmptyLatentImage",
      inputs: { width, height, batch_size: 1 },
    },
    "5": {
      class_type: "KSampler",
      inputs: {
        seed: Math.floor(Math.random() * 1_000_000_000),
        steps,
        cfg,
        sampler_name: sampler,
        scheduler,
        denoise: 1,
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["4", 0],
      },
    },
    "6": {
      class_type: "VAEDecode",
      inputs: { samples: ["5", 0], vae: ["1", 2] },
    },
    "7": {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: process.env.TELLUS_COMFYUI_FILENAME_PREFIX || "tellus",
        images: ["6", 0],
      },
    },
  };
}

function replaceWorkflowPlaceholders(value: unknown, replacements: Record<string, string>): unknown {
  if (typeof value === "string") {
    return Object.entries(replacements).reduce(
      (result, [key, replacement]) => result.replaceAll(`{{${key}}}`, replacement),
      value,
    );
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceWorkflowPlaceholders(item, replacements));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        replaceWorkflowPlaceholders(item, replacements),
      ]),
    );
  }
  return value;
}

function patchComfyPromptText(workflow: unknown, imagePrompt: string): unknown {
  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) {
    return workflow;
  }
  const patched = workflow as Record<string, unknown>;
  for (const node of Object.values(patched)) {
    if (!node || typeof node !== "object" || Array.isArray(node)) continue;
    const nodeRecord = node as Record<string, unknown>;
    if (nodeRecord.class_type !== "CLIPTextEncode") continue;
    const inputs = nodeRecord.inputs;
    if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) continue;
    const inputRecord = inputs as Record<string, unknown>;
    const text = inputRecord.text;
    if (typeof text === "string" && text.includes("{{prompt}}")) {
      inputRecord.text = text.replaceAll("{{prompt}}", imagePrompt);
      continue;
    }
    if (typeof text === "string" && !/negative|watermark|blurry|text/i.test(text)) {
      inputRecord.text = imagePrompt;
      break;
    }
  }
  return patched;
}

async function comfyWorkflow(imagePrompt: string): Promise<unknown> {
  const templatePath = process.env.TELLUS_COMFYUI_WORKFLOW_PATH?.trim();
  if (!templatePath) return builtInComfyWorkflow(imagePrompt);

  const template = JSON.parse(await readFile(hostPath(templatePath), "utf8")) as unknown;
  const replaced = replaceWorkflowPlaceholders(template, {
    prompt: imagePrompt,
    negative_prompt:
      process.env.TELLUS_TEXT_TO_IMAGE_NEGATIVE_PROMPT?.trim() ||
      "text, watermark, logo, cropped, blurry, background clutter, multiple objects",
    seed: `${Math.floor(Math.random() * 1_000_000_000)}`,
    width: `${Number(process.env.TELLUS_TEXT_TO_IMAGE_WIDTH || 1024)}`,
    height: `${Number(process.env.TELLUS_TEXT_TO_IMAGE_HEIGHT || 1024)}`,
  });
  return patchComfyPromptText(replaced, imagePrompt);
}

async function waitForComfyImage(
  baseUrl: string,
  promptId: string,
): Promise<ComfyImageOutput> {
  const deadline = Date.now() + Number(process.env.TELLUS_COMFYUI_TIMEOUT_MS || 180_000);
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const response = await fetch(`${baseUrl}/history/${encodeURIComponent(promptId)}`);
    if (!response.ok) continue;
    const allHistory = (await response.json()) as Record<string, ComfyHistoryResponse>;
    const history = allHistory[promptId];
    const output = Object.values(history?.outputs ?? {}).flatMap(
      (item) => item.images ?? [],
    )[0];
    if (output?.filename) return output;
    if (history?.status?.completed && !output) {
      throw new Error("ComfyUI workflow completed without an image output");
    }
  }
  throw new Error(`ComfyUI prompt ${promptId} timed out`);
}

async function generateComfyUIConceptImage(
  prompt: string,
  kind: string,
): Promise<TextImageResult> {
  const baseUrl = (
    process.env.TELLUS_TEXT_TO_IMAGE_BASE_URL?.trim() ||
    process.env.COMFYUI_BASE_URL?.trim() ||
    ""
  ).replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("TELLUS_TEXT_TO_IMAGE_BASE_URL is not configured");
  }

  const imagePrompt = imageGenerationPrompt(prompt, kind);
  const workflow = await comfyWorkflow(imagePrompt);
  const response = await fetch(`${baseUrl}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: workflow,
      client_id: `tellus-${Date.now().toString(36)}`,
    }),
  });
  const body = (await response.json()) as ComfyPromptResponse;
  if (!response.ok || body.error || !body.prompt_id) {
    throw new Error(`ComfyUI prompt request failed with HTTP ${response.status}`);
  }

  const image = await waitForComfyImage(baseUrl, body.prompt_id);
  const imageUrl = new URL("/view", `${baseUrl}/`);
  imageUrl.searchParams.set("filename", image.filename ?? "");
  imageUrl.searchParams.set("subfolder", image.subfolder ?? "");
  imageUrl.searchParams.set("type", image.type ?? "output");
  return {
    imageUrl: imageUrl.toString(),
    provider: "comfyui",
    imagePrompt,
  };
}

async function createTextImage(
  prompt: string,
  kind: string,
  requestedImageUrl?: string,
): Promise<TextImageResult> {
  if (requestedImageUrl) {
    return {
      imageUrl: requestedImageUrl,
      provider: "request",
      imagePrompt: "provided imageUrl",
    };
  }

  const provider = (
    process.env.TELLUS_TEXT_TO_IMAGE_PROVIDER?.trim().toLowerCase() || "auto"
  ) as
    | "auto"
    | "openai"
    | "automatic1111"
    | "comfyui"
    | "gradio"
    | "procedural"
    | "none";

  const attempts: Array<() => Promise<TextImageResult>> = [];
  if (provider === "openai") attempts.push(() => generateOpenAIConceptImage(prompt, kind));
  if (provider === "automatic1111") {
    attempts.push(() => generateAutomatic1111ConceptImage(prompt, kind));
  }
  if (provider === "gradio") {
    attempts.push(() => generateGradioConceptImage(prompt, kind));
  }
  if (provider === "comfyui") {
    attempts.push(() => generateComfyUIConceptImage(prompt, kind));
  }
  if (provider === "auto") {
    if (process.env.TELLUS_GRADIO_IMAGE_BASE_URL?.trim()) {
      attempts.push(() => generateGradioConceptImage(prompt, kind));
    }
    if (
      process.env.TELLUS_TEXT_TO_IMAGE_BASE_URL?.trim() ||
      process.env.COMFYUI_BASE_URL?.trim() ||
      process.env.TELLUS_COMFYUI_WORKFLOW_PATH?.trim()
    ) {
      attempts.push(() => generateComfyUIConceptImage(prompt, kind));
    }
    if (
      process.env.TELLUS_TEXT_TO_IMAGE_BASE_URL?.trim() ||
      process.env.AUTOMATIC1111_BASE_URL?.trim()
    ) {
      attempts.push(() => generateAutomatic1111ConceptImage(prompt, kind));
    }
    if (process.env.OPENAI_API_KEY?.trim()) {
      attempts.push(() => generateOpenAIConceptImage(prompt, kind));
    }
  }

  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch {
      // Fall back to the procedural safety net below.
    }
  }

  return {
    imageUrl: conceptImageDataUrl(prompt, kind),
    provider: "procedural",
    imagePrompt: imageGenerationPrompt(prompt, kind),
  };
}

async function persistSourceImage(params: {
  id: string;
  prompt: string;
  kind: string;
  createdAt: string;
  image: TextImageResult;
}): Promise<TextImageResult> {
  const root = generatedAssetRoot();
  await mkdir(root, { recursive: true });
  const fetched = await fetchBytes(params.image.imageUrl);
  const filename = `${generatedFilenameBase(params)}-source.${mimeExtension(
    fetched.mime,
  )}`;
  const finalPath = join(root, filename);
  const tempPath = `${finalPath}.tmp`;
  await writeFile(tempPath, fetched.bytes);
  await rename(tempPath, finalPath);
  return {
    ...params.image,
    upstreamImageUrl: params.image.imageUrl,
    imageUrl: `data:${fetched.mime};base64,${fetched.bytes.toString("base64")}`,
    storedImageUrl: `/generated-assets/${encodeURIComponent(filename)}`,
    storedImagePath: finalPath,
  };
}

async function appendManifest(entry: GeneratedAssetManifestEntry): Promise<void> {
  const manifestPath = join(generatedAssetRoot(), "manifest.json");
  let existing: GeneratedAssetManifestEntry[] = [];
  try {
    const parsed = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
    if (Array.isArray(parsed)) {
      existing = parsed.filter(
        (item): item is GeneratedAssetManifestEntry =>
          typeof item === "object" && item !== null,
      );
    }
  } catch {
    existing = [];
  }
  existing.push(entry);
  await writeFile(
    manifestPath,
    `${JSON.stringify(existing, null, 2)}\n`,
    "utf8",
  );
}

async function persistGeneratedModel(params: {
  id: string;
  prompt: string;
  kind: string;
  rawModelUrl: string;
  sourceImage: TextImageResult;
  createdAt: string;
  sampleSteps: number;
  seed: number;
  provider: Generation3DProvider;
}): Promise<GeneratedAssetManifestEntry> {
  const root = generatedAssetRoot();
  await mkdir(root, { recursive: true });

  const filename = `${generatedFilenameBase(params)}.glb`;
  const finalPath = join(root, filename);
  const tempPath = `${finalPath}.tmp`;
  const rawModelBytes = Buffer.from(await fetchArrayBuffer(params.rawModelUrl));
  const optimized = await optimizeGeneratedGlb(rawModelBytes);
  await writeFile(tempPath, optimized.bytes);
  await rename(tempPath, finalPath);

  const entry: GeneratedAssetManifestEntry = {
    id: params.id,
    prompt: params.prompt,
    kind: params.kind,
    provider: params.provider,
    rawModelUrl: params.rawModelUrl,
    modelUrl: `/generated-assets/${encodeURIComponent(filename)}`,
    storedModelPath: finalPath,
    sourceImageUrl: params.sourceImage.storedImageUrl ?? params.sourceImage.imageUrl,
    sourceImagePath: params.sourceImage.storedImagePath,
    textImageProvider: params.sourceImage.provider,
    imagePrompt: params.sourceImage.imagePrompt,
    createdAt: params.createdAt,
    sampleSteps: params.sampleSteps,
    seed: params.seed,
    rawModelSizeBytes: rawModelBytes.byteLength,
    storedModelSizeBytes: optimized.bytes.byteLength,
    optimized: optimized.optimized,
    optimization: optimized.message,
  };
  const assetStore = await uploadGeneratedModelToAssetStore({
    id: params.id,
    prompt: params.prompt,
    kind: params.kind,
    filename,
    bytes: optimized.bytes,
  });
  if (assetStore) {
    entry.assetStoreModelId = assetStore.modelId;
    entry.assetStoreModelUrl = assetStore.modelUrl;
    entry.assetStoreDownloadUrl = assetStore.downloadUrl;
  }
  await appendManifest(entry);
  return entry;
}

async function uploadGeneratedModelToAssetStore(params: {
  id: string;
  prompt: string;
  kind: string;
  filename: string;
  bytes: Buffer;
}): Promise<AssetStoreUploadResult | null> {
  const baseUrl = (
    process.env.TELLUS_ASSET_STORE_API_BASE?.trim() || "https://3d.flobots.xyz"
  ).replace(/\/+$/, "");
  const sessionCookie = process.env.TELLUS_ASSET_STORE_SESSION_COOKIE?.trim();
  const uploadToken = process.env.TELLUS_ASSET_STORE_UPLOAD_TOKEN?.trim();
  const required = boolEnv("TELLUS_REQUIRE_ASSET_STORE_UPLOAD", true);
  if (!sessionCookie && !uploadToken) {
    if (required) {
      throw new Error(
        "Asset-store upload is required but TELLUS_ASSET_STORE_SESSION_COOKIE or TELLUS_ASSET_STORE_UPLOAD_TOKEN is not configured",
      );
    }
    return null;
  }

  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(params.bytes)], { type: "model/gltf-binary" }),
    params.filename,
  );
  form.append("name", params.prompt.slice(0, 96));
  form.append("description", `Tellus generated ${params.kind}: ${params.prompt}`);
  form.append("is_public", process.env.TELLUS_ASSET_STORE_PUBLIC ?? "true");
  form.append("tags", `tellus,generated,${params.kind},${params.id}`);

  const headers: HeadersInit = {};
  if (sessionCookie) headers.Cookie = sessionCookie;
  if (uploadToken) headers.Authorization = `Bearer ${uploadToken}`;

  const response = await fetch(`${baseUrl}/api/upload`, {
    method: "POST",
    headers,
    body: form,
    redirect: "manual",
  });
  const contentType = response.headers.get("Content-Type") ?? "";
  const body = contentType.includes("application/json")
    ? ((await response.json()) as AssetStoreUploadResponse)
    : ({ message: await response.text() } satisfies AssetStoreUploadResponse);
  if (!response.ok) {
    const message =
      body.error ||
      body.message ||
      `asset-store upload failed with HTTP ${response.status}`;
    throw new Error(message.slice(0, 240));
  }
  const model = body.model ?? body.uploaded?.[0];
  if (!model?.id) {
    throw new Error("asset-store upload completed without a model id");
  }
  return {
    modelId: model.id,
    modelUrl: `${baseUrl}/view/${encodeURIComponent(model.id)}`,
    downloadUrl: `${baseUrl}/download/${encodeURIComponent(model.id)}`,
  };
}

async function optimizeGeneratedGlb(
  input: Buffer,
): Promise<{ bytes: Buffer; optimized: boolean; message: string }> {
  if (!boolEnv("TELLUS_OPTIMIZE_GLB", true)) {
    return { bytes: input, optimized: false, message: "disabled" };
  }
  try {
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
    const document = await io.readBinary(new Uint8Array(input));
    const transforms = [resample(), prune(), dedup(), weld()];
    if (boolEnv("TELLUS_OPTIMIZE_QUANTIZE", true)) {
      transforms.push(quantize());
    }
    const simplifyRatio = Number(process.env.TELLUS_OPTIMIZE_SIMPLIFY_RATIO || 0);
    if (Number.isFinite(simplifyRatio) && simplifyRatio > 0 && simplifyRatio < 1) {
      transforms.push(
        simplify({
          simplifier: MeshoptSimplifier,
          ratio: simplifyRatio,
          error: Number(process.env.TELLUS_OPTIMIZE_SIMPLIFY_ERROR || 0.0001),
        }),
      );
    }
    const textureMaxSize = Number(process.env.TELLUS_OPTIMIZE_TEXTURE_MAX_SIZE || 1024);
    if (boolEnv("TELLUS_OPTIMIZE_TEXTURES", true) && textureMaxSize > 0) {
      transforms.push(
        textureCompress({
          encoder: sharp,
          targetFormat: "webp",
          resize: [textureMaxSize, textureMaxSize],
          quality: Number(process.env.TELLUS_OPTIMIZE_TEXTURE_QUALITY || 82),
        }),
      );
    }
    await document.transform(...transforms);
    const output = Buffer.from(await io.writeBinary(document));
    if (output.byteLength >= input.byteLength) {
      return {
        bytes: input,
        optimized: false,
        message: `kept original; optimized candidate was ${output.byteLength} bytes`,
      };
    }
    return {
      bytes: output,
      optimized: true,
      message: `gltf-transform reduced ${input.byteLength} to ${output.byteLength} bytes`,
    };
  } catch (error) {
    return {
      bytes: input,
      optimized: false,
      message:
        error instanceof Error
          ? `optimization skipped: ${error.message}`
          : "optimization skipped",
    };
  }
}

function cleanUpstreamError(status: number, body: string): string {
  if (status === 524) {
    return "InstantMesh timed out upstream before returning a model";
  }
  const text = body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return `InstantMesh request failed with HTTP ${status}`;
  return `InstantMesh request failed with HTTP ${status}: ${text.slice(0, 240)}`;
}

async function uploadImageToGradio(
  baseUrl: string,
  image: TextImageResult,
): Promise<FileLikeResult> {
  const fetched = await fetchBytes(image.imageUrl);
  const extension = mimeExtension(fetched.mime);
  const form = new FormData();
  form.append(
    "files",
    new Blob([new Uint8Array(fetched.bytes)], { type: fetched.mime }),
    `tellus-source.${extension}`,
  );
  const response = await fetch(`${baseUrl}/gradio_api/upload`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(cleanUpstreamError(response.status, body));
  }
  const uploaded = (await response.json()) as unknown;
  const path = Array.isArray(uploaded) ? uploaded[0] : undefined;
  if (typeof path !== "string") {
    throw new Error("Pixal3D upload returned no file path");
  }
  return {
    path,
    orig_name: `tellus-source.${extension}`,
    mime_type: fetched.mime,
    is_stream: false,
    meta: { _type: "gradio.FileData" },
  } as FileLikeResult;
}

function parseGradioEventData(text: string): { done: boolean; data?: unknown; error?: string } {
  const events = text.split(/\n\n+/);
  let lastEvent = "";
  for (const event of events) {
    const lines = event.split(/\n/);
    const eventName = lines
      .find((line) => line.startsWith("event:"))
      ?.slice("event:".length)
      .trim();
    const dataText = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .join("\n");
    if (eventName) lastEvent = eventName;
    if (!dataText) continue;
    const data = JSON.parse(dataText) as unknown;
    if (eventName === "error") {
      return {
        done: true,
        error:
          data && typeof data === "object" && "error" in data
            ? String((data as { error?: unknown }).error)
            : "Pixal3D generation failed",
      };
    }
    if (eventName === "complete" || eventName === "success") {
      return { done: true, data };
    }
    if (lastEvent === "complete") return { done: true, data };
  }
  return { done: false };
}

async function waitForGradioCallResult(
  baseUrl: string,
  apiName: string,
  eventId: string,
): Promise<unknown> {
  const deadline = Date.now() + Number(process.env.PIXAL3D_TIMEOUT_MS || 20 * 60 * 1000);
  while (Date.now() < deadline) {
    const response = await fetch(
      `${baseUrl}/gradio_api/call/${apiName}/${encodeURIComponent(eventId)}`,
    );
    const text = await response.text();
    if (!response.ok) {
      throw new Error(cleanUpstreamError(response.status, text));
    }
    const result = parseGradioEventData(text);
    if (result.error) throw new Error(result.error);
    if (result.done) return result.data;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error(`Pixal3D ${apiName} timed out`);
}

async function callGradioV2(
  baseUrl: string,
  apiName: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(`${baseUrl}/gradio_api/call/v2/${apiName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let body: GradioCallResponse = {};
  try {
    body = JSON.parse(text) as GradioCallResponse;
  } catch {
    if (!response.ok) {
      throw new Error(cleanUpstreamError(response.status, text));
    }
  }
  if (!response.ok || body.error || !body.event_id) {
    throw new Error(
      body.error ?? `Pixal3D ${apiName} request failed with HTTP ${response.status}`,
    );
  }
  return waitForGradioCallResult(baseUrl, apiName, body.event_id);
}

function firstFileLike(value: unknown): FileLikeResult | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const file = firstFileLike(item);
      if (file) return file;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const candidate = value as FileLikeResult;
  if (typeof candidate.path === "string" || typeof candidate.url === "string") {
    return candidate;
  }
  for (const item of Object.values(value)) {
    const file = firstFileLike(item);
    if (file) return file;
  }
  return null;
}

async function generatePixal3DModel(
  baseUrl: string,
  image: TextImageResult,
  seed: number,
): Promise<string> {
  const uploadedImage = await uploadImageToGradio(baseUrl, image);
  const sessionId = `tellus-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const resolution = numberEnv("PIXAL3D_RESOLUTION", 1536);
  const steps = numberEnv("PIXAL3D_SAMPLING_STEPS", 12);
  const preprocessed = boolEnv("PIXAL3D_PREPROCESS_IMAGE", true)
    ? firstFileLike(
        await callGradioV2(baseUrl, "preprocess", { image: uploadedImage }),
      )
    : null;
  const generation = await callGradioV2(baseUrl, "generate_3d", {
    image: uploadedImage,
    seed,
    resolution,
    preprocessed_image: preprocessed,
    preprocessed_name: preprocessed?.path ? basename(preprocessed.path) : "",
    ss_guidance_strength: numberEnv("PIXAL3D_SS_GUIDANCE_STRENGTH", 7.5),
    ss_guidance_rescale: numberEnv("PIXAL3D_SS_GUIDANCE_RESCALE", 0.7),
    ss_sampling_steps: numberEnv("PIXAL3D_SS_SAMPLING_STEPS", steps),
    ss_rescale_t: numberEnv("PIXAL3D_SS_RESCALE_T", 5),
    shape_slat_guidance_strength: numberEnv(
      "PIXAL3D_SHAPE_GUIDANCE_STRENGTH",
      7.5,
    ),
    shape_slat_guidance_rescale: numberEnv("PIXAL3D_SHAPE_GUIDANCE_RESCALE", 0.5),
    shape_slat_sampling_steps: numberEnv("PIXAL3D_SHAPE_SAMPLING_STEPS", steps),
    shape_slat_rescale_t: numberEnv("PIXAL3D_SHAPE_RESCALE_T", 3),
    tex_slat_guidance_strength: numberEnv("PIXAL3D_TEXTURE_GUIDANCE_STRENGTH", 1),
    tex_slat_guidance_rescale: numberEnv("PIXAL3D_TEXTURE_GUIDANCE_RESCALE", 0),
    tex_slat_sampling_steps: numberEnv("PIXAL3D_TEXTURE_SAMPLING_STEPS", steps),
    tex_slat_rescale_t: numberEnv("PIXAL3D_TEXTURE_RESCALE_T", 3),
    preview_resolution: numberEnv("PIXAL3D_PREVIEW_RESOLUTION", 1024),
    preview_frames: numberEnv("PIXAL3D_PREVIEW_FRAMES", 8),
    manual_fov: numberEnv("PIXAL3D_MANUAL_FOV", -1),
    fov_unit: process.env.PIXAL3D_FOV_UNIT || "deg",
    session_id: sessionId,
  });
  const statePath = collectCandidates(generation).find((value) =>
    /state/i.test(value),
  );
  if (!statePath) {
    throw new Error("Pixal3D generated no extractable state");
  }
  const extracted = await callGradioV2(baseUrl, "extract_glb", {
    state_path: statePath,
    decimation_target: numberEnv("PIXAL3D_DECIMATION_TARGET", 1_000_000),
    texture_size: numberEnv("PIXAL3D_TEXTURE_SIZE", 4096),
    session_id: sessionId,
  });
  const candidate = collectCandidates(extracted).find((value) =>
    /\.(glb|gltf)(\?|$)/i.test(value),
  );
  if (!candidate) {
    throw new Error("Pixal3D completed without a GLB output");
  }
  return resolveGradioFileUrl(baseUrl, candidate);
}

function anigenAssetName(prompt: string, kind: string): string {
  return (slugify(`${kind}-${prompt}`) || `tellus-${kind}`).slice(0, 64);
}

async function generateAnigenModel(
  baseUrl: string,
  image: TextImageResult,
  prompt: string,
  kind: string,
): Promise<string> {
  const uploadedImage = await uploadImageToGradio(baseUrl, image);
  const result = await callGradioV2(baseUrl, "create_animal_asset", {
    image: uploadedImage,
    mesh: null,
    asset_name: anigenAssetName(prompt, kind),
    rigger: process.env.ANIGEN_RIGGER || "auto",
    anigen_bind: process.env.ANIGEN_BIND || "direct",
    ss_model: process.env.ANIGEN_SS_MODEL || "ss_flow_solo",
    slat_model: process.env.ANIGEN_SLAT_MODEL || "slat_flow_auto",
    ss_steps: numberEnv("ANIGEN_SS_STEPS", 25),
    slat_steps: numberEnv("ANIGEN_SLAT_STEPS", 25),
    anigen_simplify_ratio: numberEnv("ANIGEN_SIMPLIFY_RATIO", 0.95),
    texture_size: numberEnv("ANIGEN_TEXTURE_SIZE", 1024),
    animate: boolEnv("ANIGEN_ANIMATE", true),
    duration: numberEnv("ANIGEN_ANIMATION_DURATION", 2),
    fps: numberEnv("ANIGEN_ANIMATION_FPS", 30),
    amplitude: numberEnv("ANIGEN_ANIMATION_AMPLITUDE", 12),
    frequency: numberEnv("ANIGEN_ANIMATION_FREQUENCY", 1),
    axis: process.env.ANIGEN_ANIMATION_AXIS || "0,0,1",
    mesh_postprocess: boolEnv("ANIGEN_MESH_REPAIR", true) ? "repair" : "none",
    fill_holes: boolEnv("ANIGEN_FILL_HOLES", true),
    repair_target_faces: numberEnv("ANIGEN_REPAIR_TARGET_FACES", 0),
    compress_draco: boolEnv("ANIGEN_COMPRESS_DRACO", false),
    force: boolEnv("ANIGEN_FORCE_REGENERATE", false),
  });
  const outputs = Array.isArray(result) ? result : [];
  const preferred = collectCandidates(outputs[2])
    .concat(collectCandidates(outputs[1]))
    .concat(collectCandidates(result))
    .find((value) => /\.(glb|gltf)(\?|$)/i.test(value));
  if (!preferred) {
    throw new Error("Anigen completed without a GLB output");
  }
  return resolveGradioFileUrl(baseUrl, preferred);
}

async function readRequestJson(request: Request): Promise<Generate3DRequest> {
  const parsed = (await request.json()) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return parsed as Generate3DRequest;
}

function generationProviderFromValue(value: unknown): Generation3DProvider {
  if (
    value === "instantmesh-gradio" ||
    value === "pixal3d-gradio" ||
    value === "anigen-gradio"
  ) {
    return value;
  }
  return process.env.TELLUS_3D_PROVIDER === "instantmesh-gradio"
    ? "instantmesh-gradio"
    : process.env.TELLUS_3D_PROVIDER === "anigen-gradio"
      ? "anigen-gradio"
      : "pixal3d-gradio";
}

function providerBaseUrl(provider: Generation3DProvider): string | undefined {
  if (provider === "pixal3d-gradio") return process.env.PIXAL3D_GRADIO_BASE_URL;
  if (provider === "anigen-gradio") return process.env.ANIGEN_GRADIO_BASE_URL;
  return process.env.INSTANTMESH_GRADIO_BASE_URL;
}

function knownInstantMeshBaseUrls(): Set<string> {
  const urls = new Set([
    "http://127.0.0.1:43839",
    "http://localhost:43839",
    "http://192.168.1.177:43839",
  ]);
  for (const value of [
    process.env.INSTANTMESH_GRADIO_BASE_URL,
    ...(process.env.INSTANTMESH_GRADIO_BASE_URLS?.split(",") ?? []),
  ]) {
    const trimmed = value?.trim();
    if (trimmed) urls.add(trimmed.replace(/\/+$/, ""));
  }
  return urls;
}

function instantMeshBaseUrlFromPayload(payload: Generate3DRequest): string | undefined {
  const requested = payload.instantMeshBaseUrl?.trim().replace(/\/+$/, "");
  if (!requested) return providerBaseUrl("instantmesh-gradio");
  if (!knownInstantMeshBaseUrls().has(requested)) {
    throw new Error(`InstantMesh target is not allowed: ${requested}`);
  }
  return requested;
}

function missingProviderConfigMessage(provider: Generation3DProvider): string {
  if (provider === "pixal3d-gradio") return "PIXAL3D_GRADIO_BASE_URL is not configured";
  if (provider === "anigen-gradio") return "ANIGEN_GRADIO_BASE_URL is not configured";
  return "INSTANTMESH_GRADIO_BASE_URL is not configured";
}

function disabledProviderMessage(provider: Generation3DProvider): string | null {
  const disabled = new Set(
    (process.env.TELLUS_DISABLED_3D_PROVIDERS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  return disabled.has(provider) ? `${provider} is temporarily disabled` : null;
}

async function executeGeneration(params: {
  payload: Generate3DRequest;
  provider: Generation3DProvider;
  baseUrl: string;
  generationId: string;
}): Promise<Generate3DResponse> {
  const { payload, provider, baseUrl, generationId } = params;
  const prompt = payload.prompt?.trim() || "tiny Tellus world object";
  const kind = payload.kind?.trim() || "object";
  const createdAt = new Date().toISOString();
  let textImage = await createTextImage(prompt, kind, payload.imageUrl?.trim());
  try {
    textImage = await persistSourceImage({
      id: generationId,
      prompt,
      kind,
      createdAt,
      image: textImage,
    });
  } catch {
    // The GLB is the critical artifact. Keep going if image persistence fails.
  }
  const imageUrl = textImage.imageUrl;
  const sampleSteps =
    payload.sampleSteps ?? Number(process.env.INSTANTMESH_SAMPLE_STEPS || 30);
  const seed = payload.seed ?? Date.now() % 1_000_000;
  if (provider === "pixal3d-gradio") {
    const rawModelUrl = await generatePixal3DModel(baseUrl, textImage, seed);
    const stored = await persistGeneratedModel({
      id: generationId,
      prompt,
      kind,
      rawModelUrl,
      sourceImage: textImage,
      createdAt,
      sampleSteps,
      seed,
      provider,
    });
    return {
      jobId: stored.id,
      status: "completed",
      modelUrl: stored.assetStoreModelUrl ?? stored.modelUrl,
      provider,
      rawModelUrl,
      storedModelUrl: stored.modelUrl,
      storedModelPath: stored.storedModelPath,
      assetStoreModelId: stored.assetStoreModelId,
      assetStoreModelUrl: stored.assetStoreModelUrl,
      assetStoreDownloadUrl: stored.assetStoreDownloadUrl,
      sourceImageUrl: stored.sourceImageUrl,
      sourceImagePath: stored.sourceImagePath,
      textImageProvider: stored.textImageProvider,
      manifestUrl: "/generated-assets/manifest.json",
    };
  }

  if (provider === "anigen-gradio") {
    const rawModelUrl = await generateAnigenModel(baseUrl, textImage, prompt, kind);
    const stored = await persistGeneratedModel({
      id: generationId,
      prompt,
      kind,
      rawModelUrl,
      sourceImage: textImage,
      createdAt,
      sampleSteps,
      seed,
      provider,
    });
    return {
      jobId: stored.id,
      status: "completed",
      modelUrl: stored.assetStoreModelUrl ?? stored.modelUrl,
      provider,
      rawModelUrl,
      storedModelUrl: stored.modelUrl,
      storedModelPath: stored.storedModelPath,
      assetStoreModelId: stored.assetStoreModelId,
      assetStoreModelUrl: stored.assetStoreModelUrl,
      assetStoreDownloadUrl: stored.assetStoreDownloadUrl,
      sourceImageUrl: stored.sourceImageUrl,
      sourceImagePath: stored.sourceImagePath,
      textImageProvider: stored.textImageProvider,
      manifestUrl: "/generated-assets/manifest.json",
    };
  }

  const fnIndex = await instantMeshPredictFnIndex(baseUrl);
  const response = await fetch(`${baseUrl}/run/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: [
        imageUrl,
        payload.removeBackground ?? textImage.provider !== "request",
        sampleSteps,
        seed,
      ],
      fn_index: fnIndex,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(cleanUpstreamError(response.status, body));
  }

  const body = (await response.json()) as LegacyPredictResponse;
  if (body.error) throw new Error(body.error);

  const candidate = collectCandidates(body.data).find((value) =>
    /\.(glb|gltf)(\?|$)/i.test(value),
  );
  if (!candidate) {
    throw new Error("InstantMesh completed without a GLB output");
  }

  const rawModelUrl = resolveGradioFileUrl(baseUrl, candidate);
  const stored = await persistGeneratedModel({
    id: generationId,
    prompt,
    kind,
    rawModelUrl,
    sourceImage: textImage,
    createdAt,
    sampleSteps,
    seed,
    provider,
  });
  return {
    jobId: stored.id,
    status: "completed",
    modelUrl: stored.assetStoreModelUrl ?? stored.modelUrl,
    provider,
    rawModelUrl,
    storedModelUrl: stored.modelUrl,
    storedModelPath: stored.storedModelPath,
    assetStoreModelId: stored.assetStoreModelId,
    assetStoreModelUrl: stored.assetStoreModelUrl,
    assetStoreDownloadUrl: stored.assetStoreDownloadUrl,
    sourceImageUrl: stored.sourceImageUrl,
    sourceImagePath: stored.sourceImagePath,
    textImageProvider: stored.textImageProvider,
    manifestUrl: "/generated-assets/manifest.json",
  };
}

function startGenerationJob(params: {
  payload: Generate3DRequest;
  provider: Generation3DProvider;
  baseUrl: string;
  generationId: string;
}): GenerationJob {
  const existing = generationJobs.get(params.generationId);
  if (existing && !generationJobExpired(existing)) return existing;
  if (existing) generationJobs.delete(existing.id);
  const job: GenerationJob = {
    id: params.generationId,
    provider: params.provider,
    status: "queued",
    createdAt: Date.now(),
  };
  generationJobs.set(job.id, job);

  const run = async () => {
    if (!generationJobs.has(job.id) || generationJobExpired(job)) {
      job.status = "failed";
      job.error = "Generation job expired before starting";
      return;
    }
    job.status = "generating";
    job.startedAt = Date.now();
    try {
      const result = await withGenerationTimeout(executeGeneration(params));
      if (!generationJobs.has(job.id)) return;
      job.status = "completed";
      job.result = result;
    } catch (error) {
      if (!generationJobs.has(job.id)) return;
      job.status = "failed";
      job.error =
        error instanceof Error ? error.message : `${params.provider} generation failed`;
    }
  };

  generationQueueTail = generationQueueTail.then(run, run);
  return job;
}

export async function generate3DHandler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  pruneGenerationJobs();
  if (request.method === "GET") {
    const jobId = url.searchParams.get("jobId") || "";
    const job = generationJobs.get(jobId);
    if (!job) {
      return Response.json({ error: "Generation job not found" }, { status: 404 });
    }
    if (job.status === "completed" && job.result) {
      return Response.json(job.result);
    }
    return Response.json({
      jobId: job.id,
      status: job.status,
      provider: job.provider,
      textImageProvider: "pending",
      manifestUrl: "/generated-assets/manifest.json",
      error: job.error,
    } satisfies Generate3DResponse);
  }

  if (request.method === "DELETE") {
    const jobId = url.searchParams.get("jobId") || "";
    const job = generationJobs.get(jobId);
    if (!job) {
      return Response.json({ ok: true, jobId, cancelled: false });
    }
    if (job.status === "queued" || job.status === "generating") {
      job.status = "failed";
      job.error = "Generation job cancelled by client";
    }
    generationJobs.delete(jobId);
    return Response.json({ ok: true, jobId, cancelled: true });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const payload = await readRequestJson(request);
  const provider = generationProviderFromValue(payload.provider);
  const disabledProvider = disabledProviderMessage(provider);
  if (disabledProvider) {
    return Response.json({ error: disabledProvider }, { status: 503 });
  }
  let baseUrl: string | undefined;
  try {
    baseUrl = (provider === "instantmesh-gradio"
      ? instantMeshBaseUrlFromPayload(payload)
      : providerBaseUrl(provider))
      ?.trim()
      .replace(/\/+$/, "");
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "InstantMesh target is not allowed",
      },
      { status: 400 },
    );
  }
  if (!baseUrl) {
    return Response.json(
      { error: missingProviderConfigMessage(provider) },
      { status: 503 },
    );
  }

  const generationId = payload.id || `${provider}-${Date.now()}`;
  if (provider === "pixal3d-gradio" || provider === "anigen-gradio") {
    const job = startGenerationJob({ payload, provider, baseUrl, generationId });
    return Response.json(
      {
        jobId: job.id,
        status: job.status,
        provider,
        textImageProvider: "pending",
        manifestUrl: "/generated-assets/manifest.json",
      } satisfies Generate3DResponse,
      { status: 202 },
    );
  }

  try {
    return Response.json(
      await executeGeneration({ payload, provider, baseUrl, generationId }),
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "InstantMesh generation failed",
      },
      { status: 502 },
    );
  }
}

export default generate3DHandler;
