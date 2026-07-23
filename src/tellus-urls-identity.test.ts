import { afterEach, describe, expect, it, vi } from "vitest";
import { runtimeConfig } from "./tellus-runtime-config";

describe("tellusWorldWebSocketUrl", () => {
  const originalBase = runtimeConfig.worldApiBase;
  const originalWorldId = runtimeConfig.worldId;

  afterEach(() => {
    runtimeConfig.worldApiBase = originalBase;
    runtimeConfig.worldId = originalWorldId;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("adds a one-time live ticket without replacing the soft compatibility identity", async () => {
    const values = new Map<string, string>([["tellus.userId", "account-soft-id"]]);
    vi.stubGlobal("window", {
      location: { href: "https://tellus.example/world", search: "" },
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    runtimeConfig.worldApiBase = "https://hyades.example";
    runtimeConfig.worldId = "main";
    const { tellusWorldWebSocketUrl } = await import("./tellus-urls-identity");

    const url = new URL(tellusWorldWebSocketUrl("visitor one", "ticket-_123"));

    expect(url.protocol).toBe("wss:");
    expect(url.pathname).toBe("/api/world/main/live");
    expect(url.searchParams.get("userId")).toBe("account-soft-id");
    expect(url.searchParams.get("visitorId")).toBe("visitor one");
    expect(url.searchParams.get("liveTicket")).toBe("ticket-_123");
  });
});
