import generate3DHandler from "./api/generate-3d";
import generatedAssetsHandler from "./api/generated-assets";
import gradioFileHandler from "./api/gradio-file";
import tellusStateHandler from "./api/tellus-state";

const distRoot = new URL("./dist/", import.meta.url);

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
};

function extension(pathname: string): string {
  const match = /\.[a-z0-9]+$/i.exec(pathname);
  return match?.[0].toLowerCase() ?? "";
}

function safeDistUrl(pathname: string): URL {
  const decoded = decodeURIComponent(pathname);
  const cleanPath = decoded
    .replace(/^\/+/, "")
    .split("/")
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/");
  return new URL(cleanPath || "index.html", distRoot);
}

async function serveStatic(pathname: string): Promise<Response> {
  const fileUrl = safeDistUrl(pathname);
  let file = Bun.file(fileUrl);
  let servedPathname = pathname === "/" ? "/index.html" : pathname;
  if (!(await file.exists())) {
    file = Bun.file(new URL("index.html", distRoot));
    servedPathname = "/index.html";
  }
  return new Response(file, {
    headers: {
      "Cache-Control": servedPathname.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : "no-cache",
      "Content-Type":
        contentTypes[extension(servedPathname)] ?? "application/octet-stream",
    },
  });
}

const port = Number(process.env.PORT ?? 3000);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (url.pathname === "/health") {
      return withCors(Response.json({ ok: true, service: "tellus" }));
    }
    // WebAuthn Related Origin Requests (L3): the game is served on multiple hostnames
    // (tellus.gnostr.cloud = the passkey RP ID, tellus.garden, …) but passkeys bind to ONE RP ID.
    // Browsers asked to use RP ID X from origin Y fetch https://X/.well-known/webauthn and accept Y
    // iff listed here (content-type MUST be application/json). Keep in sync with the hyades silo's
    // Tellus__WebAuthnOrigins (the server-side origin allow-list).
    if (url.pathname === "/.well-known/webauthn") {
      const origins = (process.env.TELLUS_WEBAUTHN_ORIGINS ??
        "https://tellus.gnostr.cloud,https://tellus.garden,http://localhost:3344,http://127.0.0.1:3344,http://localhost:4344,http://127.0.0.1:4344")
        .split(",").map((o) => o.trim()).filter(Boolean);
      return withCors(Response.json({ origins }));
    }
    if (url.pathname.startsWith("/api/generate-3d")) {
      return withCors(await generate3DHandler(request));
    }
    if (url.pathname.startsWith("/api/gradio-file")) {
      return withCors(await gradioFileHandler(request));
    }
    if (url.pathname.startsWith("/api/tellus-state")) {
      return withCors(await tellusStateHandler(request));
    }
    if (url.pathname.startsWith("/generated-assets/")) {
      return withCors(await generatedAssetsHandler(request));
    }
    if (url.pathname.startsWith("/api/")) {
      return withCors(
        Response.json(
          { error: "Tellus API route not found", path: url.pathname },
          { status: 404 },
        ),
      );
    }
    return withCors(await serveStatic(url.pathname));
  },
});

console.log(`Tellus listening on :${port}`);
