'use strict';
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function money(value){return Number(value).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});}
function applyTheme(theme){document.documentElement.setAttribute('data-theme',theme);try{localStorage.setItem('kytalyst-theme',theme);}catch{}document.getElementById('themeToggleBtn').textContent=theme==='light'?'🌙 Dark':'☀ Light';}
function toggleTheme(){applyTheme(document.documentElement.getAttribute('data-theme')==='light'?'dark':'light');}
try{applyTheme(localStorage.getItem('kytalyst-theme')||'dark');}catch{applyTheme('dark');}
const box=BuyBox.defaults;
document.getElementById('buyBoxCriteria').innerHTML=[['Search area',box.zipCode+' · '+box.radiusMiles+' miles'],['Purchase ceiling',money(box.maxPrice)],['Minimum size',box.minBeds+' beds · '+box.minBaths+' bath'],['Profit target',money(box.minProfit)],['Rehab ceiling',money(box.maxRehab)],['Refresh schedule','Daily morning']].map(([label,value])=>`<div><span>${label}</span><strong>${value}</strong></div>`).join('');
let feed=null;let activeFilter='all';
function setFilter(filter){activeFilter=filter;document.querySelectorAll('.feed-filter').forEach(b=>{b.classList.toggle('is-active',b.dataset.filter===filter);b.setAttribute('aria-pressed',String(b.dataset.filter===filter));});renderFeed();}
function renderFeed(){
  const results=document.getElementById('feedResults');
  if(!feed||feed.status!=='ready')return;
  const rows=feed.results.filter(p=>activeFilter==='all'||(activeFilter==='valued'?!!p.valuation?.arv:p.change===activeFilter));
  if(!rows.length){results.innerHTML='<div class="feed-empty">No properties match this view in the latest saved refresh.</div>';return;}
  results.innerHTML=rows.map(p=>{
    const valuation=p.valuation;const screening=p.screening;
    let opportunity='Valuation pending';
    if(valuation?.arv)opportunity=screening?.meetsTargetBeforeRehab?`Up to ${money(screening.maxRehabAtTarget)} rehab at your ${money(box.minProfit)} target`:'Below profit target before rehab';
    else if(p.valuationState==='insufficient-comps')opportunity='Fewer than 3 usable comps';
    else if(p.valuationState==='temporarily-unavailable')opportunity='Valuation temporarily unavailable';
    return `<article class="feed-card"><div class="feed-card-top"><span class="status-badge active">${escapeHtml(p.change==='new'?'New match':p.change==='price-drop'?'Price drop':'Active match')}</span><span class="budget-note">${escapeHtml(p.distance)} mi from center</span></div><h2>${escapeHtml(p.address)}</h2><p class="budget-note">${escapeHtml(p.bedrooms)} bd · ${escapeHtml(p.bathrooms)} ba · ${p.squareFootage?Number(p.squareFootage).toLocaleString()+' sq ft':'Size unavailable'} · ${escapeHtml(p.propertyType)}</p><div class="feed-prices"><div><span>Asking price</span><strong>${money(p.price)}</strong></div><div><span>Estimated ARV</span><strong>${valuation?.arv?money(valuation.arv):'Pending'}</strong></div></div><p class="opportunity-note">${escapeHtml(opportunity)}</p>${valuation?.arv?`<p class="budget-note">3 listing comps · ${new Date(p.valuedAt).toLocaleDateString('en-US')} · condition unverified</p>`:''}<a class="feed-open" href="index.html?address=${encodeURIComponent(p.address)}">Open analysis &amp; set Hipshot <span>↗</span></a></article>`;
  }).join('');
}
async function loadDailyFeed(){
  const status=document.getElementById('feedStatus'),results=document.getElementById('feedResults'),button=document.getElementById('refreshFeedBtn');
  button.disabled=true;status.textContent='Loading the latest saved refresh…';
  try{
    const response=await fetch('data/daily.json',{cache:'no-cache'});if(!response.ok)throw new Error('Feed unavailable');
    const data=await response.json();
    if(data.status!=='ready'){
      feed=null;document.getElementById('feedCounts').innerHTML='';
      status.textContent='Your buy box is saved. The daily RentCast connection has not been activated yet.';
      results.innerHTML='<div class="feed-empty"><h2>Ready for the first search.</h2><p>The daily refresh needs the private RentCast connection configured in GitHub. No listings have been fetched yet.</p><a class="feed-open" href="https://github.com/TDX-Systems-and-Consulting/KYTALYST/settings/secrets/actions">Set up the RentCast connection ↗</a></div>';return;
    }
    if(!Array.isArray(data.results)||!Number.isFinite(Date.parse(data.generatedAt)))throw new Error('Invalid feed');
    feed=data;
    const date=new Date(data.generatedAt);const age=Date.now()-date;
    status.textContent=`Last refreshed ${date.toLocaleString('en-US',{timeZone:'America/Chicago',dateStyle:'medium',timeStyle:'short'})} Central. `+(age>48*3600000?'This list is stale; the next refresh has not arrived. ':'')+(data.listingCoverage==='partial'?'Listing search reached its page limit; coverage is partial. ':'')+'Reloading this page does not make new paid API requests.';
    document.getElementById('feedCounts').innerHTML=[['Matches',data.totalMatches],['New',data.newCount],['Price drops',data.priceDropCount],['With ARV',data.valuedCount],['Awaiting valuation',data.pendingCount]].map(([label,n])=>`<div><strong>${Number(n)||0}</strong><span>${label}</span></div>`).join('');
    renderFeed();
  }catch(_){status.textContent='Could not load the property list. Try Reload list.';if(!feed)results.innerHTML='<div class="feed-empty">Property data is currently unavailable.</div>';}
  finally{button.disabled=false;}
}
setFilter('all');loadDailyFeed();
