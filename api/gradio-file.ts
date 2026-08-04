const ALLOWED_GRADIO_HOSTS = new Set([
  "localhost:43839",
  "127.0.0.1:43839",
  "192.168.1.177:43839",
]);

function allowedGradioHosts(): Set<string> {
  const hosts = new Set(ALLOWED_GRADIO_HOSTS);
  const configuredBaseUrl = process.env.INSTANTMESH_GRADIO_BASE_URL?.trim();
  const configuredBaseUrls = [
    configuredBaseUrl,
    ...(process.env.INSTANTMESH_GRADIO_BASE_URLS?.split(",") ?? []),
  ].filter((value): value is string => Boolean(value?.trim()));
  for (const configuredBase of configuredBaseUrls) {
    const configured = new URL(configuredBase.trim());
    hosts.add(configured.host);

    const port = configured.port || (configured.protocol === "https:" ? "443" : "80");
    const publicHost = process.env.TELLUS_PUBLIC_HOST?.trim();
    if (publicHost) hosts.add(`${publicHost}:${port}`);

    const publicBaseUrl = process.env.TELLUS_PUBLIC_BASE_URL?.trim();
    if (publicBaseUrl) hosts.add(`${new URL(publicBaseUrl).hostname}:${port}`);
  }
  return hosts;
}

export async function gradioFileHandler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const rawUrl = url.searchParams.get("url");
  if (!rawUrl) {
    return new Response("Missing url", { status: 400 });
  }

  const target = new URL(rawUrl);
  if (!allowedGradioHosts().has(target.host)) {
    return new Response("Blocked Gradio file host", { status: 403 });
  }

  // Disable redirect-following: an allow-listed host must not be able to bounce the request to an
  // internal URL (redirect-based SSRF). Treat any 3xx as an error.
  const upstream = await fetch(target, { redirect: "manual" });
  if (upstream.status >= 300 && upstream.status < 400) {
    return new Response("Blocked redirect from Gradio host", { status: 502 });
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "model/gltf-binary",
      "Cache-Control": "no-store",
    },
  });
}

export default gradioFileHandler;
