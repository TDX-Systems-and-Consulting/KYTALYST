// Run with Playwright installed: node tests/browser.test.cjs
// All property responses are test fixtures; this does not call paid APIs.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname,'..');
const fixture = { address:'123 Test St, Wentzville, MO 63385',listPrice:160000,arv:255000,
  sqft:1657,yearBuilt:2004,listingStatus:'Active',rehabTier:'heavy',distressSignals:['as-is'],
  rehab:{total:127000},comps:[{addr:'125 Test St',price:250000,beds:3,baths:2,sqft:1600}] };
const server = http.createServer((req,res) => {
  const name = new URL(req.url,'http://localhost').pathname;
  if (!['/','/index.html','/rehab-budget.js'].includes(name)) {res.writeHead(404).end();return;}
  res.setHeader('Content-Type', name.endsWith('.js') ? 'application/javascript' : 'text/html');
  res.end(fs.readFileSync(path.join(root,name==='/'?'index.html':name.slice(1))));
});
(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({headless:true, ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {})});
  try {
    const context = await browser.newContext({viewport:{width:390,height:844}});
    let mode = 'normal';
    const errors = [];
    await context.route('**/*', async route => {
      const url=route.request().url();
      if (url.startsWith(origin)) return route.continue();
      if (url.includes('cloudfunctions.net/kytalystScan')) {
        const address=route.request().postDataJSON().address;
        if(mode==='error') return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Test backend unavailable'})});
        return route.fulfill({contentType:'application/json',body:JSON.stringify({...fixture,address,
          ...(mode==='fsbo'?{listingNotFound:true,listPrice:0,arv:0}:{})})});
      }
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    const scan = async (address=fixture.address) => {
      await page.locator('#addressInput').fill(address);
      await page.getByRole('button',{name:'Scan',exact:true}).click();
    };
    const add = async ({description='Roof replacement',qty='1',material='6000',labor='4000',other='0'}={}) => {
      for(const [field,value] of Object.entries({Description:description,Qty:qty,Material:material,Labor:labor,Other:other})) {
        await page.locator('#item'+field).fill(value);
      }
      await page.getByRole('button',{name:'Add item',exact:true}).click();
    };
    const text = sel => page.locator(sel).innerText();
    await page.goto(origin);
    await scan();
    await page.locator('#budgetTotal').waitFor();
    assert.equal(await text('#projectedProfit'),'—');
    assert.equal(await text('#metricRehab'),'Draft');
    await page.getByRole('button',{name:'Apply rehab budget',exact:true}).click();
    assert.match(await text('#budgetError'),/Add at least one/);
    await add();
    assert.equal(await text('#budgetTotal'),'$11,000.00');
    assert.equal(await text('#projectedProfit'),'—');
    await page.getByRole('button',{name:'Apply rehab budget',exact:true}).click();
    assert.equal(await text('#projectedProfit'),'$52,263');
    assert.equal(await text('#metricRehab'),'$11,000.00');
    await page.getByRole('button',{name:'Edit Roof replacement',exact:true}).click();
    await page.locator('#itemLabor').fill('9000');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    assert.equal(await text('#budgetTotal'),'$16,500.00');
    assert.equal(await text('#projectedProfit'),'—');
    await page.getByRole('button',{name:'Apply rehab budget',exact:true}).click();
    assert.equal(await text('#projectedProfit'),'$46,763');
    await page.locator('#contingencyInput').fill('20');
    await page.locator('#contingencyInput').press('Tab');
    assert.equal(await text('#budgetTotal'),'$18,000.00');
    assert.equal(await text('#projectedProfit'),'—');
    await page.getByRole('button',{name:'Apply rehab budget',exact:true}).click();
    // Browser reload + rescan restores the applied property budget.
    await page.reload();await scan();await page.locator('#budgetTotal').waitFor();
    assert.equal(await text('#budgetTotal'),'$18,000.00');
    assert.equal(await text('#projectedProfit'),'$45,263');
    // Unsaved catalog item cannot accidentally apply; catalog combined cost stays editable.
    await page.locator('#wtSearch').fill('faucet');
    await page.locator('#wtSearchResults button').first().click();
    assert.equal(await page.locator('#itemOther').inputValue(),'274.82');
    await page.getByRole('button',{name:'Apply rehab budget',exact:true}).click();
    assert.match(await text('#budgetError'),/Save or cancel/);
    await page.locator('#itemOther').fill('300');
    await page.locator('#itemQty').fill('2.5');
    await page.getByRole('button',{name:'Add item',exact:true}).click();
    assert.equal(await text('#budgetSubtotal'),'$15,750.00');
    assert.equal(await text('#budgetTotal'),'$18,900.00');
    // Negative costs must not add an item.
    await add({description:'Invalid',material:'-1'});
    assert.match(await text('#budgetError'),/zero or greater/);
    assert.equal(await page.locator('.budget-item').count(),2);
    await page.getByRole('button',{name:'Cancel item',exact:true}).click();
    // New property gets no previous property's scope.
    await scan('124 Test St, Wentzville, MO 63385');await page.locator('#budgetTotal').waitFor();
    assert.equal(await page.locator('.budget-item').count(),0);
    assert.equal(await text('#projectedProfit'),'—');
    await scan();await page.locator('#budgetTotal').waitFor();
    assert.equal(await page.locator('.budget-item').count(),2);
    assert.equal(await text('#projectedProfit'),'—');
    await page.getByRole('button',{name:'Apply rehab budget',exact:true}).click();
    const overflow = await page.evaluate(()=>document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow,false,'mobile page must not overflow horizontally');
    if(process.env.SCREENSHOT_DIR) {
      await page.locator('.section-head').filter({hasText:'Build your rehab budget'}).scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'rehab-mobile.png')});
      await page.setViewportSize({width:1280,height:900});
      await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'rehab-desktop.png'),fullPage:true});
    }
    // FSBO still supports manual price and ARV, with no fabricated value or verdict.
    mode='fsbo';await scan('200 Off Market St, MO');
    await page.locator('#fsboPriceInput').fill('100000');
    await page.getByRole('button',{name:'Analyze',exact:false}).click();
    await add({description:'No rehab required',material:'0',labor:'0'});
    await page.getByRole('button',{name:'Apply rehab budget',exact:true}).click();
    assert.equal(await text('#projectedProfit'),'—');
    await page.locator('#analysisArv').fill('200000');
    await page.getByRole('button',{name:'Update analysis inputs',exact:true}).click();
    assert.equal(await text('#projectedProfit'),'$76,000');
    // Backend failures clear prior figures and never fall back to mock values.
    mode='error';await scan('999 Fail St, MO');
    await page.waitForFunction(()=>document.getElementById('statusLine').textContent.includes('Scan failed'));
    assert.equal(await page.locator('#resultsWrap').innerText(),'');
    assert.match(await text('#statusLine'),/No sample data/);
    assert.equal(await page.locator('#scanBtn').isEnabled(),true);
    assert.deepEqual(errors,[]);
    console.log('Browser checks passed: manual/catalog budgets, edits, decimal quantities, contingency, draft/apply, persistence, property isolation, FSBO, failures, mobile overflow.');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
