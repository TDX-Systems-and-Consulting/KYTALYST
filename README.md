# KYTALYST

Real estate deal analyzer with RentCast property data and a simple **Hipshot** rehab estimate.

## Property discovery

Open **Daily matches** to see the saved buy box and property list: ZIP 63301 + 25 miles, purchase ≤ $200,000, 2+ beds, 1+ bath, $30,000 modeled profit target, $100,000 rehab ceiling. The rehab ceiling is not a default cost. All residential property types are included. Three-comp ARV and rehab headroom are calculated automatically; a property-specific Hipshot determines the modeled deal verdict.

See [DAILY_SETUP.md](DAILY_SETUP.md) for one-time RentCast secret activation, schedule, API-call limits, caching, coverage and valuation limitations. Until the first successful refresh, the page states that activation is required instead of showing fake matches.

## Using Hipshot

1. Scan the address. One address field is shown beside Scan. Google Places suggestions replace the plain input when available; use **Enter address manually** to switch. If Maps fails, plain entry stays available automatically.
2. ARV is filled automatically from three size-adjusted RentCast listing comparables. The displayed comps explain the estimate; manual ARV entry is an optional override. Renovated condition and closed-sale prices are not verified.
3. Enter your total rehab budget in **Hipshot**. Tap **Save Hipshot** (or press Enter) to update profit and maximum offer using exactly that amount. Editing an amount hides the previous figures until saved. The two range cards show **−10%** and **+10%**, without adding either percentage to your main budget. For example, $30,000 shows $27,000–$33,000 and uses $30,000 in the main analysis.

Empty or invalid Hipshots withhold the profit and maximum offer; an explicit $0 is accepted. Failed live requests show an error instead of sample prices. RentCast valuation comparables are labeled as unverified.

## Accounts and My deals

Once the KYTALYST Firebase project is connected (see [ACCOUNTS_SETUP.md](ACCOUNTS_SETUP.md)), scanning requires a KYTALYST account (email/password or Google). KYTALYST accounts are separate from JobsMetrix. Each deal saves automatically to **My deals** when you save a Hipshot, change price/ARV, change assumptions or set a deal status (Analyzing, Watching, Offer made, Under contract, Bought, Passed). My deals sorts by date, profit, return on cash or price; opening a deal restores it without a paid scan. Deal assumptions follow the account to every device. **Export PDF** prints a one-deal sheet (choose "Save as PDF").

Until `kytalyst-config.js` has the Firebase settings, the site runs in local mode exactly as before: no sign-in, Hipshots and assumptions saved in this browser only.

## Deal calculations

All math lives in `deal-model.js` and is shared by the deal page, the daily feed and tests. Every assumption is editable in **Deal assumptions** and saved as your default.

| Assumption | Default |
|---|---|
| Target profit | $30,000 |
| Buy closing costs | 3.5% of purchase |
| Financing | Hard money: 90% of purchase + 100% of rehab, 12%/yr interest-only, 2 points (or All cash) |
| Holding | 6 months × $500/month (taxes, insurance, utilities) |
| Agent commissions | 6% of ARV |
| Buyer concessions | 3% of ARV |
| Seller title & closing | 1.25% of ARV |

The three selling lines are the old 10.25% "resale deductions," now labeled. Interest is charged on the full loan for the whole hold (conservative). Income taxes on profit are not included.

- Loan = purchase × loan % + rehab × rehab-financed %; financing cost = loan × (points + rate × months ÷ 12).
- Projected profit = ARV − selling costs − purchase − buy closing − rehab − financing − holding.
- Maximum offer = the purchase price at which projected profit equals the target (solved exactly).
- Cash you bring = everything paid out minus the loan; return on cash = profit ÷ cash you bring.
- Daily-feed headroom = the largest rehab that still hits the target at the asking price.

## Workspace design

The responsive charcoal/copper workspace includes a property overview, target-profit indicator, saved-budget cost allocation, light/dark themes, loading states and reduced-motion support. Visuals use current scan data and saved Hipshot values; no sample deal numbers appear in production. The main analysis collapses the intro to keep the workspace compact on phones.

## Checks and publishing

Requires Node.js 22.

```sh
npm ci && (cd functions && npm ci)
npm test                      # deal math, DOM and discovery checks
npm run test:all              # everything, inside Firebase emulators (Java needed)
```

`test:all` runs: unit/DOM tests; the scan function's access control against the Auth emulator (no token, bad token, foreign website, daily cap, with RentCast/Anthropic faked); Firestore security rules; and browser checks (Hipshot flows, hard-money math by hand, sign-in gate, real Firebase sign-up/sign-in, auto-save, My deals, PDF sheet, mobile overflow). Tests never call paid APIs. GitHub Actions runs all of it on every push and saves screenshots. `CHROMIUM_PATH` selects a local Chromium; `SCREENSHOT_DIR` saves screenshots.

The scan function deploys with `./deploy-function.sh <kytalyst-project-id>` (Node 22, 2nd gen, secrets from Secret Manager). The site publishes through GitHub Pages from `main`.
