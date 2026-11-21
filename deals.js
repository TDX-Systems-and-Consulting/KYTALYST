'use strict';
const STATUSES = [['analyzing','Analyzing'],['watching','Watching'],['offer','Offer made'],['contract','Under contract'],['bought','Bought'],['passed','Passed']];
const statusLabel = v => (STATUSES.find(s => s[0] === v) || STATUSES[0])[1];
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function money(n){return Number.isFinite(Number(n))?(Number(n)<0?'-':'')+'$'+Math.abs(Math.round(Number(n))).toLocaleString('en-US'):'—';}
function applyTheme(theme){document.documentElement.setAttribute('data-theme',theme);try{localStorage.setItem('kytalyst-theme',theme);}catch{}document.getElementById('themeToggleBtn').textContent=theme==='light'?'🌙 Dark':'☀ Light';}
function toggleTheme(){applyTheme(document.documentElement.getAttribute('data-theme')==='light'?'dark':'light');}
try{applyTheme(localStorage.getItem('kytalyst-theme')||'dark');}catch{applyTheme('dark');}

document.getElementById('dealsFilter').insertAdjacentHTML('beforeend', STATUSES.map(([v,l]) => `<option value="${v}">${l}</option>`).join(''));
let deals = [];
let account = null;

function sorted(rows){
  const by = document.getElementById('dealsSort').value;
  const r = d => d.results || {};
  const key = {
    updated: d => -(d.updatedAt || 0),
    profit: d => -(r(d).projectedProfit ?? -Infinity),
    return: d => -(r(d).returnOnCash ?? -Infinity),
    price: d => d.purchasePrice || Infinity
  }[by];
  return rows.slice().sort((a, b) => key(a) - key(b));
}

function renderDeals(){
  const filter = document.getElementById('dealsFilter').value;
  const rows = sorted(deals.filter(d => filter === 'all' || (d.status || 'analyzing') === filter));
  document.getElementById('dealsCount').textContent = deals.length ? `${deals.length} saved · ${deals.filter(d => d.results && d.results.isDeal).length} meet target` : '';
  const list = document.getElementById('dealsList');
  if (!deals.length) {
    list.innerHTML = '<div class="feed-empty"><h2>No saved deals yet.</h2><p>Scan an address and save a Hipshot. The deal lands here automatically.</p><a class="feed-open" href="index.html">Scan a property ↗</a></div>';
    return;
  }
  if (!rows.length) { list.innerHTML = '<div class="feed-empty">No deals with that status.</div>'; return; }
  list.innerHTML = rows.map(d => {
    const r = d.results;
    const verdict = !r ? '<span class="status-badge inactive">Needs Hipshot</span>' : r.isDeal ? '<span class="status-badge active">Meets target</span>' : '<span class="status-badge inactive">Below target</span>';
    const updated = d.updatedAt ? new Date(d.updatedAt).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'}) : '';
    return `<article class="deal-card" data-id="${escapeHtml(d.id)}">
      <div class="deal-card-top"><span class="deal-pill">${escapeHtml(statusLabel(d.status))}</span>${verdict}<span class="budget-note">${escapeHtml(updated)}</span></div>
      <h2>${escapeHtml(d.address)}</h2>
      <div class="deal-figures">
        <div><span>Purchase</span><strong>${money(d.purchasePrice)}</strong></div>
        <div><span>ARV</span><strong>${money(d.arv)}</strong></div>
        <div><span>Rehab</span><strong>${d.hipshot === null || d.hipshot === undefined ? '—' : money(d.hipshot)}</strong></div>
        <div><span>Profit</span><strong class="${r ? (r.projectedProfit >= 0 ? 'pos' : 'neg') : ''}">${r ? money(r.projectedProfit) : '—'}</strong></div>
        <div><span>Max offer</span><strong>${r ? money(r.mao) : '—'}</strong></div>
        <div><span>Return on cash</span><strong>${r && r.returnOnCash !== null && r.returnOnCash !== undefined ? Number(r.returnOnCash).toFixed(1) + '%' : '—'}</strong></div>
      </div>
      <div class="deal-card-actions"><a class="feed-open" href="index.html?deal=${encodeURIComponent(d.id)}">Open deal ↗</a><button type="button" class="link-btn" onclick="removeDeal('${escapeHtml(d.id)}', this)">Remove</button></div>
    </article>`;
  }).join('');
}

async function removeDeal(id, btn){
  // Two-step remove instead of a browser confirm dialog.
  if (btn.dataset.armed !== '1') { btn.dataset.armed = '1'; btn.textContent = 'Tap again to remove'; setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = ''; btn.textContent = 'Remove'; } }, 4000); return; }
  btn.disabled = true;
  try { await account.deleteDeal(id); deals = deals.filter(d => d.id !== id); renderDeals(); }
  catch (err) { btn.disabled = false; document.getElementById('dealsStatus').textContent = 'Could not remove that deal. Try again.'; }
}

async function loadDeals(){
  const status = document.getElementById('dealsStatus');
  status.textContent = 'Loading your deals…';
  try {
    deals = await account.listDeals();
    status.textContent = '';
    renderDeals();
  } catch (err) {
    console.warn(err);
    status.textContent = 'Could not load your deals. Check your connection and reload.';
  }
}

(window.kytAccountReady || Promise.resolve({enabled:false})).then(acc => {
  account = acc;
  const status = document.getElementById('dealsStatus');
  if (!acc.enabled) {
    status.textContent = acc.failed ? 'Sign-in is unavailable right now, so saved deals cannot load.' : 'My deals turns on once KYTALYST sign-in is set up.';
    return;
  }
  acc.onChange(user => {
    if (user) loadDeals();
    else {
      deals = []; document.getElementById('dealsList').innerHTML = ''; document.getElementById('dealsCount').textContent = '';
      status.textContent = 'Sign in to see your saved deals.';
      KytAuthUI.open('Sign in to see your saved deals.');
    }
  });
});
