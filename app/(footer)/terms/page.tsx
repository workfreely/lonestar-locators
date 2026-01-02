import React from "react";
import LegalLayout from "@/app/components/LegalLayout";

const Terms = () => {
  return (
    <LegalLayout title="Terms and Conditions">
      <p>
        By using Lone Star Locators, you agree to the following terms and
        conditions.
      </p>

      <h2>Use of Our Service</h2>
      <p>
        Our platform connects renters with apartment communities and related
        information. You agree to use the site responsibly and not misuse any
        content or tools provided.
      </p>

      <h2>Rebates and Offers</h2>
      <p>
        Rebates and promotional offers are subject to qualification and must
        follow all stated requirements. Lone Star Locators is not responsible
        for denied rebates due to incomplete or incorrect applications.
      </p>

      <h2>External Links</h2>
      <p>
        Our website may link to third party sites. We are not responsible for
        the content, accuracy, or policies of those external websites.
      </p>

      <h2>Updates to These Terms</h2>
      <p>
        These terms may be updated at any time. Continued use of the site
        indicates acceptance of the current terms.
      </p>
    </LegalLayout>
  );
};

export default Terms;
