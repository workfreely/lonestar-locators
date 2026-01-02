import ReportLeaseThankYou from "@/app/components/ReportLeaseThankYou";

type PageProps = {
  searchParams: {
    firstName?: string;
    incentive?: "cash" | "movers";
  };
};

export default function ReportLeaseThankYouPage({ searchParams }: PageProps) {
  return (
    <ReportLeaseThankYou
      firstName={searchParams.firstName}
      incentive={searchParams.incentive}
    />
  );
}
