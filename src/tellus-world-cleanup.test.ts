import { describe, expect, it } from "vitest";
import {
  LEGACY_WORLD_CLEANUP_IDS,
  validatedLegacyWorldCleanupIds,
} from "./tellus-world-cleanup";
import { isProtectedWorldId } from "./tellus-world-options";

describe("legacy world cleanup", () => {
  it("keeps the approved cleanup list exact, unique, and Main-safe", () => {
    const ids = validatedLegacyWorldCleanupIds();

    expect(LEGACY_WORLD_CLEANUP_IDS).toHaveLength(50);
    expect(ids).toHaveLength(50);
    expect(ids.some(isProtectedWorldId)).toBe(false);
    expect(ids).toContain("interior-main-room_mqn0oe2");
    expect(ids).toContain("chunked-64-genesis");
    expect(ids).not.toContain("main");
    expect(ids).not.toContain("chunked-64-main");
  });
});
