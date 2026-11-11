const {test}=require('node:test');const assert=require('node:assert/strict');
const BuyBox=require('../buy-box.js');const V=require('../valuation.js');const {refresh,createClient}=require('../scripts/refresh-daily.cjs');
const subject={address:'1 Subject St',squareFootage:1500,bedrooms:3,bathrooms:2,propertyType:'Single Family'};
const comps=[{formattedAddress:'2 Comp St',price:200000,squareFootage:1000},
  {formattedAddress:'3 Comp St',price:300000,squareFootage:1500},
  {formattedAddress:'4 Comp St',price:320000,squareFootage:1600},
  {formattedAddress:'5 Comp St',price:280000,squareFootage:1400}];
const listing={id:'subject',formattedAddress:'1 Subject St',price:150000,status:'Active',propertyType:'Single Family',
  bedrooms:3,bathrooms:2,squareFootage:1500,latitude:BuyBox.defaults.latitude,longitude:BuyBox.defaults.longitude};
const box={...BuyBox.defaults,maxValuationsPerRun:2};
function client(rows=[listing],valuation={subjectProperty:subject,comparables:comps}){
  const calls=[];return{calls,get:async(endpoint,params)=>{calls.push({endpoint,params});return endpoint==='listings/sale'?rows:valuation;}};
}
test('configured buy box includes exact limits and all residential types',()=>{
  assert.equal(BuyBox.defaults.zipCode,'63301');assert.equal(BuyBox.defaults.radiusMiles,25);
  assert.equal(BuyBox.defaults.maxPrice,200000);assert.equal(BuyBox.defaults.minProfit,30000);assert.equal(BuyBox.defaults.maxRehab,100000);
  assert.equal(BuyBox.matches(listing),true);
  for(const change of [{price:200001},{bedrooms:1},{bathrooms:0},{status:'Inactive'},{latitude:40},{latitude:null},{propertyType:'Land'}])assert.equal(BuyBox.matches({...listing,...change}),false);
  assert.equal(BuyBox.matches({...listing,price:200000,bedrooms:2,bathrooms:1}),true);
});
test('ARV derives from exactly 3 distinct comparable price-per-sqft adjustments',()=>{
  const result=V.estimate(subject,[...comps,{...comps[1]},{...subject,price:999999}]);
  assert.equal(result.comps.length,3);assert.equal(result.arv,300000);
  assert.equal(result.comps.every(c=>c.priceBasis==='Listing price'),true);
  assert.equal(result.conditionVerified,false);
  assert.equal(V.estimate(subject,comps.slice(0,2)).arv,null);
  assert.equal(V.estimate({...subject,squareFootage:0},comps).arv,null);
  assert.equal(V.estimate(subject,comps.map(c=>({...c,propertyType:'Condo'}))).arv,null);
});
test('rehab ceiling is a cap, not an assumed cost',()=>{
  const s=BuyBox.screening(150000,300000);
  assert.equal(s.maxRehabAtTarget,84000);assert.equal(s.supportsFullRehabCap,false);
  assert.equal(BuyBox.screening(100000,400000).maxRehabAtTarget,100000);
  assert.equal(BuyBox.screening(200000,200000).meetsTargetBeforeRehab,false);
});
test('daily search requests a radius and correct filters; omits private response fields',async()=>{
  const c=client([{...listing,owner:{email:'private@example.com'},apiKey:'never-publish'}]);
  const f=await refresh({client:c,box,now:new Date('2026-11-11T13:00:00Z')});
  assert.equal(c.calls[0].params.radius,25);assert.equal(c.calls[0].params.price,'1:200000');
  assert.equal(c.calls[0].params.bedrooms,'2:*');assert.equal(c.calls[0].params.bathrooms,'1:*');
  assert.equal(f.results[0].valuation.arv,300000);assert.equal(f.results[0].valuation.comps.length,3);
  assert.equal(JSON.stringify(f).includes('private@example.com'),false);assert.equal(JSON.stringify(f).includes('never-publish'),false);
});
test('refresh detects price drops and reuses recent comp valuations',async()=>{
  const first=await refresh({client:client(),box,now:new Date('2026-11-11T13:00:00Z')});
  const c=client([{...listing,price:140000}]);
  const next=await refresh({client:c,previous:first,box,now:new Date('2026-11-12T13:00:00Z')});
  assert.equal(c.calls.length,1);assert.equal(next.priceDropCount,1);assert.equal(next.results[0].previousPrice,150000);
  assert.equal(next.results[0].screening.maxRehabAtTarget,94350);
});
test('valuation budget leaves honest pending rows instead of dropping matches',async()=>{
  const rows=[0,1,2].map(n=>({...listing,id:'id'+n,formattedAddress:n+' Example St'}));
  const f=await refresh({client:client(rows),box,now:new Date('2026-11-11T13:00:00Z')});
  assert.equal(f.totalMatches,3);assert.equal(f.valuationAttempts,2);assert.equal(f.pendingCount,1);
});
test('API authorization/quota failure aborts refresh instead of publishing empty matches',async()=>{
  for(const status of [401,403,429]){
    const c={get:async()=>{const e=new Error('provider failed');e.status=status;throw e;}};
    await assert.rejects(refresh({client:c}),/provider failed/);
  }
});
test('API client does not leak key in errors and sends it only as a header',async()=>{
  let request;
  const c=createClient('secret-key',async(url,opts)=>{request={url:String(url),opts};return{ok:false,status:429};});
  await assert.rejects(c.get('listings/sale',{radius:25}),/HTTP 429/);
  assert.equal(request.url.includes('secret-key'),false);assert.equal(request.opts.headers['X-Api-Key'],'secret-key');
});
