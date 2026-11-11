// Run only in a trusted Node environment. The API key never reaches browser code or output data.
const fs=require('node:fs/promises');
const path=require('node:path');
const BuyBox=require('../buy-box.js');
const Valuation=require('../valuation.js');
const configHash=(box=BuyBox.defaults)=>JSON.stringify(box);
const id=p=>p.id||p.formattedAddress;
function publicListing(p,box){
  return {id:id(p),address:p.formattedAddress,price:p.price,bedrooms:p.bedrooms,bathrooms:p.bathrooms,
    squareFootage:p.squareFootage,propertyType:p.propertyType,status:p.status,
    latitude:p.latitude,longitude:p.longitude,daysOnMarket:p.daysOnMarket??null,
    listedDate:p.listedDate??null,lastSeenDate:p.lastSeenDate??null,
    distance:Math.round(BuyBox.distance(p,box)*10)/10};
}
function createClient(apiKey,fetchFn=fetch){
  let calls=0;
  return {get calls(){return calls;},async get(endpoint,params){
    calls++;
    const url=new URL('https://api.rentcast.io/v1/'+endpoint);
    for(const [k,v] of Object.entries(params))if(v!=null)url.searchParams.set(k,String(v));
    const r=await fetchFn(url,{headers:{'X-Api-Key':apiKey,Accept:'application/json'},signal:AbortSignal.timeout(30000)});
    if(!r.ok){const error=new Error(`RentCast returned HTTP ${r.status}`);error.status=r.status;throw error;}
    return r.json();
  }};
}
async function refresh({client,previous={},now=new Date(),box=BuyBox.defaults}){
  const rows=[];let complete=false;
  for(let page=0;page<box.maxListingPages;page++){
    const pageRows=await client.get('listings/sale',{latitude:box.latitude,longitude:box.longitude,
      radius:box.radiusMiles,status:'Active',propertyType:box.propertyTypes.join('|'),
      bedrooms:`${box.minBeds}:*`,bathrooms:`${box.minBaths}:*`,price:`1:${box.maxPrice}`,limit:500,offset:page*500});
    if(!Array.isArray(pageRows))throw new Error('Invalid RentCast listing response. Previous feed retained.');
    rows.push(...pageRows);
    if(pageRows.length<500){complete=true;break;}
  }
  const listings=[...new Map(rows.filter(p=>p.formattedAddress&&id(p)&&BuyBox.matches(p,box)).map(p=>[id(p),p])).values()];
  const previousMap=new Map((previous.results||[]).map(p=>[p.id,p]));
  const reusable=previous.buyBoxSignature===configHash(box);
  const results=listings.map(p=>{
    const old=previousMap.get(id(p));
    const sameAttributes=old&&['squareFootage','bedrooms','bathrooms','propertyType'].every(k=>p[k]===old[k]);
    const isFresh=reusable&&sameAttributes&&old?.valuation&&now-new Date(old.valuedAt)<box.valuationCacheDays*86400000;
    return {...publicListing(p,box),change:!old?'new':p.price<old.price?'price-drop':p.price>old.price?'price-increase':'unchanged',
      previousPrice:old?.price??null,lastAttemptAt:old?.lastAttemptAt||null,firstSeenAt:old?.firstSeenAt||now.toISOString(),
      valuation:isFresh?old.valuation:null,valuedAt:isFresh?old.valuedAt:null,
      valuationState:isFresh?old.valuationState:'pending'};
  });
  const queue=results.filter(p=>!p.valuation).sort((a,b)=>(a.lastAttemptAt?Date.parse(a.lastAttemptAt):0)-(b.lastAttemptAt?Date.parse(b.lastAttemptAt):0)||new Date(a.firstSeenAt)-new Date(b.firstSeenAt)||a.price-b.price||a.id.localeCompare(b.id));
  let attempted=0,errors=0;
  for(const item of queue.slice(0,box.maxValuationsPerRun)){
    attempted++;
    item.lastAttemptAt=now.toISOString();
    try{
      const avm=await client.get('avm/value',{address:item.address,propertyType:item.propertyType,
        bedrooms:item.bedrooms,bathrooms:item.bathrooms,squareFootage:item.squareFootage,
        maxRadius:5,daysOld:365,compCount:15,lookupSubjectAttributes:true});
      const subject={...avm.subjectProperty,...item,squareFootage:item.squareFootage||avm.subjectProperty?.squareFootage};
      const valuation=Valuation.estimate(subject,avm.comparables);
      item.valuation=valuation;
      item.valuedAt=now.toISOString();
      item.valuationState=valuation.arv?'ready':'insufficient-comps';
      item.squareFootage=subject.squareFootage||null;
    }catch(err){
      if(err.status===401||err.status===403||err.status===429)throw err;
      errors++;item.valuationState='temporarily-unavailable';
    }
  }
  for(const item of results)item.screening=BuyBox.screening(item.price,item.valuation?.arv,box);
  results.sort((a,b)=>(b.screening?.maxRehabAtTarget??-1)-(a.screening?.maxRehabAtTarget??-1)||a.price-b.price);
  return {version:1,status:'ready',generatedAt:now.toISOString(),buyBox:box,buyBoxSignature:configHash(box),
    listingCoverage:complete?'complete':'partial',source:'RentCast',valuationBasis:'3 size-adjusted listing comparables; condition unverified',
    totalMatches:results.length,valuedCount:results.filter(p=>p.valuationState==='ready').length,
    pendingCount:results.filter(p=>p.valuationState==='pending').length,valuationAttempts:attempted,
    valuationErrors:errors,apiCalls:client.calls,newCount:results.filter(p=>p.change==='new').length,
    priceDropCount:results.filter(p=>p.change==='price-drop').length,results};
}
async function main(){
  const key=process.env.RENTCAST_API_KEY;
  if(!key)throw new Error('Add the RENTCAST_API_KEY repository secret to activate the daily property feed.');
  const target=path.resolve(__dirname,'../data/daily.json');
  let previous={};try{previous=JSON.parse(await fs.readFile(target,'utf8'));}catch{}
  const feed=await refresh({client:createClient(key),previous});
  await fs.mkdir(path.dirname(target),{recursive:true});
  await fs.writeFile(target+'.tmp',JSON.stringify(feed,null,2)+'\n');
  await fs.rename(target+'.tmp',target);
  console.log(`Updated ${feed.totalMatches} matches. ${feed.valuedCount} valued; ${feed.pendingCount} pending. ${feed.apiCalls} API calls.`);
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={refresh,createClient};
