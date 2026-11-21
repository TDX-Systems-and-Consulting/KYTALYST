# Turning on KYTALYST accounts

KYTALYST accounts live in their own Firebase project, separate from JobsMetrix (kytrac-72d91).
You enter every credential and secret yourself; none go in code or chat.

## 1. Create the project (Firebase console)
1. console.firebase.google.com → **Add project** → name it `kytalyst` (note the project ID it gives you, e.g. `kytalyst-1a2b3`). Google Analytics: off.
2. Upgrade to the **Blaze** plan (needed for Cloud Functions and Secret Manager).
3. **Build → Authentication → Get started** → enable **Email/Password** and **Google** (pick your support email).
   Settings → **Authorized domains** → add `tdx-kytalyst.com` (and `www.tdx-kytalyst.com`).
4. **Build → Firestore Database → Create database** → production mode → `us-central1`.
5. Firestore → **Rules** tab → replace everything with the contents of `firestore.rules` → **Publish**.
6. **Project settings → Your apps → Web (</>)** → nickname `kytalyst-web` → Register → copy the `firebaseConfig` block. These are public browser settings, not secrets.

## 2. Move the scanner into the project (Google Cloud Shell — works from Windows, nothing to install)
1. Open **console.cloud.google.com**, pick the `kytalyst` project at the top, and click the **Activate Cloud Shell** icon (`>_`, top right). A Linux terminal opens in your browser, already signed in, with `gcloud` and `node` ready.
2. Get the code and turn on the services:
   ```sh
   git clone -b feature/deal-model-v2 https://github.com/TDX-Systems-and-Consulting/KYTALYST.git
   cd KYTALYST
   gcloud config set project kytalyst-ac77f
   gcloud services enable secretmanager.googleapis.com cloudfunctions.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
   ```
3. Add your two keys (you paste them; nothing shows on screen and nothing is saved in a file):
   ```sh
   read -rs -p "Paste RentCast key, then Enter: " K && printf %s "$K" | gcloud secrets create RENTCAST_API_KEY --data-file=- ; echo
   read -rs -p "Paste Anthropic key, then Enter: " K && printf %s "$K" | gcloud secrets create ANTHROPIC_API_KEY --data-file=- ; unset K; echo
   PROJECT_NUMBER=$(gcloud projects describe kytalyst-ac77f --format='value(projectNumber)')
   for S in RENTCAST_API_KEY ANTHROPIC_API_KEY; do
     gcloud secrets add-iam-policy-binding $S --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" --role=roles/secretmanager.secretAccessor
   done
   ```
4. Deploy: `bash deploy-function.sh kytalyst-ac77f` — it prints the new function URL. Later redeploys: open Cloud Shell, `cd KYTALYST`, run the same line (it pulls the latest code first).

## 3. Connect the site
Edit `kytalyst-config.js`: paste the `firebaseConfig` object as `firebase`, and set `scanUrl` to the new function URL. Push to `main`. GitHub Pages publishes it.

## 4. Verify live, then shut the old door
1. On tdx-kytalyst.com: Scan → sign-in appears → create your account → the scan runs → save a Hipshot → it shows "Saved to My deals" → My deals lists it → open it on your phone, signed in.
2. Only after that works: delete the old open function in kytrac-72d91 so nobody can spend your RentCast/Anthropic credits through it:
   `gcloud functions delete kytalystScan --project kytrac-72d91 --region us-central1`

## Limits
Each account can run 50 scans per day (resets at midnight Central). Change `SCAN_DAILY_LIMIT` in `deploy-function.sh` and redeploy. Paid plans and Stripe come in a later build.
