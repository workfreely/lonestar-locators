import { REBATE_AMOUNT } from "@/app/lib/constants";

export const metadata = {
  title: "Apartment Rebates in Austin | Lone Star Locators",
  description: `Get up to ${REBATE_AMOUNT} cash back on your next Austin apartment. Our free locating service helps you find the best deals and specials.`,
};

const AustinApartmentRebatesPage = () => {
  return (
    <div
      style={{
        maxWidth: "900px",
        margin: "2rem auto",
        padding: "2rem",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <h1>Austin Apartment Rebates</h1>

      <p>
        When you lease through us, you can earn up to {REBATE_AMOUNT} cash back —
        just for listing our name on your application and guest card!
      </p>
    </div>
  );
};

export default AustinApartmentRebatesPage;
