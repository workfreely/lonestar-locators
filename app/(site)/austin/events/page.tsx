import BlogLayout from "@/app/components/BlogLayout";

export const metadata = {
  title: "Austin Events | Things To Do in Austin TX",
  description:
    "Discover Austin events including festivals, concerts, local happenings, and things to do year-round in Austin, Texas.",
};

export default function AustinEventsPage() {
  return (
    <BlogLayout
      title="Austin Events & Things To Do"
      content={
        <>
          <p>
            Austin is known for live music, festivals, and nonstop events
            throughout the year. Whether you are new to the city or a longtime
            local, there is always something happening.
          </p>

          <h2>Popular Austin Events</h2>
          <ul>
            <li>SXSW</li>
            <li>Austin City Limits Festival</li>
            <li>Pecan Street Festival</li>
            <li>Trail of Lights</li>
          </ul>

          <p>
            Many of Austin’s most popular events take place downtown, near Zilker
            Park, South Congress, and the Red River District.
          </p>
        </>
      }
    />
  );
}
