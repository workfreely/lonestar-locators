import type { NextConfig } from "next";

// Security Beast — Checkpoint 1: baseline HTTP security headers (Report-Only CSP
// intentionally deferred; see the checkpoint notes). These are all independent,
// behavior-neutral response headers applied to every route:
//
//  - Strict-Transport-Security: force HTTPS for a year. includeSubDomains is safe
//    here because the whole app is Vercel-served over HTTPS. `preload` is OMITTED
//    on purpose — it is an irreversible commitment to the browser preload list.
//  - X-Content-Type-Options: nosniff — stop MIME sniffing.
//  - X-Frame-Options: SAMEORIGIN — the app is never embedded cross-origin; it only
//    EMBEDS others (Maps/YouTube iframes), which this does not affect.
//  - Referrer-Policy: strict-origin-when-cross-origin — already the modern default;
//    made explicit.
//  - Permissions-Policy: CONSERVATIVE. Only disables capabilities verified unused
//    and not delegated to any embedded iframe. camera=() (no getUserMedia video
//    anywhere), browsing-topics=() (Topics API unused; privacy). Deliberately does
//    NOT restrict microphone (Vapi voice runs in-page), clipboard, autoplay,
//    encrypted-media, gyroscope, accelerometer or picture-in-picture — the last six
//    are delegated to the YouTube embeds via their iframe `allow` attribute, and a
//    top-level policy would override and break them.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  ...(process.env.BUILD_VERIFY_DIST_DIR ? { distDir: process.env.BUILD_VERIFY_DIST_DIR } : {}),
  // ffmpeg-static ships a native binary — keep it external (don't bundle its JS) and TRACE the
  // binary + the overlay font into the render function so they exist at runtime on Vercel.
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/admin/social-autopilot/posts/[id]/render": [
      "./node_modules/ffmpeg-static/ffmpeg",
      // The overlay face the render route loads at runtime via path.join(process.cwd(), …), which
      // Next cannot detect statically. It previously named Overlay-Bold.ttf (long deleted) and then
      // a second Bodoni file; there is now exactly ONE overlay font, so exactly one entry.
      "./assets/social/fonts/LibreBaskerville-Head.ttf",
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
