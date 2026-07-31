import ThankYou from "@/app/components/ThankYou";

type ThankYouPageProps = {
  searchParams: Promise<{
    firstName?: string;
    city?: string;
  }>;
};

export default async function ThankYouPage({
  searchParams,
}: ThankYouPageProps) {
  const { firstName, city } = await searchParams;

  return (
    <ThankYou
      firstName={firstName || "Friend"}
      city={city || ""}
    />
  );
}
