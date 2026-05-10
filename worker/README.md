# PolyParlay verify worker

Cloudflare Worker that checks the Polygon blockchain for a 149 USDC payment from a user's wallet to your receiving address. Used by `web/upgrade.html` to unlock Pro after on-chain payment.

## What it does

`GET /verify?wallet=0xUSER_ADDRESS` → returns:

```json
{
  "ok": true,
  "pro": true,
  "wallet": "0x...",
  "paidAt": 1715512345,
  "expires": 1747048345,
  "txHash": "0x..."
}
```

or, if no qualifying payment exists:

```json
{ "ok": true, "pro": false, "wallet": "0x..." }
```

Validity window is 365 days from `paidAt`. Cached per wallet for 5 minutes to stay under Polygonscan's free-tier rate limit (5 req/sec, 100K req/day).

## Setup

1. **Sign up for free Polygonscan API key** at <https://polygonscan.com/myapikey>
2. **Install Wrangler** if you don't have it: `npm install -g wrangler`
3. **Authenticate**: `wrangler login`
4. **Set the secrets** (you'll be prompted for each value):
   ```bash
   cd worker/
   wrangler secret put POLYGONSCAN_KEY
   wrangler secret put PAYMENT_ADDRESS
   ```
   `PAYMENT_ADDRESS` is your Polygon wallet that will receive the 149 USDC payments.
5. **Deploy**:
   ```bash
   wrangler deploy
   ```
6. **Copy the URL** Wrangler prints (e.g. `https://polyparlay-verify.YOUR_SUBDOMAIN.workers.dev`) and paste it into:
   - `web/upgrade.html` → `VERIFY_URL` constant
   - `extension/popup.js` → (when Pro verification flow is wired in v0.4.0)

## Cost

- Cloudflare Workers: free tier covers 100,000 requests/day (we'll hit ~1% of that even at thousands of subscribers thanks to 5-min cache).
- Polygonscan API: free tier covers 100,000 requests/day, 5 req/sec.
- **Total: $0/month** at expected launch scale.

## Local testing

```bash
wrangler dev
# Visit http://localhost:8787/verify?wallet=0xYOUR_TEST_WALLET
```

The cache works the same in dev mode.
