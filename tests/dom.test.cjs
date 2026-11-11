// DOM integration checks use fixtures only; no live RentCast calls.
process.chdir(require('node:path').resolve(__dirname, '..'));
const {parseHTML}=require('linkedom');
const vm=require('node:vm');const fs=require('node:fs');const assert=require('node:assert/strict');
const {window}=parseHTML(fs.readFileSync('index.html','utf8'));
const values=new Map();let mode='normal';
const context=vm.createContext({document:window.document,window:{location:{search:''}},URLSearchParams,
  localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},console:{warn(){}},setTimeout:f=>f(),
  fetch:async(url,opts)=>({ok:mode!=='error',status:mode==='error'?500:200,json:async()=>mode==='error'?{error:'Unavailable'}:
    {address:JSON.parse(opts.body).address,listPrice:mode==='fsbo'?0:160000,arv:mode==='fsbo'?0:255000,listingNotFound:mode==='fsbo',
      sqft:1657,yearBuilt:2004,listingStatus:'Active',rehabTier:'heavy',distressSignals:['as-is'],rehab:{total:127000},comps:[]}})});
vm.runInContext(fs.readFileSync('rehab-budget.js','utf8'),context);
const scripts=[...window.document.querySelectorAll('script')].filter(e=>!e.src);
vm.runInContext(scripts.at(-1).textContent,context);
const d=window.document;const el=id=>d.getElementById(id);const value=(id,v)=>{el(id).value=String(v)};
const run=code=>vm.runInContext(code,context);
const scan=async(address='123 Test St')=>{value('addressInput',address);await run('runScan()')};
function hipshot(amount){value('hipshotInput',amount);run("updateHipshot(document.getElementById('hipshotInput'))")}
(async()=>{
  await scan();assert.equal(el('projectedProfit').textContent,'—');
  hipshot(30000);assert.equal(el('hipshotLow').textContent,'$27,000.00');
  assert.equal(el('hipshotHigh').textContent,'$33,000.00');assert.equal(el('projectedProfit').textContent,'$33,263');
  hipshot(40000);assert.equal(el('projectedProfit').textContent,'$23,263');
  await scan();assert.equal(el('hipshotInput').value,'40000');
  await scan('124 Test St');assert.equal(el('hipshotInput').value,'');assert.equal(el('projectedProfit').textContent,'—');
  await scan();assert.equal(el('hipshotInput').value,'40000');
  hipshot('');assert.equal(el('projectedProfit').textContent,'—');assert.equal(el('hipshotLow').textContent,'—');
  hipshot(-1);assert.equal(el('projectedProfit').textContent,'—');assert.match(el('budgetError').textContent,/zero or greater/);
  hipshot(0);assert.equal(el('projectedProfit').textContent,'$63,263');
  mode='fsbo';await scan('200 Off Market St');value('fsboPriceInput',100000);run('applyFSBOPrice()');
  hipshot(10000);assert.equal(el('projectedProfit').textContent,'—');
  value('analysisArv',200000);run('applyAnalysisInputs()');assert.equal(el('projectedProfit').textContent,'$66,000');
  mode='error';await scan('Failed Property');assert.equal(el('resultsWrap').innerHTML,'');assert.match(el('statusLine').textContent,/No sample data/);
  console.log('DOM checks passed: Hipshot range, base-budget profit, live edits, persistence, property isolation, cleared/invalid/zero input, FSBO, failed scan.');
})().catch(e=>{console.error(e);process.exitCode=1});
