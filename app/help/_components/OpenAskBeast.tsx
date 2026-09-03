"use client"

// Opens the floating Ask Beast AI panel by dispatching an event the widget
// listens for. Used by the Help Center's "Ask Beast AI" entry points.
export default function OpenAskBeast({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("lb:open-beast-ai"))}
      className={className}
    >
      {children}
    </button>
  )
}
