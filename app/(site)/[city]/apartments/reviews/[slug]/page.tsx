import ReviewLayout from "@/app/components/ReviewLayout";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default async function ReviewPage({
  params,
}: {
  params: { city: string; slug: string };
}) {
  const { slug } = params;

  const { data: review, error } = await supabase
    .from("property_reviews")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!review || error) {
    return (
      <div style={{ padding: "2rem" }}>
        <h1>Review not found</h1>
      </div>
    );
  }

  return (
    <ReviewLayout
      title={`${review.property_name} Review — The Good, Bad & Ugly`}
      propertyName={review.property_name}
      image={review.hero_image_url}
      featureImage1={review.feature_image_1_url}
      featureImage2={review.feature_image_2_url}

      customIntro={review.custom_intro}
      good={review.good_points || []}
      bad={review.bad_points || []}
      ugly={review.ugly_points || []}
      customOutro={review.custom_outro}

      keywords={review.keywords || []}
      neighborhood={review.neighborhood}
      address={{
        streetAddress: review.street_address,
        addressLocality: review.city,
        addressRegion: review.state,
        postalCode: review.postal_code,
        addressCountry: review.country,
      }}
      rent={review.starting_rent}
      bedrooms={review.bedrooms}
      agentVideo={review.agent_video_url}
    />
  );
}
