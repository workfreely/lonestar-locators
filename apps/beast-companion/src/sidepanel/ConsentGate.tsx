import { useEffect, useState } from "react";
import { grantConsent, hasConsent } from "@/utils/sensitiveStore";

/**
 * First-run disclosure.
 *
 * Short by design: it names the CATEGORIES of data involved (client rental,
 * financial, and background-screening details) and the fact that the property
 * page being viewed is read — enough for informed consent — while the exhaustive
 * treatment lives in the Privacy Policy and the Chrome Web Store submission.
 * Deliberately free of platform names, domains, and implementation detail.
 *
 * The real protection is upstream, not here: the content-script bridges refuse
 * to write anything until consent exists, so declining leaves nothing stored
 * rather than merely hidden. This component only decides what is rendered.
 */

const PRIVACY_URL = "https://locatorbeast.com/privacy";

export function ConsentGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "needed" | "granted">("checking");

  useEffect(() => {
    void (async () => setState((await hasConsent()) ? "granted" : "needed"))();
  }, []);

  if (state === "checking") return null;
  if (state === "granted") return <>{children}</>;

  return (
    <div className="bc-consent" role="dialog" aria-modal="true" aria-labelledby="bc-consent-title">
      <div className="bc-consent__inner">
        <h1 id="bc-consent-title" className="bc-consent__title">
          Enable Beast Companion
        </h1>

        <p className="bc-consent__body">
          Beast Companion shows client contact, rental, financial, and background-screening details
          from Locator Beast CRM alongside information from the property page you&rsquo;re viewing,
          so you can find the best fit for your client.
        </p>

        <p className="bc-consent__body">
          This information stays on your device during your browser session and is never sold or
          shared with third parties.
        </p>

        <p className="bc-consent__agree">
          By enabling Beast Companion, you agree to the{" "}
          <a className="bc-consent__link" href={PRIVACY_URL} target="_blank" rel="noreferrer">
            Privacy Policy
          </a>
          .
        </p>

        <button
          type="button"
          className="bc-consent__accept"
          onClick={() => {
            void grantConsent().then(() => setState("granted"));
          }}
        >
          Enable Beast Companion
        </button>
      </div>
    </div>
  );
}
