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
    <div className="space-y-6">
      <nav className="text-[12.5px] text-[#6b7280]">
        <Link href="/help" className="hover:text-[#111318]">Help Center</Link>
        <span className="px-1.5">/</span>
        <span className="text-[#4b5162]">Search</span>
      </nav>

      <SearchBar defaultValue={query} autoFocus />

      {query === "" ? (
        <p className="text-[13px] text-[#6b7280]">Type a question above to search the Help Center.</p>
      ) : results.length === 0 ? (
        <div className="space-y-3 rounded-xl border border-[#e5e7ee] bg-white px-4 py-6 text-center">
          <p className="text-[14px] font-semibold text-[#111318]">No results for “{query}”</p>
          <p className="text-[12.5px] text-[#6b7280]">Try different words, browse the topics on the Help Center home, or ask Beast AI.</p>
          <OpenAskBeast className="mx-auto rounded-lg bg-[#2f6bff] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#255ae0]">
            Ask Beast AI
          </OpenAskBeast>
        </div>
      ) : (
        <>
          <p className="text-[12.5px] text-[#6b7280]">{results.length} result{results.length === 1 ? "" : "s"} for “{query}”</p>
          <ul className="divide-y divide-[#eceef3] rounded-xl border border-[#e5e7ee] bg-white">
            {results.map((a) => (
              <li key={a.id}>
                <Link href={`/help/${a.categorySlug}/${a.slug}`} className="block px-4 py-4 transition-colors hover:bg-[#f4f5f8]">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9098a8]">{getCategory(a.categorySlug)?.title}</p>
                  <p className="mt-0.5 text-[14.5px] font-semibold text-[#111318]">{a.title}</p>
                  <p className="mt-1 text-[12.5px] text-[#6b7280]">{a.shortAnswer}</p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
