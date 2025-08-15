// popup.js – single column, per-card status badge, collapsible sections,
// no “loaded X items” summary/ pill, and a collapsible live log.

const cardsEl   = document.getElementById('cards');
const forceBtn  = document.getElementById('force');
const exportBtn = document.getElementById('exportCsv');
const exportJsonBtn = document.getElementById('exportJson');
const statusEl  = document.getElementById('status');
const logEl     = document.getElementById('log');
const logWrap   = document.getElementById('logWrap');
const toggleLogBtn = document.getElementById('toggleLog');

let logOpen = false;
let logBuffer = [];
const MAX_BUF = 400;

// --- Payment helpers ---
async function payGetUser() {
  try { return (await chrome.runtime.sendMessage({ type: 'PAY_GET_USER' }))?.user || null; }
  catch { return null; }
}
async function payOpenCheckout(plan) {
  try { await chrome.runtime.sendMessage({ type: 'PAY_OPEN_CHECKOUT', plan }); } catch {}
}
async function payOpenLogin() {
  try { await chrome.runtime.sendMessage({ type: 'PAY_OPEN_LOGIN' }); } catch {}
}

// --- Paywall UI ---
function renderPaywall() {
  if (document.getElementById('paywallOverlay')) return;
  document.body.classList.add('locked');

  const overlay = document.createElement('div');
  overlay.id = 'paywallOverlay';
  overlay.className = 'paywall-overlay';
  overlay.innerHTML = `
    <div class="paywall-card">
      <h2>Unlock full report</h2>
      <p>Activate your license to view assessments, scores, rules, and exports.</p>
      <div class="paywall-actions">
        <button id="pw-unlock" class="btn-primary">Unlock</button>
        <button id="pw-login" class="btn-link">I already paid</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const pollUntilPaid = async () => {
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const u = await payGetUser();
      if (u && (u.paid || u.subscriptionStatus === 'active')) {
        removePaywall();
        // kick off normal data load after unlock
        initDataLoad();
        return;
      }
    }
  };

  overlay.querySelector('#pw-unlock').addEventListener('click', async () => {
    log('Opening checkout…');
    await payOpenCheckout();
    pollUntilPaid();
  });
  overlay.querySelector('#pw-login').addEventListener('click', async () => {
    log('Opening login…');
    await payOpenLogin();
    pollUntilPaid();
  });
}
function removePaywall() {
  document.body.classList.remove('locked');
  const el = document.getElementById('paywallOverlay');
  if (el) el.remove();
}

// Gatekeeper. Returns true if paid, otherwise shows paywall and returns false.
async function ensurePaid() {
  const u = await payGetUser();
  if (u && (u.paid || u.subscriptionStatus === 'active')) return true;
  renderPaywall();
  return false;
}

function log(line) {
  const ts = new Date().toLocaleTimeString();
  const full = `[${ts}] ${line}`;
  if (logOpen) {
    logEl.textContent += full + '\n';
    logEl.scrollTop = logEl.scrollHeight;
  } else {
    logBuffer.push(full);
    if (logBuffer.length > MAX_BUF) logBuffer.splice(0, logBuffer.length - MAX_BUF);
  }
}
function setStatus(txt) { statusEl.textContent = txt; }
function fmtDate(s){ if(!s) return ''; const d=new Date(s); return isNaN(d)?s:d.toLocaleString(); }
function scoreStr(it){ return it.score==null?'':(it.maxScore?`${it.score}/${it.maxScore}`:String(it.score)); }

function statusInfo(it){
  const raw = (it.certificationStatus || it.status || it.screenStatus || '').toLowerCase();
  const label = raw || 'unknown';
  if (/certified|pass/.test(raw)) return { label: 'certified', cls: 'good' };
  if (/pending|in[-\s]?review|processing/.test(raw)) return { label: 'pending', cls: 'warn' };
  if (/reject|fail/.test(raw)) return { label: 'rejected', cls: 'bad' };
  return { label, cls: 'neutral' };
}

function render(items) {
  cardsEl.innerHTML = '';
  if (!Array.isArray(items)) items = [];
  window.__CSG_DATA__ = items;

  for (const it of items) {
    const companyChips = (it.companies || []).map(c => `
      <span class="company">
        ${c.logo ? `<img src="${c.logo}" alt="">` : ''}
        <span>${c.name || 'Company'}</span>
      </span>`).join('');

    const rules = (it.proctoringOptions?.ruleIds || []).map(r => `<span class="pill">${r}</span>`).join('');
    const skills = (it.codingScore2023?.skillAreas || []).map(s => `
      <span class="pill">${s.name}: <b>${s.value}</b>${s.label ? ` (${s.label})` : ''}</span>`).join('');

    const { label: stLabel, cls: stCls } = statusInfo(it);
    const rulesCount = (it.proctoringOptions?.ruleIds || []).length;
    const areasCount = (it.codingScore2023?.skillAreas || []).length;
    const ppo = typeof it.codingScore2023?.PPoMP === 'number' ? it.codingScore2023.PPoMP : null;

    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-head">
        <div>
          <div class="card-title">${it.testName || 'Assessment'}</div>
          <div class="card-sub">
            ${it.frameworkName || ''}${it.frameworkMaturityLevel ? ` • ${it.frameworkMaturityLevel}` : ''}
          </div>
        </div>
        <div class="card-right">
          <span class="badge ${stCls}">${stLabel}</span>
          <span class="score">${scoreStr(it)}</span>
        </div>
      </div>

      ${companyChips ? `<div class="company-list">${companyChips}</div>` : ''}

      <div class="card-body">
        <div class="kv"><div class="k">Screen Status</div><div class="v">${it.screenStatus || it.status || ''}</div></div>
        <div class="kv"><div class="k">Next Retake</div><div class="v">${fmtDate(it.nextAttemptEarliest)}</div></div>

        <div class="kv"><div class="k">Started</div><div class="v">${fmtDate(it.startDate)}</div></div>
        <div class="kv"><div class="k">Finished</div><div class="v">${fmtDate(it.finishDate)}</div></div>

        <div class="kv"><div class="k">Proctoring</div><div class="v">
          ${it.proctoringOptions?.isEnabled ? 'enabled' : '—'}
          ${it.proctoringOptions?.isVideoRequired ? '• video' : ''}
          ${it.proctoringOptions?.isDisplayRequired ? '• display' : ''}
          ${it.proctoringOptions?.isPhotoRequired ? '• photo' : ''}
          ${it.proctoringOptions?.isIdPhotoRequired ? '• ID' : ''}
        </div></div>
        <div class="kv"><div class="k">Session ID</div><div class="v">${it.proctoringSessionId || ''}</div></div>

        ${rulesCount ? `
          <details class="collapsible">
            <summary>Rules <span class="muted">(${rulesCount})</span></summary>
            <div class="rule-list">${rules}</div>
          </details>` : ''}

        ${it.codingScore2023 ? `
          <details class="collapsible">
            <summary>Score Breakdown ${ppo !== null ? `<span class="muted">(PPoMP ${ppo}${areasCount ? ` • ${areasCount} areas` : ''})</span>` : ''}</summary>
            <div class="skill-list">
              ${ppo !== null ? `<span class="pill">PPoMP: <b>${ppo}</b></span>` : ''}
              ${skills}
            </div>
          </details>` : ''}
      </div>
    `;
    cardsEl.appendChild(card);
  }

  setStatus("You may need to click out and click back in the extension after refreshing to see updated changes.");
}

// CSV / downloads
function toCSV(items) {
  const cols = [
    'TestName','Framework','Maturity','Companies','Status','ScreenStatus',
    'Score','MaxScore','Start','Finish','NextRetake',
    'ProctoringEnabled','Video','Display','Photo','ID','RulesCount'
  ];
  const rows = [cols.join(',')];
  for (const it of items) {
    rows.push([
      (it.testName||'').replaceAll(',', ' '),
      (it.frameworkName||'').replaceAll(',', ' '),
      (it.frameworkMaturityLevel||'').replaceAll(',', ' '),
      (it.companies||[]).map(c=>c.name).join('|').replaceAll(',', ' '),
      it.certificationStatus || it.status || '',
      it.screenStatus || '',
      it.score ?? '',
      it.maxScore ?? '',
      it.startDate || '',
      it.finishDate || '',
      it.nextAttemptEarliest || '',
      !!it.proctoringOptions?.isEnabled,
      !!it.proctoringOptions?.isVideoRequired,
      !!it.proctoringOptions?.isDisplayRequired,
      !!it.proctoringOptions?.isPhotoRequired,
      !!it.proctoringOptions?.isIdPhotoRequired,
      (it.proctoringOptions?.ruleIds || []).length
    ].join(','));
  }
  return rows.join('\n');
}
function download(filename, text, type='text/plain') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

async function activeTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}
async function ask(type) {
  const id = await activeTabId();
  if (!id) { log('No active tab'); return null; }
  try {
    log(`→ sendMessage ${type}`);
    const resp = await chrome.tabs.sendMessage(id, { type });
    const count = Array.isArray(resp?.payload) ? resp.payload.length : 0;
    log(`← response ${type}: ${count} items`);
    return resp;
  } catch (e) {
    log(`✗ sendMessage error: ${e.message}`);
    return null;
  }
}

// collapsible live log
toggleLogBtn.addEventListener('click', () => {
  logOpen = !logOpen;
  toggleLogBtn.setAttribute('aria-expanded', String(logOpen));
  toggleLogBtn.textContent = logOpen ? 'Hide live log' : 'Show live log';
  logWrap.classList.toggle('hidden', !logOpen);
  if (logOpen) {
    logEl.textContent = logBuffer.join('\n') + (logBuffer.length ? '\n' : '');
    logBuffer = [];
    logEl.scrollTop = logEl.scrollHeight;
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'CSG_LOG') log(msg.line);
});

forceBtn.addEventListener('click', async () => {
  const id = await activeTabId();
  if (id) {
    log(`Reloading tab ${id}…`);
    chrome.tabs.reload(id);
  } else {
    log('No active tab to reload.');
  }
});

exportBtn.addEventListener('click', () => {
  download('codesignal-assessments.csv', toCSV(window.__CSG_DATA__ || []), 'text/csv');
});
exportJsonBtn.addEventListener('click', () => {
  download('codesignal-assessments.json', JSON.stringify(window.__CSG_DATA__ || [], null, 2), 'application/json');
});

// initial load
// --- gated init ---
async function initDataLoad() {
  setStatus('Connecting…');
  const r1 = await ask('CSG_GET_DATA');
  if (r1?.payload) return render(r1.payload);

  setStatus('Waiting for page data…');
  setTimeout(async () => {
    const r2 = await ask('CSG_GET_DATA');
    render(r2?.payload || []);
  }, 900);
}

(async () => {
  setStatus('Checking access…');
  if (await ensurePaid()) {
    initDataLoad();
  } else {
    setStatus('Locked until activated.');
  }
})();

