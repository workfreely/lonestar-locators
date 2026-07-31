import type { Metadata } from "next";
import Link from "next/link";
import PageHero from "../_components/PageHero";
import Reveal from "../_components/Reveal";
import { ACADEMY_MODULES } from "@/app/locator-beast/academy/_data/modules";

export const metadata: Metadata = {
  title: "Beast Academy",
  description: "Learn how to use Locator Beast and grow your apartment locating business.",
  alternates: { canonical: "https://locatorbeast.com/academy" },
};

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14z" />
    </svg>
  );
}

export default function BeastAcademyPage() {
  return (
    <>
      <PageHero
        title="Beast Academy"
        subtitle="Learn how to use Locator Beast and grow your apartment locating business."
      />

      <div className="bg-[var(--beast-bg-dark)]">
        <div className="beast-container space-y-14 py-16 md:space-y-20 md:py-24">
          {ACADEMY_MODULES.map((module, mi) => (
            <Reveal key={module.slug}>
              <section>
                {/* Module header — numbered because the modules are a sequence. */}
                <div className="flex items-start gap-4">
                  <span className="mt-1 text-[15px] font-bold tabular-nums text-[var(--beast-blue-bright)]">
                    {String(mi + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h2 className="text-[22px] font-semibold text-white md:text-[26px]">{module.title}</h2>
                    <p className="mt-1.5 max-w-2xl text-[14.5px] leading-relaxed text-white/60">
                      {module.description}
                    </p>
                  </div>
                </div>

                {/* Lesson cards */}
                <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {module.lessons.map((lesson) => (
                    <Link
                      key={lesson.slug}
                      href={`/academy/${module.slug}/${lesson.slug}`}
                      className="group flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-[var(--beast-blue)]/50 hover:bg-white/[0.06]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--beast-blue)]/15 text-[var(--beast-blue-bright)]">
                          <PlayIcon className="h-4 w-4" />
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/50">
                          Coming Soon
                        </span>
                      </div>
                      <p className="mt-3 text-[14.5px] font-semibold text-white group-hover:text-white">
                        {lesson.title}
                      </p>
                      <p className="mt-1 text-[12.5px] tabular-nums text-white/45">{lesson.durationMin} min</p>
                    </Link>
                  ))}
                </div>
              </section>
            </Reveal>
          ))}
        </div>
      </div>
    </>
  );
}
