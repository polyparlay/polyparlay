# Server-side deploy cheatsheet

The steps below assume you're at the repo root. Each command block is copy-pasteable into the terminal.

## 1. Get a Polygonscan API key (free, 1 minute)

1. Sign up at https://polygonscan.com/register
2. After confirming email: https://polygonscan.com/myapikey → Add → name it `polyparlay-verify`
3. Copy the key — you'll paste it into Wrangler in step 3

---

## 2. Vercel deploy (the privacy page must resolve before CWS submission)

The fastest path is via the Vercel dashboard (browser auth). Two clicks:

1. Go to https://vercel.com/new
2. Import GitHub repo: `polyparlay/polyparlay`
3. **Root Directory**: `web`  ← critical, sets the deploy to the static page dir
4. **Framework Preset**: Other
5. Click Deploy

When the build finishes, your URL will be something like `https://polyparlay-xyz.vercel.app`.

### Set the custom domain

1. In the Vercel project: Settings → Domains → Add → `polyparlay.app`
2. Vercel gives you DNS records to add at your registrar (A or CNAME)
3. After DNS propagates (5–30 min), https://polyparlay.app and https://polyparlay.app/privacy work

### CLI alternative (if you prefer terminal)

```bash
cd web
npm i -g vercel
vercel login         # opens browser for auth
vercel --prod        # follow prompts: link to existing project OR create new
```

---

## 3. Cloudflare Worker deploy (for Pro payment verification)

```bash
cd worker
npm i -g wrangler

# Login (opens browser):
wrangler login

# Set the Polygonscan secret (from step 1):
wrangler secret put POLYGONSCAN_KEY
# Paste your Polygonscan API key when prompted, then enter.

# Deploy:
wrangler deploy
```

The output gives you a URL like `https://polyparlay-verify.<your-subdomain>.workers.dev`.

**Copy that URL and update:**

### Replace VERIFY_URL in extension/popup.js (line 338)

```bash
# From repo root:
sed -i '' "s|https://polyparlay-verify.YOUR_SUBDOMAIN.workers.dev/verify|https://polyparlay-verify.<YOUR-ACTUAL-SUBDOMAIN>.workers.dev/verify|" extension/popup.js
```

### Replace VERIFY_URL in web/upgrade.html (line 270)

```bash
sed -i '' "s|https://polyparlay-verify.YOUR_SUBDOMAIN.workers.dev/verify|https://polyparlay-verify.<YOUR-ACTUAL-SUBDOMAIN>.workers.dev/verify|" web/upgrade.html
```

(Replace `<YOUR-ACTUAL-SUBDOMAIN>` with whatever wrangler returns. Usually your Cloudflare account name.)

### Re-deploy Vercel after the URL swap

The web/upgrade.html change needs to redeploy. If Vercel is hooked to GitHub, just `git push origin main` — Vercel auto-deploys. Otherwise `vercel --prod` again.

---

## 4. Build the CWS submission zip

```bash
cd /Users/clawdlawd/polyparlay/extension
zip -r ../polyparlay-v1.0.30.zip . \
  -x "marketing/*" \
  -x ".DS_Store" \
  -x "**/.DS_Store" \
  -x "icons/*.svg" \
  -x "icons/*-preview.png" \
  -x "icons/icon256.png" \
  -x "icons/icon512.png" \
  -x "icons/README.md"
```

This zip is what you upload to CWS. Already built once at the repo root as `polyparlay-v1.0.30.zip`.

---

## 5. Submit to Chrome Web Store

1. Register your developer account ($5 one-time): https://chrome.google.com/webstore/devconsole/register
2. New item → upload `polyparlay-v1.0.30.zip`
3. Fill the listing form using the copy in `extension/marketing/cws-submission/listing-copy.md`
4. Fill permission justifications using `extension/marketing/cws-submission/permissions-justifications.md`
5. Upload screenshots (1280×800 each) per `extension/marketing/cws-submission/screenshot-specs.md`
6. Optional: upload `extension/marketing/promo-tiles/small-440x280.png` and `marquee-1400x560.png`
7. Privacy URL: `https://polyparlay.app/privacy` (must already be deployed!)
8. Submit for review → typically 1–3 business days

---

## 6. Post-CWS-publish step (one more redeploy)

When Chrome publishes your extension, the listing URL contains your extension ID:
`https://chrome.google.com/webstore/detail/polyparlay/<EXTENSION_ID>`

Replace `YOUR_EXTENSION_ID` in `web/upgrade.html` (around line 316):

```bash
sed -i '' "s|YOUR_EXTENSION_ID|<the actual extension id>|" web/upgrade.html
git add web/upgrade.html && git commit -m "wire CWS extension ID into upgrade.html" && git push
# Vercel auto-deploys on push
```
