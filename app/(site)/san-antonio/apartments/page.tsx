import ApartmentListingsSanAntonio from "@/app/components/ApartmentListingsSanAntonio";

export const metadata = {
  title: "San Antonio Apartments | Lone Star Locators",
  description:
    "Browse apartments in San Antonio, TX. Filter by neighborhood, price, bedrooms, and move-in specials.",
};

export default function SanAntonioApartmentsPage() {
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
  Apartments in San Antonio, Texas
</h1>


      {/* ✅ Client component only */}
      <ApartmentListingsSanAntonio />
    </div>
  );
}
