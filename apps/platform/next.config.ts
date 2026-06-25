import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize: 150 * 1024 * 1024,
    serverActions: {
      bodySizeLimit: "150mb",
    },
  },
  // BlockNote and Mantine are ESM-only packages that must be transpiled
  // for Next.js to handle them in both server and client renders.
  transpilePackages: [
    "@blocknote/core",
    "@blocknote/react",
    "@blocknote/mantine",
    "@mantine/core",
    "@mantine/hooks",
  ],
};

export default nextConfig;
