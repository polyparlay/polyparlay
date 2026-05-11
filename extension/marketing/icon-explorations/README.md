# Icon explorations — round 2

Round 1 (eye/skull/flame/diamond) was degen vibes only — didn't say *profitable*.
Round 2 (× + green arrow, bar chart, slip + arrow, chip stack, coin) was profit-coded but felt generic.
**Round 3 leans into degen vernacular + direct visual storytelling.** Pick the one that hits hardest.

| File | Concept | Why it might hit |
|---|---|---|
| `icon-evplus.svg` | **"+EV" wordmark in bright green** | `+EV` is the actual term degens use for "this bet has positive expected value." Reading the icon = reading the value prop. |
| `icon-flip.svg` | **Red ↘ line → gold transform badge → green ↗ line** | Tells the whole story in one frame: bad bet → algorithm → good bet. Literally what Improve Odds does. |
| `icon-gauge.svg` | **Win-rate dial, needle parked in green zone** | Universal "your number is in the green zone" — speedometer pattern is instantly readable. |
| `icon-receipt-cash.svg` | **Parlay slip with cash bursting out the top** | Most visceral: receipt = your bet, cash = the payout. No interpretation required. |

## Preview workflow

Open the `.png` files side-by-side in Finder Quick Look (select all + space). They're rendered at 256px, which is closer to what users see in the Chrome toolbar dropdown.

## To promote one of these to the shipping icon

```bash
PICK=icon-flip  # or icon-evplus / icon-gauge / icon-receipt-cash
cd /Users/clawdlawd/polyparlay
cp extension/marketing/icon-explorations/$PICK.svg extension/icons/icon.svg

rsvg-convert -w 16  extension/icons/icon.svg -o extension/icons/icon16.png
rsvg-convert -w 48  extension/icons/icon.svg -o extension/icons/icon48.png
rsvg-convert -w 128 extension/icons/icon.svg -o extension/icons/icon128.png

# Also refresh the X profile pic to match
rsvg-convert -w 400 extension/icons/icon.svg -o extension/marketing/x-assets/x-profile-400x400.png
```

Then bump `extension/manifest.json` `version` and commit.

## My pick

Honest read: **`icon-flip.svg` is the most distinctive.** It's the only one that visualizes *what the app actually does* (transforms a bad bet into a good one) rather than referencing a generic gambling/finance trope. The others are good fallbacks if you want simpler/cleaner.
