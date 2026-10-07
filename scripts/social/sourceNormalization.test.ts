// Source normalization for the TikTok-downloaded library: already platform-compressed, often below
// 1080×1920, often 60fps, sometimes HLG/BT.2020 HDR. These guard the decisions that keep the ONE
// delivery encode from adding avoidable loss.
import { parseSourceInfo, buildSourceChain, outputFps, buildFfmpegArgs, buildVideoFilter, audioArgs, isTrustworthyHdr, DELIVERY } from "@/lib/social/renderVideo"

let pass = 0, fail = 0
const ok = (label: string, cond: boolean) => { if (cond) { pass++; console.log("  ✓", label) } else { fail++; console.log("  ✗", label) } }

// The exact banner ffmpeg prints for a real iPhone-shot, TikTok-downloaded clip in this library.
const HDR_TIKTOK = `
  Duration: 00:00:06.18, start: 0.000000, bitrate: 4660 kb/s
  Stream #0:0[0x1](eng): Video: hevc (Main 10) (hvc1 / 0x31637668), yuv420p10le(tv, bt2020nc/bt2020/arib-std-b67), 718x1280, 4527 kb/s, 60 fps, 60 tbr, 1000k tbn (default)
  Stream #0:1[0x2](eng): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 127 kb/s (default)
`
const SDR_1080 = `
  Duration: 00:00:12.00, start: 0.000000, bitrate: 6000 kb/s
  Stream #0:0: Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1080x1920, 5800 kb/s, 30 fps, 30 tbr, 15360 tbn
  Stream #0:1: Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 128 kb/s
`
const NO_AUDIO_MP3 = `
  Stream #0:0: Video: h264, yuv420p(tv, bt709), 1080x1920, 30 fps
  Stream #0:1: Audio: mp3 (mp4a / 0x6134706D), 44100 Hz, stereo
`

console.log("parseSourceInfo:")
{
  const i = parseSourceInfo(HDR_TIKTOK)
  ok("reads resolution from the video line", i.width === 718 && i.height === 1280)
  ok("reads frame rate", i.fps === 60)
  ok("detects HLG/BT.2020 as HDR", i.isHdr === true)
  ok("reads the audio codec", i.audioCodec === "aac")
  ok("flags a source below the delivery canvas", i.belowDelivery === true)
  // The codec tag "0x31637668" contains digits; the resolution must still be read correctly.
  ok("codec tag digits are not mistaken for a resolution", i.width === 718)

  const s = parseSourceInfo(SDR_1080)
  ok("an SDR BT.709 source is NOT flagged as HDR", s.isHdr === false)
  ok("a 1080×1920 source is not flagged as below delivery", s.belowDelivery === false)

  ok("a non-aac audio codec is reported as itself", parseSourceInfo(NO_AUDIO_MP3).audioCodec === "mp3")
  const empty = parseSourceInfo("")
  ok("an unreadable probe degrades instead of throwing", empty.width === null && empty.fps === null && empty.isHdr === false && empty.belowDelivery === false)
}

console.log("\nbuildSourceChain — order is the correctness property:")
{
  const hdr = buildSourceChain({ isHdr: true, width: 718, height: 1280 })
  const sdr = buildSourceChain({ isHdr: false, width: 718, height: 1280 })
  // NB: match the resize step explicitly — `zscale=` also contains the substring "scale=".
  const resizeAt = hdr.indexOf(`scale=${DELIVERY.w}:${DELIVERY.h}`)
  ok("HDR tone-maps BEFORE scaling (linear light, at source resolution)", hdr.indexOf("tonemap") < resizeAt)
  ok("HDR converts back to bt709 before the scale", hdr.indexOf("p=bt709") < resizeAt)
  ok("SDR does NOT tone-map", !sdr.includes("tonemap") && !sdr.includes("zscale"))
  ok("both scale with LANCZOS", hdr.includes("flags=lanczos") && sdr.includes("flags=lanczos"))
  ok("both crop to the delivery canvas", hdr.includes(`crop=${DELIVERY.w}:${DELIVERY.h}`) && sdr.includes(`crop=${DELIVERY.w}:${DELIVERY.h}`))
  ok("format=yuv420p is LAST, so earlier steps keep full precision", hdr.trim().endsWith("format=yuv420p") && sdr.trim().endsWith("format=yuv420p"))
  // Explicitly NOT sharpening compressed sources.
  ok("no sharpening is applied", !/unsharp|smartblur|cas\b/.test(hdr + sdr))
}

console.log("\noutputFps — preserve the source rate:")
{
  ok("60fps source emits NO -r (stays 60)", outputFps({ fps: 60 }) === null)
  ok("30fps source emits no -r either", outputFps({ fps: 30 }) === null)
  ok("above 60 is capped to 60", outputFps({ fps: 120 }) === 60)
  ok("unknown rate falls back to 30", outputFps({ fps: null }) === 30)
}

console.log("\nbuildFfmpegArgs — one encode, no avoidable generations:")
{
  const src = parseSourceInfo(HDR_TIKTOK)
  const a = buildFfmpegArgs({ sourcePath: "/s.mov", outputPath: "/o.mp4", filter: "[0:v]null[v]", audioChoice: "original", source: src })
  ok("60fps source does not get -r (no resampling)", !a.includes("-r"))
  ok("untouched AAC audio is STREAM-COPIED, not re-encoded", a.join(" ").includes("-c:a copy"))
  ok("output is tagged bt709", a.includes("-color_primaries") && a.includes("bt709"))
  ok("single video encode at the delivery quality", a.join(" ").includes("-c:v libx264 -preset slow -crf 18"))

  const noSrc = buildFfmpegArgs({ sourcePath: "/s.mov", outputPath: "/o.mp4", filter: "[0:v]null[v]", audioChoice: "original" })
  ok("without a probe, the historical 30fps default still applies", noSrc.includes("-r") && noSrc[noSrc.indexOf("-r") + 1] === "30")

  const mp3 = buildFfmpegArgs({ sourcePath: "/s.mov", outputPath: "/o.mp4", filter: "[0:v]null[v]", audioChoice: "original", source: parseSourceInfo(NO_AUDIO_MP3) })
  ok("non-AAC audio IS re-encoded (copy would break the mp4)", mp3.join(" ").includes("-c:a aac"))

  const voiced = buildFfmpegArgs({ sourcePath: "/s.mov", outputPath: "/o.mp4", filter: "[0:v]null[v]", audioChoice: "original", source: src, audioFilter: "[0:a]anull[aout]" })
  ok("a voice mix must be encoded — copy is not attempted", voiced.join(" ").includes("-map [aout] -c:a aac") && !voiced.join(" ").includes("-c:a copy"))

  const muted = buildFfmpegArgs({ sourcePath: "/s.mov", outputPath: "/o.mp4", filter: "[0:v]null[v]", audioChoice: "none", source: src })
  ok("audioChoice 'none' still mutes", muted.includes("-an"))
}

console.log("\nbuildVideoFilter — the overlay composites AFTER normalization:")
{
  const chain = buildSourceChain({ isHdr: true, width: 718, height: 1280 })
  const f = buildVideoFilter("/f.ttf", [{ file: "/h.txt", fontPx: 48, topPx: 250, lineSpacing: 8 }], chain)
  ok("the normalization chain produces [bg]", f.startsWith(`[0:v]${chain}[bg]`))
  ok("drawtext consumes [bg], so text is drawn on the normalized canvas", f.includes("[bg]drawtext="))
  ok("tone-mapping happens before any text is drawn", f.indexOf("tonemap") < f.indexOf("drawtext"))
  const legacy = buildVideoFilter("/f.ttf", [{ file: "/h.txt", fontPx: 48, topPx: 250, lineSpacing: 8 }])
  ok("callers without a probe keep the previous chain", legacy.startsWith("[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[bg]"))
}


// ── AUDIO PRESERVATION ────────────────────────────────────────────────────────────────────────
// The rule: the render never modifies the audio, so it must never re-encode it either, unless
// something makes stream-copy technically impossible.
console.log("\naudio: preserve the original unless impossible:")
{
  const aacSrc = parseSourceInfo(HDR_TIKTOK)
  const mp3Src = parseSourceInfo(NO_AUDIO_MP3)

  const copy = audioArgs({ audioChoice: "original", audioFilter: null, source: aacSrc })
  ok("AAC source is STREAM-COPIED", copy.join(" ") === "-map 0:a? -c:a copy")
  ok("copy path sets NO bitrate", !copy.includes("-b:a"))
  ok("copy path sets NO sample rate (-ar)", !copy.includes("-ar"))
  ok("copy path sets NO channel layout (-ac)", !copy.includes("-ac"))

  // 'lb_track' currently falls back to source audio, so it must preserve it too.
  ok("lb_track also stream-copies AAC", audioArgs({ audioChoice: "lb_track", audioFilter: null, source: aacSrc }).includes("copy"))

  const forced = audioArgs({ audioChoice: "original", audioFilter: null, source: mp3Src })
  ok("an un-copyable codec IS re-encoded", forced.join(" ").includes("-c:a aac"))
  ok("forced re-encode still does NOT resample or remix", !forced.includes("-ar") && !forced.includes("-ac"))
  ok("forced re-encode uses a high AAC bitrate", /(2[5-9]\d|3[0-2]\d)k/.test(forced.join(" ")))

  const mixed = audioArgs({ audioChoice: "original", audioFilter: "[0:a]anull[aout]", source: aacSrc })
  ok("voice mixing re-encodes (copy is impossible for a mix)", mixed.includes("-c:a") && !mixed.includes("copy"))
  ok("voice mixing maps the mixed output", mixed.join(" ").includes("-map [aout]"))

  ok("audioChoice 'none' mutes", audioArgs({ audioChoice: "none", audioFilter: null, source: aacSrc }).includes("-an"))
  // No probe → cannot prove the codec is copyable, so re-encode rather than risk an unplayable MP4.
  ok("no probe → re-encode rather than optimistically copy", audioArgs({ audioChoice: "original", audioFilter: null, source: null }).join(" ").includes("-c:a aac"))

  // Nothing anywhere may apply loudness processing to audio the user did not ask to change.
  const everyPath = [copy, forced, mixed].map((a) => a.join(" ")).join(" ")
  ok("no loudness normalization or compression is ever applied", !/loudnorm|dynaudnorm|compand|acompressor/.test(everyPath))
}

// ── HDR TRUST + REDUNDANT-RESIZE AVOIDANCE ────────────────────────────────────────────────────
// Preservation first: tone-mapping and resampling are both destructive, so each must be justified.
console.log("\nHDR detection requires corroborating evidence:")
{
  const hlg10 = parseSourceInfo(HDR_TIKTOK)
  ok("real HLG 10-bit IS treated as HDR", hlg10.isHdr === true)
  ok("its transfer is read exactly", hlg10.colorTransfer === "arib-std-b67")
  ok("its bit depth is read from the pixel format", hlg10.bitDepth === 10)
  ok("an SDR bt709 8-bit source is NOT HDR", parseSourceInfo(SDR_1080).isHdr === false)
  ok("8-bit bt709 depth is read as 8", parseSourceInfo(SDR_1080).bitDepth === 8)

  // BT.2020 PRIMARIES with an SDR transfer must NOT trigger a tone-map.
  const wideGamutSdr = `Stream #0:0: Video: h264, yuv420p(tv, bt2020nc/bt2020/bt709), 1080x1920, 30 fps`
  ok("bt2020 primaries alone do NOT trigger tone-mapping", parseSourceInfo(wideGamutSdr).isHdr === false)

  // An 8-bit file CLAIMING HLG is almost certainly mis-tagged — refuse it.
  const mistagged = `Stream #0:0: Video: h264, yuv420p(tv, bt2020nc/bt2020/arib-std-b67), 1080x1920, 30 fps`
  ok("8-bit claiming HLG is distrusted (mis-tagged)", parseSourceInfo(mistagged).isHdr === false)
  ok("10-bit PQ is trusted", isTrustworthyHdr({ colorTransfer: "smpte2084", bitDepth: 10 }))
  ok("unknown transfer is never HDR", isTrustworthyHdr({ colorTransfer: null, bitDepth: 10 }) === false)

  const untouched = buildSourceChain({ isHdr: false, width: 1080, height: 1920 })
  ok("a non-HDR source gets NO colour transform at all", !untouched.includes("tonemap") && !untouched.includes("zscale"))
}

console.log("\nresize only when necessary:")
{
  const exact = buildSourceChain({ isHdr: false, width: DELIVERY.w, height: DELIVERY.h })
  ok("a source already 1080x1920 is NOT rescaled", !exact.includes("scale=") && !exact.includes("crop="))
  ok("...but still gets a known pixel format", exact === "format=yuv420p")

  const small = buildSourceChain({ isHdr: false, width: 718, height: 1280 })
  ok("an undersized source IS scaled, once, with lanczos", small.includes("flags=lanczos"))
  const big = buildSourceChain({ isHdr: false, width: 2160, height: 3840 })
  ok("an oversized source is downscaled once at final composition", big.includes(`scale=${DELIVERY.w}:${DELIVERY.h}`))
  ok("scaling happens exactly once", (big.match(/(?<!z)scale=/g) ?? []).length === 1)

  const unknown = buildSourceChain({ isHdr: false, width: null, height: null })
  ok("an unreadable probe keeps the full scale+crop (canvas correctness wins)", unknown.includes("scale=") && unknown.includes("crop="))

  // Preservation: nothing in any chain may enhance the footage.
  const all = [exact, small, big, unknown, buildSourceChain({ isHdr: true, width: 718, height: 1280 })].join(" ")
  ok("no sharpening, denoising or enhancement on any path", !/unsharp|smartblur|cas=|hqdn3d|nlmeans|atadenoise|eq=|curves|vibrance/.test(all))
}

console.log(`\nSource normalization: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
