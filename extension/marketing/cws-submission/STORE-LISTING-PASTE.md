# Store Listing — every field, paste-ready

Walk the CWS "Store listing" page top to bottom. Every value you need is below.

═══════════════════════════════════════════
PRODUCT DETAILS
═══════════════════════════════════════════

**Title** — already pulled from package, leave as-is:
`PolyParlay — Parlay Builder for Polymarket`

**Summary** — already pulled from package, leave as-is:
`Build multi-leg parlays from Polymarket. 10K Monte Carlo, auto-rebalance weak legs, shareable slip cards.`

**Description** — paste this into the 16,000-char box:

```
PolyParlay is a parlay calculator and analytics layer for Polymarket. Stack multiple Polymarket binary markets into one slip, simulate the outcome with Monte Carlo, auto-rebalance the weakest leg, and share the result as a slip card.

PolyParlay does NOT execute trades. It is an analysis tool. You build the slip, see what the math says, then click out to Polymarket to place each leg as a separate position. Your actual payout is the sum of each independent leg's payout — shown clearly in the popup as "You'll actually get".

WHAT YOU GET (FREE)
• Build slips up to 3 legs from any Polymarket binary market
• Floating "+ Add to slip" pill on every Polymarket market page
• Live risk score for your current slip
• Live 24-hour volume across all legs
• Resolution deadlines for every leg
• Combined multiplier and hypothetical-parlay payout (reference math)
• Honest "You'll actually get" payout = sum of independent leg payouts

WHAT PRO UNLOCKS ($149/year, 7-day free trial, no card during trial)
• 10,000-iteration Monte Carlo simulation — see your win-rate distribution
• Improve Odds — auto-flip or drop the weakest leg to lift the simulated win rate
• 24-hour price drift signal (momentum across all legs)
• Expected ROI (Monte Carlo expected value)
• Unlimited legs (free is capped at 3)
• Watermark-free shareable slip cards
• Saved parlay history and your win-rate over time (retained while subscription is active)

HOW PRO IS PAID
149 USDC on Polygon, sent directly to a wallet address shown on the upgrade page. No third-party payment processor, no card details ever asked for. Verification happens on-chain via Polygonscan. One annual payment unlocks Pro for 365 days from the verified payment date.

HOW IT WORKS
1. Browse Polymarket as normal.
2. On any binary market page, click the floating "+ Add to slip" pill in the bottom-right corner.
3. The leg is added to your parlay. A slide-out preview shows the current slip.
4. Open the extension popup to see the full slip: stake, "You'll actually get" payout, combined multiplier, hypothetical-parlay payout, risk score, 24h volume, resolution dates.
5. Click Run Monte Carlo + Improve Odds (Pro) to simulate 10,000 outcomes and get an auto-rebalance suggestion if the weakest leg is dragging down your win rate.
6. Share the slip card to X or download as PNG.
7. Click Execute this parlay to either combine all legs into a single Polygon contract via PredictShark, or open each leg individually on Polymarket.

PRIVACY
PolyParlay collects nothing personally identifying. Your slip data is stored locally in chrome.storage on your machine. The only network calls are to Polymarket's public APIs for market data, and to our Cloudflare Worker (only when you submit a Pro payment for verification, which sends only the wallet address you specify).

DISCLAIMER
Prediction markets carry risk. PolyParlay is an analysis tool — not financial advice, not a gambling platform, not an execution venue. You are responsible for your own decisions and any positions placed on Polymarket or any other platform.
```

**Category**: select `Productivity`

**Language**: select `English (United States)`

═══════════════════════════════════════════
GRAPHIC ASSETS
═══════════════════════════════════════════

**Store icon (128x128)** — upload:
`extension/marketing/cws-submission/store-icon-128.png`
(verified 128×128, no alpha. If CWS still complains, try the .jpg next to it.)

**Screenshots (1280x800, need at least 1, max 5)** — upload all three:
`extension/marketing/cws-submission/screenshot-1-build.png`
`extension/marketing/cws-submission/screenshot-2-montecarlo.png`
`extension/marketing/cws-submission/screenshot-3-analytics.png`
(all verified 1280×800, no alpha)

**Small promo tile (440x280)** — upload:
`extension/marketing/promo-tiles/small-440x280.png`

**Marquee promo tile (1400x560)** — upload:
`extension/marketing/promo-tiles/marquee-1400x560.png`

**Global promo video**: leave blank

═══════════════════════════════════════════
ADDITIONAL FIELDS
═══════════════════════════════════════════

**Official URL**: leave as None (you'd need Google Search Console verification of polyparlay.app — skip for v1)

**Homepage URL**:
`https://polyparlay.app`

**Support URL**:
`https://polyparlay.app/privacy`
(or `mailto:hello@polyparlay.app` if you prefer — but a URL ranks better)

**Mature content**: leave UNCHECKED — PolyParlay is an analysis tool, not a gambling platform. (If a reviewer pushes back because it's prediction-market adjacent, you can revisit, but it does not facilitate betting directly.)

═══════════════════════════════════════════
OTHER TABS (not "Store listing")
═══════════════════════════════════════════

**Privacy tab**:
- Single purpose: see listing-copy.md "Single-purpose statement"
- Permission justifications: see permissions-justifications.md (one per field)
- Data usage: tick everything NO per permissions-justifications.md
- Privacy policy URL: `https://polyparlay.app/privacy` (must be live first — deploy Vercel)

**Distribution tab**:
- Visibility: Public (or Unlisted if you want a soft launch)
- Regions: All regions (or exclude any where prediction markets are restricted if you want to be cautious)

**Package tab**: upload `polyparlay-v1.0.29.zip`
```
