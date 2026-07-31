import React from "react";
import LegalLayout from "@/app/components/LegalLayout";

const Disclaimer = () => {
  return (
    <LegalLayout title="Disclaimer">
      <p>
        Pricing, availability, concessions, and lease terms may change at any
        time without notice. Photos and virtual tours may represent model units
        and may not reflect the exact available apartment.
      </p>

      <p>
        While we strive to provide accurate information, details on this site
        are not guaranteed and should be independently verified. Square
        footage, features, and amenities may vary by unit.
      </p>

      <p>
        Renters should confirm all details directly with the apartment
        community before leasing. Lone Star Locators is not responsible for
        errors, omissions, or changes made by property owners or management
        companies.
      </p>
    </LegalLayout>
  );
};

export default Disclaimer;
