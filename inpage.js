// inpage.js — runs in PAGE context (MAIN world). No chrome.* here.
(function () {
  const post = (kind, payload) => {
    try { window.postMessage({ __csg__: true, kind, payload }, "*"); } catch {}
  };
  const dbg = (msg) => post("DBG", msg);

  dbg("inpage.js loaded");

  // ---- Hook Next.js Flight queue ----
  function wrapQueue(q) {
    if (!q || typeof q.push !== "function") return q;
    if (q.__csg_wrapped) return q;

    const orig = q.push;
    const wrapped = function (...args) {
      try {
        const first = args && args[0];
        // Expected shape: [ <id>, "<tag:escaped JSON array>" ]
        if (Array.isArray(first) && typeof first[1] === "string") {
          post("FLIGHT", first[1]);   // forward the quoted string (no outer quotes)
        }
      } catch (e) { dbg("flight push err: " + e.message); }
      return orig.apply(this, args);
    };
    try { Object.defineProperty(q, "push", { value: wrapped }); } catch { q.push = wrapped; }
    q.__csg_wrapped = true;
    dbg("flight queue wrapped");
    return q;
  }

  // 1) If already present, wrap it
  if (Array.isArray(self.__next_f)) wrapQueue(self.__next_f);
  else if (!self.__next_f) self.__next_f = [];

  // 2) Guard against later reassignments
  let _queue = self.__next_f;
  try {
    Object.defineProperty(window, "__next_f", {
      configurable: true,
      get() { return _queue; },
      set(v) { _queue = wrapQueue(Array.isArray(v) ? v : []); }
    });
  } catch {}

  // 3) Poll in case the app replaces the array reference
  const iv = setInterval(() => {
    if (!Array.isArray(self.__next_f)) return;
    wrapQueue(self.__next_f);
  }, 250);
  setTimeout(() => clearInterval(iv), 30000); // stop after 30s; we should be wrapped by then

  // ---- Optional: hook fetch/XHR just in case data also travels over network ----
  const maybePostBody = (t) => {
    try {
      if (t && (t.includes('"certificationStatus"') || t.includes('\\"certificationStatus\\"'))) {
        post("NET_BODY", t.length > 200000 ? t.slice(0, 200000) : t);
      }
    } catch {}
  };

  try {
    const _fetch = window.fetch;
    window.fetch = async function (...args) {
      const res = await _fetch.apply(this, args);
      try { const txt = await res.clone().text(); maybePostBody(txt); } catch {}
      return res;
    };
  } catch {}

  try {
    const _XHR = window.XMLHttpRequest;
    function XHRWrap() {
      const x = new _XHR();
      x.addEventListener("load", function () { try { maybePostBody(x.responseText); } catch {} });
      return x;
    }
    XHRWrap.prototype = _XHR.prototype;
    window.XMLHttpRequest = XHRWrap;
  } catch {}
})();
