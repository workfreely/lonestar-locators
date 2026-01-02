export const metadata = {
  title: "San Antonio Apartment Rebates | Lone Star Locators",
  description:
    "Get up to $200 cash back when you lease your San Antonio apartment with Lone Star Locators. Free locating service with exclusive perks.",
};

const SanAntonioApartmentRebatesPage = () => {
  const REBATE_AMOUNT = "$200";

  return (
    <div
      style={{
        maxWidth: "900px",
        margin: "2rem auto",
        padding: "2rem",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <h1>San Antonio Apartment Rebates</h1>

      <p>
        Did you know you could earn up to {REBATE_AMOUNT} just for listing Lone
        Star Locators on your apartment application and guest card? Our free
        service helps you find the best deals and specials — and rewards you for
        it.
      </p>

      <h2>How It Works</h2>
      <ul>
        <li>Use our free locating service to explore San Antonio apartments</li>
        <li>Put “Lone Star Locators” on the guest card and application</li>
        <li>Move in, then submit your rebate form within 90 days</li>
      </ul>

      <p>
        It’s that simple. No fees, no catch — just cash back or free movers to
        help make your move easier.
      </p>
    </div>
  );
};

export default SanAntonioApartmentRebatesPage;
