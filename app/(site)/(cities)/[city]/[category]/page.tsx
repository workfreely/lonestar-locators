import CityCategoryPage from "@/app/components/CityCategoryPage";

export default function Page({
  params,
}: {
  params: { city: string; category: string };
}) {
  const cityMap: Record<string, any> = {
    austin: "Austin",
    dallas: "Dallas",
    houston: "Houston",
    "san-antonio": "San Antonio",
  };

  const city = cityMap[params.city];

  if (!city) {
    return <div>City not found</div>;
  }

  return (
    <CityCategoryPage
      city={city}
      slug={params.category}
      path={`/${params.city}/${params.category}`}
    />
  );
}
