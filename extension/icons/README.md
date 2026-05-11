# PolyParlay icon options

Five SVG concepts. Pick whichever lands hardest. The currently active extension icon is `icon.svg` — replace it with one of the others to swap.

| File | Concept | Vibe |
|---|---|---|
| `icon.svg` | **All-seeing-eye pyramid with × pupil** (current) | Provocative degen-finance, PM "smart money watching" energy |
| `icon-lightning.svg` | Lightning bolt branching into 3 legs + × badge | Strike-fast, momentum, "your parlay just hit" |
| `icon-skull.svg` | Stylized skull with × eyes (one purple, one gold) | Live-and-die-by-the-parlay degen energy |
| `icon-flame.svg` | Flame with × in the core | "Hot bet" / fire emoji culture |
| `icon-diamond.svg` | Faceted diamond with gold × carved in | Diamond-hands crypto-native |

## Pick + ship

Once you've decided which icon, generate the 3 sizes Chrome Web Store requires:

```bash
# Pick one and replace 'icon.svg' below with your choice
PICK=icon.svg
cd /Users/clawdlawd/polyparlay
rsvg-convert -w 16  extension/icons/$PICK -o extension/icons/icon16.png
rsvg-convert -w 48  extension/icons/$PICK -o extension/icons/icon48.png
rsvg-convert -w 128 extension/icons/$PICK -o extension/icons/icon128.png
```

Then add this block to `extension/manifest.json` (near the bottom, before the closing brace):

```json
"icons": {
  "16":  "icons/icon16.png",
  "48":  "icons/icon48.png",
  "128": "icons/icon128.png"
}
```

Commit + push and you're CWS-submission-ready.

## Preview without converting

Open any of these `.svg` files directly in Chrome — they render natively at any size. Quick way to compare before committing.
