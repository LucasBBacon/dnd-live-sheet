import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"],
      include: ["src/engine/core.ts", "src/engine/combat.ts", "src/engine/reducers.ts"],
    },
  },
});
