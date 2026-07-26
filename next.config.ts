import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.BUILD_VERIFY_DIST_DIR ? { distDir: process.env.BUILD_VERIFY_DIST_DIR } : {}),
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
};

export default nextConfig;
