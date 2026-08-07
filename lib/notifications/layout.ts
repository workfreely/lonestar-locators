import { BRAND } from "./branding"

// Reusable, table-based email layout for all Locator Beast notifications.
// Deliberately inline-styled and table-driven (not flexbox/grid) because that's
// the only thing that renders consistently across email clients (Gmail, Outlook,
// Apple Mail). The outer canvas + centered white card mirror the existing Lone
// Star Locators email layout (app/api/templates/*) so the two products feel
// related, while the header/footer carry Locator Beast branding.
//
// Composition model — every template is built from the same pieces:
//   • Branding  → the dark header wordmark + footer (this file)
//   • Title     → `heading`
//   • Body      → `contentHtml` (compose with the paragraph()/infoTable() helpers)
//   • CTA button→ `cta`
//   • Footer    → support line + optional note (this file)

// HTML-escape any dynamic/user-supplied value before it goes into email HTML.
// Lead names, notes, etc. are untrusted input — never interpolate them raw.
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

// Reusable paragraph block.
export function paragraph(html: string): string {
  return `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:${BRAND.inkSoft};">${html}</p>`
}

// Reusable CTA button. Bulletproof-ish anchor button (padding on the <a>) so it
// renders as a real button in every client without VML.
export function button(label: string, url: string): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 8px 0;">
    <tr>
      <td align="center" bgcolor="${BRAND.blue}" style="border-radius:9999px;">
        <a href="${url}" target="_blank"
           style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:9999px;">
          ${esc(label)}
        </a>
      </td>
    </tr>
  </table>`
}

// Reusable label/value table — used for lead details and any structured summary.
// Values are escaped here; labels are trusted (developer-supplied) constants.
export function infoTable(rows: { label: string; value: string | null | undefined }[]): string {
  const body = rows
    .filter((r) => r.value !== undefined && r.value !== null && String(r.value).trim() !== "")
    .map(
      (r) => `
      <tr>
        <td style="padding:8px 0;font-size:13px;color:${BRAND.inkSoft};width:160px;vertical-align:top;">${esc(
          r.label
        )}</td>
        <td style="padding:8px 0;font-size:14px;color:${BRAND.ink};font-weight:600;vertical-align:top;">${esc(
          r.value
        )}</td>
      </tr>`
    )
    .join("")
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid ${BRAND.border};margin:4px 0 20px 0;">${body}</table>`
}

export type EmailLayoutInput = {
  /** Hidden inbox-preview text shown after the subject in most clients. */
  preheader?: string
  /** Main headline inside the card. */
  heading: string
  /** Pre-built HTML body (use paragraph()/infoTable()/etc. to compose). */
  contentHtml: string
  /** Optional primary call-to-action button. */
  cta?: { label: string; url: string }
  /** Optional small print above the standard footer. */
  footerNote?: string
  /**
   * Optional city-skyline banner shown at the very top (above the wordmark).
   * Absolute URL from the shared theme registry (see cityHeader.ts). Rendered
   * inside the dark branded band with a `!mso` guard, so clients that can't show
   * the image (Outlook desktop / .webp) fall back to the neutral branded band —
   * never a broken image. The band is Locator-Beast-branded regardless; the
   * image only follows the LEAD's market.
   */
  bannerImageUrl?: string | null
  bannerAlt?: string
}

export function renderEmail({ preheader, heading, contentHtml, cta, footerNote, bannerImageUrl, bannerAlt }: EmailLayoutInput): string {
  const year = "2026"
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="x-apple-disable-message-reformatting" />
<title>${esc(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.pageBg};-webkit-text-size-adjust:100%;">
${
  preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>`
    : ""
}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${
    BRAND.pageBg
  };">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;background:${
        BRAND.cardBg
      };border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(5,7,13,0.06);">
        <!-- City skyline banner (optional) + Locator Beast wordmark. The band is
             always the dark brand color, so a client that can't render the image
             (Outlook desktop / .webp) shows a clean neutral branded header. -->
        ${
          bannerImageUrl
            ? `<tr>
          <td bgcolor="${BRAND.ink}" style="background:${BRAND.ink};font-size:0;line-height:0;">
            <!--[if !mso]><!-->
            <img src="${bannerImageUrl}" alt="${esc(bannerAlt ?? "")}" width="600"
                 style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;" />
            <!--<![endif]-->
          </td>
        </tr>`
            : ""
        }
        <!-- Branding header -->
        <tr>
          <td align="center" bgcolor="${BRAND.ink}" style="background:${
    BRAND.ink
  };padding:${bannerImageUrl ? "16px" : "26px"} 40px;">
            <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;letter-spacing:-0.01em;color:#ffffff;">Locator&nbsp;Beast</span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:36px 40px 32px 40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <h1 style="margin:0 0 18px 0;font-size:22px;line-height:1.3;font-weight:700;color:${
              BRAND.ink
            };">${esc(heading)}</h1>
            ${contentHtml}
            ${cta ? button(cta.label, cta.url) : ""}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px 32px 40px;border-top:1px solid ${
            BRAND.border
          };font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            ${
              footerNote
                ? `<p style="margin:0 0 12px 0;font-size:12px;line-height:1.6;color:${BRAND.inkSoft};">${footerNote}</p>`
                : ""
            }
            <p style="margin:0 0 6px 0;font-size:12px;line-height:1.6;color:${BRAND.inkSoft};">
              Need help? Reach us at
              <a href="mailto:${BRAND.supportEmail}" style="color:${BRAND.blue};text-decoration:none;">${
    BRAND.supportEmail
  }</a>.
            </p>
            <p style="margin:0;font-size:12px;line-height:1.6;color:#9098a8;">
              &copy; ${year} ${esc(BRAND.name)} &middot;
              <a href="${BRAND.siteUrl}" style="color:#9098a8;text-decoration:underline;">locatorbeast.com</a>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}
