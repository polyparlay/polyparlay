# Screenshot specs for the CWS listing

CWS requires at least 1 screenshot at **1280×800** or **640×400**. Aim for 4 — listings with multiple screenshots get more clicks.

You'll need to take these yourself in a real Chrome window (CWS reviewers will spot synthetic mockups). Below is the shot list with setup instructions.

---

## Shot 1 — Hero: popup with a full 3-leg slip + Monte Carlo running

**Window setup**:
- Open a Polymarket market page in Chrome
- Use the floating pill to add 3 legs (mix of high + low probability so the multiplier is interesting)
- Click the PolyParlay extension icon to open the popup
- Click Run Monte Carlo (you'll need to be in Trial or Paid state — click the footer "Free" pill twice to cycle to Trial)
- The sim results panel should be open WITHIN the parlay-ticket card, showing the histogram + Improve Odds suggestion

**Capture**:
- Chrome popup native size (380×~900) — popup doesn't fit 1280×800 alone
- Capture the popup + a portion of the Polymarket page behind it for context
- macOS: `Cmd+Shift+4` then drag, OR `Cmd+Shift+5` for window mode
- Crop/resize to **1280×800** in Preview (Tools → Adjust Size, uncheck "Scale proportionally" — pad with the bg color if needed)

**Caption** (CWS lets you write a caption under each screenshot):

```
Build a slip, simulate 10,000 outcomes, get auto-rebalance suggestions
```

---

## Shot 2 — Floating pill on a real PM market page

**Window setup**:
- Polymarket market page open, full-screen browser
- Floating "+ Add to slip" pill visible bottom-right corner
- Optionally hover the pill so the expanded version shows ("+ Add to slip" with badge)

**Capture**:
- Full Chrome window at **1280×800** browser viewport (resize the window beforehand)
- Make sure the pill is visible and the PM market question is readable

**Caption**:

```
Add legs without leaving Polymarket — the floating pill detects every market page
```

---

## Shot 3 — Improve Odds rebalance suggestion

**Window setup**:
- Same as Shot 1 but scroll the popup down to show ONLY the simResults panel
- Make sure the green "↗ Improve odds" banner is visible at the bottom with a real "Flip leg X → NO" suggestion
- Click Apply to show what happens after (optional bonus: split this into 2 screenshots, "before" and "after")

**Capture**:
- Tighter crop on just the sim results card
- Pad to **1280×800** with the dark popup background

**Caption**:

```
Improve Odds finds your weakest leg and tells you whether to flip or drop it
```

---

## Shot 4 — Shareable slip card

**Window setup**:
- Build a slip with 3+ legs
- Click "Share to X" or "Download PNG" in the actions section
- Capture the canvas-rendered slip card (1200×630)

**Capture**:
- The slip card itself OR the popup with the slip-card preview visible
- Resize to **1280×800** (the card is 1200×630 so it'll need slight padding)

**Caption**:

```
Share viral slip cards with one click — 1200×630 X/Twitter-card sized
```

---

## Optional Shot 5 — Pro section / pricing

If you want a 5th screenshot, capture the popup scrolled to the Pro section showing "Included today" + "Coming v1.0" + the $149/year CTA. This is the conversion screenshot.

**Caption**:

```
Pro unlocks Monte Carlo, Improve Odds, unlimited legs — $149/year, on-chain payment
```

---

## Quick capture commands (macOS)

```bash
# 1. Resize Chrome to 1280×800 (in browser DevTools device toolbar OR just resize manually)
# 2. Position content
# 3. Capture:
screencapture -i ~/Desktop/polyparlay-shot-1.png   # interactive crop
# 4. Verify dimensions:
sips -g pixelWidth -g pixelHeight ~/Desktop/polyparlay-shot-1.png
# 5. Resize to 1280×800 if needed:
sips -z 800 1280 ~/Desktop/polyparlay-shot-1.png --out ~/Desktop/polyparlay-shot-1-1280x800.png
```

---

## Optional promo tiles (boost listing placement)

- **Small promo tile**: 440×280 — see `extension/marketing/promo-tiles/small-440x280.png`
- **Marquee promo tile**: 1400×560 — only shown if Chrome features your extension on the homepage. See `extension/marketing/promo-tiles/marquee-1400x560.png`

Both are pre-built; just upload directly.
