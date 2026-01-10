import ApartmentListingsHouston from "@/app/components/ApartmentListingsHouston";

export const metadata = {
  title: "Houston Apartments | Lone Star Locators",
  description:
    "Browse apartments in Houston, TX. Filter by neighborhood, price, bedrooms, and move-in specials.",
};

export default function HoustonApartmentsPage() {
  return (
    <div
      style={{
        padding: "2.5rem 1.5rem",
        maxWidth: "1200px",
        margin: "0 auto",
      }}
    >
      <h1
        style={{
          fontSize: "1.75rem",
          fontWeight: 700,
          marginBottom: "1rem",
          marginTop: "-2rem",
          textAlign: "left",
        }}
      >
        Apartments in Houston, Texas
      </h1>

      <ApartmentListingsHouston />
    </div>
  );
}
