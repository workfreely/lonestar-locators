"use client";

import React from "react";

type Testimonial = {
  name: string;
  location: string;
  text: string;
};

type TestimonialsSectionProps = {
  title?: string;
  testimonials: Testimonial[];
};

const TestimonialsSection: React.FC<TestimonialsSectionProps> = ({
  title = "What Clients Are Saying",
  testimonials,
}) => {
  return (
    <section
      style={{
        maxWidth: "1200px",
        margin: "3.5rem auto",
        padding: "1rem",
      }}
    >
      <h2
        style={{
          textAlign: "center",
          fontSize: "2.25rem",
          fontWeight: 800,
          marginBottom: "2rem",
          color: "#222",
        }}
      >
        {title}
      </h2>

      {/* ✅ GRID — FIXED WIDTH CARDS */}
      <div className="testimonial-grid">
        {testimonials.slice(0, 3).map((review, i) => (
          <div key={i} className="testimonial-card">
            <p className="testimonial-text">“{review.text}”</p>

            <div className="testimonial-footer">
              <div className="testimonial-name">{review.name}</div>
              <div className="testimonial-location">{review.location}</div>
              <div className="testimonial-stars">★★★★★</div>
            </div>
          </div>
        ))}
      </div>

      {/* ✅ STYLES */}
      <style jsx>{`
        .testimonial-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.75rem;
        }

        .testimonial-card {
          display: flex;
          flex-direction: column;
          padding: 1.75rem;
          background: #ffffff;
          border-radius: 14px;
          box-shadow: 0 8px 22px rgba(0, 0, 0, 0.08);
          transition: transform 0.3s ease, box-shadow 0.3s ease;
          height: 100%;
        }

        .testimonial-card:hover {
          transform: translateY(-6px);
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.12);
        }

        .testimonial-text {
          font-size: 1.1rem;
          line-height: 1.7;
          color: #444;
          margin-bottom: 2rem;
        }

        .testimonial-footer {
          margin-top: auto;
        }

        .testimonial-name {
          font-weight: 600;
          font-size: 1rem;
          color: #222;
          margin-bottom: 0.25rem;
        }

        .testimonial-location {
          font-size: 0.95rem;
          color: #555;
          margin-bottom: 0.75rem;
        }

        .testimonial-stars {
          color: #f5a623;
          font-size: 1.8rem;
          letter-spacing: 3px;
          line-height: 1;
        }

        /* ✅ RESPONSIVE */
        @media (max-width: 1024px) {
          .testimonial-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 640px) {
          .testimonial-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
};

export default TestimonialsSection;
