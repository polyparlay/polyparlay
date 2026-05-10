# PolyParlay

Multi-leg parlay builder for Polymarket. Chrome extension that injects a "+ Add to slip" button on polymarket.com market pages, calculates combined multiplier and max payout, and generates shareable slip cards.

**Information only — no execution, no wallet connection, no custody.**

## Project layout

```
polyparlay/
├── extension/          Chrome extension (Manifest V3)
│   ├── manifest.json
│   ├── content.js      Floating button injection on polymarket.com
│   ├── content.css
│   ├── background.js   Gamma API client + chrome.storage state
│   ├── popup.html
│   ├── popup.css
│   ├── popup.js        Slip builder UI + Canvas card generator
│   └── icons/          (placeholder — add 16/48/128 PNGs before CWS submission)
└── web/
    ├── index.html      Landing page (install CTA + email capture)
    ├── slip.html       Read-only slip viewer (decodes URL hash)
    └── privacy.html    Privacy policy (CWS-required)
```

## Install (development)

1. Open `chrome://extensions` in Chrome
2. Enable **Developer Mode** (top right)
3. Click **Load unpacked** → select `polyparlay/extension/`
4. Visit any Polymarket market page (e.g. `polymarket.com/event/...`)
5. The "+ Add to slip" floating button appears bottom-right
6. Click to add the current market. Open the popup (extension icon) to see the slip.

## Free tier (current MVP)

- 3-leg parlay builder with live multiplier + max payout
- Flip leg direction (YES ↔ NO) per leg
- Generate 1200×630 slip card via Canvas (Twitter/OG card dimensions)
- Download PNG or copy shareable link (slip data encoded in URL hash)
- Share to X with pre-filled tweet text + slip URL
- Open shared slips at `polyparlay.io/slip#<encoded>` — works without the extension installed
- 4th-leg gate with "would jump to N×" preview copy (Pro upsell hook)
- Outbound `?ref=polyparlay` referral on every Polymarket/Kalshi click-through

## Pro tier (planned, not yet built)

Pricing: **$29.99/month** or **$249/year** (save $111)

Payment rail: **Coinbase Commerce** (1% fee, USDC on Base — users already hold USDC)

Features (in build order):

1. **Smart Money Feed** — real-time stream of position entries from a curated list of top profitable PM wallets (public on-chain data, no auth required). Bridge to the parlay builder: one click adds any smart-money position as a leg in your slip. **This is the feature that justifies $29.99/mo** — comparable services (Prediction Insiders, PolyInsider, Polymarket Bros) charge $29-99/mo for similar signal access.
2. **Wallet read** — paste your PM wallet address (read-only, public on-chain). Extension auto-tracks every position you've ever held.
3. **Your record by bet type** — shown while building. "3-leg crypto parlays: 0-7. 3-leg weather parlays: 4-5 (44%, beats market 26%)." Win rate by category, leg count, entry price band.
4. **Partial win calculator** — at live prices: "If Fed + BTC hit but London misses, your remaining legs are worth $X — sell now for $Y." PM-specific feature with no sportsbook equivalent.
5. **Portfolio concentration flag** — plain-language warning when open positions are correlated. "4 of your 7 open bets are European weather YES — they move together."
6. **Outcome cards at resolution** — auto-generated, watermark-free for Pro.
7. **Unlimited legs** (free is capped at 3).

Explicitly **not** building: Kelly fractions, Brier scores, calibration UI, factor-model correlation. Wrong audience for retail PM users — these were earlier design rounds that didn't survive contact with the user-journey reframe.

### Smart Money Feed — infrastructure note

This is the only Pro feature that requires a backend. Architecture:
- Curated wallet list (seed from EdgeClaw research: ColdMath, Poligarch, BeefSlayer, etc. — known profitable wallets)
- Polling worker monitors `gamma-api.polymarket.com/positions?user=<addr>` for new entries
- Detected new positions push to a lightweight pub/sub (Cloudflare Workers + Durable Objects, or a $5/mo VPS with Redis pub/sub)
- Extension polls the public feed endpoint every 60-90s
- Latency target: <2 minutes from wallet entry to subscriber notification (good enough — copy-trade fills don't require sub-second)

Re-evaluation cadence: rolling 90-day profitability ranking on the wallet list. Survivorship bias is real — wallets profitable 6 months ago may not be today.

### Regulatory positioning

Smart Money Feed is an **information product surfacing public on-chain data**. The user decides whether to act on the information; PolyParlay never executes, holds funds, or routes orders. This is the same legal posture as Prediction Insiders, PolyInsider, and Polymarket Bros — all operating openly. Distinguishes from "investment advice" because the data is public and observable to anyone with a block explorer.

## Revenue stack

| Source | Y1 estimate | Notes |
|---|---|---|
| Pro subscriptions ($29.99/mo or $249/yr) | $15K–60K | Primary revenue. Smart Money Feed justifies the price point. |
| PM/Kalshi referral commissions | $1.5K–4K | Zero-effort: every "Open on Polymarket" link carries `?ref=polyparlay` |
| Data licensing | $0 | Y2+ if usage compounds (aggregate parlay-structure insights) |

Y2 with PM platform growth (~90% QoQ): $60K–250K total.

The Smart Money Feed is what changes the economics. Without it, this is a $10-15K/year side project. With it, it's a real micro-SaaS with a defensible moat (curated wallet list + EdgeClaw-derived signal quality).

## GitHub vs Vercel — they do different things

You need **both**, not either-or:

- **GitHub** hosts the source code (the git repo you've been committing into). Makes the project public, gets you a star count, satisfies HN/r/Polymarket "show me the code" requests, lands you in the Awesome-PM-Tools directory.
- **Vercel** hosts the static website (`polyparlay.io`, `polyparlay.io/upgrade`, `polyparlay.io/slip`). Serves the actual pages users visit.

The clean flow is **GitHub → Vercel auto-deploy**: push to GitHub, Vercel watches the `web/` subdirectory and rebuilds on every push. One source of truth, automatic deploys. You set this up once in 5 minutes.

## Launch — end-to-end deploy guide

### 1. Domain + handles

- [ ] Register `polyparlay.io` on Namecheap or Cloudflare Domains (~$12/yr)
- [ ] Verify `@polyparlay` X handle availability and grab it
- [ ] Create dedicated `polyparlay@gmail.com` (CWS owner email; never personal)

### 2. Icons (Chrome Web Store requires PNGs at 16/48/128)

A source SVG is at `extension/icons/icon.svg`. Export to PNGs:

```bash
# Pick any of these — they all work
# Option A: rsvg-convert
brew install librsvg
rsvg-convert -w 16  extension/icons/icon.svg -o extension/icons/icon16.png
rsvg-convert -w 48  extension/icons/icon.svg -o extension/icons/icon48.png
rsvg-convert -w 128 extension/icons/icon.svg -o extension/icons/icon128.png

# Option B: ImageMagick
magick -background none -resize 16x16   extension/icons/icon.svg extension/icons/icon16.png
magick -background none -resize 48x48   extension/icons/icon.svg extension/icons/icon48.png
magick -background none -resize 128x128 extension/icons/icon.svg extension/icons/icon128.png

# Option C: Browser — open icon.svg in Chrome, screenshot, resize manually
```

Then add the icons to `manifest.json`:
```json
"icons": {
  "16":  "icons/icon16.png",
  "48":  "icons/icon48.png",
  "128": "icons/icon128.png"
}
```

### 3. Push to GitHub

```bash
cd /Users/clawdlawd/polyparlay
gh repo create polyparlay --public --source . --remote origin
git push -u origin master
```

(Or via web UI: create empty repo at github.com/new, then `git remote add origin <url>` + `git push -u origin master`.)

### 4. Deploy `web/` to Vercel — connect to GitHub for auto-deploy

**Recommended flow (5 minutes, one-time setup):**

1. Sign in at <https://vercel.com> with your GitHub account
2. Click "Add New Project"
3. Import your `polyparlay` GitHub repo
4. Vercel auto-detects no framework — manually set:
   - **Root Directory:** `web`
   - **Framework Preset:** Other (static)
   - **Build Command:** (leave empty)
   - **Output Directory:** (leave empty — Vercel serves the `web/` directory as-is)
5. Deploy. Every subsequent `git push` auto-deploys.
6. In Vercel project settings → Domains, add `polyparlay.io`. Vercel gives you the DNS records to add at your registrar (an A record + a CNAME).

**Alternative one-off deploy (no auto-deploy):**

```bash
cd web/
npx vercel deploy --prod
```

### 5. Deploy the Pro-verification worker

The Cloudflare Worker at `worker/verify.js` checks Polygon for the user's 149 USDC payment. See `worker/README.md` for the full deploy walkthrough — short version:

```bash
cd worker/
npm install -g wrangler
wrangler login
wrangler secret put POLYGONSCAN_KEY      # free at polygonscan.com/myapikey
wrangler secret put PAYMENT_ADDRESS      # your Polygon receiving wallet
wrangler deploy
```

Note the deployed URL (e.g. `polyparlay-verify.YOUR_SUBDOMAIN.workers.dev`). Paste it into:
- `web/upgrade.html` → `VERIFY_URL` constant
- `extension/popup.js` → wire when v0.4.0 Pro-state worker call ships

### 6. Replace placeholders

- [ ] `web/upgrade.html` → `PAYMENT_ADDRESS` (your Polygon receiving wallet)
- [ ] `web/upgrade.html` → `VERIFY_URL` (your deployed worker URL from step 5)
- [ ] `web/upgrade.html` → `YOUR_EXTENSION_ID` (after CWS publishes — used to message the extension on successful payment)
- [ ] `extension/popup.js` → `VERIFY_URL` constant (same deployed worker URL)
- [ ] `extension/popup.js` → `REF_CODE` (your PM/Kalshi affiliate code, if you sign up for those programs)
- [ ] `web/privacy.html` → replace `hello@polyparlay.io` with your real contact email

### 7. Submit to Chrome Web Store

- [ ] `$5` one-time dev fee at <https://chrome.google.com/webstore/devconsole>
- [ ] Zip the `extension/` directory (must include the PNG icons from step 2)
- [ ] Upload zip, fill listing (title, description, screenshots), submit for review
- [ ] Review typically 2-5 business days

### 8. Distribution (post-publish)

- [ ] PR to [Awesome-Prediction-Market-Tools](https://github.com/aarora4/Awesome-Prediction-Market-Tools)
- [ ] Submit to [Polymark.et](https://polymark.et/) tools directory
- [ ] Show HN: `Show HN: PolyParlay — Multi-leg parlay builder for Polymarket`
- [ ] r/Polymarket post (discussion-framed, not pitch)
- [ ] PM Discord #tools channel
- [ ] X launch thread tagging @PolyBackTest and similar accounts

## Distribution plan (launch week)

1. Chrome Web Store listing — keywords: polymarket, parlay, multi-leg, kelly, prediction markets
2. Show HN — title: "Show HN: PolyParlay — Multi-leg parlay builder for Polymarket"
3. r/Polymarket post — discussion-framed, not announcement
4. PM Discord #tools channel
5. X post (no followers required) tagging @PolyBackTest
6. Polymark.et listing
7. PR to Awesome-PM-Tools

## Honest projections

| Scenario | Y1 installs | Pro conversion | Y1 revenue |
|---|---|---|---|
| Pessimistic | 600 | 4% | ~$2,000 |
| Realistic | 2,000 | 6% | ~$8,000 |
| Strong (HN + newsletter pickup) | 8,000 | 8% | ~$32,000 |
| Wild success | 25,000 | 10% | ~$140,000 |

Most outcomes: **$5K–$20K Y1**. Wild-success requires HN front page + viral PM event + influencer pickup — none can be planned for.

## Day-30 gate

If by day 30 from CWS approval:
- **500+ installs AND >2% slip share rate** → product has signal, build Pro tier (wallet read first)
- **<500 installs OR <2% share rate** → kill or rethink. Don't sink more dev time.

## Known limitations / honesty

- 3-leg cap is enforced in popup but a determined user can edit `chrome.storage.local` directly. Acceptable for v1; tighten in v1.1 if abuse appears.
- "Open on Polymarket" links carry `?ref=polyparlay` — replace with your verified affiliate code before launch. PM and Kalshi must accept these as referrals or commissions don't accrue.
- Outcome cards are not yet implemented — they fire on market resolution. Requires either polling Gamma for resolution status or a separate web service. Defer to v1.1.
- The popup's "Pro upgrade" button opens `polyparlay.io/upgrade` which doesn't exist yet. Stub the upgrade page on Cloudflare Pages before going live.
- No icon files yet. Chrome will use defaults; Web Store submission requires real PNGs.

## Roadmap

- **v0.1** (this commit) — Free tier MVP, no Pro features wired yet
- **v0.2** — Outcome cards on resolution (requires periodic poll or webhook)
- **v1.0** — Pro tier launches: **Smart Money Feed** + wallet integration + record by bet type + partial win calc + Coinbase Commerce. This is the version that justifies $29.99/mo and creates the moat.
- **v1.1** — Portfolio concentration flag, multiple-wallet support, Smart Money wallet re-ranking (rolling 90-day profitability)
- **v1.2** — Public "Popular Parlays" feed (anonymized aggregate); first data licensing conversations
- **v2.0** — Cross-platform support (Kalshi parity), PM↔Kalshi best-execution display, Kalshi smart money wallets via API positions

## License

Source available, all rights reserved (until decided otherwise).
