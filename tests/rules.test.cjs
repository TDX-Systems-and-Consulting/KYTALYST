// Firestore security rules. Needs the Firestore emulator (runs in CI):
//   npx firebase emulators:exec --only firestore --project demo-kytalyst "node --test tests/rules.test.cjs"
const { test, before, after } = require('node:test');
const fs = require('node:fs');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, deleteDoc, collection, getDocs } = require('firebase/firestore');

let env;
const deal = (over = {}) => Object.assign({ id: '123-test-st', address: '123 Test St', status: 'analyzing', purchasePrice: 160000,
  arv: 255000, arvOverridden: false, hipshot: 30000, assumptions: {}, results: null, scan: { listPrice: 160000 } }, over);
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-kytalyst', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
});
after(async () => { if (env) await env.cleanup(); });

test('owners manage their own deals and profile', async () => {
  const db = env.authenticatedContext('alice').firestore();
  await assertSucceeds(setDoc(doc(db, 'users/alice/deals/123-test-st'), deal()));
  await assertSucceeds(getDoc(doc(db, 'users/alice/deals/123-test-st')));
  await assertSucceeds(getDocs(collection(db, 'users/alice/deals')));
  await assertSucceeds(setDoc(doc(db, 'users/alice'), { assumptions: { holdMonths: 6 }, email: 'a@example.com' }));
  await assertSucceeds(deleteDoc(doc(db, 'users/alice/deals/123-test-st')));
});
test('nobody reads or writes another user or signed-out', async () => {
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'users/alice/deals/123-test-st'), deal()));
  const bob = env.authenticatedContext('bob').firestore();
  const anon = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(bob, 'users/alice/deals/123-test-st')));
  await assertFails(getDocs(collection(bob, 'users/alice/deals')));
  await assertFails(setDoc(doc(bob, 'users/alice/deals/x'), deal({ id: 'x' })));
  await assertFails(getDoc(doc(anon, 'users/alice/deals/123-test-st')));
});
test('bad deal shapes are rejected', async () => {
  const db = env.authenticatedContext('alice').firestore();
  await assertFails(setDoc(doc(db, 'users/alice/deals/123-test-st'), deal({ id: 'other' })));
  await assertFails(setDoc(doc(db, 'users/alice/deals/123-test-st'), deal({ status: 'sold-to-me' })));
  await assertFails(setDoc(doc(db, 'users/alice/deals/123-test-st'), deal({ purchasePrice: '160000' })));
  await assertFails(setDoc(doc(db, 'users/alice/deals/123-test-st'), deal({ extra: true })));
  await assertFails(setDoc(doc(db, 'users/alice'), { role: 'admin' }));
});
test('scan usage is read-only to its owner and never writable from the browser', async () => {
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'usage/alice/days/2026-11-21'), { scans: 3 }));
  const db = env.authenticatedContext('alice').firestore();
  await assertSucceeds(getDoc(doc(db, 'usage/alice/days/2026-11-21')));
  await assertFails(setDoc(doc(db, 'usage/alice/days/2026-11-21'), { scans: 0 }));
  await assertFails(getDoc(doc(env.authenticatedContext('bob').firestore(), 'usage/alice/days/2026-11-21')));
});
