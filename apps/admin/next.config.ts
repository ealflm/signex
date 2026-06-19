import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Emit a self-contained production server at .next/standalone for a small Docker image.
  output: "standalone",
  // Trace files from the monorepo root so hoisted workspace node_modules are included.
  // apps/admin -> repo root is two levels up.
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default nextConfig;
