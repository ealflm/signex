import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Emit a self-contained production server at .next/standalone (server.js + only the traced
  // node_modules) for a small Docker image. Static assets (.next/static) and public/ are NOT
  // included by standalone — the Dockerfile copies them in. No effect on `next dev`.
  output: "standalone",
  // Monorepo: trace files from the repo root so the standalone bundle spans the whole workspace
  // (hoisted root node_modules + this app). With this set, the standalone server is emitted at
  // .next/standalone/apps/web/server.js with node_modules hoisted to the standalone root.
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default nextConfig;
