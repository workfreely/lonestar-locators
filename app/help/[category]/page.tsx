import Link from "next/link"
import { notFound } from "next/navigation"
import { getCategory, liveArticlesInCategory } from "@/lib/knowledge"
import SearchBar from "../_components/SearchBar"

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params
  const cat = getCategory(category)
  return { title: cat ? `${cat.title} — Help Center` : "Help Center" }
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params
  const cat = getCategory(category)
  if (!cat) notFound()

  const articles = liveArticlesInCategory(category)

  return (
    <div className="beast-container space-y-8 pb-20 pt-10 md:pt-12">
      <nav className="text-[12.5px] text-white/45">
        <Link href="/help" className="transition-colors hover:text-white">Help Center</Link>
        <span className="px-1.5">/</span>
        <span className="text-white/70">{cat.title}</span>
      </nav>

      {/* A plain div, not <header>: a Lone Star global styles `header h1/p`
          dark, which would fight the dark surface here. */}
      <div className="max-w-2xl space-y-2">
        <h1 className="text-[30px] font-semibold tracking-tight text-white md:text-[38px]">{cat.title}</h1>
        <p className="text-[15px] leading-relaxed text-white/60">{cat.description}</p>
      </div>

      <div className="max-w-xl">
        <SearchBar />
      </div>

      {articles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-10 text-center">
          <p className="text-[15px] font-semibold text-white/70">Coming soon</p>
          <p className="mt-1 text-[13px] text-white/45">Guides for this topic are on the way.</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {articles.map((a) => (
            <li key={a.id}>
              <Link
                href={`/help/${a.categorySlug}/${a.slug}`}
                className="group flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-[var(--beast-blue)]/50 hover:bg-white/[0.06]"
              >
                <p className="text-[15.5px] font-semibold text-white">{a.title}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/55">{a.shortAnswer}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
