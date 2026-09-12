import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    instantInsights: {
      validationLevel: "warning",
    },
  },
  outputFileTracingExcludes: {
    "/*": ["./.venv/**/*", "./venv/**/*"],
    "/api/*": ["./.venv/**/*", "./venv/**/*"],
  },
};

export default nextConfig;
