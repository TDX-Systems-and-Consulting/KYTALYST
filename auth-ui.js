// Sign-in button, account menu and sign-in dialog shared by every KYTALYST page.
(function () {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let account = null;
  let pending = [];
  let mode = 'signin';

  function slot() { return document.getElementById('accountSlot'); }

  function renderSlot(user) {
    const el = slot();
    if (!el || !account) return;
    if (!account.enabled) {
      el.innerHTML = account.failed ? '<span class="account-note" title="Deals save in this browser until sign-in is back">Sign-in unavailable</span>' : '';
      return;
    }
    el.innerHTML = user
      ? `<a class="daily-nav" href="deals.html">My deals</a><details class="account-menu"><summary aria-label="Account menu">${esc((user.email || 'Account').split('@')[0])}</summary><div><span>${esc(user.email || '')}</span><button type="button" onclick="KytAuthUI.signOut()">Sign out</button></div></details>`
      : '<button type="button" class="account-btn" onclick="KytAuthUI.open()">Sign in</button>';
  }

  function dialog() {
    let d = document.getElementById('authDialog');
    if (d) return d;
    d = document.createElement('div');
    d.id = 'authDialog';
    d.className = 'auth-overlay';
    d.hidden = true;
    d.innerHTML = `
      <div class="auth-card" role="dialog" aria-modal="true" aria-labelledby="authTitle">
        <button type="button" class="auth-close" aria-label="Close" onclick="KytAuthUI.close()">×</button>
        <div class="eyebrow">KYTALYST account</div>
        <h2 id="authTitle">Sign in</h2>
        <p class="budget-note" id="authLead">Sign in to scan properties and keep your deals on every device.</p>
        <button type="button" class="auth-google" id="authGoogleBtn" onclick="KytAuthUI.google()">Continue with Google</button>
        <div class="auth-divider"><span>or</span></div>
        <form id="authForm" onsubmit="event.preventDefault();KytAuthUI.submit()">
          <label>Email<input id="authEmail" type="email" autocomplete="email" required></label>
          <label id="authPasswordLabel">Password<input id="authPassword" type="password" autocomplete="current-password" minlength="8"></label>
          <button type="submit" class="budget-btn" id="authSubmit">Sign in</button>
        </form>
        <div id="authError" class="budget-error" role="alert"></div>
        <p id="authStatus" class="budget-note" role="status"></p>
        <div class="auth-links">
          <button type="button" id="authModeBtn" onclick="KytAuthUI.toggleMode()">New here? Create account</button>
          <button type="button" id="authResetBtn" onclick="KytAuthUI.setMode('reset')">Forgot password?</button>
        </div>
      </div>`;
    document.body.appendChild(d);
    d.addEventListener('click', e => { if (e.target === d) api.close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !d.hidden) api.close(); });
    return d;
  }

  function setBusy(busy) {
    ['authSubmit', 'authGoogleBtn'].forEach(id => { const b = document.getElementById(id); if (b) b.disabled = busy; });
  }

  const api = {
    open(lead) {
      if (!account || !account.enabled) return;
      const d = dialog();
      api.setMode('signin');
      if (lead) document.getElementById('authLead').textContent = lead;
      d.hidden = false;
      setTimeout(() => { const e = document.getElementById('authEmail'); if (e) e.focus(); }, 0);
    },
    close() {
      const d = document.getElementById('authDialog');
      if (d) d.hidden = true;
      const waiting = pending; pending = [];
      waiting.forEach(p => p.resolve(account && account.user));
    },
    setMode(next) {
      mode = next;
      const reset = mode === 'reset', signup = mode === 'signup';
      document.getElementById('authTitle').textContent = reset ? 'Reset your password' : signup ? 'Create your account' : 'Sign in';
      document.getElementById('authSubmit').textContent = reset ? 'Send reset link' : signup ? 'Create account' : 'Sign in';
      document.getElementById('authPasswordLabel').hidden = reset;
      document.getElementById('authPassword').required = !reset;
      document.getElementById('authPassword').autocomplete = signup ? 'new-password' : 'current-password';
      document.getElementById('authModeBtn').textContent = signup || reset ? 'Have an account? Sign in' : 'New here? Create account';
      document.getElementById('authResetBtn').hidden = reset;
      document.getElementById('authError').textContent = '';
      document.getElementById('authStatus').textContent = signup ? 'Use at least 8 characters for your password.' : '';
    },
    toggleMode() { api.setMode(mode === 'signin' ? 'signup' : 'signin'); },
    async submit() {
      const email = document.getElementById('authEmail').value.trim();
      const password = document.getElementById('authPassword').value;
      document.getElementById('authError').textContent = '';
      setBusy(true);
      try {
        if (mode === 'reset') {
          await account.resetPassword(email);
          document.getElementById('authStatus').textContent = 'If that email has an account, a reset link is on its way.';
        } else if (mode === 'signup') {
          await account.signUp(email, password);
        } else {
          await account.signIn(email, password);
        }
      } catch (err) {
        document.getElementById('authError').textContent = account.friendlyError ? account.friendlyError(err) : err.message;
      } finally { setBusy(false); }
    },
    async google() {
      document.getElementById('authError').textContent = '';
      setBusy(true);
      try { await account.signInGoogle(); }
      catch (err) { document.getElementById('authError').textContent = account.friendlyError ? account.friendlyError(err) : err.message; }
      finally { setBusy(false); }
    },
    async signOut() { if (account && account.enabled) await account.signOut(); },
    /** Resolves with the signed-in user, opening the dialog if needed; null if they close it. */
    requireSignIn(lead) {
      if (!account || !account.enabled) return Promise.resolve(null);
      if (account.user) return Promise.resolve(account.user);
      return new Promise(resolve => { pending.push({ resolve }); api.open(lead); });
    }
  };
  window.KytAuthUI = api;

  function attach(acc) {
    account = acc;
    renderSlot(acc.user);
    if (acc.enabled) acc.onChange(user => {
      renderSlot(user);
      if (user) {
        const d = document.getElementById('authDialog');
        if (d && !d.hidden) api.close();
      }
    });
  }
  if (window.kytAccountReady) window.kytAccountReady.then(attach);
})();
