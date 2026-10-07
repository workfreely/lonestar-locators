# Social Beast premium render worker.
#
# WHY A CONTAINER AT ALL: the Vercel Fluid probe proved the pipeline runs, then failed 3 of 4
# consecutive renders because /tmp reached ~794MB — the 210MB Chromium extraction plus per-render
# residue accumulating across REUSED Fluid containers. Nothing here extracts a browser at runtime
# and nothing shares /tmp with a previous job.
FROM mcr.microsoft.com/playwright:v1.63.0-noble

# Chromium arrives WITH the base image, installed normally. FFmpeg from the distro, also normal.
# No brotli unpacking, no cold-start extraction, no /tmp budget spent on the browser itself.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# The bundled overlay face. It MUST be this exact file — the same bytes the browser preview loads —
# or preview and render diverge. The worker asserts this at startup (see fontGuard).
COPY assets/social/fonts/LibreBaskerville-Head.ttf /app/assets/social/fonts/LibreBaskerville-Head.ttf

COPY worker/package.json worker/package-lock.json* /app/
RUN npm install --omit=dev

COPY worker/src /app/src
COPY lib/social /app/lib/social

ENV NODE_ENV=production \
    RENDER_WORK_ROOT=/var/render \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# Per-render scratch lives on the task's own writable layer / mounted volume, NOT /tmp. Sized by the
# ECS task definition rather than by a platform default we cannot raise.
RUN mkdir -p /var/render

# One render at a time until reliability is proven, per the rollout plan.
ENV RENDER_CONCURRENCY=1

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node /app/src/health.mjs || exit 1
CMD ["node", "/app/src/index.mjs"]
