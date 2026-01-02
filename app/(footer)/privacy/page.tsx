import React from "react";
import LegalLayout from "@/app/components/LegalLayout";

const Privacy = () => {
  return (
    <LegalLayout title="Privacy Policy">
      <p>
        At Lone Star Locators, your privacy matters to us. This Privacy Policy
        explains how we collect, use, and protect your personal information.
      </p>

      <h2>Information We Collect</h2>
      <p>
        We may collect personal information such as your name, phone number,
        email address, and apartment search preferences when you submit a form
        or request assistance.
      </p>

      <h2>How We Use Your Information</h2>
      <p>
        Your information is used only to help match you with apartment listings,
        provide updates, or contact you with your consent. We do not sell or
        share your personal data with third parties.
      </p>

      <h2>Cookies and Analytics</h2>
      <p>
        Our website may use cookies to improve performance and understand site
        usage. You can disable cookies through your browser settings if you
        prefer.
      </p>

      <h2>Contact Us</h2>
      <p>
        If you have questions about this Privacy Policy, contact us at
        support@lonestarlocators.com.
      </p>
    </LegalLayout>
  );
};

export default Privacy;
