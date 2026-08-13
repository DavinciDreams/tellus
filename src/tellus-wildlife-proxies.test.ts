import { describe, expect, it } from "vitest";
import { createWildlifeProxyGeometry } from "./tellus-wildlife-proxies";

describe("wildlife proxy geometry", () => {
  it("keeps a recognizable stag silhouette inside the single-draw proxy budget", () => {
    const geometry = createWildlifeProxyGeometry();
    const triangles = (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;
    expect(triangles).toBe(388);
    expect(triangles).toBeLessThanOrEqual(400);
    expect(geometry.boundingBox?.max.y).toBeGreaterThan(2.4);
    expect(geometry.boundingBox?.max.z).toBeGreaterThan(1.2);
    geometry.dispose();
  });
});
