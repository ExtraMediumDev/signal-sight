// content.js — injects inpage.js, receives FLIGHT/NET_BODY, parses, caches, serves popup.
(() => {
  // ---- inject inpage.js into MAIN world ----
  try {
    const src = chrome.runtime.getURL("inpage.js");
    const el = document.createElement("script");
    el.src = src;
    el.onload = () => el.remove();
    (document.head || document.documentElement).appendChild(el);
  } catch {}

  const log = (line) => chrome.runtime.sendMessage({ type: "CSG_LOG", line }).catch(() => {});
  const parseJSONSafe = (t) => { try { return JSON.parse(t); } catch { return null; } };
  const walk = (o, visit) => {
    if (!o || typeof o !== "object") return;
    visit(o);
    for (const k in o) walk(o[k], visit);
  };

  /** Convert various raw result shapes into a rich, uniform object. */
  function normalize(res) {
    // Prefer CodeSignal "results" shape with screenDoc
    if (res && res.testName && res.screenDoc) {
      const sd  = res.screenDoc || {};
      const pro = sd.proctoringOptions || {};
      const toISO = (v) => typeof v === "number" ? new Date(v).toISOString() : (v || "");
      const companies = Array.isArray(res.companies) ? res.companies.map(c => ({
        id: c.id || c._id || "", name: c.name || "", logo: c.logo || "", lockdownFrameworkEnabled: !!c.lockdownFrameworkEnabled
      })) : [];

      return {
        id: sd._id || res._id || `${res.testName}:${sd.finishDate || sd.startDate || Date.now()}`,
        testName: res.testName || "",
        frameworkName: res.frameworkName || "",
        frameworkMaturityLevel: res.frameworkMaturityLevel || "",
        companies,
        isCustomPreScreen: !!res.isCustomPreScreen,
        shouldLockdown: !!res.shouldLockdown,

        // statuses & scoring
        status: sd.certificationStatus || res.certificationStatus || "",
        screenStatus: sd.status || "",
        score: typeof sd.score === "number" ? sd.score : (typeof res.score === "number" ? res.score : null),
        maxScore: typeof sd.maxScore === "number" ? sd.maxScore : (typeof res.maxScore === "number" ? res.maxScore : null),

        // timing
        createDate: toISO(sd.createDate),
        startDate:  toISO(sd.startDate),
        finishDate: toISO(sd.finishDate),
        nextAttemptEarliest: res.nextAttemptDate || "",

        // proctoring
        proctoringOptions: {
          isEnabled: !!pro.isEnabled,
          isVideoRequired: !!pro.isVideoRequired,
          isDisplayRequired: !!pro.isDisplayRequired,
          isPhotoRequired: !!pro.isPhotoRequired,
          isIdPhotoRequired: !!pro.isIdPhotoRequired,
          ruleIds: Array.isArray(pro.ruleIds) ? pro.ruleIds.slice(0, 64) : []
        },
        proctoringSessionId: sd.proctoringSessionId || "",

        // detailed score object if present
        codingScore2023: sd.codingScore2023 || res.codingScore2023 || null,

        // keep the raw object for the UI "Details" viewer
        raw: res
      };
    }

    // Generic fallback, still keep rich info if present
    const name   = res?.name || res?.title || res?.assessmentName || res?.testName || "";
    const status = res?.certificationStatus || "";
    const score  = res?.score ?? res?.totalScore ?? null;
    const maxScore = res?.maxScore ?? res?.max ?? null;
    const toISO = (v) => typeof v === "number" ? new Date(v).toISOString() : (v || "");
    const pro = res?.proctoringOptions || res?.proctoring || {};

    return {
      id: res?._id || `${name}:${res?.finishDate || res?.endTime || Date.now()}`,
      testName: name,
      frameworkName: res?.frameworkName || "",
      frameworkMaturityLevel: res?.frameworkMaturityLevel || "",
      companies: Array.isArray(res?.companies) ? res.companies : [],
      isCustomPreScreen: !!res?.isCustomPreScreen,
      shouldLockdown: !!res?.shouldLockdown,

      status, screenStatus: res?.status || "",
      score, maxScore,

      createDate: toISO(res?.createDate),
      startDate:  toISO(res?.startDate),
      finishDate: toISO(res?.finishDate || res?.finishedAt || res?.endTime),
      nextAttemptEarliest: res?.nextAttemptEarliest || res?.nextAttemptAt || res?.nextAttemptDate || "",

      proctoringOptions: {
        isEnabled: !!(pro.isEnabled),
        isVideoRequired: !!(pro.isVideoRequired || pro.video),
        isDisplayRequired: !!(pro.isDisplayRequired || pro.display),
        isPhotoRequired: !!(pro.isPhotoRequired || pro.photo),
        isIdPhotoRequired: !!(pro.isIdPhotoRequired || pro.id),
        ruleIds: Array.isArray(pro.ruleIds) ? pro.ruleIds.slice(0, 64) : []
      },
      proctoringSessionId: res?.proctoringSessionId || "",
      codingScore2023: res?.codingScore2023 || null,
      raw: res
    };
  }

  // If we ever capture an escaped JS string (from inline-scan), this will unescape it.
  function decodeQuotedJSString(str) {
    try { return JSON.parse(`"${str.replace(/"/g, '\\"')}"`); } catch { return null; }
  }

  // Find the first [...]-balanced JSON array in a string
  function extractJSONArrayText(s) {
    let i = s.indexOf("[");
    if (i < 0) return null;
    let depth = 0, inStr = false, esc = false;
    for (let j = i; j < s.length; j++) {
      const ch = s[j];
      if (inStr) {
        if (esc) { esc = false; continue; }
        if (ch === "\\") { esc = true; continue; }
        if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === "[") depth++;
      else if (ch === "]") {
        depth--;
        if (depth === 0) return s.slice(i, j + 1);
      }
    }
    return null;
  }

  // ---- robust parser for a Flight string (handles raw *and* escaped) ----
  function parseFlightString(str) {
    const out = [];
    const candidates = [str];
    const maybeDecoded = decodeQuotedJSString(str);
    if (maybeDecoded && maybeDecoded !== str) candidates.push(maybeDecoded);

    for (const cand of candidates) {
      if (!cand) continue;

      // Flight payloads look like:   92:[ "...", null, { invites:..., results:[...] }]
      // or module lists like:        12b:I[40015,[...],"default"]
      const colon = cand.indexOf(":");
      const after = (colon >= 0 ? cand.slice(colon + 1) : cand).trim();

      let arr = null;
      if (after.startsWith("[")) {
        arr = parseJSONSafe(after);
      }
      if (!arr) {
        const arrText = extractJSONArrayText(after);
        if (arrText) arr = parseJSONSafe(arrText);
      }
      if (!Array.isArray(arr)) continue;

      const tail = arr[arr.length - 1];
      if (tail && typeof tail === "object") {
        if (Array.isArray(tail.results)) {
          for (const r of tail.results) out.push(normalize(r));
        }
        if (Array.isArray(tail.children)) {
          for (const ch of tail.children) {
            if (ch && typeof ch === "object" && Array.isArray(ch.results)) {
              for (const r of ch.results) out.push(normalize(r));
            }
          }
        }
      }

      if (!out.length) {
        walk(arr, (n) => {
          if (n && typeof n === "object" && Object.prototype.hasOwnProperty.call(n, "certificationStatus")) {
            out.push(normalize(n));
          }
        });
      }

      if (out.length) break;
    }

    return out;
  }

  // ---- inline <script> scan (for hard refresh before hook attaches) ----
  function scanInlineNow() {
    let found = [];
    for (const sc of document.querySelectorAll("script")) {
      if (sc.src) continue;
      const t = sc.textContent || "";
      if (!t) continue;

      // Capture Flight pushes that include a quoted string literal and feed it to the parser
      const re = /self\.__next_f\.push\(\[\s*\d+\s*,\s*"((?:[^"\\]|\\.)+)"\s*\]\)/g;
      let m;
      while ((m = re.exec(t)) !== null) {
        found = found.concat(parseFlightString(m[1]));
      }

      // Brute JSON blocks (rare)
      if (t.includes('"certificationStatus"') || t.includes('\\"certificationStatus\\"')) {
        const blocks = t.match(/\{[^{}]{0,2000}"certificationStatus"\s*:\s*"[^"]+"[^{}]{0,4000}\}/g) || [];
        for (const b of blocks) {
          const obj = parseJSONSafe(b);
          if (obj) found.push(normalize(obj));
        }
      }
    }
    return found;
  }

  // ---- cache & API to popup ----
  const cache = new Map(); // key=id
  const upsert = (arr) => {
    for (const r of arr) {
      const key = r.id || [r.testName, r.finishDate, r.score].join("|");
      cache.set(key, r);
    }
    log(`cache size: ${cache.size}`);
  };
  const snapshot = () => Array.from(cache.values());

  log("content.js started (document_start)");

  // Receive events posted by inpage.js
  window.addEventListener("message", (e) => {
    const d = e.data;
    if (!d || !d.__csg__) return;

    if (d.kind === "DBG") {
      log(`[inpage] ${d.payload}`);
      return;
    }

    if (d.kind === "FLIGHT") {
      const items = parseFlightString(d.payload);
      log(`FLIGHT parsed items: ${items.length}`);
      if (items.length) upsert(items);
      return;
    }

    if (d.kind === "NET_BODY") {
      const t = d.payload || "";
      let out = [];
      const j = parseJSONSafe(t);
      if (j) {
        walk(j, (n) => {
          if (n && typeof n === "object" && Object.prototype.hasOwnProperty.call(n, "certificationStatus")) {
            out.push(normalize(n));
          }
        });
      }
      if (!out.length) {
        const blocks = t.match(/\{[^{}]{0,2000}"certificationStatus"\s*:\s*"[^"]+"[^{}]{0,4000}\}/g) || [];
        for (const b of blocks) { const obj = parseJSONSafe(b); if (obj) out.push(normalize(obj)); }
      }
      if (out.length) { log(`NET_BODY parsed items: ${out.length}`); upsert(out); }
    }
  });

  // Initial scan + mutation fallback
  const first = scanInlineNow();
  if (first.length) upsert(first);
  else log("No items from inline/HTML on init");

  const mo = new MutationObserver(() => {
    const res = scanInlineNow();
    if (res.length) upsert(res);
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
    if (!req) return;
    if (req.type === "CSG_GET_DATA" || req.type === "CSG_FORCE_SCAN") {
      const snap = snapshot();
      log(`serve ${req.type}: ${snap.length} items`);
      sendResponse({ type: "CSG_VERIFY_DATA", payload: snap });
      return true;
    }
  });
})();
