// KYTALYST account layer: sign-in, saved deals and saved assumptions.
// With no Firebase config this resolves a local-mode adapter (enabled:false)
// and the site keeps working exactly as before, saving in this browser only.
const cfg = window.KYTALYST_CONFIG || {};

export function dealId(address) {
  return String(address || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'deal';
}

function localAdapter() {
  return {
    enabled: false, user: null, dealId,
    onChange(cb) { cb(null); return () => {}; },
    async idToken() { return null; }
  };
}

const AUTH_MESSAGES = {
  'auth/invalid-credential': 'That email and password do not match.',
  'auth/wrong-password': 'That email and password do not match.',
  'auth/user-not-found': 'No account uses that email yet. Choose Create account.',
  'auth/email-already-in-use': 'An account already uses that email. Sign in instead.',
  'auth/weak-password': 'Use a password of at least 8 characters.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/popup-closed-by-user': 'Google sign-in was closed before it finished.',
  'auth/network-request-failed': 'Network problem. Check your connection and try again.',
  'auth/unauthorized-domain': 'This web address is not approved for sign-in yet.'
};
export function friendlyError(err) {
  return AUTH_MESSAGES[err && err.code] || (err && err.message) || 'Something went wrong. Try again.';
}

async function firebaseAdapter() {
  const fb = await import('./vendor/firebase-13.4.0.js');
  const app = fb.initializeApp(cfg.firebase);
  const auth = fb.getAuth(app);
  const db = fb.getFirestore(app);
  if (cfg.emulators) {
    fb.connectAuthEmulator(auth, cfg.emulators.auth, { disableWarnings: true });
    if (cfg.emulators.firestore) fb.connectFirestoreEmulator(db, cfg.emulators.firestore.host, cfg.emulators.firestore.port);
  }
  await fb.setPersistence(auth, fb.browserLocalPersistence);

  const listeners = new Set();
  let firstResolved = false;
  let resolveFirst;
  const firstState = new Promise(r => { resolveFirst = r; });

  const api = {
    enabled: true, user: null, dealId, friendlyError,
    onChange(cb) { listeners.add(cb); if (firstResolved) cb(api.user); return () => listeners.delete(cb); },
    async idToken() { return auth.currentUser ? auth.currentUser.getIdToken() : null; },
    async signIn(email, password) { await fb.signInWithEmailAndPassword(auth, email, password); },
    async signUp(email, password) {
      if (String(password || '').length < 8) throw Object.assign(new Error(), { code: 'auth/weak-password' });
      await fb.createUserWithEmailAndPassword(auth, email, password);
    },
    async signInGoogle() { await fb.signInWithPopup(auth, new fb.GoogleAuthProvider()); },
    async resetPassword(email) { await fb.sendPasswordResetEmail(auth, email); },
    async signOut() { await fb.signOut(auth); },

    async getProfile() {
      const snap = await fb.getDoc(fb.doc(db, 'users', need()));
      return snap.exists() ? snap.data() : null;
    },
    async saveAssumptions(assumptions) {
      await fb.setDoc(fb.doc(db, 'users', need()), { assumptions, email: auth.currentUser.email || '', updatedAt: fb.serverTimestamp() }, { merge: true });
    },
    async saveDeal(deal) {
      const id = dealId(deal.address);
      const ref = fb.doc(db, 'users', need(), 'deals', id);
      const existing = await fb.getDoc(ref);
      const data = Object.assign({}, deal, { id, updatedAt: fb.serverTimestamp() });
      if (!existing.exists()) data.createdAt = fb.serverTimestamp();
      await fb.setDoc(ref, data, { merge: true });
      return id;
    },
    async getDeal(id) {
      const snap = await fb.getDoc(fb.doc(db, 'users', need(), 'deals', id));
      return snap.exists() ? toPlain(snap.data()) : null;
    },
    async listDeals() {
      const q = fb.query(fb.collection(db, 'users', need(), 'deals'), fb.orderBy('updatedAt', 'desc'), fb.limit(500));
      return (await fb.getDocs(q)).docs.map(d => toPlain(d.data()));
    },
    async deleteDeal(id) { await fb.deleteDoc(fb.doc(db, 'users', need(), 'deals', id)); }
  };
  function need() {
    if (!auth.currentUser) throw new Error('Sign in first.');
    return auth.currentUser.uid;
  }
  function toPlain(d) {
    const out = Object.assign({}, d);
    ['createdAt', 'updatedAt'].forEach(k => { if (out[k] && typeof out[k].toMillis === 'function') out[k] = out[k].toMillis(); });
    return out;
  }
  fb.onAuthStateChanged(auth, user => {
    api.user = user ? { uid: user.uid, email: user.email, displayName: user.displayName } : null;
    firstResolved = true;
    resolveFirst();
    listeners.forEach(cb => { try { cb(api.user); } catch (e) { console.warn(e); } });
  });
  await firstState;
  return api;
}

(async () => {
  let api;
  try {
    api = cfg.firebase ? await firebaseAdapter() : localAdapter();
  } catch (err) {
    console.warn('KYTALYST account service unavailable:', err);
    api = Object.assign(localAdapter(), { failed: true });
  }
  window.KytAccount = api;
  if (window.__kytResolveAccount) window.__kytResolveAccount(api);
  document.dispatchEvent(new CustomEvent('kyt-account-ready', { detail: api }));
})();
