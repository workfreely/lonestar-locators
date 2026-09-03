import Link from "next/link"
import { LIVE_ARTICLES, searchArticles, getCategory } from "@/lib/knowledge"
import SearchBar from "../_components/SearchBar"
import OpenAskBeast from "../_components/OpenAskBeast"

export const metadata = { title: "Search — Help Center" }

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams
  const query = q.trim()
  const results = query ? searchArticles(query, LIVE_ARTICLES) : []

  return (
    <div className="beast-container space-y-6 pb-20 pt-10 md:pt-12">
      <nav className="text-[12.5px] text-white/45">
        <Link href="/help" className="transition-colors hover:text-white">Help Center</Link>
        <span className="px-1.5">/</span>
        <span className="text-white/70">Search</span>
      </nav>

      <div className="max-w-xl">
        <SearchBar defaultValue={query} autoFocus />
      </div>

      {query === "" ? (
        <p className="text-[13.5px] text-white/50">Type a question above to search the Help Center.</p>
      ) : results.length === 0 ? (
        <div className="max-w-xl space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-8 text-center">
          <p className="text-[15px] font-semibold text-white">No results for “{query}”</p>
          <p className="text-[13px] text-white/55">
            Try different words, browse the topics on the Help Center home, or ask Beast AI.
          </p>
          <OpenAskBeast className="mx-auto rounded-full bg-[var(--beast-blue)] px-5 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-[var(--beast-blue-bright)]">
            Ask Beast AI
          </OpenAskBeast>
        </div>
      ) : (
        <>
          <p className="text-[12.5px] text-white/45">
            {results.length} result{results.length === 1 ? "" : "s"} for “{query}”
          </p>
          <ul className="grid gap-4 sm:grid-cols-2">
            {results.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/help/${a.categorySlug}/${a.slug}`}
                  className="group flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-[var(--beast-blue)]/50 hover:bg-white/[0.06]"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--beast-blue-bright)]">
                    {getCategory(a.categorySlug)?.title}
                  </p>
                  <p className="mt-1 text-[15.5px] font-semibold text-white">{a.title}</p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-white/55">{a.shortAnswer}</p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
