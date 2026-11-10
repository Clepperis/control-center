import type { NextConfig } from "next";
const config: NextConfig = {
  // Synthetic UI tests can run beside the owner's normal development server.
  distDir:
    process.env.CONTROL_CENTER_TEST_DIST === "true"
      ? ".local/next-synthetic"
      : ".next",
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["pg", "better-auth", "@node-rs/argon2"],
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
