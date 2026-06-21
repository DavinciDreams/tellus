import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import generate3DHandler from "./api/generate-3d";
import generatedAssetsHandler from "./api/generated-assets";
import gradioFileHandler from "./api/gradio-file";
import tellusStateHandler from "./api/tellus-state";

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
      rollupOptions: {
        input: {
          main: "index.html",
          agentView: "agent-view.html",
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
