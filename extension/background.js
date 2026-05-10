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

  const yi = outcomes.findIndex((o) => String(o).toLowerCase() === 'yes');
  const ni = outcomes.findIndex((o) => String(o).toLowerCase() === 'no');
  const yesPrice = yi >= 0 && prices[yi] != null ? parseFloat(prices[yi]) : null;
  const noPrice = ni >= 0 && prices[ni] != null ? parseFloat(prices[ni]) : null;

  return {
    id: m.id || m.conditionId || m.slug,
    slug: m.slug,
    question: m.question || (parentEvent && parentEvent.title) || m.title || 'Unknown market',
    yesPrice,
    noPrice,
    endDate: m.endDate || (parentEvent && parentEvent.endDate) || null,
    category: m.category || (parentEvent && parentEvent.category) || null,
    eventSlug: parentEvent ? parentEvent.slug : null
  };
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
  if (!detected) return { ok: false, error: 'No market on page' };

  const market = await fetchMarketBySlug(detected.slug);
  if (!market) return { ok: false, error: 'Market not found in Gamma' };

  if (market.yesPrice == null) {
    return { ok: false, error: 'Market has no YES price (not a binary market?)' };
  }

  const slip = await getSlip();

  // Dedup by market id
  if (slip.legs.some((l) => l.id === market.id)) {
    return { ok: false, error: 'Already in slip', legCount: slip.legs.length };
  }

  // Default direction: YES
  slip.legs.push({
    id: market.id,
    slug: market.slug,
    question: market.question,
    direction: 'YES',
    price: market.yesPrice,
    yesPrice: market.yesPrice,
    noPrice: market.noPrice,
    endDate: market.endDate,
    category: market.category,
    url
  });

  await setSlip(slip);
  const message = slip.legs.length > FREE_LEG_LIMIT
    ? `Added — leg ${slip.legs.length} (Pro)`
    : `Added — leg ${slip.legs.length} of ${FREE_LEG_LIMIT}`;

  return { ok: true, message, legCount: slip.legs.length };
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
  if (leg) {
    if (leg.direction === 'YES' && leg.noPrice != null) {
      leg.direction = 'NO';
      leg.price = leg.noPrice;
    } else if (leg.direction === 'NO' && leg.yesPrice != null) {
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

// Refresh prices for all legs in current slip (for live multiplier)
async function refreshSlipPrices() {
  const slip = await getSlip();
  for (const leg of slip.legs) {
    try {
      const fresh = await fetchMarketBySlug(leg.slug);
      if (fresh) {
        leg.yesPrice = fresh.yesPrice;
        leg.noPrice = fresh.noPrice;
        leg.price = leg.direction === 'YES' ? fresh.yesPrice : fresh.noPrice;
      }
    } catch {}
  }
  await setSlip(slip);
  return slip;
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
        default:
          sendResponse({ ok: false, error: 'Unknown message type' });
      }
    } catch (err) {
      sendResponse({ ok: false, error: String(err && err.message ? err.message : err) });
    }
  })();
  return true; // async response
});
