const { http } = require('@google-cloud/functions-framework');

const DISTRESS_SYSTEM_PROMPT = `You are a distress-signal detector for real estate listings. You will receive a property description. Your only job is to output JSON, nothing else.

Look for language indicating seller motivation or property distress:
- "as-is," "handyman special," "TLC," "fixer," "cash only," "investor special"
- "corporate owned," "estate sale," "must sell," "motivated seller," "short sale"
- "gut," "fire damage," "uninhabitable," "condemned," "flashlight tour"

Output exactly this JSON structure and nothing else:
{
  "distress_detected": true or false,
  "distress_signals": ["list", "of", "exact", "phrases", "found"],
  "rehab_tier": "light" or "heavy" or "none",
  "confidence": "high" or "medium" or "low"
}`;

function estimateRehab(sqft, yearBuilt) {
  const currentYear = new Date().getFullYear();
  const age = currentYear - (yearBuilt || currentYear - 40);
  let base = 25000;
  base += age > 40 ? 3000 : age > 20 ? 1000 : 0;
  const over2000 = Math.max(0, Math.floor((sqft - 2000) / 500));
  base += over2000 * 3000;
  const unknownsBuffer = base * 0.25;
  return { base: Math.round(base), unknownsBuffer: Math.round(unknownsBuffer), total: Math.round(base + unknownsBuffer) };
}

function evaluateDeal({ listPrice, arv, rehabTotal, wantedProfit }) {
  const closingCosts = listPrice * 0.035;
  const sellingCosts = arv * (0.0125 + 0.03 + 0.06);
  const allInCost = listPrice + rehabTotal + closingCosts;
  const netSalePrice = arv - sellingCosts;
  const projectedProfit = netSalePrice - allInCost;
  const isDeal = projectedProfit >= wantedProfit;
  const mao = arv - sellingCosts - rehabTotal - closingCosts - wantedProfit;
  return { projectedProfit: Math.round(projectedProfit), isDeal, mao: Math.round(mao) };
}

// Filter and score comps for similarity to subject property
function filterComps(comparables, subjectSqft, subjectBeds, subjectBaths) {
  if (!comparables || comparables.length === 0) return [];

  const scored = comparables
    .filter(c => c.price && c.price > 0)
    .map(c => {
      let score = 0;
      const cSqft = c.squareFootage || c.squareFeet || 0;
      const cBeds = c.bedrooms || 0;
      const cBaths = c.bathrooms || 0;

      // Sqft similarity — penalize if more than 25% off
      if (subjectSqft && cSqft) {
        const sqftDiff = Math.abs(cSqft - subjectSqft) / subjectSqft;
        if (sqftDiff <= 0.10) score += 40;
        else if (sqftDiff <= 0.20) score += 25;
        else if (sqftDiff <= 0.30) score += 10;
        else score -= 20; // too different
      }

      // Bedroom match
      if (subjectBeds && cBeds) {
        if (cBeds === subjectBeds) score += 30;
        else if (Math.abs(cBeds - subjectBeds) === 1) score += 10;
        else score -= 15;
      }

      // Bathroom match
      if (subjectBaths && cBaths) {
        if (Math.abs(cBaths - subjectBaths) <= 0.5) score += 20;
        else if (Math.abs(cBaths - subjectBaths) <= 1) score += 5;
        else score -= 10;
      }

      // Recency — prefer sales within 6 months
      if (c.listedDate || c.soldDate) {
        const saleDate = new Date(c.soldDate || c.listedDate);
        const monthsAgo = (Date.now() - saleDate) / (1000 * 60 * 60 * 24 * 30);
        if (monthsAgo <= 3) score += 15;
        else if (monthsAgo <= 6) score += 8;
      }

      return { ...c, _score: score };
    })
    .sort((a, b) => b._score - a._score);

  // Take top candidates then remove price outliers
  const candidates = scored.slice(0, 10);
  if (candidates.length < 2) return candidates.slice(0, 3);

  const prices = candidates.map(c => c.price).sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)];
  const filtered = candidates.filter(c => {
    const pctOff = Math.abs(c.price - median) / median;
    return pctOff <= 0.20; // drop anything more than 20% from median
  });

  return (filtered.length >= 2 ? filtered : candidates).slice(0, 3).map(c => ({
    addr: c.formattedAddress || c.addressLine1 || 'Comp',
    price: c.price || 0,
    sqft: c.squareFootage || c.squareFeet || null,
    beds: c.bedrooms || null,
    baths: c.bathrooms || null,
    soldDate: c.soldDate || c.listedDate || null,
  }));
}

http('kytalystScan', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const { address } = req.body || {};
    if (!address) {
      res.status(400).json({ error: 'address is required' });
      return;
    }

    const rentcastHeaders = { 'X-Api-Key': process.env.RENTCAST_API_KEY, Accept: 'application/json' };
    const encodedAddr = encodeURIComponent(address);

    // --- Listing lookup ---
    const listingRes = await fetch(
      `https://api.rentcast.io/v1/listings/sale?address=${encodedAddr}&limit=1`,
      { headers: rentcastHeaders }
    );

    let listing = null;
    let listingNotFound = false;

    if (listingRes.status === 404) {
      listingNotFound = true;
    } else if (!listingRes.ok) {
      throw new Error(`RentCast listings ${listingRes.status}`);
    } else {
      const listingData = await listingRes.json();
      listing = Array.isArray(listingData) ? listingData[0] : listingData?.[0];
      if (!listing) listingNotFound = true;
    }

    // --- AVM / comps — always run regardless of listing status ---
    const avmRes = await fetch(
      `https://api.rentcast.io/v1/avm/value?address=${encodedAddr}`,
      { headers: rentcastHeaders }
    );
    if (!avmRes.ok) throw new Error(`RentCast AVM ${avmRes.status}`);
    const avmData = await avmRes.json();

    const sqft = listing?.squareFootage || avmData?.squareFootage || 1500;
    const yearBuilt = listing?.yearBuilt || avmData?.yearBuilt || null;
    const beds = listing?.bedrooms || avmData?.bedrooms || null;
    const baths = listing?.bathrooms || avmData?.bathrooms || null;
    const listPrice = listing?.price || 0;
    const arv = avmData.price || 0;

    // Filter comps by similarity — beds, baths, sqft, price outlier removal
    const comps = filterComps(avmData.comparables, sqft, beds, baths);

    // --- Distress signals ---
    let distress = { distress_detected: false, distress_signals: [], rehab_tier: 'none', confidence: 'low' };
    if (listing?.description) {
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          system: DISTRESS_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: listing.description }],
        }),
      });
      if (claudeRes.ok) {
        const claudeData = await claudeRes.json();
        const text = claudeData.content?.find((b) => b.type === 'text')?.text || '{}';
        try { distress = JSON.parse(text.trim()); } catch (_) {}
      }
    }

    const rehab = estimateRehab(sqft, yearBuilt);

    res.status(200).json({
      address,
      sqft,
      yearBuilt,
      beds,
      baths,
      listPrice,
      arv,
      listingNotFound,
      listingStatus: listingNotFound ? 'Not Actively Listed' : (listing?.status || 'Active'),
      distressSignals: distress.distress_signals || [],
      rehabTier: distress.rehab_tier || 'none',
      rehab,
      comps,
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
