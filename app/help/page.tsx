import Link from "next/link"
import { categoriesWithStatus } from "@/lib/knowledge"
import SearchBar from "./_components/SearchBar"
import OpenAskBeast from "./_components/OpenAskBeast"

export const metadata = { title: "Locator Beast Help Center" }

export default function HelpHome() {
  const categories = categoriesWithStatus()

  return (
    <div className="space-y-8">
      {/* Header */}
      <section id="search" className="space-y-3">
        <h1 className="text-[26px] font-black tracking-tight text-[#111318]">Locator Beast Help Center</h1>
        <p className="text-[14px] text-[#4b5162]">Search for answers, browse how-to guides, or ask Beast AI.</p>
        <SearchBar autoFocus />
      </section>

      {/* Primary options */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <a href="#search" className="rounded-xl border border-[#e5e7ee] bg-white px-4 py-4 transition-colors hover:bg-[#f4f5f8]">
          <p className="text-[14px] font-semibold text-[#111318]">Search Help</p>
          <p className="mt-1 text-[12.5px] text-[#6b7280]">Type a question and get a direct answer.</p>
        </a>
        <a href="#categories" className="rounded-xl border border-[#e5e7ee] bg-white px-4 py-4 transition-colors hover:bg-[#f4f5f8]">
          <p className="text-[14px] font-semibold text-[#111318]">Browse Guides</p>
          <p className="mt-1 text-[12.5px] text-[#6b7280]">Explore how-to guides by topic.</p>
        </a>
        <OpenAskBeast className="rounded-xl border border-[#e5e7ee] bg-white px-4 py-4 text-left transition-colors hover:bg-[#f4f5f8]">
          <p className="text-[14px] font-semibold text-[#111318]">Ask Beast AI</p>
          <p className="mt-1 text-[12.5px] text-[#6b7280]">Ask a question in your own words.</p>
        </OpenAskBeast>
      </section>

      {/* Categories */}
      <section id="categories" className="space-y-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-widest text-[#9098a8]">Browse by topic</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {categories.map((c) =>
            c.live ? (
              <Link
                key={c.slug}
                href={`/help/${c.slug}`}
                className="rounded-xl border border-[#e5e7ee] bg-white px-4 py-4 transition-colors hover:border-[#c7ccd8] hover:bg-[#f4f5f8]"
              >
                <p className="text-[14.5px] font-semibold text-[#111318]">{c.title}</p>
                <p className="mt-1 text-[12.5px] text-[#6b7280]">{c.description}</p>
                <p className="mt-2 text-[11.5px] font-medium text-[#2f6bff]">{c.count} article{c.count === 1 ? "" : "s"}</p>
              </Link>
            ) : (
              <div
                key={c.slug}
                aria-disabled
                className="rounded-xl border border-dashed border-[#e5e7ee] bg-[#fafbfc] px-4 py-4"
              >
                <div className="flex items-center gap-2">
                  <p className="text-[14.5px] font-semibold text-[#6b7280]">{c.title}</p>
                  <span className="rounded-full bg-[#eef0f4] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-[#8a93a3]">Coming soon</span>
                </div>
                <p className="mt-1 text-[12.5px] text-[#9098a8]">{c.description}</p>
              </div>
            ),
          )}
        </div>
      </section>
    </div>
  )
}
