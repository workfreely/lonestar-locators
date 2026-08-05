import { LogoMark } from "@/components/Logo";

/**
 * The collapsed, docked tab that sits fixed against the right edge of the
 * viewport (~22% down). It shows only the Beast mark, is dark to match Locator
 * Beast, has rounded corners on its left side, and glows blue on hover. Clicking
 * it expands the panel.
 *
 * This is deliberately NOT a lower-right floating bubble — it reads as a docked
 * drawer handle, like the Apollo tab in the reference.
 */
export function CollapsedTab({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      className="bc-tab"
      onClick={onOpen}
      aria-label="Open Beast Companion"
      title="Open Beast Companion"
    >
      <LogoMark size={30} radius={8} />
    </button>
  );
}
