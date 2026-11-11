// Run with Playwright installed: node tests/browser.test.cjs
// All property responses are test fixtures; this does not call paid APIs.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname,'..');
const fixture = { address:'123 Test St, Wentzville, MO 63385',listPrice:160000,arv:999999,
  sqft:1657,yearBuilt:2004,listingStatus:'Active',rehabTier:'heavy',distressSignals:['as-is'],
  rehab:{total:127000},comps:[250000,255000,260000].map((price,i)=>({addr:(125+i*2)+' Test St',price,beds:3,baths:2,sqft:1657})) };
const server = http.createServer((req,res) => {
  const name = new URL(req.url,'http://localhost').pathname;
  if (!['/','/index.html','/rehab-budget.js','/design.css','/daily.html','/buy-box.js','/valuation.js','/discovery.js','/data/daily.json'].includes(name)) {res.writeHead(404).end();return;}
  res.setHeader('Content-Type', name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.json') ? 'application/json' : 'text/html');
  res.end(fs.readFileSync(path.join(root,name==='/'?'index.html':name.slice(1))));
});
(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({headless:true, ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {})});
  try {
    const context = await browser.newContext({viewport:{width:390,height:844}});
    let mode = 'normal';
    let feedFixture = null;
    let backendCalls = 0;
    const errors = [];
    await context.route('**/*', async route => {
      const url=route.request().url();
      if (url.startsWith(origin) && url.includes('/data/daily.json') && feedFixture) return route.fulfill({contentType:'application/json',body:JSON.stringify(feedFixture)});
      if (url.startsWith(origin)) return route.continue();
      if (url.includes('cloudfunctions.net/kytalystScan')) {
        const headers = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'};
        if(route.request().method()==='OPTIONS') return route.fulfill({status:204,headers});
        backendCalls++;
        const address=route.request().postDataJSON().address;
        if(mode==='error') return route.fulfill({status:500,headers,contentType:'application/json',body:JSON.stringify({error:'Test backend unavailable'})});
        return route.fulfill({headers,contentType:'application/json',body:JSON.stringify({...fixture,address,
          ...(mode==='fsbo'?{listingNotFound:true,listPrice:0,arv:0,comps:[]}:{})})});
      }
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    const scan = async (address=fixture.address) => {
      await page.locator('#addressInput').fill(address);
      await page.getByRole('button',{name:'Scan',exact:true}).click();
    };
    const text = sel => page.locator(sel).innerText();
    await page.goto(origin);
    assert.equal(await page.locator('h1').innerText(),'Find the upside.');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    if(process.env.SCREENSHOT_DIR){
      await page.screenshot({animations:'disabled',path:path.join(process.env.SCREENSHOT_DIR,'home-mobile.png'),fullPage:true});
      await page.setViewportSize({width:1440,height:1000});
      await page.screenshot({animations:'disabled',path:path.join(process.env.SCREENSHOT_DIR,'home-desktop.png'),fullPage:true});
      await page.setViewportSize({width:390,height:844});
    }
    assert.equal(await page.locator('#addressInput').isVisible(),true,'manual field remains when Maps fails');
    await scan();await page.locator('#hipshotInput').waitFor();
    assert.equal(await text('#projectedProfit'),'—');
    await page.locator('#hipshotInput').fill('30000');
    assert.equal(await text('#projectedProfit'),'—');
    await page.getByRole('button',{name:'Save Hipshot',exact:true}).click();
    assert.equal(await text('#hipshotLow'),'$27,000.00');
    assert.equal(await text('#hipshotHigh'),'$33,000.00');
    assert.equal(await text('#projectedProfit'),'$33,263');
    assert.equal(await page.locator('#analysisArv').inputValue(),'255000');
    assert.equal(await page.locator('.comp-row').count(),3);
    assert.equal(await page.locator('.allocation-bar>span').count(),4);
    assert.match(await text('#profitTarget'),/above your/);
    await page.locator('#hipshotInput').fill('65800');
    await page.locator('#hipshotInput').press('Enter');
    assert.equal(await text('#hipshotLow'),'$59,220.00');
    assert.equal(await text('#hipshotHigh'),'$72,380.00');
    assert.match(await text('#budgetStorage'),/Saved/);
    assert.match(await text('#dealAllocation'),/Projected loss/);
    assert.equal(await page.locator('#verdictBanner').getAttribute('class'),'verdict-banner nodeal');
    await page.locator('#hipshotInput').fill('40000');
    assert.equal(await text('#projectedProfit'),'—');
    await page.getByRole('button',{name:'Save Hipshot',exact:true}).click();
    assert.equal(await text('#projectedProfit'),'$23,263');
    await page.locator('#hipshotInput').fill('50000');
    assert.equal(await text('#projectedProfit'),'—');
    await page.reload();await scan();await page.locator('#hipshotInput').waitFor();
    assert.equal(await page.locator('#hipshotInput').inputValue(),'40000');
    await scan('124 Test St, MO');await page.locator('#hipshotInput').waitFor();
    assert.equal(await page.locator('#hipshotInput').inputValue(),'');
    await scan();await page.locator('#hipshotInput').waitFor();
    assert.equal(await page.locator('#hipshotInput').inputValue(),'40000');
    await page.locator('#hipshotInput').fill('');
    assert.equal(await text('#projectedProfit'),'—');
    await page.getByRole('button',{name:'Save Hipshot',exact:true}).click();assert.equal(await text('#projectedProfit'),'—');
    await page.locator('#hipshotInput').fill('-1');
    assert.equal(await text('#projectedProfit'),'—');
    await page.getByRole('button',{name:'Save Hipshot',exact:true}).click();assert.equal(await text('#projectedProfit'),'—');
    assert.match(await text('#budgetError'),/zero or greater/);
    await page.locator('#hipshotInput').fill('0');
    assert.equal(await text('#projectedProfit'),'—');
    await page.getByRole('button',{name:'Save Hipshot',exact:true}).click();assert.equal(await text('#projectedProfit'),'$63,263');
    await page.locator('#hipshotInput').fill('30000');
    assert.equal(await text('#projectedProfit'),'—');
    await page.getByRole('button',{name:'Save Hipshot',exact:true}).click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
    if(process.env.SCREENSHOT_DIR){
      await page.locator('#hipshotInput').scrollIntoViewIfNeeded();
      await page.screenshot({animations:'disabled',path:path.join(process.env.SCREENSHOT_DIR,'rehab-mobile.png'),fullPage:true});
      await page.setViewportSize({width:1280,height:900});
      await page.screenshot({animations:'disabled',path:path.join(process.env.SCREENSHOT_DIR,'rehab-desktop.png'),fullPage:true});
      await page.locator('#themeToggleBtn').click();
      assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
      await page.screenshot({animations:'disabled',path:path.join(process.env.SCREENSHOT_DIR,'workspace-light.png'),fullPage:true});
      await page.locator('#themeToggleBtn').click();
      await page.setViewportSize({width:390,height:844});
    }
    mode='fsbo';await scan('200 Off Market St, MO');
    await page.locator('#fsboPriceInput').fill('100000');
    await page.getByRole('button',{name:'Analyze',exact:false}).click();
    await page.locator('#hipshotInput').fill('10000');
    assert.equal(await text('#projectedProfit'),'—');
    await page.getByRole('button',{name:'Save Hipshot',exact:true}).click();assert.equal(await text('#projectedProfit'),'—');
    await page.locator('#analysisArv').fill('200000');
    await page.getByRole('button',{name:'Update analysis inputs',exact:true}).click();
    assert.equal(await text('#projectedProfit'),'$66,000');
    // Backend failures clear prior figures and never fall back to mock values.
    mode='error';await scan('999 Fail St, MO');
    await page.waitForFunction(()=>document.getElementById('statusLine').textContent.includes('Scan failed'));
    assert.equal(await page.locator('#resultsWrap').innerText(),'');
    assert.match(await text('#statusLine'),/No sample data/);
    assert.equal(await page.locator('#scanBtn').isEnabled(),true);
    await page.goto(origin+'/daily.html');
    await page.waitForFunction(()=>document.getElementById('feedStatus').textContent.includes('not been activated'));
    assert.match(await page.locator('#buyBoxCriteria').innerText(),/63301/);
    assert.match(await page.locator('#buyBoxCriteria').innerText(),/30,000/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    if(process.env.SCREENSHOT_DIR)await page.screenshot({animations:'disabled',path:path.join(process.env.SCREENSHOT_DIR,'buy-box-mobile.png'),fullPage:true});
    // Simulate successful Places loading to catch the original duplicate-address regression.
    mode='normal';
    const withMaps = await context.newPage();
    withMaps.on('pageerror',e=>errors.push(e.message));
    await withMaps.addInitScript(()=>{
      class FakePlaces extends HTMLElement {
        constructor(){super();this.attachShadow({mode:'open'}).innerHTML='<input aria-label="Address suggestions">';}
        get value(){return this.shadowRoot.querySelector('input').value;}
        set placeholder(v){this.shadowRoot.querySelector('input').placeholder=v;}
      }
      customElements.define('gmp-place-autocomplete',FakePlaces);
      window.google={maps:{importLibrary:async()=>({PlaceAutocompleteElement:FakePlaces})}};
    });
    await withMaps.goto(origin);
    await withMaps.locator('gmp-place-autocomplete').waitFor();
    assert.equal(await withMaps.locator('#addressInput').isVisible(),false);
    assert.equal(await withMaps.locator('gmp-place-autocomplete').isVisible(),true);
    const box=await withMaps.locator('gmp-place-autocomplete').boundingBox();
    const scanBox=await withMaps.locator('#scanBtn').boundingBox();
    assert.ok(Math.abs(box.y-scanBox.y)<1,'autocomplete and Scan stay on one row');
    await withMaps.locator('gmp-place-autocomplete input').fill(fixture.address);
    await withMaps.locator('#scanBtn').click();
    await withMaps.locator('#hipshotInput').waitFor();
    await withMaps.locator('#hipshotInput').fill('30000');
    await withMaps.getByRole('button',{name:'Save Hipshot',exact:true}).click();
    assert.equal(await withMaps.locator('#projectedProfit').innerText(),'$33,263');
    await withMaps.locator('#addressModeBtn').click();
    assert.equal(await withMaps.locator('#addressInput').isVisible(),true);
    assert.equal(await withMaps.locator('gmp-place-autocomplete').isVisible(),false);
    await withMaps.locator('#addressModeBtn').click();
    assert.equal(await withMaps.locator('#addressInput').isVisible(),false);
    assert.equal(await withMaps.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    if(process.env.SCREENSHOT_DIR){
      await withMaps.screenshot({animations:'disabled',path:path.join(process.env.SCREENSHOT_DIR,'address-mobile.png')});
    }
    // A real ready feed is rendered and opens cached comp analysis without a paid scan.
    const B = require('../buy-box.js');
    const row={id:'test-listing',address:fixture.address,price:160000,status:'Active',
      bedrooms:3,bathrooms:2,squareFootage:1657,propertyType:'Single Family',distance:5,
      change:'new',valuationState:'ready',valuedAt:new Date().toISOString(),
      valuation:{arv:255000,comps:fixture.comps},screening:B.screening(160000,255000)};
    feedFixture={version:1,status:'ready',generatedAt:new Date().toISOString(),listingCoverage:'complete',
      totalMatches:2,newCount:1,priceDropCount:1,valuedCount:2,pendingCount:0,
      results:[row,{...row,id:'other-listing',address:'200 Another St, MO',change:'price-drop'}]};
    await page.goto(origin+'/daily.html');await page.locator('.feed-card').first().waitFor();
    assert.equal(await page.locator('.feed-card').count(),2);
    await page.getByRole('button',{name:'Price drops',exact:true}).click();
    assert.equal(await page.locator('.feed-card').count(),1);
    await page.getByRole('button',{name:'New',exact:true}).click();
    assert.equal(await page.locator('.feed-card').count(),1);
    if(process.env.SCREENSHOT_DIR)await page.screenshot({animations:'disabled',path:path.join(process.env.SCREENSHOT_DIR,'daily-matches-mobile.png'),fullPage:true});
    const callsBefore=backendCalls;
    await page.locator('.feed-open').click();await page.locator('#hipshotInput').waitFor();
    assert.equal(backendCalls,callsBefore,'fresh cached match should not call the paid scanner again');
    assert.equal(await page.locator('#analysisArv').inputValue(),'255000');
    assert.deepEqual(errors,[]);
    console.log('Browser checks passed: Hipshot range and base amount, edits, persistence, validation, FSBO, failures, mobile layout, single address field with Maps loaded/unavailable.');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
