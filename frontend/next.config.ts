import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source      : "/api/backend-auth/:path*",
        destination : "http://localhost:8000/auth/:path*",
      },
      {
        source      : "/api/auth/:path*",
        destination : "/api/auth/:path*",
      },
      {
        source      : "/api/:path*",
        destination : "http://localhost:8000/:path*",
      },
    ];
  },
  turbopack: {
    root: path.join(__dirname, '..'),
  },
};

export default nextConfig;
