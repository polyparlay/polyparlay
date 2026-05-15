# PolyParlay launch post-copy — paste-ready

**⚠️ Do not post any of this until CWS approves v1.0.29 and you have the live store listing URL.** Once you have it, replace every instance of `[CWS_LINK]` below with `https://chromewebstore.google.com/detail/<your-extension-id>` and you're good to go.

---

## 🖼️ Image asset map

| Use this image | When | Where |
|---|---|---|
| `social-1-hero.png` (1200×675) | Main launch — the hero card | X launch tweet · Reddit body image |
| `social-2-improve-odds.png` (1200×675) | The killer feature demo | X follow-up tweet · Reddit screenshot 2 |
| `social-3-monte-carlo.png` (1200×675) | Pro-tier hook | X thread tweet 3 · Reddit screenshot 3 |
| `social-4-vs-polymarket.png` (1200×675) | "What PM doesn't ship" comparison | X reply quote-tweet · Reddit thread cap |
| `social-5-reddit-square.png` (1080×1080) | Square format | Reddit thumbnail · Instagram if relevant |
| `01-audacious-lottery-parlay.png` (1200×630) | Real-feeling slip card | When showing what users actually share |
| `02-rebalanced-by-algo.png` (1200×630) | Algo flipped a leg | Improve Odds demo screenshot |
| `03-balanced-plus-EV.png` (1200×630) | +EV slip | Pro-tier example |

---

## 🐦 X (Twitter)

### LAUNCH TWEET — pick ONE. Pin it. Attach `social-1-hero.png`.

**Option A — direct + curiosity hook (best for cold reach):**

```
Polymarket doesn't let you build parlays.

Built a Chrome extension that does.

Stack 3+ binary markets → 10K Monte Carlo sim → algo flips your weakest leg → share the slip.

Free tier covers most of it. Pro is 149 USDC, on-chain.

polyparlay.app
[CWS_LINK]
```

**Option B — degen energy:**

```
new chrome extension: PolyParlay

build a parlay from any Polymarket market
see the real win-rate distribution (10K Monte Carlo)
click "Improve Odds" — it flips your worst leg
share the slip

free + pro 149 USDC. polygon. on-chain.

[CWS_LINK]
```

**Option C — value-prop forward:**

```
Your 3-leg Polymarket parlay sims at 4.3% win rate.

One click. 25.5%.

PolyParlay finds your weakest leg and tells you whether to flip or drop it. Chrome extension. Free + Pro.

[CWS_LINK]
polyparlay.app
```

---

### FOLLOW-UP THREAD (post within 5 min of the launch tweet, as a reply to it)

**Tweet 2/ — the killer feature** · Attach `social-2-improve-odds.png`

```
The hook: Improve Odds.

Your slip is dragging because one leg is way overpriced vs implied probability. PolyParlay runs 10K sims, finds it, and gives you a one-click "flip it" suggestion.

Same exposure. Real win-rate lift.
```

**Tweet 3/ — pro tier framing** · Attach `social-3-monte-carlo.png`

```
Free tier: 3 legs, multiplier, honest payout math, risk score.

Pro (149 USDC/yr): 10K Monte Carlo with full win-rate distribution, Improve Odds rebalancer, expected ROI, unlimited legs.

7-day trial. No card. On-chain payment, no payment processor.
```

**Tweet 4/ — what PM doesn't ship** · Attach `social-4-vs-polymarket.png`

```
Polymarket pays each leg independently — there's no native "all-or-nothing" parlay contract on PM. So your real payout = sum of each leg that hits.

PolyParlay shows the honest number ("you'll actually get") AND the hypothetical combined multiplier for reference.
```

**Tweet 5/ — install close**

```
Built solo over a few weeks. Chrome extension is live in the store.

polyparlay.app
[CWS_LINK]

Feedback welcome. RT if you bet on PM.
```

---

### REPLY TEMPLATES (for engagement after launch)

**Q: "Does it actually combine the legs into one bet?"**
```
No — PolyParlay analyses, doesn't execute. Polymarket settles each leg independently. The popup is honest about this: it shows "you'll actually get" (sum of independent payouts) separately from "hypothetical combined parlay" (multiplier × stake if combined).
```

**Q: "How is 149 USDC paid? Is there a refund?"**
```
Direct USDC transfer to my wallet on Polygon. Cloudflare Worker verifies the on-chain transfer via Polygonscan, then unlocks Pro for 365 days. No payment processor, no card, no subscription. No refund mechanism — but 7-day free trial first so you know what you're getting.
```

**Q: "Why not native USDC vs USDC.e?"**
```
Worker accepts both. If you hold either flavor of USDC on Polygon, send 149 to the address shown on /upgrade — the verifier checks both contracts.
```

**Q: "Open source?"**
```
Public repo: github.com/polyparlay/polyparlay — code is readable, you can verify the worker / extension yourself. Pro state is local to your install (chrome.storage).
```

**Q: "What about Kalshi / Manifold / [other]?"**
```
v1 is Polymarket-only. If usage warrants it, Kalshi is the next port. Different market metadata schemas so it's not a one-line change.
```

---

## 🟠 Reddit

### r/Polymarket — main launch post

**Title (keep this exact — gets the click):**
```
I built a parlay-builder Chrome extension for Polymarket. 10K Monte Carlo, auto-rebalance weak legs, free + paid tiers. Feedback wanted.
```

**Body — paste as-is:**

```markdown
Hey r/Polymarket,

Long-time lurker, occasional poster. I bet enough multi-leg setups on PM to get tired of (a) calculating combined odds in my head, (b) realising too late that one leg was tanking the whole thing, and (c) having nothing shareable when a slip popped.

So I built **PolyParlay** — a Chrome extension that lives in your browser. The TL;DR:

**What it does**
- Floating "+ Add to slip" pill appears on every PM market page
- Stack up to 3 binary markets (free), unlimited (Pro)
- Real-time multiplier + the honest "you'll actually get" payout (since PM pays each leg independently, not as a true parlay)
- Risk score, 24h volume, resolution dates
- One-click Monte Carlo simulation (10K iterations, full win-rate distribution) — Pro
- **Improve Odds** — algorithm finds your weakest leg and tells you whether to flip or drop it. Pro. This is the bit I actually wanted to exist.
- Shareable 1200×630 slip card (X / Discord) — Pro is watermark-free

**What it doesn't do**
- Doesn't execute. Doesn't touch your wallet. You still place each leg on PM yourself.
- Doesn't ask for any login or wallet connect. Slip data lives in chrome.storage local.

**Pricing**
- Free tier covers ~80% of usage
- Pro is 149 USDC/yr (≈ $12.42/mo) sent directly to a Polygon address. On-chain verified via Polygonscan. 7-day free trial, no card.

**Why I built it**
Polymarket itself doesn't ship a parlay-builder, and I think it should. Until they do, this is my version. Open to feedback on what's missing, what's wrong, what should be in free vs Pro.

Install: [CWS_LINK]
Site: https://polyparlay.app

Happy to answer questions.
```

**After posting** — drop these images as replies to your own post (Reddit lets you reply with image):
- Reply 1: `social-1-hero.png` with caption "Here's what the popup looks like"
- Reply 2: `social-2-improve-odds.png` with caption "Improve Odds in action — flips your weakest leg to lift sim win rate"
- Reply 3: `social-3-monte-carlo.png` with caption "Pro tier: full Monte Carlo distribution"

---

### r/predictionmarkets — variant post

**Title:**
```
PolyParlay — multi-leg parlay analyser for Polymarket. Monte Carlo + auto-rebalance. Chrome extension, free tier.
```

**Body — slightly different framing for a more analytical sub:**

```markdown
Built a Chrome extension that adds multi-leg parlay analytics to Polymarket. Wanted to share it here since some of you actually care about the math.

**Approach**: it reads market metadata from PM's Gamma API, computes combined multipliers + per-leg implied probabilities, and runs a 10,000-iteration Monte Carlo simulation per slip (independent Bernoulli draws per leg, no correlation modelling — happy to discuss limits).

**The interesting bit**: "Improve Odds." It scans each leg, looks at the worst case (typically a leg priced near $0.90+ where flipping to NO at $0.10 is the math-right move), and surfaces a one-click flip suggestion. The win rate lift is real — most slips with a single weak leg jump from sub-10% to 20-30% after rebalance. Same exposure, different distribution.

**Honest framing**: I'm explicit that Polymarket settles legs independently, so the "all hit" multiplier is reference-only. The popup separates "you'll actually get" (sum of independent leg payouts) from "hypothetical parlay" (combined multiplier × stake).

**Pricing**: free tier covers up to 3 legs + all the basic analytics. Pro (149 USDC/year, on-chain) unlocks Monte Carlo + Improve Odds + unlimited legs.

Repo + site: https://polyparlay.app
Install: [CWS_LINK]

Open to critique on the Monte Carlo methodology, the Improve Odds heuristic, or the pricing.
```

---

### r/CryptoCurrency / r/ethfinance — IF you want broader reach

These are spam-sensitive. Only post if you have karma in those subs and frame as "I built [thing] in [niche]." Probably skip unless you have an existing presence.

---

## 🏷️ Hashtag bank

**Highest-fit (use 1-2 per X post):**
- `#Polymarket` — exact target audience
- `#predictionmarkets`

**Secondary (use 1 sometimes):**
- `#Polygon`
- `#onchain`
- `#crypto` (broad, dilutes targeting but bigger pool)

**Maker / build-in-public:**
- `#buildinpublic`
- `#sideproject`

**Generally avoid:**
- `#sportsbetting` `#parlay` alone (off-target audience, sports-fan crowd doesn't care about PM)
- `#defi` (too broad, your tool isn't really DeFi)

**X best practice**: use 1, max 2 hashtags inline. More than 2 looks spammy. Tweets without hashtags often outperform tweets with them — let the copy do the work.

---

## 📍 Other channels to drop in (after CWS approval)

| Channel | What to do |
|---|---|
| **Polymarket Discord** | Find the #general / #suggestions channel. Drop a single, polite "I built this" message with the install link. Don't spam. |
| **Polymarket Telegram** | Same — one message, link, friendly. |
| **r/Polymarket weekly thread** | Some subs have weekly "what are you working on" megathreads. Use those if they exist. |
| **Crypto-Twitter DMs** | List 10-20 active PM-Twitter accounts (people tweeting PM screenshots regularly with 1k-50k followers). DM each: "Built this. Free 6-month Pro code for honest feedback?" Cost: $0. Expected: 2-3 will actually try it; if 1 tweets organically, you get a step-function bump. |

---

## 🛡️ What NOT to do

- **Don't post in unrelated subs.** r/sportsbook will instaban for promoting a crypto tool. r/CryptoCurrency rules are strict.
- **Don't make multiple Reddit accounts.** Reddit's spam detection is sharp; one ban kills your launch.
- **Don't post identical text across subs in the same hour.** Vary the title and body. (The 2 Reddit posts above are deliberately worded differently.)
- **Don't @ Polymarket itself directly** in the launch tweet unless you have prior contact. Looks needy. Let them find you organically if they're going to.
- **Don't quote-tweet whales unsolicited.** DM is the move there.

---

## 🎯 Critical-path checklist for launch day

- [ ] CWS shows "Published" status, you have a real `chromewebstore.google.com/detail/<id>` URL
- [ ] Replace `YOUR_EXTENSION_ID` in `web/upgrade.html`, run `vercel --prod`
- [ ] Replace every `[CWS_LINK]` in this doc with the real URL
- [ ] Pin the X launch tweet
- [ ] Post the Reddit thread BEFORE the X tweet (Reddit posts can sit and slowly accumulate over a day; X is an instant moment)
- [ ] Drop the 3 image replies on the Reddit post within 5 min
- [ ] Engage in comments for the first 4-6 hours
- [ ] Send DMs to 10 PM-Twitter accounts within 24h
