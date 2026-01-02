import React from "react";
import Link from "next/link";

<Link href="/start-your-search">Start Your Search</Link>



const NavigationBar = () => {
  return (
    <nav
      aria-label="Main Navigation"
      style={{
        backgroundColor: "#fff",
        padding: "1rem 2rem",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        position: "sticky",
        top: 0,
        zIndex: 1000,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      {/* Logo */}
      <Link
        href="/"
        style={{
          display: "flex",
          alignItems: "center",
          textDecoration: "none",
        }}
      >
        <img
          src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1747932834/lone-star-locators-logo_wn85wu.png"
          alt="Lone Star Locators Logo"
          style={{ height: "50px", marginRight: "0.5rem" }}
        />
      </Link>

      {/* Links */}
      <div>
        <Link
          href="/how-it-works"
          style={{
            color: "#333",
            marginRight: "1rem", 
            textDecoration: "none",
            fontSize: "1.1rem", // 👈 slightly larger
            fontWeight: 600, // 👈 makes it stand out
          }}
        >
          How It Works
        </Link>
        <span className="hide-on-mobile">
          <Link
            href="/start-your-search"
            style={{
              color: "#333",
              textDecoration: "none",
              fontSize: "1.1rem", // 👈 match size
              fontWeight: 600,
            }}
          >
            Start Your Search
          </Link>
          <Link
            href="/report-lease"
            style={{
              backgroundColor: "#28a745", // green button
              color: "#fff",
              padding: "0.5rem 1rem",
              borderRadius: "6px",
              textDecoration: "none",
              fontSize: "1.1rem",
              fontWeight: 600,
              marginLeft: "1rem",
            }}
          >
            Report Your Lease
          </Link>
        </span>
      </div>
    </nav>
  );
};

export default NavigationBar;
