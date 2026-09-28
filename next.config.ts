import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["10.10.1.3", "10.10.*.*"],
  devIndicators: false,
  async headers() {
    return [
      {
        // Sin esto, un navegador (o un proxy delante de Next) puede
        // quedarse con una versión vieja de sw.js y nunca aplicar el
        // service worker nuevo hasta que alguien limpie caché a mano.
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
