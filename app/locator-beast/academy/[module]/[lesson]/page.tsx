import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLesson, allLessonParams } from "@/app/locator-beast/academy/_data/modules";

type LessonParams = { module: string; lesson: string };

// Statically generate every lesson page from the single data source.
export function generateStaticParams(): LessonParams[] {
  return allLessonParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<LessonParams>;
}): Promise<Metadata> {
  const { module: moduleSlug, lesson: lessonSlug } = await params;
  const found = getLesson(moduleSlug, lessonSlug);
  if (!found) return { title: "Lesson | Beast Academy" };
  return {
    title: `${found.lesson.title} | Beast Academy`,
    description: found.lesson.description,
    robots: { index: false, follow: true },
  };
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14z" />
    </svg>
  );
}

export default async function LessonPage({
  params,
}: {
  params: Promise<LessonParams>;
}) {
  const { module: moduleSlug, lesson: lessonSlug } = await params;
  const found = getLesson(moduleSlug, lessonSlug);
  if (!found) notFound();
  const { module, lesson } = found;

  return (
    <div className="min-h-screen bg-[var(--beast-bg-dark)]">
      <div className="beast-container max-w-3xl py-14 md:py-20">
        <Link
          href="/academy"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-white/50 transition-colors hover:text-white"
        >
          <span aria-hidden="true">←</span> Beast Academy
        </Link>

        <p className="mt-6 text-[13px] font-semibold text-[var(--beast-blue-bright)]">{module.title}</p>
        <h1 className="mt-2 text-[30px] font-semibold leading-tight text-white md:text-[38px]">
          {lesson.title}
        </h1>
        <div className="mt-3 flex items-center gap-2.5 text-[13px] text-white/50">
          <span className="tabular-nums">{lesson.durationMin} min</span>
          <span aria-hidden="true">•</span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/50">
            Coming Soon
          </span>
        </div>

        {/* Video placeholder */}
        <div className="mt-8 flex aspect-video w-full flex-col items-center justify-center rounded-2xl border border-white/10 bg-[var(--beast-panel-dark)]">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/5 text-white/40">
            <PlayIcon className="h-7 w-7" />
          </span>
          <p className="mt-4 text-[13.5px] text-white/45">Video coming soon.</p>
        </div>

        <p className="mt-7 text-[15px] leading-relaxed text-white/70">{lesson.description}</p>
        <p className="mt-4 text-[13.5px] text-white/40">Video coming soon.</p>
      </div>
    </div>
  );
}
