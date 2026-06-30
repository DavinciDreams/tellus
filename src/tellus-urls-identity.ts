import { runtimeConfig, worldApiUrl } from "./tellus-runtime-config";
import { browserUuid } from "./tellus-utils";
import { sessionAccountId } from "./tellus-auth";

let pageVisitorId: string | undefined;
let stableUserId: string | undefined;

export function tellusWorldHttpUrl(route: "state" | "action"): string {
  // Carry the stable (anonymous) user id so private worlds bind to / gate on the visitor. The WS URL
  // inherits it because tellusWorldWebSocketUrl is derived from the "state" URL.
  return worldApiUrl(`/api/world/${encodeURIComponent(runtimeConfig.worldId)}/${route}?userId=${encodeURIComponent(tellusUserId())}`);
}

export function tellusWorldChunkUrl(cx: number, cz: number): string {
  return worldApiUrl(`/api/world/${encodeURIComponent(runtimeConfig.worldId)}/chunk/${cx}/${cz}?userId=${encodeURIComponent(tellusUserId())}`);
}

export function tellusWorldChunksManifestUrl(cx: number, cz: number, radius: number): string {
  return worldApiUrl(`/api/world/${encodeURIComponent(runtimeConfig.worldId)}/chunks?cx=${cx}&cz=${cz}&radius=${radius}&userId=${encodeURIComponent(tellusUserId())}`);
}

export function tellusAgentUrl(action: "start" | "stop" | "persona" | "status" | "transcript" | "say" | "view" | "memories" | "reset-thread"): string {
  // Per-user embodied-agent control endpoints; carry the stable user id (missing => 401 from the backend).
  return worldApiUrl(`/api/world/${encodeURIComponent(runtimeConfig.worldId)}/agent/${action}?userId=${encodeURIComponent(tellusUserId())}`);
}

export function tellusAssetLibraryUrl(path: string): string {
  return worldApiUrl(path);
}

const RAW_ASSET_STORE_HOSTS = new Set(["3d.flobots.xyz"]);

export function assetStoreIdFromModelUrl(url: string): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    const base =
      typeof window !== "undefined" && window.location?.href
        ? window.location.href
        : "https://tellus.local";
    parsed = new URL(url, base);
  } catch {
    return null;
  }
  const pathname = parsed.pathname.replace(/^\/__hyades(?=\/api\/)/i, "");
  const match =
    /^\/api\/(?:view|download|model)\/([^/?#/]+)/i.exec(pathname) ??
    /^\/api\/assets\/(?:model|download)\/([^/?#/]+)/i.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

export function assetStoreGameOptimizedModelUrl(assetId: string): string {
  return `/api/assets/model/${encodeURIComponent(assetId)}/game-optimized`;
}

export function assetStoreLodModelUrl(assetId: string, level: 0 | 1 | 2): string {
  return `/api/assets/model/${encodeURIComponent(assetId)}/lod/${level}`;
}

export function assetStoreImpostorModelUrl(assetId: string): string {
  return `/api/assets/model/${encodeURIComponent(assetId)}/impostor`;
}

export function assetStoreOptimizedAssetUrls(assetId: string): {
  gameOptimized: string;
  lod0: string;
  lod1: string;
  lod2: string;
  impostor: string;
} {
  return {
    gameOptimized: assetStoreGameOptimizedModelUrl(assetId),
    lod0: assetStoreLodModelUrl(assetId, 0),
    lod1: assetStoreLodModelUrl(assetId, 1),
    lod2: assetStoreLodModelUrl(assetId, 2),
    impostor: assetStoreImpostorModelUrl(assetId),
  };
}

function isAssetProxyPath(pathname: string): boolean {
  return /^\/(?:__hyades\/)?api\/assets\//i.test(pathname);
}

// A generated model can arrive as a RAW asset-store URL (e.g. https://3d.flobots.xyz/api/view/{id})
// straight from the Hyades 3D backend — both the player path (api/generate-3d) and agent/remote things
// synced through the world backend carry it. The asset store sends NO `Access-Control-Allow-Origin`
// header, so a cross-origin GLTFLoader fetch from the Tellus origin is blocked and the model silently
// never renders — the "generated fine but didn't load until I re-added it from the asset library" bug
// (the library path already loads through the same-origin /api/assets proxy, which is why it works).
// Route any raw or stored /api/assets model URL through the configured world API proxy:
// CORS-safe + game-optimized with original-GLB fallback. Non-store URLs (procedural://,
// data:, blob:, /generated-assets, and other local assets) pass through unchanged.
export function proxiedGeneratedModelUrl(url: string): string {
  if (!url) return url;
  if (/^\/__hyades\/api\/assets\//i.test(url)) return url;
  if (/^\/api\/assets\//i.test(url)) return worldApiUrl(url);
  if (!/^https?:\/\//i.test(url)) return url;
  if (url.includes("/api/assets/")) {
    try {
      const parsedAssetUrl = new URL(url);
      if (isAssetProxyPath(parsedAssetUrl.pathname)) {
        return worldApiUrl(parsedAssetUrl.pathname.replace(/^\/__hyades(?=\/api\/)/i, ""));
      }
    } catch {
      return url;
    }
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const worldApiHost = (() => {
    try {
      return runtimeConfig.worldApiBase ? new URL(runtimeConfig.worldApiBase).hostname.toLowerCase() : "";
    } catch {
      return "";
    }
  })();
  const parsedHost = parsed.hostname.toLowerCase();
  const isKnownAssetHost =
    RAW_ASSET_STORE_HOSTS.has(parsedHost) ||
    (worldApiHost.length > 0 && parsedHost === worldApiHost);
  if (!isKnownAssetHost) return url;
  const assetId = assetStoreIdFromModelUrl(parsed.toString());
  if (!assetId) return url; // not an asset-store model URL
  return worldApiUrl(assetStoreGameOptimizedModelUrl(assetId));
}

export function tellusWorldWebSocketUrl(visitorId: string): string {
  const httpUrl = new URL(tellusWorldHttpUrl("state"), window.location.href);
  httpUrl.pathname = httpUrl.pathname.replace(/\/state\/?$/, "/live");
  httpUrl.searchParams.set("visitorId", visitorId);
  httpUrl.protocol = httpUrl.protocol === "https:" ? "wss:" : "ws:";
  return httpUrl.toString();
}

export function tellusVisitorId(): string {
  if (!pageVisitorId) {
    // Honor a host-pinned identity (window.__hyadesIdentity or a ?visitorId= query param) before falling
    // back to a fresh random id — lets an embodied external agent join as a stable, distinct visitor.
    const injected =
      window.__hyadesIdentity?.visitorId ??
      new URLSearchParams(window.location.search).get("visitorId") ??
      undefined;
    pageVisitorId = injected && injected.trim() ? injected.trim() : browserUuid();
  }
  return pageVisitorId;
}

export function tellusUserId(): string {
  // Logged in => the account IS the identity (worlds/agents bind to it). The anonymous uuid below
  // stays untouched in localStorage ("tellus.userId") so it can be CLAIMED onto the account later.
  const accountId = sessionAccountId();
  if (accountId) return accountId;
  if (stableUserId) return stableUserId;
  const storageKey = "tellus.userId";
  const existing = window.localStorage.getItem(storageKey);
  if (existing) {
    stableUserId = existing;
    return stableUserId;
  }
  stableUserId = browserUuid();
  window.localStorage.setItem(storageKey, stableUserId);
  return stableUserId;
}

export function speakTellusText(text: string): void {
  if (!("speechSynthesis" in window)) return;
  const trimmed = text.trim();
  if (!trimmed) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(trimmed);
  utterance.rate = 0.96;
  utterance.pitch = 1.04;
  window.speechSynthesis.speak(utterance);
}

export function toAssetId(prompt: string, prefix: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
  return `tellus-${prefix}-${slug || "creation"}-${Date.now().toString(36)}`;
}

export function absoluteAssetForgeUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${runtimeConfig.assetForgeApiBase}${path.startsWith("/") ? path : `/${path}`}`;
}

export function tellusApiUrl(path: string): string {
  return `${runtimeConfig.apiBase}${path.startsWith("/") ? path : `/${path}`}`;
}

export function absoluteTellusApiUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return tellusApiUrl(path);
}
