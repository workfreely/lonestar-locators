/**
 * Google Maps bootstrap — loaded exactly once, resolved only when genuinely usable.
 *
 * WHY THIS IS NOT JUST `script.onload`
 * With `loading=async` the script URL returns a small BOOTSTRAP, not the API. Its
 * `onload` fires long before `google.maps.Map` or `google.maps.importLibrary`
 * exist, so resolving there and immediately constructing a map throws — which is
 * exactly the "map could not be loaded" failure this replaces. We therefore wait
 * for the documented `callback`, and then for `importLibrary` to actually be a
 * function, before anyone is allowed to touch the API.
 *
 * Everything after that goes through `importLibrary`, which is itself idempotent:
 * asking for a library twice returns the same module rather than refetching.
 *
 * The single module-level promise is what makes React re-renders, Strict Mode's
 * double-effect and remounting the Explorer safe — the script is injected once and
 * every caller awaits the same promise.
 */
let bootstrap: Promise<void> | null = null

export class MapsConfigError extends Error {}

const CALLBACK = "__lbGoogleMapsReady"
const SCRIPT_ID = "lb-google-maps"

/** True once the real API (not the bootstrap stub) has defined importLibrary. */
function importLibraryReady(): boolean {
  return typeof (window as any).google?.maps?.importLibrary === "function"
}

/** Poll briefly for importLibrary — the callback can fire a tick before it lands. */
function waitForImportLibrary(timeoutMs = 10_000): Promise<void> {
  if (importLibraryReady()) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      if (importLibraryReady()) return resolve()
      if (Date.now() - started > timeoutMs) {
        return reject(new Error("google.maps.importLibrary never became available"))
      }
      setTimeout(tick, 50)
    }
    tick()
  })
}

function loadBootstrap(): Promise<void> {
  if (bootstrap) return bootstrap

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  if (!key) {
    // Surfaced as an in-panel state, never a crash that takes the CRM down.
    bootstrap = Promise.reject(new MapsConfigError("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set"))
    return bootstrap
  }

  bootstrap = new Promise<void>((resolve, reject) => {
    if (importLibraryReady()) return resolve()

    // Another instance already injected it — await the same script element.
    const existing = document.getElementById(SCRIPT_ID)
    if (existing) {
      waitForImportLibrary().then(resolve, reject)
      return
    }

    // Google calls this when the API is ready. Waiting on it (rather than onload)
    // is the whole point.
    ;(window as any)[CALLBACK] = () => {
      waitForImportLibrary().then(resolve, reject)
    }

    const s = document.createElement("script")
    s.id = SCRIPT_ID
    s.async = true
    // No `libraries=` param: libraries are pulled explicitly via importLibrary, which
    // is the modern pattern. Mixing the two is what produced the broken stub.
    s.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}` +
      `&v=weekly&loading=async&callback=${CALLBACK}`
    s.onerror = () => reject(new Error("Google Maps script failed to load"))
    document.head.appendChild(s)
  })

  return bootstrap
}

/**
 * Await the bootstrap, then import the libraries this feature uses. Returns only
 * when `new google.maps.Map(...)` and `Place.searchNearby` are genuinely callable.
 */
export async function loadGoogleMaps(): Promise<{
  maps: google.maps.MapsLibrary
  places: google.maps.PlacesLibrary
  marker: google.maps.MarkerLibrary
}> {
  await loadBootstrap()
  const importLibrary = (window as any).google.maps.importLibrary as (
    name: string,
  ) => Promise<unknown>

  // importLibrary de-duplicates internally, so this is safe on every mount.
  const [maps, places, marker] = await Promise.all([
    importLibrary("maps") as Promise<google.maps.MapsLibrary>,
    importLibrary("places") as Promise<google.maps.PlacesLibrary>,
    importLibrary("marker") as Promise<google.maps.MarkerLibrary>,
  ])
  return { maps, places, marker }
}
