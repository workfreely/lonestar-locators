// Types for the location_clusters table.
//
// Apartment-locating-accuracy-prioritized neighborhood/area clusters
// (e.g. "Stone Oak", "La Cantera / The Rim") used by the matching engine's
// location-intelligence layer. Schema-only for now — not yet wired into
// calculateMatchScore.

export type LocationCluster = {
  id: string

  cluster_id:   string  // stable slug, e.g. "stone_oak"
  cluster_name: string  // display name, e.g. "Stone Oak"
  city_slug:    string  // e.g. "san-antonio", "new-braunfels", "san-marcos"

  core_zips:   string[]  // ZIPs that define the heart of the cluster
  nearby_zips: string[]  // adjacent/overlapping ZIPs, lower-confidence match

  property_keywords: string[]  // free-text terms matched against property name/address
  aliases:           string[]  // short canonical names, e.g. "La Cantera", "The Rim"
  landmarks:         string[]  // destination/POI keywords, e.g. "Six Flags Fiesta Texas"
  corridor_keywords: string[]  // road/highway/loop-position search-intent terms, e.g. "Loop 1604 West" — maps to multiple clusters
  nearby_clusters:   string[]  // cluster_id references for radius-expansion logic

  created_at: string
  updated_at: string
}

// Subset used when inserting/upserting seed or admin-managed clusters
export type LocationClusterUpsert = Omit<LocationCluster, "id" | "created_at" | "updated_at">
