import React from "react";
import Link from "next/link";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ items }) => {
  return (
    <nav style={{ fontSize: "14px", margin: "-8px 0 15px 0" }}>
      {items.map((item, index) => (
        <span key={index}>
          {item.href ? (
            <Link
              href={item.href}
              style={{
                textDecoration: "none",
                color: "#2ecc71",
                fontWeight: "bold",
              }}
            >
              {item.label}
            </Link>
          ) : (
            <span>{item.label}</span>
          )}
          {index < items.length - 1 && " / "}
        </span>
      ))}
    </nav>
  );
};

export default Breadcrumbs;
