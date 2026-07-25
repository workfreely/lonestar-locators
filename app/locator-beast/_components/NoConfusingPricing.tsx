import Reveal from "./Reveal";

const LINES = [
  { text: "No Basic Plan.", muted: true },
  { text: "No Pro Plan.", muted: true },
  { text: "No Enterprise Upsell.", muted: true },
  { text: "Just everything.", muted: false },
  { text: "One Price.", muted: false },
  { text: "Every Feature Included.", muted: false },
];

export default function NoConfusingPricing() {
  return (
    <section className="bg-[var(--beast-bg-dark)] py-20 text-white md:py-28">
      <div className="beast-container flex flex-col items-center text-center">
        <Reveal>
          <div className="flex flex-col gap-2">
            {LINES.map((line) => (
              <p
                key={line.text}
                className={
                  line.muted
                    ? "text-[20px] font-medium text-white/35 line-through decoration-white/20 md:text-[26px]"
                    : "text-[28px] font-semibold text-white md:text-[36px]"
                }
              >
                {line.text}
              </p>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
