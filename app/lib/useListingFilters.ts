"use client";

import { useState } from "react";

export type ListingFilters = {
  beds: string;
  baths: string;
  price: string;
  propertyType: string;
  neighborhoods: string[];
  submarkets: string[];
};

export function useListingFilters() {
  const [filters, setFilters] = useState<ListingFilters>({
    beds: "",
    baths: "",
    price: "",
    propertyType: "",
    neighborhoods: [],
    submarkets: [],
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;

    // ✅ Neighborhood checkboxes
    if (
      type === "checkbox" &&
      name === "neighborhoods" &&
      e.target instanceof HTMLInputElement
    ) {
      const { checked } = e.target;
      const updated = checked
        ? [...filters.neighborhoods, value]
        : filters.neighborhoods.filter((n) => n !== value);

      setFilters({ ...filters, neighborhoods: updated });
      return;
    }

    // ✅ Submarket checkboxes
    if (
      type === "checkbox" &&
      name === "submarkets" &&
      e.target instanceof HTMLInputElement
    ) {
      const { checked } = e.target;
      const updated = checked
        ? [...filters.submarkets, value]
        : filters.submarkets.filter((s) => s !== value);

      setFilters({ ...filters, submarkets: updated });
      return;
    }

    // ✅ Normal dropdowns
    setFilters((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const resetFilters = () =>
    setFilters({
      beds: "",
      baths: "",
      price: "",
      propertyType: "",
      neighborhoods: [],
      submarkets: [],
    });

  return { filters, setFilters, handleChange, resetFilters };
}
