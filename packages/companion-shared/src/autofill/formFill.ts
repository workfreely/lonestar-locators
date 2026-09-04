import type { AutofillPayload, AutofillResult } from "./types";

/**
 * Best-effort tour/contact-form autofill, run IN THE PAGE.
 *
 * This function is injected verbatim by chrome.scripting.executeScript({ func,
 * args }), so it MUST be fully self-contained — every helper, spec and constant
 * lives inside it and it references nothing but its `payload` argument and the DOM.
 * Type annotations are erased at build time and do not affect serialization.
 *
 * Guarantees (the MVP contract):
 *   • never submits and never clicks a submit control;
 *   • never overwrites a field the locator already changed (a non-empty value we
 *     did not place is left alone);
 *   • skips low-confidence matches rather than guessing;
 *   • client data fills the prospect fields; locator data goes ONLY to the
 *     message/comments field;
 *   • cross-origin iframes are unreachable → reported, never forced (manual
 *     fallback), and Schedule Tour stays usable regardless.
 *
 * Re-running is safe and idempotent per field: a value we wrote is marked with a
 * data attribute, so a re-trigger (e.g. after a calendar-first form finally shows
 * its contact fields) fills the newly-appeared fields without disturbing the rest.
 */
export function autofillTourForm(payload: AutofillPayload): AutofillResult {
  const dryRun = !!payload.dryRun;
  const CONF_MIN = 30; // medium-confidence floor; below this a field is left alone

  type Spec = {
    key: string;
    ac: string[];
    tok: string[];
    softtok: string[];
    text: string[];
    strongTypes: string[];
    kinds: string[];
  };
  const SPECS: Spec[] = [
    { key: "firstName", ac: ["given-name"], tok: ["first_name", "firstname", "fname", "first-name", "givenname"], softtok: ["first"], text: ["first name", "given name"], strongTypes: [], kinds: ["input"] },
    { key: "lastName", ac: ["family-name"], tok: ["last_name", "lastname", "lname", "last-name", "surname", "familyname"], softtok: ["last"], text: ["last name", "surname", "family name"], strongTypes: [], kinds: ["input"] },
    { key: "email", ac: ["email"], tok: ["email", "e-mail", "emailaddress"], softtok: [], text: ["email", "e-mail"], strongTypes: ["email"], kinds: ["input"] },
    { key: "phone", ac: ["tel", "tel-national"], tok: ["phone", "telephone", "mobile", "cell", "phone_no", "phonenumber", "phone_number"], softtok: ["tel"], text: ["phone", "mobile", "cell", "telephone"], strongTypes: ["tel"], kinds: ["input"] },
    { key: "moveDate", ac: [], tok: ["move_in", "movein", "move-in", "moveindate", "move_in_date", "move_in_date_act", "desired_move", "movedate", "move_date"], softtok: ["move"], text: ["move-in", "move in", "moving", "desired move", "move date", "moveindate"], strongTypes: ["date"], kinds: ["input"] },
    { key: "bedrooms", ac: [], tok: ["bedroom", "bedrooms", "beds", "floorplan", "floor_plan", "floorplan_chosen", "unit_type", "unittype", "desired_bedrooms"], softtok: ["bed"], text: ["bedroom", "beds", "floor plan", "floorplan", "unit type", "desired bedrooms"], strongTypes: [], kinds: ["select", "input"] },
    { key: "message", ac: [], tok: ["message", "comment", "comments", "questions", "question", "notes", "inquiry", "additional_info", "additionalinfo", "details", "yourmessage"], softtok: ["msg"], text: ["message", "comment", "question", "tell us", "notes", "anything else", "how can we help", "additional"], strongTypes: [], kinds: ["textarea"] },
  ];

  const norm = (s: unknown) => (s == null ? "" : String(s)).toLowerCase().replace(/[\s_\-]+/g, "");
  const textNorm = (s: unknown) => (s == null ? "" : String(s)).toLowerCase().replace(/\s+/g, " ").trim();

  function isVisible(el: any): boolean {
    if (!el) return false;
    const t = (el.type || "").toLowerCase();
    if (t === "hidden") return false;
    if (el.disabled || el.readOnly) return false;
    if (el.getAttribute && el.getAttribute("aria-hidden") === "true") return false;
    const rects = el.getClientRects();
    if ((!rects || rects.length === 0) && el.offsetParent === null) return false;
    const cs = (el.ownerDocument.defaultView || window).getComputedStyle(el);
    if (cs && (cs.display === "none" || cs.visibility === "hidden")) return false;
    return true;
  }

  function nearbyText(el: any): string {
    const bits: string[] = [];
    try { if (el.labels) for (let i = 0; i < el.labels.length; i++) bits.push(el.labels[i].innerText || ""); } catch (e) { /* noop */ }
    const al = el.getAttribute && el.getAttribute("aria-label"); if (al) bits.push(al);
    const lb = el.getAttribute && el.getAttribute("aria-labelledby");
    if (lb) lb.split(/\s+/).forEach((id: string) => { const n = el.ownerDocument.getElementById(id); if (n) bits.push(n.innerText || ""); });
    const p = el.closest && el.closest("label"); if (p) bits.push(p.innerText || "");
    let prev = el.previousElementSibling; let hops = 0;
    while (prev && hops < 2) { if (prev.innerText) { bits.push(prev.innerText); break; } prev = prev.previousElementSibling; hops++; }
    return textNorm(bits.join(" "));
  }

  function candidates(doc: any): any[] {
    const out: any[] = [];
    const nodes = doc.querySelectorAll("input, select, textarea");
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (el.tagName.toLowerCase() === "input") {
        const t = (el.type || "text").toLowerCase();
        if (["submit", "button", "reset", "hidden", "file", "image", "checkbox", "radio", "password", "search"].indexOf(t) >= 0) continue;
      }
      out.push(el);
    }
    return out;
  }

  function score(el: any, spec: Spec): { score: number; strategy: string } {
    const tag = el.tagName.toLowerCase();
    if (spec.kinds.indexOf(tag) < 0) return { score: 0, strategy: "" };
    let s = 0; const strat: string[] = [];
    const ac = norm(el.getAttribute && el.getAttribute("autocomplete"));
    const type = (el.type || "").toLowerCase();
    const nm = norm(el.getAttribute && el.getAttribute("name"));
    const id = norm(el.id);
    const ph = textNorm(el.getAttribute && el.getAttribute("placeholder"));
    const near = nearbyText(el);
    for (let i = 0; i < spec.ac.length; i++) { if (ac && ac.indexOf(norm(spec.ac[i])) >= 0) { s += 100; strat.push("autocomplete"); break; } }
    if (spec.strongTypes.indexOf(type) >= 0) { s += 45; strat.push("type"); }
    let hitTok = false;
    for (let j = 0; j < spec.tok.length; j++) { const tk = norm(spec.tok[j]); if (nm === tk || id === tk) { s += 80; strat.push("name"); hitTok = true; break; } }
    if (!hitTok) for (let j = 0; j < spec.tok.length; j++) { const tk = norm(spec.tok[j]); if ((nm && nm.indexOf(tk) >= 0) || (id && id.indexOf(tk) >= 0)) { s += 55; strat.push("name~"); hitTok = true; break; } }
    if (!hitTok) for (let j = 0; j < spec.softtok.length; j++) { const tk = norm(spec.softtok[j]); if ((nm && nm.indexOf(tk) >= 0) || (id && id.indexOf(tk) >= 0)) { s += 25; strat.push("name-soft"); break; } }
    for (let k = 0; k < spec.text.length; k++) { if (near && near.indexOf(spec.text[k]) >= 0) { s += 35; strat.push("label"); break; } }
    for (let m = 0; m < spec.text.length; m++) { if (ph && ph.indexOf(spec.text[m]) >= 0) { s += 22; strat.push("placeholder"); break; } }
    return { score: s, strategy: strat.join("+") };
  }

  function setNative(el: any, value: string) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype
      : el.tagName === "SELECT" ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    const d = Object.getOwnPropertyDescriptor(proto, "value");
    try { el.focus(); } catch (e) { /* noop */ }
    if (d && d.set) d.set.call(el, value); else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    try { el.blur(); } catch (e) { /* noop */ }
    el.setAttribute("data-lb-filled", "1");
  }

  function bedroomTokens(v: string): string[] {
    const x = textNorm(v);
    const map: Record<string, string[]> = { "0": ["studio"], studio: ["studio", "0"], "1": ["one", "1"], one: ["one", "1"], "2": ["two", "2"], two: ["two", "2"], "3": ["three", "3"], three: ["three", "3"], "4": ["four", "4"], four: ["four", "4"] };
    const digit = (x.match(/\d+/) || [])[0];
    let toks = [x];
    if (digit && map[digit]) toks = toks.concat(map[digit]);
    Object.keys(map).forEach((k) => { if (x.indexOf(k) >= 0) toks = toks.concat(map[k]); });
    return toks.filter((t) => t);
  }

  function fillSelect(el: any, desired: string): boolean {
    const toks = bedroomTokens(desired);
    const opts = el.options;
    for (let i = 0; i < opts.length; i++) {
      const ot = textNorm(opts[i].text); const ov = norm(opts[i].value);
      for (let j = 0; j < toks.length; j++) {
        const tk = textNorm(toks[j]);
        if (ot === tk || ov === norm(tk) || (ot && ot.indexOf(tk) >= 0)) { setNative(el, opts[i].value); return true; }
      }
    }
    return false;
  }

  const loc = payload.locator || {};
  let msg = payload.message || "";
  if (!msg) {
    const lines = ["My client is interested in touring this community. Please contact me with availability or recommendations.", ""];
    const nm = [loc.firstName, loc.lastName].filter(Boolean).join(" ");
    if (nm) lines.push("— " + nm);
    const tb = [loc.title, loc.brokerage].filter(Boolean).join(", "); if (tb) lines.push(tb);
    if (loc.phone) lines.push(loc.phone);
    if (loc.email) lines.push(loc.email);
    msg = lines.join("\n");
  }

  const c = payload.client || {};
  const values: Record<string, string | null | undefined> = {
    firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone,
    moveDate: c.moveDate, bedrooms: c.bedrooms, message: msg,
  };

  const report: AutofillResult["report"] = [];
  const docs: any[] = [document];
  let frameCount = 0; let frameBlocked = 0;
  const iframes = document.querySelectorAll("iframe");
  for (let f = 0; f < iframes.length; f++) {
    frameCount++;
    try { const d = (iframes[f] as HTMLIFrameElement).contentDocument; if (d && d.body) docs.push(d); else if ((iframes[f] as HTMLIFrameElement).src) frameBlocked++; }
    catch (e) { frameBlocked++; }
  }

  const used: any[] = [];
  SPECS.forEach((spec) => {
    const want = values[spec.key];
    if (want == null || want === "") { report.push({ field: spec.key as any, action: "no-value" }); return; }
    let bestScore = -1; let bestStrategy = ""; let bestEl: any = null;
    docs.forEach((doc) => {
      candidates(doc).forEach((el) => {
        if (used.indexOf(el) >= 0) return;
        if (!isVisible(el)) return;
        const r = score(el, spec);
        if (r.score > 0 && r.score > bestScore) { bestScore = r.score; bestStrategy = r.strategy; bestEl = el; }
      });
    });
    if (!bestEl) { report.push({ field: spec.key as any, action: "not-found" }); return; }
    if (bestScore < CONF_MIN) { report.push({ field: spec.key as any, action: "low-confidence", score: bestScore, strategy: bestStrategy }); return; }
    const existing = bestEl.value;
    if (existing && existing !== "" && bestEl.getAttribute("data-lb-filled") !== "1") {
      report.push({ field: spec.key as any, action: "skip-user-value", score: bestScore, strategy: bestStrategy }); return;
    }
    used.push(bestEl);
    const descr = bestEl.tagName.toLowerCase() + (bestEl.name ? "[name=" + bestEl.name + "]" : "") + (bestEl.id ? "#" + bestEl.id : "");
    if (dryRun) { report.push({ field: spec.key as any, action: "would-fill", el: descr, score: bestScore, strategy: bestStrategy }); return; }
    let ok: boolean;
    if (bestEl.tagName === "SELECT") ok = fillSelect(bestEl, String(want));
    else { setNative(bestEl, String(want)); ok = true; }
    report.push({ field: spec.key as any, action: ok ? "filled" : "select-no-match", el: descr, score: bestScore, strategy: bestStrategy });
  });

  const filled = report.filter((r) => r.action === "filled").length;
  const attempted = report.filter((r) => r.action !== "no-value").length;
  return { origin: location.origin, url: location.href, filled, attempted, frames: { total: frameCount, crossOriginBlocked: frameBlocked }, report };
}
