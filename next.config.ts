import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.BUILD_VERIFY_DIST_DIR ? { distDir: process.env.BUILD_VERIFY_DIST_DIR } : {}),
  // ffmpeg-static ships a native binary — keep it external (don't bundle its JS) and TRACE the
  // binary + the overlay font into the render function so they exist at runtime on Vercel.
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/admin/social-autopilot/posts/[id]/render": [
      "./node_modules/ffmpeg-static/ffmpeg",
      "./assets/social/fonts/Overlay-Bold.ttf",
    ],
  },
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
