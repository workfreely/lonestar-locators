// Shared row shapes for the Beast Network page, mirroring the RPC return columns.

// lb_network_downline row
export type DownlineMember = {
  depth: number
  display_name: string
  photo_url: string | null
  joined_date: string | null
  status: string | null
}

// lb_list_network_members row (admin panel)
export type AdminMember = {
  user_id: string
  display_name: string
  photo_url: string | null
  sponsor_name: string | null
  applied_at: string | null
  approved_at: string | null
  status: string | null
}
