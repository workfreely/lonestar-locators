import BlogLayout from "@/app/components/BlogLayout";

export const metadata = {
  title: "Dallas Events | Things To Do in Dallas TX",
  description:
    "Discover Dallas events including festivals, concerts, local happenings, and things to do year-round in Dallas, Texas.",
};

export default function DallasEventsPage() {
  return (
    <BlogLayout
      title="Dallas Events & Things To Do"
      content={
        <>
          <p>
            Dallas is known for live music, festivals, and nonstop events
            throughout the year. Whether you are new to the city or a longtime
            local, there is always something happening.
          </p>

          <h2>Popular Dallas Events</h2>
          <ul>
            <li>SXSW</li>
            <li>Dallas City Limits Festival</li>
            <li>Pecan Street Festival</li>
            <li>Trail of Lights</li>
          </ul>

          <p>
            Many of Dallas’s most popular events take place downtown, near Zilker
            Park, South Congress, and the Red River District.
          </p>
        </>
      }
    />
  );
}
