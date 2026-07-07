import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  outputFileTracingExcludes: {
    "*": [
      "**/node_modules/sharp/**",
      "**/.cache/**",
      "**/*.map"
    ]
  }
};

export default nextConfig;
