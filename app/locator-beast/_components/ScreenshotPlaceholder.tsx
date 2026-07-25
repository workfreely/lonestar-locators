import Image from "next/image";
import { HiOutlinePhoto } from "react-icons/hi2";

/**
 * Product screenshot frame. Pass `src` once a real screenshot exists — the
 * window-chrome frame, aspect ratio, and surrounding layout stay identical,
 * so dropping in real product images later requires no layout changes.
 */
export default function ScreenshotPlaceholder({
  label,
  src,
  alt,
}: {
  label: string;
  src?: string;
  alt?: string;
}) {
  return (
    <div className="w-full overflow-hidden rounded-[20px] border border-[var(--beast-border)] bg-gradient-to-br from-[#f2f4f8] to-[#e7eaf1] shadow-[0_30px_80px_-30px_rgba(15,23,42,0.25)]">
      <div className="flex items-center gap-1.5 border-b border-[var(--beast-border)] bg-white/70 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
      </div>

      <div className="relative aspect-[16/10]">
        {src ? (
          <Image src={src} alt={alt ?? label} fill className="object-cover" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_30%_20%,rgba(47,107,255,0.12),transparent_60%)]">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--beast-blue)]/10">
              <HiOutlinePhoto className="h-7 w-7 text-[var(--beast-blue)]" />
            </div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.25em] text-[var(--beast-ink-soft)]">
              {label}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
