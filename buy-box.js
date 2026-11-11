(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.BuyBox=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const defaults=Object.freeze({
    zipCode:'63301',latitude:38.858035,longitude:-90.463316,radiusMiles:25,
    maxPrice:200000,minBeds:2,minBaths:1,minProfit:30000,maxRehab:100000,
    propertyTypes:['Single Family','Condo','Townhouse','Manufactured','Multi-Family','Apartment'],
    centerSource:'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_zcta_national.zip',
    maxValuationsPerRun:25,maxListingPages:4,valuationCacheDays:14
  });
  function distance(a,b){
    const rad=n=>n*Math.PI/180;
    const lat1=Number(a.latitude),lat2=Number(b.latitude),lon1=Number(a.longitude),lon2=Number(b.longitude);
    if([a.latitude,a.longitude,b.latitude,b.longitude].some(n=>n===null||n===undefined||n==='')||![lat1,lat2,lon1,lon2].every(Number.isFinite))return null;
    const h=Math.sin(rad(lat2-lat1)/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(rad(lon2-lon1)/2)**2;
    return 3958.7613*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
  }
  function matches(p,box=defaults){
    const miles=distance(p,box);
    return p.status==='Active'&&Number(p.price)>0&&Number(p.price)<=box.maxPrice&&
      Number(p.bedrooms)>=box.minBeds&&Number(p.bathrooms)>=box.minBaths&&
      box.propertyTypes.includes(p.propertyType)&&miles!==null&&miles<=box.radiusMiles;
  }
  function screening(price,arv,box=defaults){
    if(!Number.isFinite(arv)||arv<=0||!Number.isFinite(price)||price<=0)return null;
    const headroom=Math.floor(arv*(1-0.1025)-price*1.035-box.minProfit);
    return {maxRehabAtTarget:Math.max(0,Math.min(box.maxRehab,headroom)),
      headroomBeforeCap:headroom,supportsFullRehabCap:headroom>=box.maxRehab,
      meetsTargetBeforeRehab:headroom>=0};
  }
  return {defaults,distance,matches,screening};
});
