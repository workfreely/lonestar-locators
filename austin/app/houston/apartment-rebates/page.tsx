import BlogLayout from "@/app/components/BlogLayout";

const REBATE_AMOUNT = "$200";

export const metadata = {
  title: "Apartment Rebates in Houston | Lone Star Locators",
  description:
    "Get up to $200 cash back on your next Houston apartment. Use Lone Star Locators for expert help, exclusive deals, and a 100% free apartment locating service.",
};

const HoustonApartmentRebatesPage = () => {
  return (
    <BlogLayout
      title="Houston Apartment Rebates"
      content={
        <>
          <p>
            Did you know you can earn up to <strong>{REBATE_AMOUNT}</strong> just
            for listing Lone Star Locators on your application and guest card?
          </p>

          <p>
            Whether you're moving to Midtown, The Heights, or Downtown Houston,
            our expert team will help you find the best apartment options — and
            make sure you get rewarded for it.
          </p>

          <h2>How to Qualify</h2>
          <ul>
            <li>Use our free service to find your next apartment</li>
            <li>List “Lone Star Locators” on the application and guest card</li>
            <li>Submit your rebate form after you move in</li>
          </ul>

          <p>
            It’s that easy. Save money, reduce stress, and get cash back — only
            with Lone Star Locators.
          </p>
        </>
      }
    />
  );
};

export default HoustonApartmentRebatesPage;
