/**
 * VOICE CLIP LOUDNESS — one recording, measured and brought to a known level.
 *
 * Jay's 58 recordings arrived at a mean of −21.3 LUFS, spread across 8.3 dB, with 54 of them
 * below −18. On a bed of property-video audio sitting near −16, a −25 LUFS hook is simply not
 * audible as the lead voice. This is what fixes that.
 *
 * ── WHY SIMPLE GAIN DOES NOT WORK ───────────────────────────────────────────────────────────
 * Measured across the real library: reaching −16 by gain alone would push 33 of the 58 past
 * −1 dBTP, the worst by +5.08 dB. Gain is the obvious tool and it is the wrong one — the quiet
 * recordings are quiet BECAUSE they have wide peaks relative to their average, so lifting the
 * average lifts the peaks straight through the ceiling.
 *
 * loudnorm in two-pass mode solves exactly this: pass one measures, pass two applies gain AND
 * limits to the true-peak ceiling. `linear=true` makes it a single gain factor rather than a
 * moving one, which is what keeps delivery natural; when a file physically cannot reach the
 * target under the ceiling, it UNDER-delivers rather than pumping. Two files land at −16.9 and
 * −17.4 for that reason, and that is the correct trade.
 *
 * ── COMPRESSION, ONLY WHERE IT EARNS ITS PLACE ──────────────────────────────────────────────
 * For the widest-crest recordings, gentle compression before loudnorm recovers most of the
 * shortfall: the worst case went −17.35 → −16.78 with no measurable loss of character. It is
 * applied only when the crest factor says it is needed — 17 of 58 — because compressing a
 * recording that does not need it is how a natural voice starts sounding processed.
 *
 * ── WHAT THIS DOES NOT DO ───────────────────────────────────────────────────────────────────
 * It does not trim silence. The library averages 0.42 s of lead and 0.96 s of tail, and a test
 * render proved that removing it made the finished video WORSE, not better: with the CTA
 * anchored near the end, shortening the clips just moved the silence into the middle — 9.12 s of
 * dead air against 6.69 s, 47% speech coverage against 60%. Timing is preserved until the
 * renderer can place a CTA relative to the hook rather than to the end of the video.
 *
 * It also does not touch the original. Every output is a derivative; the uploaded file is kept
 * exactly as recorded.
 */

/** The target every voice clip is brought to. Configurable in one place, on purpose. */
export const VOICE_NORMALIZE = {
  targetLufs: -16,
  /**
   * WHAT loudnorm IS ASKED FOR — deliberately below where the stored file must land.
   *
   * loudnorm hits its PCM target exactly; the AAC encode that follows adds intersample peak.
   * Measured on the worst clip in the library, same file, three asks:
   *
   *       asked    PCM      AAC
   *       −1.5     −1.50    −0.87     +0.63 of encoder overshoot
   *       −2.0     −2.00    −1.34     +0.66
   *       −2.5     −2.50    −2.03     +0.47
   *
   * Asking for −1.5 and calling the result a −1.5 dBTP file was simply wrong: it stores −0.87.
   * Asking for −2.0 leaves the encoder its ~0.6 dB and keeps every stored clip under the
   * `maxEncodedTruePeakDb` guarantee below, which is the number that actually describes the
   * file on disk.
   */
  truePeakDb: -2.0,
  /** What a STORED clip must measure. The importer warns above this; nothing silently passes. */
  maxEncodedTruePeakDb: -1.0,
  loudnessRange: 11,
  /** Above this peak-to-loudness ratio, gain alone cannot reach the target under the ceiling. */
  compressAboveCrestDb: 16,
  /** Gentle: 2:1 over −18 dB. Enough to close the gap, not enough to flatten delivery. */
  compressor: "acompressor=threshold=-18dB:ratio=2:attack=10:release=200:makeup=1",
  sampleRate: 48000,
  bitrateKbps: 128,
} as const

/** What pass one of loudnorm reports. */
export type LoudnessMeasurement = {
  inputI: number
  inputTp: number
  inputLra: number
  inputThresh: number
}

/** Peak-to-loudness ratio — how far the peaks sit above the average. The decision input for
 *  whether compression is warranted. */
export function crestFactorDb(m: Pick<LoudnessMeasurement, "inputI" | "inputTp">): number {
  return m.inputTp - m.inputI
}

export function needsCompression(m: Pick<LoudnessMeasurement, "inputI" | "inputTp">): boolean {
  return crestFactorDb(m) > VOICE_NORMALIZE.compressAboveCrestDb
}

/**
 * Parse the JSON loudnorm prints on stderr.
 *
 * It prints a JSON object at the END of stderr, after everything else ffmpeg has to say, so this
 * matches the LAST occurrence of each key rather than the first — an input file whose metadata
 * happens to contain one of these words cannot shadow the real measurement.
 */
export function parseLoudnorm(stderr: string): LoudnessMeasurement | null {
  const pick = (key: string): number | null => {
    const all = [...stderr.matchAll(new RegExp(`"${key}"\\s*:\\s*"(-?[\\d.]+|-?inf)"`, "g"))]
    if (all.length === 0) return null
    const raw = all[all.length - 1][1]
    if (raw === "-inf" || raw === "inf") return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }
  const inputI = pick("input_i")
  const inputTp = pick("input_tp")
  const inputLra = pick("input_lra")
  const inputThresh = pick("input_thresh")
  if (inputI === null || inputTp === null || inputLra === null || inputThresh === null) return null
  return { inputI, inputTp, inputLra, inputThresh }
}

/** PASS ONE — the filter that measures. Includes the compressor when the caller already knows it
 *  is needed, because loudnorm must measure what it will actually be given. */
export function measureFilter(withCompression: boolean): string {
  const pre = withCompression ? `${VOICE_NORMALIZE.compressor},` : ""
  return `${pre}loudnorm=I=${VOICE_NORMALIZE.targetLufs}:TP=${VOICE_NORMALIZE.truePeakDb}:LRA=${VOICE_NORMALIZE.loudnessRange}:print_format=json`
}

/**
 * PASS TWO — the filter that applies, using pass one's numbers.
 *
 * `linear=true` is the setting that keeps the voice sounding like the voice: one gain factor for
 * the whole clip rather than a level that moves under the words.
 */
export function applyFilter(m: LoudnessMeasurement, withCompression: boolean): string {
  const pre = withCompression ? `${VOICE_NORMALIZE.compressor},` : ""
  return [
    `${pre}loudnorm=linear=true`,
    `I=${VOICE_NORMALIZE.targetLufs}`,
    `TP=${VOICE_NORMALIZE.truePeakDb}`,
    `LRA=${VOICE_NORMALIZE.loudnessRange}`,
    `measured_I=${m.inputI}`,
    `measured_TP=${m.inputTp}`,
    `measured_LRA=${m.inputLra}`,
    `measured_thresh=${m.inputThresh}`,
  ].join(":")
}

/** The encoder settings for a derivative. AAC at 128k/48k matches what the renderer mixes at, so
 *  the clip is never resampled on its way into the graph. */
export function encodeArgs(): string[] {
  return ["-c:a", "aac", "-b:a", `${VOICE_NORMALIZE.bitrateKbps}k`, "-ar", String(VOICE_NORMALIZE.sampleRate)]
}
