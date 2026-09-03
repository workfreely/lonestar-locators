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
    <div className="space-y-6">
      <nav className="text-[12.5px] text-[#6b7280]">
        <Link href="/help" className="hover:text-[#111318]">Help Center</Link>
        <span className="px-1.5">/</span>
        <span className="text-[#4b5162]">{cat.title}</span>
      </nav>

      <header className="space-y-2">
        <h1 className="text-[24px] font-black tracking-tight text-[#111318]">{cat.title}</h1>
        <p className="text-[14px] text-[#4b5162]">{cat.description}</p>
      </header>

      <SearchBar />

      {articles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#e5e7ee] bg-[#fafbfc] px-4 py-8 text-center">
          <p className="text-[14px] font-semibold text-[#6b7280]">Coming soon</p>
          <p className="mt-1 text-[12.5px] text-[#9098a8]">Guides for this topic are on the way.</p>
        </div>
      ) : (
        <ul className="divide-y divide-[#eceef3] rounded-xl border border-[#e5e7ee] bg-white">
          {articles.map((a) => (
            <li key={a.id}>
              <Link href={`/help/${a.categorySlug}/${a.slug}`} className="block px-4 py-4 transition-colors hover:bg-[#f4f5f8]">
                <p className="text-[14.5px] font-semibold text-[#111318]">{a.title}</p>
                <p className="mt-1 text-[12.5px] text-[#6b7280]">{a.shortAnswer}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
