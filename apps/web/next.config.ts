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
  // CSP frame-ancestors — scoped to the editor preview tree ONLY (/preview/:path*) so the
  // admin (:3061 in dev; PREVIEW_FRAME_ANCESTORS in prod) can iframe the live working-state
  // preview. Public routes (/[lang]/**) are NOT matched here and keep their default framing
  // policy (no header → same as before). The preview pages are already token-gated; this header
  // is the second layer (a leaked URL still can't be framed by an arbitrary origin).
  async headers() {
    const adminOrigin = process.env.PREVIEW_FRAME_ANCESTORS ?? "http://localhost:3061";
    return [
      {
        source: "/preview/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors 'self' ${adminOrigin};`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
