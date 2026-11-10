import type { NextConfig } from "next";
// Static policy without nonces: Next.js inline bootstrap scripts need
// 'unsafe-inline', and React needs eval only in development. Every request,
// including the dev server's websocket, stays on this origin.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");
const config: NextConfig = {
  // Synthetic UI tests can run beside the owner's normal development server.
  distDir:
    process.env.CONTROL_CENTER_TEST_DIST === "true"
      ? ".local/next-synthetic"
      : ".next",
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["pg"],
  // Local secrets/research/test data never belong in a standalone artifact.
  outputFileTracingExcludes: {
    "/*": [
      "./.env*",
      "./*AUDIT*.md",
      "./audit/**/*",
      "./private/**/*",
      "./.local/**/*",
      "./.data/**/*",
      "./*.log",
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          // Browsers ignore HSTS over plain HTTP, so local loopback use is
          // unaffected. No includeSubDomains: sibling hosts are not ours.
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
