import HomeThankYou from "@/app/components/HomeThankYou";

type PageProps = {
  searchParams: Promise<{
    firstName?: string;
    city?: string;
  }>;
};

export default async function NewHomeThankYouPage({
  searchParams,
}: PageProps) {
  const { firstName, city } = await searchParams;

  return <HomeThankYou firstName={firstName} city={city} />;
}
