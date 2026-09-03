import Link from "next/link"
import { notFound } from "next/navigation"
import { getCategory, getLiveArticle, resolveRelated } from "@/lib/knowledge"
import WasThisHelpful from "../../_components/WasThisHelpful"
import OpenAskBeast from "../../_components/OpenAskBeast"

export async function generateMetadata({ params }: { params: Promise<{ category: string; slug: string }> }) {
  const { category, slug } = await params
  const a = getLiveArticle(category, slug)
  return { title: a ? `${a.title} — Help Center` : "Help Center" }
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h2 className="text-[11px] font-semibold uppercase tracking-widest text-[#9098a8]">{label}</h2>
      <div className="text-[14px] leading-relaxed text-[#2b303b]">{children}</div>
    </section>
  )
}

export default async function ArticlePage({ params }: { params: Promise<{ category: string; slug: string }> }) {
  const { category, slug } = await params
  const a = getLiveArticle(category, slug)
  if (!a) notFound()
  const cat = getCategory(category)
  const related = resolveRelated(a.relatedArticles)

  return (
    <article className="space-y-6">
      <nav className="text-[12.5px] text-[#6b7280]">
        <Link href="/help" className="hover:text-[#111318]">Help Center</Link>
        <span className="px-1.5">/</span>
        <Link href={`/help/${category}`} className="hover:text-[#111318]">{cat?.title}</Link>
      </nav>

      <header className="space-y-3">
        <h1 className="text-[24px] font-black tracking-tight text-[#111318]">{a.title}</h1>
        <div className="rounded-xl border border-[#dfe7ff] bg-[#f3f6ff] px-4 py-3 text-[14px] font-medium leading-relaxed text-[#1b2a5b]">
          {a.shortAnswer}
        </div>
      </header>

      <div className="space-y-5">
        <Section label="Why this matters to you">{a.whyItMatters}</Section>
        <Section label="What this helps you do">{a.whatItHelpsYouDo}</Section>
        {a.whatClientSees && <Section label="What your client sees">{a.whatClientSees}</Section>}

        {a.steps && a.steps.length > 0 && (
          <Section label="How to do it">
            <ol className="list-decimal space-y-1.5 pl-5">
              {a.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </Section>
        )}

        {a.whatHappensNext && <Section label="What happens next">{a.whatHappensNext}</Section>}

        {a.rulesOrLimitations && a.rulesOrLimitations.length > 0 && (
          <Section label="Good to know">
            <ul className="list-disc space-y-1.5 pl-5">
              {a.rulesOrLimitations.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </Section>
        )}

        {a.commonMistakes && a.commonMistakes.length > 0 && (
          <Section label="Common mistakes">
            <ul className="list-disc space-y-1.5 pl-5">
              {a.commonMistakes.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </Section>
        )}

        {a.troubleshooting && <Section label="Troubleshooting">{a.troubleshooting}</Section>}
      </div>

      {/* Video */}
      {a.videoUrl ? (
        <div className="rounded-xl border border-[#e5e7ee] bg-white px-4 py-3">
          <Link href={a.videoUrl} className="text-[13.5px] font-semibold text-[#2f6bff] hover:underline">
            Watch a related lesson in Beast Academy
          </Link>
        </div>
      ) : a.videoPlaceholder ? (
        <div className="rounded-xl border border-dashed border-[#e5e7ee] bg-[#fafbfc] px-4 py-3 text-[12.5px] text-[#9098a8]">
          {a.videoPlaceholder}
        </div>
      ) : null}

      {/* Related */}
      {related.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-[#9098a8]">Related articles</h2>
          <ul className="divide-y divide-[#eceef3] rounded-xl border border-[#e5e7ee] bg-white">
            {related.map((r) => (
              <li key={r.id}>
                <Link href={`/help/${r.categorySlug}/${r.slug}`} className="block px-4 py-2.5 text-[13.5px] font-medium text-[#111318] hover:bg-[#f4f5f8]">
                  {r.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Feedback + Ask Beast */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eceef3] pt-5">
        <WasThisHelpful />
        <OpenAskBeast className="rounded-lg border border-[#e5e7ee] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#111318] hover:bg-[#f4f5f8]">
          Still need help? Ask Beast AI
        </OpenAskBeast>
      </div>

      <p className="text-[11.5px] text-[#9098a8]">Last reviewed {a.lastReviewed}</p>
    </article>
  )
}
