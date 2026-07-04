import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Prod serves the admin under /admin (set NEXT_PUBLIC_BASE_PATH at build time); dev leaves it
  // unset → root. Empty string coerces to undefined so Next omits basePath entirely in dev.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  // Emit a self-contained production server at .next/standalone for a small Docker image.
  output: "standalone",
  // Trace files from the monorepo root so hoisted workspace node_modules are included.
  // apps/admin -> repo root is two levels up.
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default nextConfig;
