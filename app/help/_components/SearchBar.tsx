// Plain GET form → /help/search?q=… . Works without client JS; results render
// server-side on the search page.
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
        className="min-w-0 flex-1 rounded-lg border border-[#e5e7ee] bg-white px-3.5 py-2.5 text-[14px] text-[#111318] placeholder-[#9098a8] outline-none transition-shadow focus:ring-2 focus:ring-[#2f6bff] focus:border-transparent"
      />
      <button
        type="submit"
        className="rounded-lg bg-[#2f6bff] px-4 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-[#255ae0]"
      >
        Search
      </button>
    </form>
  )
}
