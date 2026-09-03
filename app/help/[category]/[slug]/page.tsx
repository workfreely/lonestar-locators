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
      <h2 className="text-[11px] font-semibold uppercase tracking-widest text-white/45">{label}</h2>
      <div className="text-[15px] leading-relaxed text-white/80">{children}</div>
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
    <div className="beast-container pb-20 pt-10 md:pt-12">
      {/* Prose reads best in a narrower column; it sits centered on the wide
          dark page, keeping the standard container padding + rhythm. */}
      <article className="mx-auto max-w-3xl space-y-6">
        <nav className="text-[12.5px] text-white/45">
          <Link href="/help" className="transition-colors hover:text-white">Help Center</Link>
          <span className="px-1.5">/</span>
          <Link href={`/help/${category}`} className="transition-colors hover:text-white">{cat?.title}</Link>
        </nav>

        {/* A plain div, not <header>: a Lone Star global styles `header h1/p`
            dark, which would fight the dark surface here. */}
        <div className="space-y-3">
          <h1 className="text-[28px] font-semibold tracking-tight text-white md:text-[34px]">{a.title}</h1>
          <div className="rounded-2xl border border-[var(--beast-blue)]/25 bg-[var(--beast-blue)]/10 px-5 py-4 text-[15px] font-medium leading-relaxed text-white">
            {a.shortAnswer}
          </div>
        </div>

        <div className="space-y-5">
          <Section label="Why this matters to you">{a.whyItMatters}</Section>
          <Section label="What this helps you do">{a.whatItHelpsYouDo}</Section>
          {a.whatClientSees && <Section label="What your client sees">{a.whatClientSees}</Section>}

          {a.steps && a.steps.length > 0 && (
            <Section label="How to do it">
              <ol className="list-decimal space-y-1.5 pl-5 marker:text-white/40">
                {a.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </Section>
          )}

          {a.whatHappensNext && <Section label="What happens next">{a.whatHappensNext}</Section>}

          {a.rulesOrLimitations && a.rulesOrLimitations.length > 0 && (
            <Section label="Good to know">
              <ul className="list-disc space-y-1.5 pl-5 marker:text-white/40">
                {a.rulesOrLimitations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </Section>
          )}

          {a.commonMistakes && a.commonMistakes.length > 0 && (
            <Section label="Common mistakes">
              <ul className="list-disc space-y-1.5 pl-5 marker:text-white/40">
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
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
            <Link href={a.videoUrl} className="text-[13.5px] font-semibold text-[var(--beast-blue-bright)] hover:underline">
              Watch a related lesson in Beast Academy
            </Link>
          </div>
        ) : a.videoPlaceholder ? (
          <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-5 py-4 text-[12.5px] text-white/45">
            {a.videoPlaceholder}
          </div>
        ) : null}

        {/* Related */}
        {related.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-white/45">Related articles</h2>
            <ul className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
              {related.map((r) => (
                <li key={r.id} className="border-b border-white/[0.06] last:border-b-0">
                  <Link
                    href={`/help/${r.categorySlug}/${r.slug}`}
                    className="block px-5 py-3 text-[13.5px] font-medium text-white/85 transition-colors hover:bg-white/[0.06]"
                  >
                    {r.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Feedback + Ask Beast */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
          <WasThisHelpful />
          <OpenAskBeast className="rounded-lg border border-white/12 bg-white/[0.04] px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-white/[0.08]">
            Still need help? Ask Beast AI
          </OpenAskBeast>
        </div>

        <p className="text-[11.5px] text-white/40">Last reviewed {a.lastReviewed}</p>
      </article>
    </div>
  )
}
