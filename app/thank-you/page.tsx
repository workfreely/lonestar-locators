import ThankYou from "@/app/components/ThankYou";

type ThankYouPageProps = {
  searchParams: {
    firstName?: string;
    city?: string;
  };
};

export default function ThankYouPage({ searchParams }: ThankYouPageProps) {
  const firstName = searchParams.firstName || "Friend";
  const city = searchParams.city || "";

  return (
    <ThankYou
      firstName={firstName}
      city={city}
    />
  );
}
