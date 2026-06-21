import { defineConfig } from "vitest/config";
import { config } from "dotenv";

config({ path: ".env" });

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.spec.ts"],
    pool: "forks",
    singleFork: true,
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
