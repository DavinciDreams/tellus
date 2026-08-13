import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import generate3DHandler from "./api/generate-3d.js";
import generatedAssetsHandler from "./api/generated-assets.js";
import gradioFileHandler from "./api/gradio-file.js";
import tellusStateHandler from "./api/tellus-state.js";

async function bodyFromRequest(request: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function sendWebResponse(
  response: import("node:http").ServerResponse,
  webResponse: Response,
) {
  response.statusCode = webResponse.status;
  webResponse.headers.forEach((value, key) => response.setHeader(key, value));
  if (!webResponse.body) {
    response.end();
    return;
  }
  const reader = webResponse.body.getReader();
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    response.write(Buffer.from(next.value));
  }
  response.end();
}

function cesiumBuildPath() {
  return path.resolve(process.cwd(), "node_modules/cesium/Build/Cesium");
}

function contentTypeFor(file: string) {
  if (file.endsWith(".js")) return "text/javascript";
  if (file.endsWith(".css")) return "text/css";
  if (file.endsWith(".json")) return "application/json";
  if (file.endsWith(".wasm")) return "application/wasm";
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".jpg") || file.endsWith(".jpeg")) return "image/jpeg";
  if (file.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  for (const key of [
    "ZAI_BASE_URL",
    "ZAI_API_KEY",
    "ZAI_MODEL",
    "ZAI_THINKING_TYPE",
    "HYADES_BASE_URL",
    "HYADES_API_KEY",
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "ANIGEN_GRADIO_BASE_URL",
    "AUTOMATIC1111_BASE_URL",
    "COMFYUI_BASE_URL",
    "INSTANTMESH_GRADIO_BASE_URL",
    "INSTANTMESH_GRADIO_BASE_URLS",
    "INSTANTMESH_SAMPLE_STEPS",
    "PIXAL3D_DECIMATION_TARGET",
    "PIXAL3D_FOV_UNIT",
    "PIXAL3D_GEOMETRY_STEPS",
    "PIXAL3D_GRADIO_BASE_URL",
    "PIXAL3D_MANUAL_FOV",
    "PIXAL3D_MESH_RESOLUTION",
    "PIXAL3D_PREPROCESS_IMAGE",
    "PIXAL3D_PREVIEW_FRAMES",
    "PIXAL3D_PREVIEW_RESOLUTION",
    "PIXAL3D_REFINE_STEPS",
    "PIXAL3D_RESOLUTION",
    "PIXAL3D_SAMPLING_STEPS",
    "PIXAL3D_SEED_MODE",
    "PIXAL3D_SHAPE_GUIDANCE_RESCALE",
    "PIXAL3D_SHAPE_GUIDANCE_STRENGTH",
    "PIXAL3D_SHAPE_RESCALE_T",
    "PIXAL3D_SHAPE_SAMPLING_STEPS",
    "PIXAL3D_SS_GUIDANCE_RESCALE",
    "PIXAL3D_SS_GUIDANCE_STRENGTH",
    "PIXAL3D_SS_RESCALE_T",
    "PIXAL3D_SS_SAMPLING_STEPS",
    "PIXAL3D_TARGET_FACES",
    "PIXAL3D_TEXTURE_GUIDANCE_RESCALE",
    "PIXAL3D_TEXTURE_GUIDANCE_STRENGTH",
    "PIXAL3D_TEXTURE_RESCALE_T",
    "PIXAL3D_TEXTURE_SAMPLING_STEPS",
    "PIXAL3D_TEXTURE_SIZE",
    "PIXAL3D_TEXTURE_STEPS",
    "PIXAL3D_TIMEOUT_MS",
    "TELLUS_OPTIMIZE_GLB",
    "TELLUS_3D_PROVIDER",
    "TELLUS_GRADIO_IMAGE_API_NAME",
    "TELLUS_GRADIO_IMAGE_BASE_URL",
    "TELLUS_COMFYUI_CHECKPOINT",
    "TELLUS_COMFYUI_FILENAME_PREFIX",
    "TELLUS_COMFYUI_SCHEDULER",
    "TELLUS_COMFYUI_TIMEOUT_MS",
    "TELLUS_COMFYUI_WORKFLOW_PATH",
    "TELLUS_GENERATED_ASSET_DIR",
    "TELLUS_TEXT_TO_IMAGE_BASE_URL",
    "TELLUS_TEXT_TO_IMAGE_CFG_SCALE",
    "TELLUS_TEXT_TO_IMAGE_HEIGHT",
    "TELLUS_TEXT_TO_IMAGE_MODEL",
    "TELLUS_TEXT_TO_IMAGE_NEGATIVE_PROMPT",
    "TELLUS_TEXT_TO_IMAGE_PROVIDER",
    "TELLUS_TEXT_TO_IMAGE_RANDOM_SEED",
    "TELLUS_TEXT_TO_IMAGE_SAMPLER",
    "TELLUS_TEXT_TO_IMAGE_SEED",
    "TELLUS_TEXT_TO_IMAGE_SIZE",
    "TELLUS_TEXT_TO_IMAGE_STEPS",
    "TELLUS_TEXT_TO_IMAGE_WIDTH",
  ]) {
    if (env[key]) process.env[key] = env[key];
  }
  const hyadesBaseUrl = /\/v\d+\/?$/i.test(
    env.HYADES_BASE_URL ?? "http://192.168.1.187/v1",
  )
    ? (env.HYADES_BASE_URL ?? "http://192.168.1.187/v1")
    : `${(env.HYADES_BASE_URL ?? "http://192.168.1.187").replace(/\/+$/, "")}/v1`;
  const hyadesApiKey = env.HYADES_API_KEY;

  return {
    build: {
      // Split 3D engine/runtime code into cacheable vendor chunks; Rapier's physics
      // runtime is intentionally larger than Vite's generic 500 KB web-app default.
      chunkSizeWarningLimit: 2500,
      rollupOptions: {
        input: {
          main: "index.html",
          agentView: "agent-view.html",
          treeLodGallery: "tree-lod-gallery.html",
          biomeMixer: "biome-mixer.html",
          biomeDefaults: "biome-defaults.html",
          yosemiteTerrainViewer: "yosemite-terrain-viewer.html",
          cesiumTerrainViewer: "cesium-terrain-viewer.html",
          dragonFlight: "dragon-flight.html",
          styleguide: "styleguide.html",
        },
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            const normalizedId = id.replaceAll("\\", "/");
            // Cesium is only used by the dedicated terrain/flight entries. Keeping it
            // in the generic vendor chunk made the primary Tellus page preload the
            // entire globe runtime and widget stylesheet before its first frame.
            if (
              normalizedId.includes("/node_modules/cesium/") ||
              normalizedId.includes("/node_modules/@cesium/")
            ) return "vendor-cesium";
            // Let Rollup keep the dynamically imported 3D Tiles graph lazy. Forcing
            // it into a manual chunk makes Vite conservatively preload that chunk.
            if (normalizedId.includes("/node_modules/3d-tiles-renderer/")) return undefined;
            if (normalizedId.includes("@dimforge/rapier3d-compat")) return "vendor-rapier";
            if (normalizedId.includes("@pixiv/three-vrm")) return "vendor-vrm";
            if (normalizedId.includes("/node_modules/three/")) return "vendor-three";
            return "vendor";
          },
        },
        onwarn(warning, warn) {
          const message =
            typeof warning.message === "string" ? warning.message : "";
          if (
            warning.code === "IMPORT_IS_UNDEFINED" &&
            message.includes("tslFn") &&
            message.includes("@pixiv/three-vrm")
          ) {
            return;
          }
          warn(warning);
        },
      },
    },
    server: {
      host: true,
      port: 3344,
      strictPort: true,
      proxy: {
        "/__hyades": {
          target: "https://hyades.gnostr.cloud",
          changeOrigin: true,
          secure: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/__hyades/, ""),
        },
        "/api/assets": {
          target: "https://hyades.gnostr.cloud",
          changeOrigin: true,
          secure: true,
        },
        ...(hyadesApiKey
          ? {
              "/api/tts": {
                target: hyadesBaseUrl,
                changeOrigin: true,
                rewrite: () => "/tts",
                headers: {
                  Authorization: `Bearer ${hyadesApiKey}`,
                },
              },
            }
          : {}),
      },
    },
    plugins: [
      react(),
      {
        name: "tellus-cesium-assets",
        configureServer(server) {
          server.middlewares.use((request, response, next) => {
            if (!request.url?.startsWith("/cesium/")) {
              next();
              return;
            }
            const relative = decodeURIComponent(request.url.replace(/^\/cesium\/?/, ""));
            const file = path.resolve(cesiumBuildPath(), relative);
            if (!file.startsWith(cesiumBuildPath()) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
              next();
              return;
            }
            response.setHeader("Content-Type", contentTypeFor(file));
            fs.createReadStream(file).pipe(response);
          });
        },
        closeBundle() {
          const source = cesiumBuildPath();
          const target = path.resolve(process.cwd(), "dist/cesium");
          if (!fs.existsSync(source)) return;
          fs.rmSync(target, { recursive: true, force: true });
          fs.cpSync(source, target, { recursive: true });
        },
      },
      {
        name: "tellus-api-dev",
        configureServer(server) {
          server.middlewares.use(async (request, response, next) => {
            if (!request.url?.startsWith("/api/generate-3d")) {
              next();
              return;
            }
            const body = await bodyFromRequest(request);
            const webRequest = new Request(
              `http://localhost${request.url}`,
              {
                method: request.method ?? "GET",
                headers: request.headers as HeadersInit,
                body:
                  request.method === "GET" || request.method === "HEAD"
                    ? undefined
                    : body,
              },
            );
            await sendWebResponse(response, await generate3DHandler(webRequest));
          });
          server.middlewares.use(async (request, response, next) => {
            if (!request.url?.startsWith("/api/gradio-file")) {
              next();
              return;
            }
            const webRequest = new Request(`http://localhost${request.url}`, {
              method: request.method,
              headers: request.headers as HeadersInit,
            });
            await sendWebResponse(response, await gradioFileHandler(webRequest));
          });
          server.middlewares.use(async (request, response, next) => {
            if (!request.url?.startsWith("/api/tellus-state")) {
              next();
              return;
            }
            const body = await bodyFromRequest(request);
            const webRequest = new Request(`http://localhost${request.url}`, {
              method: request.method ?? "GET",
              headers: request.headers as HeadersInit,
              body:
                request.method === "GET" || request.method === "HEAD"
                  ? undefined
                  : body,
            });
            await sendWebResponse(response, await tellusStateHandler(webRequest));
          });
          server.middlewares.use(async (request, response, next) => {
            if (!request.url?.startsWith("/generated-assets/")) {
              next();
              return;
            }
            const webRequest = new Request(`http://localhost${request.url}`, {
              method: request.method,
              headers: request.headers as HeadersInit,
            });
            await sendWebResponse(
              response,
              await generatedAssetsHandler(webRequest),
            );
          });
        },
      },
    ],
  };
});
