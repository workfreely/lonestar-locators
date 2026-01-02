import HomeThankYou from "@/app/components/HomeThankYou";

type PageProps = {
  searchParams: {
    firstName?: string;
    city?: string;
  };
};

export default function NewHomeThankYouPage({ searchParams }: PageProps) {
  return (
    <HomeThankYou
      firstName={searchParams.firstName}
      city={searchParams.city}
    />
  );
}
