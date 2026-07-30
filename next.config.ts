import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Product forms can submit several real photos at once; the
      // framework default (1mb) is too small for that.
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
