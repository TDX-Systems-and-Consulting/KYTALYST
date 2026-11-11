# KYTALYST

Real estate deal analyzer with RentCast property data and a manually built rehab budget.

## Rehab workflow

1. Scan an address. Plain address entry works even when Google Places is unavailable.
2. Review the purchase price and enter an ARV supported by your renovation scope and comparable properties. RentCast's valuation is only a starting estimate of current value.
3. Add custom rehab items with description, trade, unit, quantity, material cost, labor cost, and other / bundled cost. All costs are **per unit**. Use quantity 1 for a complete subcontractor quote or allowance.
4. Optionally search JOBSpan to prefill an item. The July 2026 catalog contains combined package costs, so they appear in **Other / bundled**, with material and labor set to zero. Review the package scope and quantity; adjust the bundled amount or replace it with a breakdown to avoid double counting.
5. Edit or remove items and set contingency (default 10%, editable from 0–100%). Total rehab = sum of quantity × (material + labor + other), plus contingency, rounded to cents.
6. Click **Apply rehab budget** when your scope is complete. Profit and maximum offer remain blank for an unapplied draft or missing price / ARV. Saving an item, removing an item, or changing contingency returns the budget to draft. An explicitly entered $0 scope can be applied.

Budgets save per normalized address in this browser's local storage, including draft/applied status. They restore when that address is scanned again. They do not sync across devices. Unsaved editor fields are not part of the saved budget. Purchase price and ARV overrides apply to the current scan; a new scan reloads those values from RentCast.

The scanner ignores the backend's age / square-footage rehab formula. A failed live request shows an error and no results; it does not substitute sample prices or comps. RentCast valuation comparables are labeled as unverified, rather than presented as confirmed closed sales.

## Deal calculations

The existing non-rehab assumptions remain visible in the app: $20,000 target profit, 3.5% acquisition closing costs, and 10.25% resale deductions (the existing 1.25% + 3% + 6% model). Check financing, holding costs, commissions, and taxes separately for the actual deal; this change does not establish their adequacy.

- Projected profit = ARV × (1 − 0.1025) − purchase price × 1.035 − applied rehab budget.
- Maximum offer = (ARV × (1 − 0.1025) − applied rehab budget − target profit) ÷ 1.035.

Maximum offer now accounts for acquisition costs at the **offered price**, rather than subtracting the costs calculated on the original asking price.

## Local checks

Requires Node.js 20+.

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

Unit and DOM integration tests cover manual/catalog costs, decimal quantities, contingency, invalid input, draft/apply behavior, edits, removal, property-isolated persistence, FSBO overrides, and failed scans. The optional browser test also checks horizontal overflow at a 390px viewport. All tests use fixtures and do not call paid property APIs. Set `SCREENSHOT_DIR` to an existing folder for browser screenshots; `CHROMIUM_PATH` optionally selects a local Chromium executable.

Serve the repository over HTTP for manual review, for example `python3 -m http.server 8000`. Deploy `index.html` and `rehab-budget.js` together. This change requires no Cloud Function deployment; `functions/index.js` and `daily.html` retain their existing behavior.
