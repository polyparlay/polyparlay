// Polywise background service worker
// - Handles message-passing between content/popup and Gamma API
// - Manages slip state in chrome.storage.local

const GAMMA = 'https://gamma-api.polymarket.com';
const FREE_LEG_LIMIT = 3;

async function fetchMarketBySlug(slug) {
  // Try /markets?slug= first (works for individual binary markets and sub-markets)
  const r = await fetch(`${GAMMA}/markets?slug=${encodeURIComponent(slug)}&limit=1`);
  if (r.ok) {
    const arr = await r.json();
    if (Array.isArray(arr) && arr.length) return normalizeMarket(arr[0]);
  }
  // Fall back to /events?slug= for event-level slugs
  const e = await fetch(`${GAMMA}/events?slug=${encodeURIComponent(slug)}&limit=1`);
  if (e.ok) {
    const arr = await e.json();
    if (Array.isArray(arr) && arr.length) {
      const ev = arr[0];
      // For an event, take the first child market as a default; user can refine later.
      if (Array.isArray(ev.markets) && ev.markets.length) {
        return normalizeMarket(ev.markets[0], ev);
      }
    }
  }
  return null;
}

function normalizeMarket(m, parentEvent) {
  let outcomes = [];
  let prices = [];
  try {
    outcomes = typeof m.outcomes === 'string' ? JSON.parse(m.outcomes) : (m.outcomes || []);
  } catch {}
  try {
    prices = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : (m.outcomePrices || []);
  } catch {}

  const labels = outcomes.map((o) => String(o));
  const numericPrices = prices.map((p) => parseFloat(p)).filter((p) => !isNaN(p));

  // Volume / liquidity / price-change fields vary between Gamma payloads — try the common ones
  const vol24 = pickNumber([
    m.volume24hr, m.volume24Hr, m.volume24h, m.volume_24h,
    m.volume24hrClob, m.oneDayVolumeNum
  ]);
  const liquidity = pickNumber([m.liquidity, m.liquidityNum, m.liquidityClob]);
  const priceChange24h = pickNumber([
    m.oneDayPriceChange, m.priceChange24h, m.priceChange24Hr,
    m.priceChange1d, m.dailyPriceChange
  ]);

  return {
    id: m.id || m.conditionId || m.slug,
    slug: m.slug,
    question: m.question || (parentEvent && parentEvent.title) || m.title || 'Unknown market',
    outcomes: labels,
    prices: numericPrices,
    endDate: m.endDate || (parentEvent && parentEvent.endDate) || null,
    category: m.category || (parentEvent && parentEvent.category) || null,
    eventSlug: parentEvent ? parentEvent.slug : null,
    volume24h: vol24,
    liquidity,
    priceChange24h
  };
}

function pickNumber(values) {
  for (const v of values) {
    if (v == null) continue;
    const n = parseFloat(v);
    if (!isNaN(n) && isFinite(n)) return n;
  }
  return null;
}

async function getSlip() {
  const { slip } = await chrome.storage.local.get(['slip']);
  const defaults = { legs: [], stake: 10, createdAt: Date.now() };
  if (slip && Array.isArray(slip.legs)) {
    // Merge defaults so legacy slips (pre-v0.1.2) get a stake fallback.
    return { ...defaults, ...slip, stake: slip.stake != null ? Number(slip.stake) : 10 };
  }
  return defaults;
}

async function setSlip(slip) {
  await chrome.storage.local.set({ slip });
  return slip;
}

async function addLeg({ detected, pageTitle, url }) {
  if (!detected) return { ok: false, error: 'No market detected in URL' };

  const market = await fetchMarketBySlug(detected.slug);
  if (!market) {
    return { ok: false, error: `Not found in Gamma: ${detected.slug}` };
  }

  if (!market.outcomes || market.outcomes.length < 2) {
    return { ok: false, error: 'Market has fewer than 2 outcomes' };
  }
  if (!market.prices || market.prices.length < market.outcomes.length) {
    return { ok: false, error: 'Market has incomplete pricing' };
  }

  const slip = await getSlip();

  // Dedup by market id
  if (slip.legs.some((l) => l.id === market.id)) {
    return { ok: false, error: 'Already in slip', legCount: slip.legs.length };
  }

  // Default to first outcome (typically YES, Up, Team A, etc.)
  const selectedIndex = 0;
  slip.legs.push({
    id: market.id,
    slug: market.slug,
    question: market.question,
    outcomes: market.outcomes,
    prices: market.prices,
    selectedIndex,
    // Convenience fields kept for backward compatibility with old popup code
    direction: market.outcomes[selectedIndex],
    price: market.prices[selectedIndex],
    endDate: market.endDate,
    category: market.category,
    volume24h: market.volume24h,
    liquidity: market.liquidity,
    priceChange24h: market.priceChange24h,
    url
  });

  await setSlip(slip);
  const message = slip.legs.length > FREE_LEG_LIMIT
    ? `Added — leg ${slip.legs.length} (Pro)`
    : `Added — leg ${slip.legs.length} of ${FREE_LEG_LIMIT}`;

  return { ok: true, message, legCount: slip.legs.length, slip };
}

async function removeLeg(legId) {
  const slip = await getSlip();
  slip.legs = slip.legs.filter((l) => l.id !== legId);
  await setSlip(slip);
  return slip;
}

async function flipLeg(legId) {
  const slip = await getSlip();
  const leg = slip.legs.find((l) => l.id === legId);
  if (leg && leg.outcomes && leg.outcomes.length > 1) {
    // Cycle through outcomes (binary = simple flip; 3+ = round-robin)
    const cur = typeof leg.selectedIndex === 'number' ? leg.selectedIndex : 0;
    const next = (cur + 1) % leg.outcomes.length;
    leg.selectedIndex = next;
    leg.direction = leg.outcomes[next];
    leg.price = leg.prices[next];
  } else if (leg && leg.yesPrice != null && leg.noPrice != null) {
    // Legacy leg (pre-v0.1.3) — keep old flip behavior so existing slips don't break
    if (leg.direction === 'YES') {
      leg.direction = 'NO';
      leg.price = leg.noPrice;
    } else {
      leg.direction = 'YES';
      leg.price = leg.yesPrice;
    }
  }
  await setSlip(slip);
  return slip;
}

async function clearSlip() {
  return setSlip({ legs: [], stake: 10, createdAt: Date.now() });
}

async function setStake(stake) {
  const slip = await getSlip();
  slip.stake = Math.max(0, Number(stake) || 0);
  await setSlip(slip);
  return slip;
}

// Refresh prices for all legs in current slip (for live multiplier).
// Also migrates legacy legs (pre-v0.1.3) to the outcomes/prices array shape.
async function refreshSlipPrices() {
  const slip = await getSlip();
  for (const leg of slip.legs) {
    try {
      const fresh = await fetchMarketBySlug(leg.slug);
      if (fresh && fresh.outcomes && fresh.prices) {
        leg.outcomes = fresh.outcomes;
        leg.prices = fresh.prices;
        leg.volume24h = fresh.volume24h;
        leg.liquidity = fresh.liquidity;
        leg.priceChange24h = fresh.priceChange24h;
        leg.endDate = fresh.endDate || leg.endDate;
        leg.category = fresh.category || leg.category;
        // Preserve selection if possible — match by label first, fall back to index
        let idx = 0;
        if (typeof leg.selectedIndex === 'number') {
          idx = Math.min(leg.selectedIndex, fresh.outcomes.length - 1);
        } else if (leg.direction) {
          const matchIdx = fresh.outcomes.findIndex(
            (o) => String(o).toLowerCase() === String(leg.direction).toLowerCase()
          );
          if (matchIdx >= 0) idx = matchIdx;
        }
        leg.selectedIndex = idx;
        leg.direction = fresh.outcomes[idx];
        leg.price = fresh.prices[idx];
      }
    } catch {}
  }
  await setSlip(slip);
  return slip;
}

// Open the extension popup if the API is available (Chrome 127+),
// otherwise fall back to opening popup.html in a new tab.
async function openExtensionUI() {
  // chrome.action.openPopup() requires a recent Chrome AND a user gesture
  // that propagated from the content-script click through sendMessage.
  if (chrome.action && typeof chrome.action.openPopup === 'function') {
    try {
      await chrome.action.openPopup();
      return { ok: true, method: 'popup' };
    } catch (err) {
      // fall through to tab fallback
    }
  }
  try {
    const url = chrome.runtime.getURL('popup.html');
    await chrome.tabs.create({ url });
    return { ok: true, method: 'tab' };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.type) {
        case 'addLeg':
          sendResponse(await addLeg(msg));
          break;
        case 'removeLeg':
          sendResponse({ ok: true, slip: await removeLeg(msg.legId) });
          break;
        case 'flipLeg':
          sendResponse({ ok: true, slip: await flipLeg(msg.legId) });
          break;
        case 'clearSlip':
          sendResponse({ ok: true, slip: await clearSlip() });
          break;
        case 'setStake':
          sendResponse({ ok: true, slip: await setStake(msg.stake) });
          break;
        case 'getSlip':
          sendResponse({ ok: true, slip: await getSlip() });
          break;
        case 'refreshPrices':
          sendResponse({ ok: true, slip: await refreshSlipPrices() });
          break;
        case 'openPopup':
          sendResponse(await openExtensionUI());
          break;
        default:
          sendResponse({ ok: false, error: 'Unknown message type' });
      }
    } catch (err) {
      sendResponse({ ok: false, error: String(err && err.message ? err.message : err) });
    }
  })();
  return true; // async response
});
