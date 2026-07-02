import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    // Concurrency test spins up two real overlapping transactions —
    // don't let vitest's default per-file isolation mask that.
    testTimeout: 15000,
  },
});
