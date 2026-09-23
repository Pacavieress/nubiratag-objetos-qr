import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["10.10.1.3", "10.10.*.*"],
  devIndicators: false,
};

export default nextConfig;
