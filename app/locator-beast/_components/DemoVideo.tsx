/**
 * Placeholder for the product demo. When the real video is ready, swap the
 * inner placeholder block below for a <video> or <iframe> (YouTube/Vimeo) —
 * the aspect-ratio frame, rounding, border, and shadow around it stay as-is.
 */
export default function DemoVideo() {
  return (
    <div className="w-full max-w-4xl">
      <div className="relative aspect-video overflow-hidden rounded-[20px] border border-white/10 bg-gradient-to-br from-[#10141f] to-[#05070d] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.65)]">
        {/* --- placeholder content: replace with <video>/<iframe> --- */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5">
          <button
            type="button"
            aria-label="Play product demo"
            className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20 backdrop-blur-sm transition-transform duration-300 hover:scale-110 hover:bg-white/15 sm:h-20 sm:w-20"
          >
            <svg viewBox="0 0 24 24" className="ml-1 h-6 w-6 fill-white sm:h-7 sm:w-7">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
          <p className="text-[12px] font-semibold uppercase tracking-[0.3em] text-white/60 sm:text-[13px]">
            Product Demo
          </p>
        </div>
        {/* --- end placeholder content --- */}

        <div className="pointer-events-none absolute inset-0 rounded-[20px] ring-1 ring-inset ring-white/5" />
      </div>

      <p className="mt-4 text-center text-[13px] text-[var(--beast-ink-inverse-soft)]">
        See Locator Beast in action
      </p>
    </div>
  );
}
