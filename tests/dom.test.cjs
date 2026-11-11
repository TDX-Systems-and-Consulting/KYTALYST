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
function add(desc='Roof',material=6000,labor=4000,other=0,qty=1){
  for(const [id,v] of Object.entries({itemDescription:desc,itemMaterial:material,itemLabor:labor,itemOther:other,itemQty:qty}))value(id,v);
  run('saveRehabItem()');
}
(async()=>{
  await scan();assert.equal(el('projectedProfit').textContent,'—');
  run('applyRehabBudget()');assert.match(el('budgetError').textContent,/Add at least one/);
  add();assert.equal(el('budgetTotal').textContent,'$11,000.00');assert.equal(el('projectedProfit').textContent,'—');
  run('applyRehabBudget()');assert.equal(el('projectedProfit').textContent,'$52,263');
  run('editRehabItem(0)');value('itemLabor',9000);run('saveRehabItem()');
  assert.equal(el('projectedProfit').textContent,'—');assert.equal(el('budgetTotal').textContent,'$16,500.00');
  run('applyRehabBudget()');value('contingencyInput',20);run("changeContingency(document.getElementById('contingencyInput'))");
  assert.equal(el('budgetTotal').textContent,'$18,000.00');assert.equal(el('projectedProfit').textContent,'—');
  run('applyRehabBudget()');await scan();assert.equal(el('projectedProfit').textContent,'$45,263');
  value('wtSearch','faucet');run('filterCatalogSearch();selectCatalogItem(0)');
  assert.equal(el('itemOther').value,'274.82');run('applyRehabBudget()');assert.match(el('budgetError').textContent,/Save or cancel/);
  value('itemOther',300);value('itemQty',2.5);run('saveRehabItem()');assert.equal(el('budgetTotal').textContent,'$18,900.00');
  add('Invalid',-1);assert.match(el('budgetError').textContent,/zero or greater/);assert.equal(d.querySelectorAll('.budget-item').length,2);
  run('cancelRehabItem()');await scan('124 Test St');assert.equal(d.querySelectorAll('.budget-item').length,0);
  await scan();assert.equal(d.querySelectorAll('.budget-item').length,2);assert.equal(el('projectedProfit').textContent,'—');
  run('removeRehabItem(1)');assert.equal(el('budgetTotal').textContent,'$18,000.00');
  mode='fsbo';await scan('200 Off Market St');value('fsboPriceInput',100000);run('applyFSBOPrice()');
  add('No rehab',0,0);run('applyRehabBudget()');assert.equal(el('projectedProfit').textContent,'—');
  value('analysisArv',200000);run('applyAnalysisInputs()');assert.equal(el('projectedProfit').textContent,'$76,000');
  mode='error';await scan('Failed Property');assert.equal(el('resultsWrap').innerHTML,'');assert.match(el('statusLine').textContent,/No sample data/);
  console.log('DOM integration checks passed: custom/catalog items, edits, validation, draft/apply, contingency, saved budgets, isolation, deletion, manual ARV, FSBO, failed live scan.');
})().catch(e=>{console.error(e);process.exitCode=1});
