# PolyParlay icon options

The current `icon.svg` (× multiplier with a green profit arrow piercing through it) is the active extension icon. All options say one thing: **this app makes your bets more profitable.** Green = profit, up-arrow = your line goes up, × = multi-leg multiplier.

| File | Concept | Why it sells |
|---|---|---|
| `icon.svg` | **× multiplier + green up-arrow piercing through** (current) | Multiplier is the parlay math; arrow is the profit. Most universal "your number goes up" symbol. |
| `icon-upchart.svg` | Three bars (legs) growing taller + green line graph trending up with arrowhead | Literal "each leg climbs, your line goes up-and-to-the-right." Reads as analytics/sim. |
| `icon-slip-arrow.svg` | Parlay slip with green arrow shooting up out of it | Slip = parlay you build; arrow = profit lift after Improve-Odds. |
| `icon-chipstack.svg` | Three chips stacked (gold/purple/green), each higher, × on top, green arrow rising | Casino chip stack growing = profit. Tactile, hard to misread. |
| `icon-money-multiply.svg` | Gold dollar coin with green × multiplier badge + small up-arrow | Most literal: money × multiplier = bigger money. Reads instantly. |

Provocative legacy set (kept around but they don't sell ROI):

- `icon-lightning.svg` · `icon-skull.svg` · `icon-flame.svg` · `icon-diamond.svg` — degen vibes only.

## Pick + ship

```bash
PICK=icon.svg                 # or icon-upchart.svg / icon-slip-arrow.svg / icon-chipstack.svg / icon-money-multiply.svg
cd /Users/clawdlawd/polyparlay
rsvg-convert -w 16  extension/icons/$PICK -o extension/icons/icon16.png
rsvg-convert -w 48  extension/icons/$PICK -o extension/icons/icon48.png
rsvg-convert -w 128 extension/icons/$PICK -o extension/icons/icon128.png
```

Then add to `extension/manifest.json` (before closing brace):

```json
"icons": {
  "16":  "icons/icon16.png",
  "48":  "icons/icon48.png",
  "128": "icons/icon128.png"
}
```

## Preview without converting

Open any `.svg` directly in Chrome — renders natively. Quick way to compare before committing.
