import ReportLeaseThankYou from "@/app/components/ReportLeaseThankYou";

type PageProps = {
  searchParams: Promise<{
    firstName?: string;
    incentive?: "cash" | "movers";
  }>;
};

export default async function ReportLeaseThankYouPage({
  searchParams,
}: PageProps) {
  const { firstName, incentive } = await searchParams;

  return (
    <ReportLeaseThankYou
      firstName={firstName}
      incentive={incentive}
    />
  );
}
