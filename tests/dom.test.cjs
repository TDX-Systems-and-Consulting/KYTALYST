// DOM integration checks use fixtures only; no live RentCast calls.
process.chdir(require('node:path').resolve(__dirname, '..'));
const {parseHTML}=require('linkedom');
const vm=require('node:vm');const fs=require('node:fs');const assert=require('node:assert/strict');
const {window}=parseHTML(fs.readFileSync('index.html','utf8'));
const values=new Map();let mode='normal';
const context=vm.createContext({document:window.document,window:{location:{search:''}},URLSearchParams,
  localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},console:{warn(){}},setTimeout:f=>f(),
  fetch:async(url,opts)=>({ok:mode!=='error',status:mode==='error'?500:200,json:async()=>mode==='error'?{error:'Unavailable'}:
    {address:JSON.parse(opts.body).address,listPrice:mode==='fsbo'?0:160000,arv:mode==='fsbo'?0:999999,listingNotFound:mode==='fsbo',
      sqft:1657,yearBuilt:2004,listingStatus:'Active',rehabTier:'heavy',distressSignals:['as-is'],rehab:{total:127000},comps:mode==='fsbo'?[]:[{addr:'125 Test St',price:250000,sqft:1657},{addr:'127 Test St',price:255000,sqft:1657},{addr:'129 Test St',price:260000,sqft:1657}]}})});
// Saved assumptions load from storage: start in the original all-cash, no-holding model.
values.set('kytalyst-assumptions-v1',JSON.stringify({financing:'cash',monthlyHolding:0}));
for(const file of ['deal-model.js','buy-box.js','valuation.js','rehab-budget.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
const scripts=[...window.document.querySelectorAll('script')].filter(e=>!e.src);
vm.runInContext(scripts.at(-1).textContent,context);
const d=window.document;const el=id=>d.getElementById(id);const value=(id,v)=>{el(id).value=String(v)};
const run=code=>vm.runInContext(code,context);
const scan=async(address='123 Test St')=>{value('addressInput',address);await run('runScan()')};
function hipshot(amount){
  value('hipshotInput',amount);run("updateHipshot(document.getElementById('hipshotInput'))");
  assert.equal(el('projectedProfit').textContent,'—','editing withholds figures until saved');
  run('saveHipshot()');
}
(async()=>{
  await scan();assert.equal(el('projectedProfit').textContent,'—');
  hipshot(30000);assert.equal(el('hipshotLow').textContent,'$27,000.00');
  assert.equal(el('hipshotHigh').textContent,'$33,000.00');assert.equal(el('projectedProfit').textContent,'$33,263');
  value('hipshotInput',65800);run('saveHipshot()');assert.equal(el('hipshotLow').textContent,'$59,220.00');assert.equal(el('hipshotHigh').textContent,'$72,380.00');
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
  // Switch to hard money through the assumptions form; numbers checked by hand.
  mode='normal';await scan('300 Hard Money St');hipshot(30000);value('analysisArv',260000);run('applyAnalysisInputs()');
  el('as_financing').querySelectorAll('option').forEach(o=>o.value==='hardMoney'?o.setAttribute('selected',''):o.removeAttribute('selected'));value('as_monthlyHolding',500);run('saveAssumptions()');
  // 260,000 - (160,000 + 5,600 closing + 30,000 rehab + 3,480 points + 10,440 interest + 3,000 holding + 26,650 selling)
  assert.equal(el('projectedProfit').textContent,'$20,830');assert.equal(el('cashNeeded').textContent,'$38,520');
  assert.equal(JSON.parse(values.get('kytalyst-assumptions-v1')).financing,'hardMoney','assumptions saved');
  value('as_interestRatePct',-2);run('saveAssumptions()');assert.match(el('assumptionsError').textContent,/zero or greater|between/);
  assert.equal(el('projectedProfit').textContent,'$20,830','bad input leaves numbers unchanged');
  mode='error';await scan('Failed Property');assert.equal(el('resultsWrap').innerHTML,'');assert.match(el('statusLine').textContent,/No sample data/);
  console.log('DOM checks passed: Hipshot range, base-budget profit, live edits, persistence, property isolation, cleared/invalid/zero input, FSBO, hard money assumptions, failed scan.');
})().catch(e=>{console.error(e);process.exitCode=1});
