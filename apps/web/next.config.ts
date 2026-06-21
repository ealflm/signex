import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Emit a self-contained production server at .next/standalone (see Dockerfile).
  output: "standalone",
  // Monorepo: trace files from the repo root so the standalone bundle spans the workspace.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // Required for `'use cache'` + `cacheTag('release')` in app/lib/content.ts (Next 16.2).
  cacheComponents: true,
  // Keep @prisma/client + the generated @signex/db client OUT of the bundler so the
  // native query engine (linux-musl-openssl-3.0.x binaryTarget) is required() at runtime
  // and traced into standalone rather than mangled by the build.
  serverExternalPackages: ["@prisma/client", "@signex/db"],
};

export default nextConfig;
