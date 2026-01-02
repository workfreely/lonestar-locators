"use client";

import React, { useState } from "react";

const LoneStarDistrictNewSanAntonioNeighborhood = () => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const toggleAccordion = (index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  const IMG_CONTINENTAL = "";
  const IMG_TOWER_LIFE = "";
  const IMG_LONE_STAR_BREWERY = "";

  const VIDEO_CONTINENTAL = "";
  const VIDEO_TOWER_LIFE = "";

  const faqs = [
    {
      question: "What is the Lone Star District in San Antonio",
      answer:
        "The Lone Star District is a rapidly growing urban neighborhood just south of downtown San Antonio that blends historic industrial spaces with new residential, retail, and entertainment projects along the river.",
    },
    {
      question: "Why is the Lone Star District becoming so popular",
      answer:
        "Renters are drawn to the Lone Star District for its walkable lifestyle, new apartment communities, river access, and proximity to downtown employers, the Tech District, and cultural attractions.",
    },
    {
      question:
        "What new apartment developments are coming to the Lone Star District",
      answer:
        "Key projects include the large scale Lone Star Brewery redevelopment with significant multi family residential plans, The Continental Residences high rise, and the Tower Life Building conversion into apartments.",
    },
    {
      question:
        "When will new apartments in the Lone Star District be available to move into",
      answer:
        "The Continental Residences is pre leasing now with move ins targeted for January twenty twenty six, and the Tower Life residential conversion is expected to begin leasing in twenty twenty six.",
    },
    {
      question:
        "Can I get a rebate or free movers when I lease in the Lone Star District",
      answer:
        "Yes, when you list Jay Morris with AptAmigo on your application and report your lease after move in, you can qualify for up to two hundred dollars cash back or free movers depending on the property.",
    },
  ];

  return (
      content={
        <>
          <p>
            The Lone Star District is quickly becoming
            <strong>San Antonio’s most exciting new neighborhood</strong>, and
            renters are beginning to pay close attention. What used to be a
            quiet stretch of industrial buildings and riverfront space is now
            transforming into one of the city’s most modern and talked about
            districts.
          </p>

          <p>
            If you have been waiting for a walkable, vibrant, and modern area in
            San Antonio that still keeps the city’s culture, the Lone Star
            District is where everything is happening. It blends history, river
            access, and new apartment developments in a way that feels fresh
            without losing the personality of the city.
          </p>

          <h2>Where the Lone Star District Fits Into San Antonio’s Growth</h2>
          <p>
            Located just south of downtown, the district connects brewery
            heritage, warehouse buildings, and a prime stretch of the river with
            new residential and retail developments. For years, locals viewed
            this area as a place with potential. Now that potential is turning
            into real momentum.
          </p>

          <p>
            The Lone Star District offers a rare mix of scenic river access,
            historic charm, and new construction. It sits minutes from downtown
            employers, the Tech District, Market Square, and the River Walk,
            while still feeling like a neighborhood with room to grow. This
            makes it a prime spot for people who want to be early adopters in an
            area that is clearly becoming a major part of San Antonio’s urban
            future.
          </p>

          <h2>Major Apartment Developments in the Lone Star District</h2>
          <p>
            A significant part of the district’s growth is the wave of new
            apartment communities being developed around it. These residences
            are reshaping the downtown border and bringing modern living options
            to an area that never had this level of residential quality before.
          </p>

          <h3>Lone Star Brewery Redevelopment</h3>
          {IMG_LONE_STAR_BREWERY && (
            <img
              src={IMG_LONE_STAR_BREWERY}
              alt="Lone Star Brewery Redevelopment San Antonio"
              style={{
                width: "100%",
                marginBottom: "20px",
                borderRadius: "8px",
              }}
            /> */}
          )}
          <p>
            The Lone Star Brewery project is the centerpiece of the district’s
            redevelopment. The plan includes more than
            <strong>
              one million square feet of multi family residential space
            </strong>
            along with restaurants, retail, green spaces, and direct river
            access. It is one of the most ambitious redevelopment projects
            underway in the city.
          </p>

          <h3>The Continental Residences</h3>
          {IMG_CONTINENTAL && (
            <img
              src={IMG_CONTINENTAL}
              alt="The Continental Residences San Antonio Lone Star District"
              style={{
                width: "100%",
                marginBottom: "20px",
                borderRadius: "8px",
              }}
            /> */}
          )}
          <p>
            The Continental Residences is bringing luxury high rise living to
            the Lone Star District. This sixteen story, two hundred ninety unit
            tower includes designer interiors, skyline views, and amenities that
            feel like a boutique hotel.
          </p>

          <p>
            Residents can enjoy a rooftop pool, sky lounge, fitness center, co
            working spaces, garage parking, and a full pet spa with a dog park
            onsite. Pre leasing is underway with move ins targeted for January
            twenty twenty six.
          </p>

          <h3>Tower Life Building Conversion</h3>
          {IMG_TOWER_LIFE && (
            <img
              src={IMG_TOWER_LIFE}
              alt="Tower Life Building Apartments San Antonio"
              style={{
                width: "100%",
                marginBottom: "20px",
                borderRadius: "8px",
              }}
            /> */}
          )}
          <p>
            The Tower Life Building is being transformed from office space into
            luxury residential homes. With tall ceilings, historic character,
            and updated finishes, this project will offer a blend of vintage
            architecture and modern living.
          </p>

          <h2>Why Renters Are Looking Toward the Lone Star District</h2>

          <ul style={{ paddingLeft: "20px", lineHeight: "1.8" }}>
            <li>Walkable access to the river and downtown</li>
            <li>New apartments with luxury amenities</li>
            <li>Close to the Tech District and downtown employers</li>
            <li>Backed by major redevelopment investment</li>
            <li>New restaurants, bars, and entertainment on the way</li>
          </ul>

          <h2>How We Help You Get Into These New Developments</h2>
          <p>
            Leasing updates can change quickly with new construction. Our team
            tracks <strong>new downtown apartment developments</strong>
            including pricing, specials, and pre lease openings.
          </p>

          <ul style={{ paddingLeft: "20px", lineHeight: "1.8" }}>
            <li>Real time updates on new developments</li>
            <li>Help securing pre lease opportunities</li>
            <li>Support with approval guidelines</li>
            <li>Walkthroughs of similar properties</li>
            <li>
              Up to two hundred dollars cash rebate or free movers when you list
              Jay Morris with AptAmigo on your application
            </li>
          </ul>

          <h2>Frequently Asked Questions</h2>
          <div style={{ borderTop: "1px solid #ddd", paddingTop: "15px" }}>
            {faqs.map((faq, index) => (
              <div key={index} style={{ marginBottom: "15px" }}>
                    fontWeight: 600,
                    color: "#004aad",
                  }}
                >
                  {faq.question}
                </div>
                {activeIndex === index && (
                      marginTop: "-5px",
                      color: "#555",
                    }}
                  >
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </> */}
      }
    /> */}
  );
};

export default LoneStarDistrictNewSanAntonioNeighborhood;
