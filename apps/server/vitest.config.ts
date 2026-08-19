import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    exclude: ["dist/**", "node_modules/**"],
    // These suites build a real Express app through dynamic imports, so the
    // first test in a file pays the whole cold-transform cost before its own
    // assertions run. The default 5s sat right on that boundary and the route
    // tests failed intermittently; the work is import latency, not the tests.
    testTimeout: 20000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "dist/"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
