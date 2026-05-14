# Permission justifications for the CWS form

Each box in the developer-console permissions screen wants a one-sentence "why do you need this." Paste these as written — they're calibrated to what CWS reviewers expect (specific feature → specific permission).

---

## API permissions

### `storage`

```
PolyParlay stores your in-progress parlay slip (legs, stake) and Pro subscription state locally on your machine via chrome.storage.local. Nothing is uploaded; nothing is shared with us.
```

### `activeTab`

```
PolyParlay reads the URL of the active Polymarket tab to detect which market the user is viewing, so the "+ Add to slip" button knows which market to add. We only read the URL when the user explicitly clicks the extension icon or the floating "+ Add to slip" pill.
```

### `tabs`

```
PolyParlay queries open Polymarket tabs to identify when a user is on a market page so the floating pill can be injected. We do not access tab content beyond the URL.
```

---

## Host permissions

### `https://gamma-api.polymarket.com/*`

```
Fetches market metadata (question text, outcomes, current implied probability) for each leg the user adds to their parlay. This is Polymarket's public Gamma API; no authentication required.
```

### `https://data-api.polymarket.com/*`

```
Fetches the user's existing Polymarket positions (only when they explicitly request a refresh) so the popup can show holdings alongside the parlay slip. This is Polymarket's public data API; no authentication required.
```

### `https://polymarket.com/*` and `https://*.polymarket.com/*`

```
Injects the "+ Add to slip" floating pill on Polymarket market pages so users can add legs without leaving the page. Required for the core user flow.
```

### `https://*.workers.dev/*`

```
PolyParlay's Cloudflare Worker (polyparlay-verify.workers.dev) verifies Pro subscription payments on Polygon. Only called when the user explicitly submits the wallet address they paid from on our upgrade page.
```

### `https://polyparlay.app/*`

```
The polyparlay.app upgrade page calls back into the extension to mark Pro as active after on-chain payment verification succeeds. This is gated by externally_connectable so only our domain can message the extension.
```

---

## Remote code

```
None. All extension code is bundled in the package. No eval, no remote scripts, no dynamic imports.
```

## Data collection disclosure

When CWS asks "does this extension collect any of the following user data?", tick:

- **Authentication info**: NO
- **Personally identifiable info**: NO
- **Health info**: NO
- **Financial / payment info**: NO (we receive the wallet address the user types into the verify form, but it's only used for on-chain payment verification and not stored after verification)
- **Personal communications**: NO
- **Location**: NO
- **Web history**: NO (we read the current PM URL only when the user invokes us; we don't log or store browsing history)
- **User activity**: NO
- **Website content**: NO

You will need to certify:
- ☑ I do not sell or transfer user data to third parties outside the approved use cases
- ☑ I do not use or transfer user data for purposes unrelated to my item's single purpose
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes
