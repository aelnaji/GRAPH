import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: [
    "preview-chat-1716f301-8c64-44e2-a294-4588f8b9b26e.space.z.ai",
    "*.space.z.ai",
  ],
};

export default nextConfig;
