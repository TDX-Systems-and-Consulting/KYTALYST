// Accounts, saved deals, deal history and PDF export in a real browser.
// Part 1 uses an in-memory account double; part 2 uses the real account.js +
// Firebase SDK against the Auth emulator (start it first, see function.test.cjs).
// Run: CHROMIUM_PATH=... node tests/accounts.browser.test.cjs
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const AUTH_EMULATOR = 'http://' + (process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099');
const types = { '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.html': 'text/html' };
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.join(root, name === '/' ? 'index.html' : name.slice(1));
  if (!file.startsWith(root + path.sep) || file.includes('node_modules') || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});
const fixture = { listPrice: 160000, arv: 999999, sqft: 1657, yearBuilt: 2004, listingStatus: 'Active', rehabTier: 'heavy',
  distressSignals: ['as-is'], comps: [250000, 255000, 260000].map((price, i) => ({ addr: (125 + i * 2) + ' Test St', price, beds: 3, baths: 2, sqft: 1657 })) };

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const shots = process.env.SCREENSHOT_DIR;
  const errors = [];
  try {
    // ---------------- Part 1: account double ----------------
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const scans = [];
    await ctx.route('**/*', async route => {
      const url = route.request().url();
      if (url.startsWith(origin + '/account.js')) return route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(__dirname, 'fixtures/fake-account.js')) });
      if (url.startsWith(origin)) return route.continue();
      if (url.includes('cloudfunctions.net/kytalystScan')) {
        const h = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: h });
        scans.push(route.request().headers().authorization || '');
        return route.fulfill({ headers: h, contentType: 'application/json', body: JSON.stringify({ ...fixture, address: route.request().postDataJSON().address }) });
      }
      return route.abort();
    });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    const text = sel => page.locator(sel).innerText();
    await page.goto(origin);
    await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
    await page.locator('#addressInput').fill('123 Test St, Wentzville, MO 63385');
    await page.getByRole('button', { name: 'Scan', exact: true }).click();
    await page.locator('#authDialog').waitFor({ state: 'visible' });
    assert.equal(scans.length, 0, 'no paid scan before sign-in');
    if (shots) await page.screenshot({ path: path.join(shots, 'signin-mobile.png') });
    await page.getByRole('button', { name: 'New here? Create account' }).click();
    assert.equal(await text('#authTitle'), 'Create your account');
    await page.locator('#authEmail').fill('travis@example.com');
    await page.locator('#authPassword').fill('short');
    await page.locator('#authSubmit').click();
    assert.equal(await page.locator('#authPassword').evaluate(el => el.validity.tooShort), true, 'browser blocks a short password');
    await page.locator('#authPassword').fill('long-enough-1');
    await page.locator('#authSubmit').click();
    await page.locator('#hipshotInput').waitFor();
    assert.equal(await page.locator('#authDialog').isVisible(), false);
    assert.equal(scans.length, 1);
    assert.match(scans[0], /^Bearer fake-token-/);
    await page.getByRole('link', { name: 'My deals' }).waitFor();

    await page.locator('#hipshotInput').fill('30000');
    await page.getByRole('button', { name: 'Save Hipshot', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('dealSaveStatus').textContent === 'Saved to My deals');
    await page.locator('#dealStatus').selectOption('offer');
    await page.locator('#analysisArv').fill('260000');
    await page.getByRole('button', { name: 'Update analysis inputs', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('dealSaveStatus').textContent === 'Saved to My deals');
    assert.equal(await text('#projectedProfit'), '$20,830');

    // PDF export: the button prints; the print layout is a clean one-page-style sheet.
    await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
    await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__printed), 1);
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('.topbar').isVisible(), false);
    assert.equal(await page.locator('.print-header').isVisible(), true);
    assert.equal(await page.locator('#dealLedger').isVisible(), true);
    assert.equal(await page.locator('.assumption-actions').isVisible(), false);
    const pdf = await page.pdf({ format: 'Letter', printBackground: true, path: shots ? path.join(shots, 'deal-sheet.pdf') : undefined });
    assert.ok(pdf.length > 10000, 'PDF rendered');
    await page.emulateMedia({ media: 'screen' });

    // My deals lists it; opening it restores everything without a paid scan.
    await page.goto(origin + '/deals.html');
    await page.locator('.deal-card').first().waitFor();
    assert.equal(await page.locator('.deal-card').count(), 1);
    const card = await text('.deal-card');
    assert.match(card, /Offer made/); assert.match(card, /\$20,830/); assert.match(card, /\$260,000/); assert.match(card, /54\.1%/);
    if (shots) await page.screenshot({ path: path.join(shots, 'my-deals-mobile.png'), fullPage: true });
    const before = scans.length;
    await page.getByRole('link', { name: 'Open deal ↗' }).click();
    await page.locator('#hipshotInput').waitFor();
    assert.equal(scans.length, before, 'saved deal opens without a paid scan');
    assert.equal(await page.locator('#hipshotInput').inputValue(), '30000');
    assert.equal(await page.locator('#analysisArv').inputValue(), '260000');
    assert.equal(await page.locator('#dealStatus').inputValue(), 'offer');
    assert.equal(await text('#projectedProfit'), '$20,830');

    // Assumptions follow the account: change to all-cash, clear this browser's copy, reload.
    await page.locator('#as_financing').selectOption('cash');
    await page.getByRole('button', { name: 'Save assumptions', exact: true }).click();
    await page.evaluate(() => localStorage.removeItem('kytalyst-assumptions-v1'));
    await page.reload();
    await page.locator('#hipshotInput').waitFor();
    await page.waitForFunction(() => document.getElementById('as_financing').value === 'cash');
    assert.equal(await text('#projectedProfit'), '$34,750');

    // Re-scanning the same address restores the saved Hipshot and status.
    await page.goto(origin);
    await page.locator('#addressInput').fill('123 Test St, Wentzville, MO 63385');
    await page.getByRole('button', { name: 'Scan', exact: true }).click();
    await page.locator('#hipshotInput').waitFor();
    assert.equal(await page.locator('#hipshotInput').inputValue(), '30000');
    assert.equal(await page.locator('#dealStatus').inputValue(), 'offer');

    // Remove (two taps, no browser dialog), then sign out.
    await page.goto(origin + '/deals.html');
    await page.locator('.deal-card').first().waitFor();
    await page.getByRole('button', { name: 'Remove' }).click();
    assert.equal(await page.locator('.deal-card').count(), 1);
    await page.getByRole('button', { name: 'Tap again to remove' }).click();
    await page.getByText('No saved deals yet.').waitFor();
    await page.locator('.account-menu summary').click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.locator('#authDialog').waitFor({ state: 'visible' });
    assert.match(await text('#dealsStatus'), /Sign in to see/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await ctx.close();

    // ---------------- Part 2: real Firebase Auth (emulator) ----------------
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const tokens = [];
    const config = `window.KYTALYST_CONFIG={firebase:{apiKey:'demo-key',authDomain:'127.0.0.1',projectId:'demo-kytalyst'},scanUrl:'https://us-central1-demo.cloudfunctions.net/kytalystScan',emulators:{auth:'${AUTH_EMULATOR}',firestore:{host:'127.0.0.1',port:8089}}};window.kytAccountReady=new Promise(r=>{window.__kytResolveAccount=r;});`;
    await ctx2.route('**/*', async route => {
      const url = route.request().url();
      if (url.startsWith(origin + '/kytalyst-config.js')) return route.fulfill({ contentType: 'application/javascript', body: config });
      if (url.startsWith(origin) || url.startsWith(AUTH_EMULATOR)) return route.continue();
      if (url.includes('cloudfunctions.net/kytalystScan')) {
        const h = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: h });
        tokens.push((route.request().headers().authorization || '').replace(/^Bearer /, ''));
        return route.fulfill({ headers: h, contentType: 'application/json', body: JSON.stringify({ ...fixture, address: route.request().postDataJSON().address }) });
      }
      return route.abort();
    });
    const p2 = await ctx2.newPage();
    p2.on('pageerror', e => errors.push(e.message));
    await p2.goto(origin);
    await p2.getByRole('button', { name: 'Sign in', exact: true }).waitFor({ timeout: 15000 });
    await p2.locator('#addressInput').fill('500 Real Auth Ave, MO');
    await p2.getByRole('button', { name: 'Scan', exact: true }).click();
    await p2.locator('#authDialog').waitFor({ state: 'visible' });
    const email = `real-${Date.now()}@example.com`;
    await p2.getByRole('button', { name: 'New here? Create account' }).click();
    await p2.locator('#authEmail').fill(email);
    await p2.locator('#authPassword').fill('real-password-1');
    await p2.locator('#authSubmit').click();
    await p2.locator('#hipshotInput').waitFor({ timeout: 20000 });
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].split('.').length, 3, 'Firebase ID token sent to the scanner');
    const verify = await fetch(`${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:lookup?key=demo-key`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: tokens[0] }) });
    assert.equal((await verify.json()).users[0].email, email, 'token belongs to the new account');
    if (shots) await p2.screenshot({ path: path.join(shots, 'signed-in-desktop.png') });
    await p2.locator('.account-menu summary').click();
    await p2.getByRole('button', { name: 'Sign out' }).click();
    await p2.getByRole('button', { name: 'Sign in', exact: true }).click();
    await p2.locator('#authEmail').fill(email);
    await p2.locator('#authPassword').fill('wrong-password-1');
    await p2.locator('#authSubmit').click();
    await p2.waitForFunction(() => document.getElementById('authError').textContent.length > 0);
    assert.match(await p2.locator('#authError').innerText(), /do not match/);
    await p2.locator('#authPassword').fill('real-password-1');
    await p2.locator('#authSubmit').click();
    await p2.getByRole('link', { name: 'My deals' }).waitFor();
    await ctx2.close();

    assert.deepEqual(errors, []);
    console.log('Account checks passed: sign-in gate, create account, bearer token, auto-save, status, PDF sheet, My deals list/open/remove, account assumptions, sign out, real Firebase Auth sign-up/sign-in/wrong password.');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
