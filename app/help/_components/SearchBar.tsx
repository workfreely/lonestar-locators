// Plain GET form → /help/search?q=… . Works without client JS; results render
// server-side on the search page. Dark treatment to match the Locator Beast /
// Beast Academy surface it now lives on.
export default function SearchBar({ defaultValue = "", autoFocus = false }: { defaultValue?: string; autoFocus?: boolean }) {
  return (
    <form action="/help/search" method="get" className="flex w-full items-center gap-2">
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        autoFocus={autoFocus}
        placeholder="What do you need help with?"
        aria-label="Search the Help Center"
        className="min-w-0 flex-1 rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-[15px] text-white placeholder-white/40 outline-none transition-colors focus:border-[var(--beast-blue)] focus:bg-white/[0.06]"
      />
      <button
        type="submit"
        className="flex-none rounded-xl bg-[var(--beast-blue)] px-5 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-[var(--beast-blue-bright)]"
      >
        Search
      </button>
    </form>
  )
}
