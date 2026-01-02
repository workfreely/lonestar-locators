export const metadata = {
  title: "Apartment Rebates in Dallas | Lone Star Locators",
  description:
    "Earn cash back when you lease your next apartment in Dallas. Our free apartment locating service helps you find the best deals and move-in specials.",
};

const DallasApartmentRebatesPage = () => {
  const REBATE_AMOUNT = "$200"; // adjust later if needed

  return (
    <div
      style={{
        maxWidth: "900px",
        margin: "2rem auto",
        padding: "2rem",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <h1>Dallas Apartment Rebates</h1>

      <p>
        Lease a new apartment in Dallas and earn up to{" "}
        <strong>{REBATE_AMOUNT}</strong> cash back — just for listing Lone Star
        Locators on your application and guest card.
      </p>

      <h2>How to Qualify</h2>
      <ul>
        <li>Use our free service to find an apartment</li>
        <li>List “Lone Star Locators” on your guest card and application</li>
        <li>Submit your rebate form within 90 days of move-in</li>
      </ul>

      <h2>Why Renters Love It</h2>
      <ul>
        <li>Earn cash on something you were already planning to do</li>
        <li>Still qualify for all current move-in specials</li>
        <li>Free expert guidance at no cost to you</li>
      </ul>

      <p style={{ marginTop: "2rem" }}>
        Ready to claim your rebate? Let’s find your next Dallas apartment.
      </p>
    </div>
  );
};

export default DallasApartmentRebatesPage;
