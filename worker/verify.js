// PolyParlay Pro verification worker
// Cloudflare Workers — free tier covers the expected volume.
//
// Endpoint:  GET /verify?wallet=0xUSER_WALLET
// Returns:   { ok: true, pro: bool, expires?: unixTimestamp, paidAt?: ts, txHash?: str }
//
// Logic:
//   1. Query Polygonscan for ERC20 transfers of USDC from <wallet> to PAYMENT_ADDRESS
//   2. Find the most recent transfer of >= 99 USDC within the last 365 days
//   3. If found, return pro=true with the expiry timestamp
//
// Deploy with: wrangler deploy
// See ./README.md for setup.

const USDC_CONTRACT = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // Polygon mainnet USDC
const REQUIRED_AMOUNT_RAW = '99000000'; // 99 USDC, 6 decimals
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS,
      ...extraHeaders
    }
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }
    if (request.method !== 'GET') {
      return json({ ok: false, error: 'Method not allowed' }, 405);
    }

    const url = new URL(request.url);
    if (url.pathname !== '/verify' && url.pathname !== '/') {
      return json({ ok: false, error: 'Not found' }, 404);
    }

    const wallet = (url.searchParams.get('wallet') || '').trim().toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
      return json({ ok: false, error: 'Invalid wallet address' }, 400);
    }

    const paymentAddress = (env.PAYMENT_ADDRESS || '').trim().toLowerCase();
    const apiKey = env.POLYGONSCAN_KEY;
    if (!paymentAddress || !apiKey) {
      return json({ ok: false, error: 'Worker not configured (PAYMENT_ADDRESS / POLYGONSCAN_KEY missing)' }, 500);
    }

    // Edge cache the answer for 5 minutes per wallet — Polygonscan throttles at 5 req/sec free tier
    const cacheKey = new Request(`https://cache.polyparlay/${wallet}`, request);
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const apiUrl =
      `https://api.polygonscan.com/api` +
      `?module=account&action=tokentx` +
      `&contractaddress=${USDC_CONTRACT}` +
      `&address=${paymentAddress}` +
      `&page=1&offset=200&sort=desc` +
      `&apikey=${apiKey}`;

    let data;
    try {
      const res = await fetch(apiUrl);
      if (!res.ok) return json({ ok: false, error: 'Polygonscan unavailable' }, 502);
      data = await res.json();
    } catch (err) {
      return json({ ok: false, error: 'Polygonscan fetch failed: ' + (err.message || err) }, 502);
    }

    // Polygonscan returns { status: '1', result: [...] } on success.
    // Status '0' with message 'No transactions found' is a valid empty result.
    if (data.status !== '1') {
      const resp = json({ ok: true, pro: false, wallet, reason: data.message || 'no transactions' });
      resp.headers.set('Cache-Control', 'public, max-age=300');
      await cache.put(cacheKey, resp.clone());
      return resp;
    }

    const txs = Array.isArray(data.result) ? data.result : [];
    const now = Math.floor(Date.now() / 1000);

    const valid = txs.find((tx) => {
      if (!tx) return false;
      if ((tx.from || '').toLowerCase() !== wallet) return false;
      if ((tx.to || '').toLowerCase() !== paymentAddress) return false;
      const value = (() => {
        try { return BigInt(tx.value || '0'); } catch { return 0n; }
      })();
      if (value < BigInt(REQUIRED_AMOUNT_RAW)) return false;
      const ts = parseInt(tx.timeStamp || '0', 10);
      if (!ts || (now - ts) >= ONE_YEAR_SECONDS) return false;
      return true;
    });

    let resp;
    if (valid) {
      const paidAt = parseInt(valid.timeStamp, 10);
      const expires = paidAt + ONE_YEAR_SECONDS;
      resp = json({
        ok: true,
        pro: true,
        wallet,
        paidAt,
        expires,
        txHash: valid.hash
      });
    } else {
      resp = json({ ok: true, pro: false, wallet });
    }
    resp.headers.set('Cache-Control', 'public, max-age=300');
    await cache.put(cacheKey, resp.clone());
    return resp;
  }
};
