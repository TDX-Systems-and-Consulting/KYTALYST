// kytalystScan access control, run against the Firebase Auth emulator with
// RentCast/Anthropic and Firestore faked. Start the emulator first:
//   npx firebase emulators:start --only auth --project demo-kytalyst
// then: FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node --test tests/function.test.cjs
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-kytalyst';
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
process.env.SCAN_DAILY_LIMIT = '2';
process.env.RENTCAST_API_KEY = 'test-rentcast';
process.env.ANTHROPIC_API_KEY = 'test-anthropic';

// Fake Firestore (the emulator jar cannot be downloaded here); counts per doc path.
const store = new Map();
const fakeFirestore = {
  getFirestore: () => ({
    collection: c => ({ doc: d => ({ collection: c2 => ({ doc: d2 => ({ path: [c, d, c2, d2].join('/') }) }) }) }),
    runTransaction: async fn => {
      const pending = [];
      await fn({
        get: async ref => ({ exists: store.has(ref.path), get: k => (store.get(ref.path) || {})[k] }),
        set: (ref, data) => pending.push([ref, data])
      });
      for (const [ref, data] of pending) {
        const cur = store.get(ref.path) || {};
        store.set(ref.path, { ...cur, scans: (cur.scans || 0) + 1, email: data.email });
      }
    }
  }),
  FieldValue: { increment: n => ({ increment: n }), serverTimestamp: () => 'ts' }
};
const realLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'firebase-admin/firestore') return fakeFirestore;
  return realLoad.apply(this, arguments);
};
// Fake paid providers; anything else (the Auth emulator) goes to the real fetch.
const realFetch = global.fetch;
let providerCalls = 0;
global.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes('api.rentcast.io/v1/listings')) { providerCalls++; return new Response(JSON.stringify([{ price: 150000, status: 'Active', squareFootage: 1500, bedrooms: 3, bathrooms: 2, description: 'as-is' }]), { status: 200 }); }
  if (u.includes('api.rentcast.io/v1/avm')) { providerCalls++; return new Response(JSON.stringify({ price: 260000, comparables: [] }), { status: 200 }); }
  if (u.includes('api.anthropic.com')) { providerCalls++; return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"distress_detected":true,"distress_signals":["as-is"],"rehab_tier":"light","confidence":"high"}' }] }), { status: 200 }); }
  return realFetch(url, opts);
};

const { getFunction } = require(path.join(__dirname, '../functions/node_modules/@google-cloud/functions-framework/build/src/testing.js'));
require('../functions/index.js');
const scan = getFunction('kytalystScan');

function call({ method = 'POST', origin = 'https://tdx-kytalyst.com', token, body = { address: '123 Test St, Wentzville, MO 63385' } } = {}) {
  const headers = { origin };
  if (token) headers.authorization = 'Bearer ' + token;
  const req = { method, body, get: h => headers[h.toLowerCase()] };
  return new Promise(resolve => {
    const res = { headers: {}, statusCode: 200,
      set(k, v) { this.headers[k] = v; return this; },
      status(c) { this.statusCode = c; return this; },
      json(b) { resolve({ status: this.statusCode, body: b, headers: this.headers }); },
      send(b) { resolve({ status: this.statusCode, body: b, headers: this.headers }); } };
    scan(req, res);
  });
}

let token;
before(async () => {
  const host = 'http://' + process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const email = `scan-${Date.now()}@example.com`;
  const r = await realFetch(`${host}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct-horse-9', returnSecureToken: true }) });
  token = (await r.json()).idToken;
  assert.ok(token, 'emulator issued a token');
});

test('preflight only answers approved web addresses', async () => {
  const ok = await call({ method: 'OPTIONS' });
  assert.equal(ok.status, 204);
  assert.equal(ok.headers['Access-Control-Allow-Origin'], 'https://tdx-kytalyst.com');
  assert.match(ok.headers['Access-Control-Allow-Headers'], /Authorization/);
  const bad = await call({ method: 'OPTIONS', origin: 'https://evil.example' });
  assert.equal(bad.status, 403);
  assert.equal(bad.headers['Access-Control-Allow-Origin'], undefined);
});

test('no sign-in, bad token or foreign site never reaches the paid providers', async () => {
  assert.equal((await call()).status, 401);
  assert.equal((await call({ token: 'not-a-real-token' })).status, 401);
  assert.equal((await call({ token, origin: 'https://evil.example' })).status, 403);
  assert.equal((await call({ token, method: 'GET' })).status, 405);
  assert.equal((await call({ token, body: {} })).status, 400);
  assert.equal(providerCalls, 0);
});

test('signed-in scan works and the daily cap stops the third scan', async () => {
  const first = await call({ token });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.listPrice, 150000);
  assert.deepEqual(first.body.distressSignals, ['as-is']);
  assert.equal((await call({ token })).status, 200);
  const calls = providerCalls;
  const third = await call({ token });
  assert.equal(third.status, 429);
  assert.match(third.body.error, /Daily scan limit/);
  assert.equal(providerCalls, calls, 'capped scan made no paid calls');
});
