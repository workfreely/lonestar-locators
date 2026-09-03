import Link from "next/link"
import PageHero from "@/app/locator-beast/(site)/_components/PageHero"
import { categoriesWithStatus } from "@/lib/knowledge"
import SearchBar from "./_components/SearchBar"
import OpenAskBeast from "./_components/OpenAskBeast"

export const metadata = { title: "Locator Beast Help Center" }

// Home — Beast Academy's layout system: a wide dark PageHero, then
// .beast-container (1180px) sections with generously sized cards. Same widths,
// spacing, heading scale, grid proportions, and card treatment as the Academy
// modules page; the content (categories, counts, Coming Soon, search, Browse
// Guides, Ask Beast) is unchanged.
export default function HelpHome() {
  const categories = categoriesWithStatus()

  return (
    <>
      {/* Pull the whole hero/content stack up toward the header so there's less
          empty space above the title. Help-Center-only: PageHero's own padding
          is unchanged (it's shared with other pages); the header sits above via
          its z-index, so this trims the hero's top space rather than overlapping
          the logo/pill. */}
      <div className="-mt-8 md:-mt-14">
      <PageHero
        title="Locator Beast Help Center"
        subtitle="Search for answers, browse how-to guides, or ask Beast AI."
      >
        {/* Explicit width: the hero centers its children (shrink-to-fit), so a
            plain w-full/max-w-* collapses to the content width. A definite width
            gives the search row real presence, proportionate to the 1180px page. */}
        <div id="hero-search" className="w-[640px] max-w-full">
          <SearchBar autoFocus />
        </div>
      </PageHero>
      </div>

      {/* Pull the content up into the hero's bottom padding, matching the Academy
          modules page rhythm. */}
      <div className="-mt-10 bg-[var(--beast-bg-dark)] md:-mt-14">
        <div className="beast-container space-y-14 pb-16 pt-8 md:space-y-20 md:pb-24 md:pt-10">
          {/* Quick entry points */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <a
              href="#hero-search"
              className="group flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-[var(--beast-blue)]/50 hover:bg-white/[0.06] md:p-6"
            >
              <p className="text-[16px] font-semibold text-white md:text-[17px]">Search Help</p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/60">
                Type a question and get a direct answer.
              </p>
            </a>
            <a
              href="#topics"
              className="group flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-[var(--beast-blue)]/50 hover:bg-white/[0.06] md:p-6"
            >
              <p className="text-[16px] font-semibold text-white md:text-[17px]">Browse Guides</p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/60">Explore how-to guides by topic.</p>
            </a>
            <OpenAskBeast className="group flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left transition-colors hover:border-[var(--beast-blue)]/50 hover:bg-white/[0.06] md:p-6">
              <p className="text-[16px] font-semibold text-white md:text-[17px]">Ask Beast AI</p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/60">Ask a question in your own words.</p>
            </OpenAskBeast>
          </section>

          {/* Browse by topic — the Academy lesson-card grid, scaled for topics. */}
          <section id="topics">
            <div className="flex items-start gap-4">
              <span className="mt-1 text-[15px] font-bold tabular-nums text-[var(--beast-blue-bright)]">01</span>
              <div>
                <h2 className="text-[22px] font-semibold text-white md:text-[26px]">Browse by topic</h2>
                <p className="mt-1.5 max-w-2xl text-[14.5px] leading-relaxed text-white/60">
                  Pick a topic to see step-by-step guides written for how you actually work in Locator Beast.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((c) =>
                c.live ? (
                  <Link
                    key={c.slug}
                    href={`/help/${c.slug}`}
                    className="group flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-[var(--beast-blue)]/50 hover:bg-white/[0.06] md:p-6"
                  >
                    <p className="text-[16px] font-semibold text-white md:text-[17px]">{c.title}</p>
                    <p className="mt-1.5 flex-1 text-[13.5px] leading-relaxed text-white/60">{c.description}</p>
                    <p className="mt-4 text-[12.5px] font-semibold text-[var(--beast-blue-bright)]">
                      {c.count} article{c.count === 1 ? "" : "s"}
                    </p>
                  </Link>
                ) : (
                  <div
                    key={c.slug}
                    aria-disabled
                    className="flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6"
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-[16px] font-semibold text-white/70 md:text-[17px]">{c.title}</p>
                      <span className="flex-none rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-white/50">
                        Coming soon
                      </span>
                    </div>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/45">{c.description}</p>
                  </div>
                ),
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
