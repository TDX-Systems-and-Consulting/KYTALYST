(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.Valuation=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const key=a=>String(a||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  function estimate(subject,candidates){
    const sqft=Number(subject.squareFootage||subject.sqft);
    if(!Number.isFinite(sqft)||sqft<=0)return {arv:null,comps:[],reason:'Subject square footage unavailable.'};
    const subjectKey=key(subject.formattedAddress||subject.address);
    const seen=new Set();
    const scored=(candidates||[]).map(c=>{
      const addr=c.addr||c.formattedAddress||c.addressLine1;
      const size=Number(c.sqft||c.squareFootage||c.squareFeet);
      const price=Number(c.price);
      const id=key(addr);
      if(!id||id===subjectKey||seen.has(id)||!Number.isFinite(size)||size<=0||!Number.isFinite(price)||price<=0)return null;
      if(subject.propertyType&&c.propertyType&&subject.propertyType!==c.propertyType)return null;
      const sizeDiff=Math.abs(size-sqft)/sqft;
      if(sizeDiff>0.3)return null;
      const beds=Number(c.beds||c.bedrooms),baths=Number(c.baths||c.bathrooms);
      const subjectBeds=Number(subject.beds||subject.bedrooms),subjectBaths=Number(subject.baths||subject.bathrooms);
      if(subjectBeds&&beds&&Math.abs(subjectBeds-beds)>1)return null;
      if(subjectBaths&&baths&&Math.abs(subjectBaths-baths)>1)return null;
      const miles=Number(c.distance);
      if(c.distance!=null&&Number.isFinite(miles)&&miles>5)return null;
      if(c.daysOld!=null&&Number(c.daysOld)>365)return null;
      seen.add(id);
      const correlation=Number(c.correlation);
      let score=100-sizeDiff*100;
      if(Number.isFinite(correlation))score+=correlation*50;
      if(c.distance!=null&&Number.isFinite(miles))score-=miles*5;
      if(subjectBeds&&beds)score-=Math.abs(subjectBeds-beds)*10;
      if(subjectBaths&&baths)score-=Math.abs(subjectBaths-baths)*10;
      return {addr,price,sqft:size,beds:beds||null,baths:baths||null,
        status:c.status||'Not supplied',distance:c.distance??null,daysOld:c.daysOld??null,
        priceBasis:'Listing price',adjustedValue:Math.round(price/size*sqft),score};
    }).filter(Boolean).sort((a,b)=>b.score-a.score||a.addr.localeCompare(b.addr));
    const comps=scored.slice(0,3).map(({score,...c})=>c);
    if(comps.length!==3)return {arv:null,comps,reason:`${comps.length} usable comps found; 3 required.`};
    const adjusted=comps.map(c=>c.adjustedValue).sort((a,b)=>a-b);
    return {arv:adjusted[1],comps,method:'Median of 3 size-adjusted listing comparables',
      conditionVerified:false,reason:null};
  }
  return {estimate};
});
