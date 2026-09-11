import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingExcludes: {
    "/*": ["./.venv/**/*", "./venv/**/*"],
    "/api/*": ["./.venv/**/*", "./venv/**/*"],
  },
};

export default nextConfig;
