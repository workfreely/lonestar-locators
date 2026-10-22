import { notFound } from "next/navigation"
import { utmSourceForSlug } from "@/app/smart-lead-form/_lib/shareConfig"
import PublicFormView, { publicFormMetadata } from "../_lib/publicForm"

export const dynamic = "force-dynamic"

// CLEAN BRANDED SOURCE LINK — locatorbeast.com/{username}/{source}
//
// SERVED DIRECTLY, NOT REDIRECTED. This route renders the same PublicFormView the base URL renders,
// so the visitor's experience is "tap link → form": one request, no intermediate page, no client-side
// hop, nothing to flash. A redirect would have cost an extra round trip on exactly the mobile
// social-app traffic these links exist for.
//
// The source segment only decides which utm_source the form falls back to. It never changes the
// form, its fields, or how the lead is created.
//
// Static siblings win: /{username}/thank-you and /{username}/out-of-office are real routes and Next
// matches them before this dynamic segment, so they are unaffected.
export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  // Same preview as the base link — a branded URL shared into iMessage or a bio must not look
  // different from the plain one.
  return publicFormMetadata(username)
}

export default async function BrandedSourceFormPage({
  params,
}: {
  params: Promise<{ username: string; source: string }>
}) {
  const { username, source } = await params

  // UNKNOWN SLUG → 404, deliberately.
  //
  // The alternative — render the form with no attribution — would turn every arbitrary path under
  // an agent's slug into a live copy of their form, an unbounded and indexable URL surface. Every
  // slug that reaches a real visitor is one WE generated in the Share panel, so an unrecognised one
  // is a broken link, not a lead to rescue. Failing here also guarantees the thing the brief asked
  // for: a source is never invented. 404 matches the existing unknown-agent behaviour exactly.
  const pathUtmSource = utmSourceForSlug(source)
  if (!pathUtmSource) {
    notFound()
  }

  return <PublicFormView username={username} pathUtmSource={pathUtmSource} sourceSlug={source} />
}
