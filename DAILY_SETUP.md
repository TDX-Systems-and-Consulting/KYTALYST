# Activate daily property discovery

The buy box is configured in `buy-box.js`: 25 miles from the Census representative point for ZIP 63301 (38.858035, −90.463316), asking price up to $200,000, at least 2 bedrooms and 1 bathroom, $30,000 minimum modeled profit, and $100,000 maximum rehab. All residential property types are included because no narrower type was specified. The radius crosses state lines.

## One-time activation

1. In GitHub, open **Settings → Secrets and variables → Actions → New repository secret**: https://github.com/TDX-Systems-and-Consulting/KYTALYST/settings/secrets/actions
2. Name it exactly `RENTCAST_API_KEY` and enter your RentCast API key. Keep the key out of source files and chat.
3. Open **Actions → Refresh daily property matches → Run workflow**. Or rerun the initial refresh after adding the key. Once configured, the workflow refreshes every day at **13:00 UTC**, which is **7 a.m. Central Standard Time / 8 a.m. Central Daylight Time**. GitHub schedules can be delayed.
4. Check for a successful refresh and Pages build, then open `daily.html` on the website. Reload list only reloads the saved feed; it does not call RentCast again.

The first merge also attempts a refresh. If the secret is missing, the refresh fails with an activation message, retains the prior feed, and does not call RentCast. The website shows **not activated** until the first successful refresh. The Google Cloud backend key is separate; having it there does not make it available to GitHub Actions. No new Google Cloud server or function deployment is needed for the daily feed.

## API usage and coverage

- The refresh pages through active listings, up to four pages of 500, and rechecks price, beds/baths, property type and geographic distance locally. If the cap is reached, the feed is labeled **partial**.
- Up to **25 valuation requests per refresh** are allowed. Recent valuations are reused for 14 days; asking prices and listing status refresh each run. Unvalued matches stay visible as **pending**, so the first list may not value every property. Unattempted matches are processed first, then the oldest attempts; failures do not permanently starve other matches. Changed property attributes invalidate cached valuations.
- A refresh uses at most **29 RentCast requests**: four listing requests and 25 valuations. Confirm your existing plan's allowance before activation. This workflow does not buy or upgrade a subscription.
- Authentication or quota errors stop the refresh and preserve the previous successful feed. Individual valuation failures remain visible; they do not turn into fake estimates.
- The saved public feed contains listing data and normalized comp data only. API keys, owner records and unrelated provider fields are not written to it.

## ARV and rehab screening

The same `valuation.js` math is used by the address scanner and the daily refresh: select exactly three distinct, similar, usable comps; calculate each comp's listing price per square foot multiplied by subject square footage; take the median of those three adjusted values. The three displayed comps therefore explain the automatic estimate. Missing subject size or fewer than three usable comps produces **no automatic ARV**, not a fabricated third comp. Manual override remains optional for those cases.

These are **listing-based estimates**. They do not verify closed-sale prices or renovated condition. A comp's removed/listed date must never be presented as a closing date. RentCast AVM's independent `price` field is not used as the three-comp estimate.

The daily list computes how much rehab is affordable while meeting the $30,000 modeled profit target, capped at $100,000. That is **headroom**, not a rehab estimate or proof the property needs that much work. Enter a Hipshot for the specific property to assess the deal. The existing model still deducts 3.5% acquisition closing costs and 10.25% resale deductions; account for actual financing, holding, commissions, and taxes.

GitHub Actions commits `data/daily.json`, then explicitly requests a GitHub Pages build (Actions commits do not automatically retrigger workflows). Source changes remain in normal reviewed pull requests; the daily job writes only the feed. GitHub can disable scheduled workflows after prolonged repository inactivity; check Actions if the feed's displayed timestamp becomes stale.
