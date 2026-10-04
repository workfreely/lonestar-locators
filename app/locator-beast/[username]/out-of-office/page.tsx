import OutOfOfficeView from "./OutOfOfficeView"

/**
 * PUBLIC OUT-OF-OFFICE LANDING PAGE — /{username}/out-of-office
 *
 * The page itself now lives in OutOfOfficeView so the authenticated preview at
 * /admin/out-of-office/preview can render the EXACT same component rather than a
 * copy that would drift from it.
 *
 * This route is unchanged in behaviour: it does not pass `preview`, so the gate
 * is exactly what it always was — an unknown username or a locator who is not
 * currently away is a 404. There is no query parameter that can relax that from
 * out here; `preview` is a prop, and the only caller that sets it is a route
 * behind requireWorkspaceMember() that resolves the username from the session.
 */
export const dynamic = "force-dynamic"

export default async function OutOfOfficePage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params
  return <OutOfOfficeView username={username} />
}
