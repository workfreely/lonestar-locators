// Lightweight User-Agent parsing for marketing attribution — device type,
// browser, and OS only. Deliberately not a full UA-parsing library: this
// covers the handful of common cases needed for the Performance page
// without adding a new dependency. Pure function, no DOM/window access
// beyond the string passed in, so it's callable from any client component.

export type ParsedUserAgent = {
  deviceType: "mobile" | "tablet" | "desktop"
  browser: string
  operatingSystem: string
}

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  const s = ua || ""

  // ── Device type ──
  let deviceType: ParsedUserAgent["deviceType"] = "desktop"
  if (/iPad|Tablet(?!.*Mobile)/i.test(s)) {
    deviceType = "tablet"
  } else if (/Mobi|Android|iPhone|iPod/i.test(s)) {
    deviceType = "mobile"
  }

  // ── Browser (order matters — Edge/Chrome UAs also contain "Safari") ──
  let browser = "Other"
  if (/Edg\//i.test(s)) browser = "Edge"
  else if (/OPR\/|Opera/i.test(s)) browser = "Opera"
  else if (/CriOS/i.test(s)) browser = "Chrome" // Chrome on iOS
  else if (/FxiOS/i.test(s)) browser = "Firefox" // Firefox on iOS
  else if (/Firefox\//i.test(s)) browser = "Firefox"
  else if (/Chrome\//i.test(s)) browser = "Chrome"
  else if (/Safari\//i.test(s) && /Version\//i.test(s)) browser = "Safari"

  // ── Operating system ──
  let operatingSystem = "Other"
  if (/iPhone|iPad|iPod/i.test(s)) operatingSystem = "iOS"
  else if (/Android/i.test(s)) operatingSystem = "Android"
  else if (/Windows/i.test(s)) operatingSystem = "Windows"
  else if (/Mac OS X/i.test(s)) operatingSystem = "macOS"
  else if (/Linux/i.test(s)) operatingSystem = "Linux"

  return { deviceType, browser, operatingSystem }
}
