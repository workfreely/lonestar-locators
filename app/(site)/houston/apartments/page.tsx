import ApartmentListingsAustin from "@/app/components/ApartmentListingsAustin";

export const metadata = {
  title: "Austin Apartments | Lone Star Locators",
  description:
    "Browse apartments in Austin, TX. Filter by neighborhood, price, bedrooms, and move-in specials.",
};

export default function AustinApartmentsPage() {
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
        Apartments in Austin, Texas
      </h1>

      <ApartmentListingsAustin />
    </div>
  );
}
