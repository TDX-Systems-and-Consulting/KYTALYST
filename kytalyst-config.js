/*
 * KYTALYST site settings. These values are PUBLIC browser settings, not secrets.
 *
 * firebase: paste the firebaseConfig object from the KYTALYST Firebase project
 *           (Project settings → Your apps → Web app). While it is null the site
 *           runs in local mode: no sign-in, deals saved in this browser only.
 * scanUrl:  the kytalystScan Cloud Function. Once the function lives in the
 *           KYTALYST project, change this to that project's URL.
 * emulators: local testing only; leave null on the live site.
 */
window.KYTALYST_CONFIG = {
  firebase: null,
  scanUrl: 'https://us-central1-kytrac-72d91.cloudfunctions.net/kytalystScan',
  emulators: null
};
// Resolved by account.js once the account layer (Firebase or local mode) is ready.
window.kytAccountReady = new Promise(resolve => { window.__kytResolveAccount = resolve; });
