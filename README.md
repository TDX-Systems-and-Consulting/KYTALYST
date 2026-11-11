# KYTALYST

Real estate deal analyzer with RentCast property data and a simple **Hipshot** rehab estimate.

## Using Hipshot

1. Scan the address. One address field is shown beside Scan. Google Places suggestions replace the plain input when available; use **Enter address manually** to switch. If Maps fails, plain entry stays available automatically.
2. Review purchase price and ARV. RentCast's current valuation is a starting estimate, not a verified after-repair value.
3. Enter your total rehab budget in **Hipshot**. Tap **Save Hipshot** (or press Enter) to update profit and maximum offer using exactly that amount. Editing an amount hides the previous figures until saved. The two range cards show **−10%** and **+10%**, without adding either percentage to your main budget. For example, $30,000 shows $27,000–$33,000 and uses $30,000 in the main analysis.

Empty or invalid Hipshots withhold the profit and maximum offer; an explicit $0 is accepted. Each property's saved estimate stays in this browser and restores when its address is scanned again. It does not sync across devices. Previously saved detailed budgets are left untouched under their original storage keys; they are not silently converted into Hipshots. Price and ARV overrides apply to the current scan only.

There is no rehab formula, line-item editor, or extra contingency in the main analyzer. Failed live requests show an error instead of sample prices. RentCast valuation comparables are labeled as unverified.

## Deal calculations

Existing non-rehab assumptions: $20,000 target profit, 3.5% acquisition closing costs, 10.25% resale deductions. Check financing, holding costs, commissions, and taxes for the actual deal.

- Projected profit = ARV × (1 − 0.1025) − purchase price × 1.035 − Hipshot.
- Maximum offer = (ARV × (1 − 0.1025) − Hipshot − target profit) ÷ 1.035.

## Checks and publishing

Requires Node.js 20+.

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

Tests use property fixtures and never call paid APIs. Unit/DOM checks cover ±10% ranges, base-budget profit, edits, persistence, property isolation, validation, FSBO and failed requests. Browser checks also cover mobile overflow and the single address field with Maps loaded or unavailable. GitHub Actions saves mobile and desktop screenshots. `SCREENSHOT_DIR` optionally selects an existing screenshot folder; `CHROMIUM_PATH` selects a local Chromium binary.

Serve locally with `python3 -m http.server 8000`. Publish `index.html` and `rehab-budget.js` together. No Cloud Function redeployment is required; the backend and daily shortlist retain their existing behavior.
