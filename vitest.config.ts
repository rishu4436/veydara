import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: [...(process.env.VEYDARA_LIVE_TESTS ? [] : ["tests/live/**"]), ...(process.env.VEYDARA_FORK_TESTS ? [] : ["tests/fork/**"]), "tests/e2e/**"],
    environment: "node",
  },
});
