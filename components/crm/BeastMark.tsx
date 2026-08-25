import Image from "next/image"

// Temporary brand mark — the Beast head, standing in for the old blue square +
// chevron while the full logo system is still being decided. Two source files,
// picked by the surface the mark sits on rather than by the active theme: every
// CRM theme is dark, so `dark` covers all five, and `light` is only the white
// Business Settings / Smart Lead Form shell.
//
// Both files are the favicon artwork reused as-is, and the two no longer share
// proportions, so `size` does NOT mean the same thing for both tones:
//
//   dark  — the official Beast-in-pin mark, trimmed and centred, ink filling
//           ~80% x 98% of its canvas. `size` is very close to the visible
//           height.
//   light — still the older bare-head artwork, ink ~70% x 58% of its canvas,
//           so its box has to be much larger than the mark it draws: at 48px
//           the visible lion is only ~34x28px.
//
// That asymmetry is deliberate and temporary: the black mark is out of scope
// for the icon checkpoint that introduced the pin. Callers pick `size` for the
// tone they actually render — see AiVoiceScriptModal, the one dark caller.
const SRC = {
  dark: "/locator-beast/locator-beast-favicon-white.png",
  light: "/locator-beast/locator-beast-favicon-black.png",
} as const

export default function BeastMark({
  tone = "dark",
  size = 48,
  className = "",
}: {
  /** The surface behind the mark, NOT the mark's own color. */
  tone?: "dark" | "light"
  size?: number
  className?: string
}) {
  return (
    <Image
      src={SRC[tone]}
      alt=""
      aria-hidden
      width={size}
      height={size}
      priority
      // The source is square and the artwork is centered in it, so a square box
      // plus object-contain keeps the lion's proportions at every size.
      className={`flex-none object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  )
}
