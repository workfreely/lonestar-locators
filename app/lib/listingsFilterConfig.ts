export const defaultImage =
  "https://res.cloudinary.com/dxtiguwzm/image/upload/v1748277676/photos-coming-soon-lone-star-locators_be1dyx.jpg";

export const CITY_FILTERS: Record<
  string,
  { neighborhoods: string[]; submarkets: string[] }
> = {
  "san-antonio": {
    neighborhoods: [
      "Downtown San Antonio",
      "La Cantera/The Rim",
      "The Dominion",
      "Stone Oak",
      "Alamo Ranch",
      "Southtown",
      "UTSA",
      "Medical Center",
      "Universal City/Converse",
      "Westover Hills",
      "Alamo Heights",
    ],
    submarkets: ["New Braunfels", "Boerne", "Schertz"],
  },

  austin: {
    neighborhoods: [
      "Downtown Austin",
      "South Congress",
      "East Austin",
      "Zilker",
      "Mueller",
      "Domain",
      "Barton Creek",
      "Westlake",
      "Riverside",
      "North Loop",
    ],
    submarkets: ["Round Rock", "Cedar Park", "Pflugerville", "Georgetown"],
  },

  dallas: {
    neighborhoods: [
      "Downtown Dallas",
      "Uptown",
      "Deep Ellum",
      "Bishop Arts District",
      "Knox-Henderson",
      "Oak Lawn",
      "Design District",
      "Victory Park",
      "Lower Greenville",
      "Trinity Groves",
    ],
    submarkets: [], // keep empty if you don’t want them
  },

  houston: {
    neighborhoods: [
      "Downtown Houston",
      "Midtown",
      "Montrose",
      "The Heights",
      "Museum District",
      "River Oaks",
      "Medical Center",
      "Galleria",
      "Washington Ave",
      "EaDo",
    ],
    submarkets: ["Sugar Land", "Katy"],
  },
};
