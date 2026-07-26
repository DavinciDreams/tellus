import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      reportsDirectory: "coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/vendor/**"],
      thresholds: {
        statements: 26,
        branches: 23,
        functions: 22,
        lines: 27,
      },
    },
  },
});
