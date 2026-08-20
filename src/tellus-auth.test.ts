import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canUseTellusMcp,
  hasTellusMcpAccess,
  shouldAttachSessionHeader,
} from "./tellus-auth";
import { runtimeConfig } from "./tellus-runtime-config";

describe("Tellus auth fetch header routing", () => {
  const originalWorldApiBase = runtimeConfig.worldApiBase;
  const originalApiBase = runtimeConfig.apiBase;

  afterEach(() => {
    runtimeConfig.worldApiBase = originalWorldApiBase;
    runtimeConfig.apiBase = originalApiBase;
    vi.unstubAllGlobals();
  });

  it("keeps public world reads header-free so they do not trigger CORS preflight", () => {
    runtimeConfig.worldApiBase = "https://hyades.gnostr.cloud";
    vi.stubGlobal("window", {
      location: {
        href: "https://tellus.garden/",
        origin: "https://tellus.garden",
      },
    });

    expect(
      shouldAttachSessionHeader(
        "https://hyades.gnostr.cloud/api/world/chunked-64-zzz/state?userId=abc",
      ),
    ).toBe(false);
    expect(
      shouldAttachSessionHeader(
        "https://hyades.gnostr.cloud/api/world/chunked-64-zzz/chunks?cx=0&cz=0&radius=2&userId=abc",
      ),
    ).toBe(false);
    expect(
      shouldAttachSessionHeader(
        "https://hyades.gnostr.cloud/api/world/chunked-64-zzz/chunk/0/0?userId=abc",
      ),
    ).toBe(false);
    expect(
      shouldAttachSessionHeader(
        "https://hyades.gnostr.cloud/api/world/chunked-64-zzz/preview/live?userId=abc",
        "HEAD",
      ),
    ).toBe(false);
  });

  it("keeps sessions on Hyades mutations and account-scoped endpoints", () => {
    runtimeConfig.worldApiBase = "https://hyades.gnostr.cloud";
    vi.stubGlobal("window", {
      location: {
        href: "https://tellus.garden/",
        origin: "https://tellus.garden",
      },
    });

    expect(
      shouldAttachSessionHeader(
        "https://hyades.gnostr.cloud/api/world/chunked-64-zzz/action?userId=abc",
        "POST",
      ),
    ).toBe(true);
    expect(
      shouldAttachSessionHeader(
        "https://hyades.gnostr.cloud/api/world/chunked-64-zzz/agent/status?userId=abc",
      ),
    ).toBe(true);
    expect(
      shouldAttachSessionHeader(
        "https://hyades.gnostr.cloud/api/tellus/worlds/chunked-64-zzz?userId=abc",
        "PATCH",
      ),
    ).toBe(true);
  });

  it("leaves asset proxy and non-Hyades URLs header-free", () => {
    runtimeConfig.worldApiBase = "https://hyades.gnostr.cloud";
    vi.stubGlobal("window", {
      location: {
        href: "https://tellus.garden/",
        origin: "https://tellus.garden",
      },
    });

    expect(
      shouldAttachSessionHeader("https://hyades.gnostr.cloud/api/assets/model/asset-1"),
    ).toBe(false);
    expect(shouldAttachSessionHeader("https://example.com/api/world/main/state")).toBe(false);
  });
});

describe("Tellus MCP entitlement", () => {
  it("allows active accounts to bring their own agents", () => {
    expect(canUseTellusMcp({ status: "active" })).toBe(true);
    expect(canUseTellusMcp({ status: "ACTIVE" })).toBe(true);
  });

  it("denies pending, banned, and unverified cached account state", () => {
    expect(canUseTellusMcp({ status: "pending" })).toBe(false);
    expect(canUseTellusMcp({ status: "banned" })).toBe(false);
    expect(canUseTellusMcp({})).toBe(false);
  });

  it("lets a server denial narrow access but never lets stale status widen it", () => {
    expect(
      hasTellusMcpAccess(
        { status: "active" },
        { canUseMcp: false },
      ),
    ).toBe(false);
    expect(
      hasTellusMcpAccess(
        { status: "pending" },
        { canUseMcp: true },
      ),
    ).toBe(false);
  });
});
