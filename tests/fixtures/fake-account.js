// Test double for account.js: same interface, in-memory, persisted in sessionStorage
// so saved deals survive page loads within one browser test run.
const KEY = 'kyt-fake-account';
const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) || { user: null, users: {}, deals: {}, profile: {} }; } catch (_) { return { user: null, users: {}, deals: {}, profile: {} }; } };
const state = load();
const save = () => sessionStorage.setItem(KEY, JSON.stringify(state));
const listeners = new Set();
const emit = () => listeners.forEach(cb => cb(api.user));
const dealId = a => String(a || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'deal';
window.__fakeAccountLog = window.__fakeAccountLog || [];
const api = {
  enabled: true, dealId,
  get user() { return state.user; },
  friendlyError: e => e.message,
  onChange(cb) { listeners.add(cb); cb(state.user); return () => listeners.delete(cb); },
  async idToken() { return state.user ? 'fake-token-' + state.user.uid : null; },
  async signUp(email, password) { if (password.length < 8) throw new Error('Use a password of at least 8 characters.'); state.users[email] = password; state.user = { uid: 'u-' + email, email }; save(); emit(); },
  async signIn(email, password) { if (state.users[email] !== password) throw new Error('That email and password do not match.'); state.user = { uid: 'u-' + email, email }; save(); emit(); },
  async signInGoogle() { throw new Error('Google is not available in tests.'); },
  async resetPassword() {},
  async signOut() { state.user = null; save(); emit(); },
  async getProfile() { return state.profile[state.user.uid] || null; },
  async saveAssumptions(a) { state.profile[state.user.uid] = { assumptions: a }; save(); },
  async saveDeal(deal) {
    const id = dealId(deal.address); const key = state.user.uid + '/' + id;
    const now = Date.now();
    state.deals[key] = Object.assign({}, state.deals[key], JSON.parse(JSON.stringify(deal)), { id, updatedAt: now, createdAt: (state.deals[key] || {}).createdAt || now });
    window.__fakeAccountLog.push(['saveDeal', id]); save(); return id;
  },
  async getDeal(id) { return state.deals[state.user.uid + '/' + id] || null; },
  async listDeals() { return Object.entries(state.deals).filter(([k]) => k.startsWith(state.user.uid + '/')).map(([, d]) => d).sort((a, b) => b.updatedAt - a.updatedAt); },
  async deleteDeal(id) { delete state.deals[state.user.uid + '/' + id]; save(); }
};
window.KytAccount = api;
if (window.__kytResolveAccount) window.__kytResolveAccount(api);
document.dispatchEvent(new CustomEvent('kyt-account-ready', { detail: api }));
