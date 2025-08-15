// MV3 service worker – caches items per tab and coordinates refreshes

importScripts('ExtPay.js'); // loads the library file

const EXTPAY_ID = 'signal-sight';  // <-- replace with your actual id
let extpay = ExtPay(EXTPAY_ID);
extpay.startBackground();


const cache = new Map(); // tabId -> { items: [...] }

function log(line) {
  chrome.runtime.sendMessage({ type: 'CSG_LOG', line }).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg?.type === 'PAY_GET_USER') {
    (async () => {
      try {
        // Recreate in callbacks if needed to avoid undefined in SW event lifecycles. :contentReference[oaicite:5]{index=5}
        const ext = ExtPay(EXTPAY_ID);
        const user = await ext.getUser();   // { paid, subscriptionStatus, plan, ... } :contentReference[oaicite:6]{index=6}
        sendResponse({ ok: true, user });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true; // async
  }

  if (msg?.type === 'PAY_OPEN_CHECKOUT') {
    try {
      const ext = ExtPay(EXTPAY_ID);
      // Optionally support planNickname: msg.plan
      ext.openPaymentPage(msg?.plan || undefined); // opens tab to pay/manage. :contentReference[oaicite:7]{index=7}
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
    return true;
  }

  if (msg?.type === 'PAY_OPEN_LOGIN') {
    try {
      const ext = ExtPay(EXTPAY_ID);
      ext.openLoginPage(); // for users who already paid on another profile/device. :contentReference[oaicite:8]{index=8}
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
    return true;
  }

  try {
    if (msg?.type === 'CSG_SAVE') {
      // Content script pushes parsed items here
      const tabId = sender?.tab?.id ?? msg.tabId;
      cache.set(tabId, { items: msg.items || [] });
      log(`[sw] cache updated for tab ${tabId}: ${msg.items?.length ?? 0} items`);
      // Tell any open popup(s) to refetch
      chrome.runtime.sendMessage({
        type: 'CSG_CACHE_UPDATED',
        tabId,
        count: msg.items?.length ?? 0
      }).catch(() => {});
      sendResponse({ ok: true });
      return true;
    }

    if (msg?.type === 'CSG_GET_DATA') {
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        const tabId = tabs?.[0]?.id;
        const items = cache.get(tabId)?.items || [];
        log(`[sw] GET_DATA for tab ${tabId}: ${items.length} items`);
        sendResponse({ items });
      });
      return true;
    }

    if (msg?.type === 'CSG_REFRESH_TAB') {
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        const tab = tabs?.[0];
        if (!tab?.id) {
          sendResponse({ ok: false, error: 'no-active-tab' });
          return;
        }

        const tabId = tab.id;
        cache.delete(tabId); // clear old
        log(`[sw] reload tab ${tabId}`);

        // After reload completes we ping (optional) and notify popup
        const onUpdated = (id, info, t) => {
          if (id !== tabId) return;
          if (info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(onUpdated);
            log(`[sw] tab ${tabId} load complete`);
            // Let popup know it can start polling (or wait for CSG_CACHE_UPDATED)
            chrome.runtime.sendMessage({ type: 'CSG_TAB_RELOADED', tabId }).catch(() => {});
          }
        };
        chrome.tabs.onUpdated.addListener(onUpdated);

        chrome.tabs.reload(tabId, { bypassCache: true });
        sendResponse({ ok: true });
      });
      return true;
    }
  } catch (e) {
    try { sendResponse({ ok: false, error: String(e) }); } catch {}
  }
});
