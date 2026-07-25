import Reveal from "./Reveal";
import ScreenshotPlaceholder from "./ScreenshotPlaceholder";

export default function FeatureDetailSection({
  title,
  description,
  bullets,
  imageSide = "right",
  tone = "white",
  comingSoon,
}: {
  title: string;
  description: string;
  bullets: string[];
  imageSide?: "left" | "right";
  tone?: "white" | "tint";
  comingSoon?: boolean;
}) {
  return (
    <section className={tone === "tint" ? "bg-[#f7f8fa] py-16 md:py-20" : "bg-white py-16 md:py-20"}>
      <div className="beast-container grid items-center gap-10 md:grid-cols-2 md:gap-16">
        <Reveal className={imageSide === "left" ? "md:order-2" : ""}>
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-[26px] font-semibold leading-tight tracking-tight text-[var(--beast-ink)] md:text-[30px]">
                {title}
              </h3>
              {comingSoon && (
                <span className="rounded-full bg-[var(--beast-blue)]/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--beast-blue)]">
                  Coming Soon
                </span>
              )}
            </div>
            <p className="mt-3 text-[16px] leading-relaxed text-[var(--beast-ink-soft)]">
              {description}
            </p>
            <ul className="mt-6 flex flex-col gap-3">
              {bullets.map((bullet) => (
                <li key={bullet} className="flex items-center gap-3 text-[14px] font-medium text-[var(--beast-ink)]">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--beast-blue)]" />
                  {bullet}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        <Reveal delayMs={100} className={imageSide === "left" ? "md:order-1" : ""}>
          <ScreenshotPlaceholder label={title} />
        </Reveal>
      </div>
    </section>
  );
}
