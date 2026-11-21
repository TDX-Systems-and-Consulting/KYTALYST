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
  firebase: {
    apiKey: 'AIzaSyAJQnegXK7u1wtOZMa-0wOpHIzDogMZG8o',
    authDomain: 'kytalyst-ac77f.firebaseapp.com',
    projectId: 'kytalyst-ac77f',
    storageBucket: 'kytalyst-ac77f.firebasestorage.app',
    messagingSenderId: '1081757518234',
    appId: '1:1081757518234:web:b703b9745c1bde7fdb1223'
  },
  scanUrl: 'https://us-central1-kytalyst-ac77f.cloudfunctions.net/kytalystScan',
  emulators: null
};
// Resolved by account.js once the account layer (Firebase or local mode) is ready.
window.kytAccountReady = new Promise(resolve => { window.__kytResolveAccount = resolve; });
