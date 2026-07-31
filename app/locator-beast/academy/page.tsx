import type { Metadata } from "next";
import Link from "next/link";
import { HiOutlineRocketLaunch, HiOutlinePlayCircle, HiOutlineDocumentText } from "react-icons/hi2";
import PageHero from "../_components/PageHero";
import Reveal from "../_components/Reveal";
import { TRIAL_URL } from "../_lib/site";

export const metadata: Metadata = {
  title: "Beast Academy",
  description:
    "Playbooks, guides, and video training to help apartment locators close more leases with Locator Beast.",
  alternates: { canonical: "https://locatorbeast.com/academy" },
};

const TRACKS = [
  {
    icon: HiOutlineRocketLaunch,
    title: "Getting started",
    body: "Set up your workspace, import leads, and send your first guest card in under an hour.",
  },
  {
    icon: HiOutlinePlayCircle,
    title: "Video walkthroughs",
    body: "Short, focused videos on every part of the pipeline — from first contact to closed lease.",
  },
  {
    icon: HiOutlineDocumentText,
    title: "Locator playbooks",
    body: "Proven follow-up cadences, templates, and scripts from top-producing locators.",
  },
];

export default function BeastAcademyPage() {
  return (
    <>
      <PageHero
        eyebrow="Beast Academy"
        title={
          <>
            Master the craft
            <br />
            of locating.
          </>
        }
        subtitle="Guides, playbooks, and video training to help you close more leases. Rolling out to every workspace."
      >
        <Link
          href={TRIAL_URL}
          className="inline-block rounded-full bg-[var(--beast-blue)] px-7 py-3.5 text-[15px] font-semibold text-white transition-transform duration-300 hover:scale-[1.02]"
        >
          Start your free trial
        </Link>
      </PageHero>

      <section className="bg-white py-20 md:py-28">
        <div className="beast-container grid gap-6 md:grid-cols-3">
          {TRACKS.map((t, i) => {
            const Icon = t.icon;
            return (
              <Reveal key={t.title} delayMs={i * 100}>
                <div className="flex h-full flex-col rounded-2xl border border-[var(--beast-border)] bg-white p-7">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--beast-blue)]/10">
                    <Icon className="h-5 w-5 text-[var(--beast-blue)]" />
                  </div>
                  <p className="mt-5 text-[16px] font-semibold text-[var(--beast-ink)]">{t.title}</p>
                  <p className="mt-2 text-[14px] leading-relaxed text-[var(--beast-ink-soft)]">{t.body}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>
    </>
  );
}
