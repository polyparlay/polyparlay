// PolyParlay popup
// Renders slip, computes multiplier, generates Canvas card, shares.

const FREE_LEG_LIMIT = 3;
const VIEWER_BASE = 'https://polyparlay.app/slip';
const REF_CODE = 'polyparlay'; // placeholder — replace with verified PM/Kalshi referral codes before publishing

// Append referral parameter to outbound platform links
function withRef(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (u.hostname.endsWith('polymarket.com') || u.hostname.endsWith('kalshi.com')) {
      if (!u.searchParams.has('ref')) u.searchParams.set('ref', REF_CODE);
    }
    return u.toString();
  } catch {
    return url;
  }
}

// ---------- helpers ----------
function fmt$(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return '$' + Number(n).toFixed(2);
}
// Adaptive precision for prices.
// Sub-penny ($0.0005, $0.0001) needs 4 decimals so the multiplier math ties out;
// otherwise users see "$0.001 × $0.69 = 23021×" and can't reverse-engineer the
// joint prob. Below $0.01 → 4 decimals; below $0.10 → 3; otherwise 2.
function fmtPrice(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const v = Number(n);
  if (v > 0 && v < 0.01) return '$' + v.toFixed(4);
  if (v < 0.10) return '$' + v.toFixed(3);
  return '$' + v.toFixed(2);
}
function fmtMult(n) {
  if (!isFinite(n) || n <= 0) return '—';
  return n.toFixed(2) + '×';
}
function safeJSON(obj) {
  try { return JSON.stringify(obj); } catch { return '{}'; }
}
function b64UrlEncode(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function combinedCost(legs) {
  if (!legs.length) return null;
  return legs.reduce((acc, l) => acc * (l.price || 0), 1);
}
function multiplier(legs) {
  const c = combinedCost(legs);
  if (!c || c <= 0) return null;
  return 1 / c;
}
function maxPayout(legs, stake) {
  const m = multiplier(legs);
  if (!m) return null;
  return m * stake;
}
function lossProbability(legs) {
  const c = combinedCost(legs);
  if (c == null) return null;
  return 1 - c;
}
// If user placed each leg independently (no parlay), max payout if every leg hits
// is the SUM of per-leg payouts. Worth showing alongside parlay multiplier so the
// user sees what they'd actually win on PM without a parlay execution layer.
function independentMaxPayout(legs, stake) {
  if (!legs.length || stake <= 0) return null;
  const perLeg = stake / legs.length; // assume even split
  return legs.reduce((acc, l) => acc + (l.price > 0 ? perLeg / l.price : 0), 0);
}
function lastResolutionDate(legs) {
  let latest = null;
  for (const l of legs) {
    if (!l.endDate) continue;
    const d = new Date(l.endDate);
    if (isNaN(d.getTime())) continue;
    if (!latest || d > latest) latest = d;
  }
  return latest;
}
function categoryConcentration(legs) {
  if (legs.length < 2) return null;
  const counts = {};
  let known = 0;
  for (const l of legs) {
    const c = (l.category || '').toLowerCase();
    if (!c) continue;
    counts[c] = (counts[c] || 0) + 1;
    known++;
  }
  if (known < 2) return null;
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [topCat, topCount] = sorted[0];
  // Concentrated if 2+ legs share a category and that category is at least half the slip
  if (topCount >= 2 && topCount / legs.length >= 0.5) {
    return {
      category: topCat,
      count: topCount,
      total: legs.length,
      message: `${topCount} of ${legs.length} legs in ${topCat} — these may move together`
    };
  }
  return null;
}
function totalVolume24h(legs) {
  let any = false;
  let total = 0;
  for (const l of legs) {
    if (l.volume24h != null && !isNaN(l.volume24h)) {
      total += Number(l.volume24h);
      any = true;
    }
  }
  return any ? total : null;
}
function fmtCompactDollar(n) {
  if (n == null || isNaN(n)) return '—';
  const v = Number(n);
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
  return '$' + v.toFixed(0);
}
function fmtPercent(n, decimals) {
  if (n == null || isNaN(n)) return '—';
  return (Number(n) * 100).toFixed(decimals != null ? decimals : 2) + '%';
}
// Real-data Pro analytics — computed from public Gamma data, no backend needed.

// Risk score heuristic. Reads:
// - leg count (more legs = higher risk)
// - combined cost (lower = lottery-style, riskier)
// - minimum leg liquidity (thinly traded leg = exit risk)
function riskScore(legs) {
  if (!legs.length) return null;
  const cost = combinedCost(legs);
  const vols = legs.map((l) => Number(l.volume24h) || 0).filter((v) => v > 0);
  const minVol = vols.length ? Math.min(...vols) : null;
  let score = 0;
  if (legs.length >= 4) score += 2;
  else if (legs.length >= 3) score += 1;
  if (cost != null && cost < 0.10) score += 1;       // lottery-style
  if (cost != null && cost < 0.02) score += 1;       // extreme long shot
  if (minVol != null && minVol < 1000) score += 1;   // thin leg
  if (minVol != null && minVol < 100) score += 1;    // very thin leg
  if (score >= 4) return 'EXTREME';
  if (score >= 2) return 'HIGH';
  if (score >= 1) return 'MODERATE';
  return 'LOW';
}

// Average 24h price drift across legs in absolute price points.
function avg24hDrift(legs) {
  const drifts = legs.map((l) => l.priceChange24h).filter((d) => d != null && !isNaN(d));
  if (!drifts.length) return null;
  return drifts.reduce((a, b) => a + b, 0) / drifts.length;
}

// Average 7d price drift — same as 24h but weekly. Used for "trend strength".
function avg7dDrift(legs) {
  const drifts = legs.map((l) => l.priceChange7d).filter((d) => d != null && !isNaN(d));
  if (!drifts.length) return null;
  return drifts.reduce((a, b) => a + b, 0) / drifts.length;
}

// Resolution confidence — heuristic blend of:
//   - days until soonest leg resolves (closer = higher confidence)
//   - minimum leg liquidity (more = lower oracle-dispute risk)
// Returns 'HIGH' / 'MED' / 'LOW' / null when data missing.
function resolutionConfidence(legs) {
  if (!legs.length) return null;
  const now = Date.now();
  const daysToResolve = legs
    .map((l) => l.endDate ? (new Date(l.endDate).getTime() - now) / (1000 * 60 * 60 * 24) : null)
    .filter((d) => d != null && !isNaN(d));
  if (!daysToResolve.length) return null;
  const maxDays = Math.max(...daysToResolve); // when the LAST leg resolves
  const liquidities = legs.map((l) => Number(l.liquidity) || 0).filter((v) => v > 0);
  const minLiq = liquidities.length ? Math.min(...liquidities) : null;

  let score = 0;
  if (maxDays <= 7) score += 2;
  else if (maxDays <= 30) score += 1;
  if (minLiq != null && minLiq >= 5000) score += 2;
  else if (minLiq != null && minLiq >= 1000) score += 1;

  if (score >= 3) return 'HIGH';
  if (score >= 2) return 'MED';
  return 'LOW';
}

// Monte Carlo simulator — runs entirely client-side, ~10ms for 10K iterations.
// Each iteration: bernoulli trial per leg using market-implied probability.
// All-or-nothing parlay model (atomic — all legs must hit for payout).
function runMonteCarlo(legs, stake, iterations = 10000) {
  if (!legs.length || !stake) return null;
  const probs = legs.map((l) => Math.max(0, Math.min(1, Number(l.price) || 0)));
  const cost = probs.reduce((a, b) => a * b, 1);
  if (cost <= 0) return null;
  const mult = 1 / cost;
  const winPayout = stake * mult;

  let wins = 0;
  let totalReturn = 0;
  let curWinStreak = 0;
  let curLossStreak = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;
  let cumPnl = 0;
  let peakPnl = 0;
  let maxDD = 0;

  for (let i = 0; i < iterations; i++) {
    let allHit = true;
    for (let j = 0; j < probs.length; j++) {
      if (Math.random() > probs[j]) {
        allHit = false;
        break;
      }
    }
    if (allHit) {
      wins++;
      totalReturn += winPayout - stake;
      cumPnl += winPayout - stake;
      curWinStreak++;
      if (curWinStreak > maxWinStreak) maxWinStreak = curWinStreak;
      curLossStreak = 0;
    } else {
      totalReturn += -stake;
      cumPnl += -stake;
      curLossStreak++;
      if (curLossStreak > maxLossStreak) maxLossStreak = curLossStreak;
      curWinStreak = 0;
    }
    if (cumPnl > peakPnl) peakPnl = cumPnl;
    const dd = peakPnl - cumPnl;
    if (dd > maxDD) maxDD = dd;
  }

  const winRate = wins / iterations;
  const avgReturn = totalReturn / iterations;
  const expectedRoi = avgReturn / stake;
  const totalStaked = stake * iterations;
  const overallRoi = totalReturn / totalStaked;

  return {
    iterations,
    legs: legs.length,
    stake,
    multiplier: mult,
    winPayout,
    wins,
    losses: iterations - wins,
    winRate,
    impliedWinRate: cost,
    avgReturnPerParlay: avgReturn,
    expectedRoi,
    totalReturn,
    totalStaked,
    overallRoi,
    maxWinStreak,
    maxLossStreak,
    maxDrawdown: maxDD
  };
}

function fmtRelativeDate(d) {
  if (!d) return '—';
  const now = new Date();
  const ms = d.getTime() - now.getTime();
  const days = Math.round(ms / (1000 * 60 * 60 * 24));
  const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  if (days < 0) return dateStr + ' (resolved)';
  if (days === 0) return dateStr + ' (today)';
  if (days === 1) return dateStr + ' (tomorrow)';
  if (days < 30) return dateStr + ` (${days}d)`;
  if (days < 365) return dateStr + ` (${Math.round(days / 30)}mo)`;
  return dateStr + ` (${Math.round(days / 365)}y)`;
}

// ---------- state ----------
let currentSlip = { legs: [], stake: 10 };
// Leaderboard cache: array of { addr, label, profit, winRate, positions }
let smartMoneyCache = null;
let smartMoneyLoadedAt = 0;
// Captured when user clicks Improve Odds Apply — drives the rebalance banner
// on the shareable slip card. Cleared when slip is cleared or all legs are removed.
let lastRebalance = null;

// Pro state machine — drives feature locking.
// State stored in chrome.storage.local under key 'proState':
//   { trialStartedAt: ms, trialEndsAt: ms, paidUntilAt: ms }
// Tier derived from current time vs these timestamps:
//   - 'paid'  = paidUntilAt > now
//   - 'trial' = trialEndsAt > now (and not paid)
//   - 'free'  = neither
//   - 'expired' = had trial that ended without payment (= 'free' but UX differs)

// One-time free-tier reset is a no-op in production. Kept as a stub so the
// applyProState wiring continues to compile; flip FORCE_FREE_RESET_VERSION
// to a future version string only when you need to wipe state across all
// installs again (typically only for major schema changes).
const FORCE_FREE_RESET_VERSION = null;
async function maybeForceFreeReset() {
  if (!FORCE_FREE_RESET_VERSION) return;
  const { lastFreeResetVersion } = await chrome.storage.local.get(['lastFreeResetVersion']);
  if (lastFreeResetVersion === FORCE_FREE_RESET_VERSION) return;
  await chrome.storage.local.remove(['proState']);
  await chrome.storage.local.set({ lastFreeResetVersion: FORCE_FREE_RESET_VERSION });
}

async function getProState() {
  const { proState } = await chrome.storage.local.get(['proState']);
  if (!proState) return { tier: 'free' };
  const now = Date.now();
  if (proState.paidUntilAt && proState.paidUntilAt > now) {
    return { tier: 'paid', expiresAt: proState.paidUntilAt };
  }
  if (proState.trialEndsAt && proState.trialEndsAt > now) {
    const msLeft = proState.trialEndsAt - now;
    return {
      tier: 'trial',
      expiresAt: proState.trialEndsAt,
      daysLeft: Math.ceil(msLeft / 86400000),
      hoursLeft: Math.ceil(msLeft / 3600000)
    };
  }
  if (proState.trialStartedAt) return { tier: 'expired' };
  return { tier: 'free' };
}

// Cloudflare Worker URL for Pro verification.
// REPLACE with your deployed worker URL after `wrangler deploy`.
const VERIFY_URL = 'https://polyparlay-verify.YOUR_SUBDOMAIN.workers.dev/verify';
const VERIFY_CACHE_MS = 60 * 60 * 1000; // re-check the worker at most once per hour

async function syncProFromWorker() {
  try {
    const { proState } = await chrome.storage.local.get(['proState']);
    if (!proState || !proState.wallet) return null;
    if (Date.now() - (proState.lastVerifiedAt || 0) < VERIFY_CACHE_MS) return proState;
    const r = await fetch(`${VERIFY_URL}?wallet=${encodeURIComponent(proState.wallet)}`);
    if (!r.ok) return proState;
    const data = await r.json();
    if (!data.ok) return proState;
    const next = {
      ...proState,
      paidAt: data.pro && data.paidAt ? data.paidAt : proState.paidAt || null,
      paidUntilAt: data.pro && data.expires ? data.expires * 1000 : null,
      lastVerifiedAt: Date.now()
    };
    await chrome.storage.local.set({ proState: next });
    return next;
  } catch (err) {
    return null;
  }
}

async function startTrial() {
  const now = Date.now();
  const existing = (await chrome.storage.local.get(['proState'])).proState || {};
  // Don't restart a trial that already happened
  if (existing.trialStartedAt) return;
  await chrome.storage.local.set({
    proState: {
      ...existing,
      trialStartedAt: now,
      trialEndsAt: now + 7 * 86400000
    }
  });
}

async function applyProState() {
  const state = await getProState();
  document.body.classList.remove('state-free', 'state-trial', 'state-paid', 'state-expired');
  document.body.classList.add(`state-${state.tier}`);

  const cta = document.getElementById('proMainCta');
  if (cta) {
    if (state.tier === 'free') {
      // Loss-aversion framing: emphasize what they'll miss + early-adopter lock-in
      cta.innerHTML =
        '<span class="pro-cta-line1">Try Pro free for 7 days</span>' +
        '<span class="pro-cta-line2">$149/yr after · early-adopter price locks in · no card required</span>';
    } else if (state.tier === 'trial') {
      const dayLabel = state.daysLeft === 1 ? '1 day' : state.daysLeft + ' days';
      const hourLabel = state.hoursLeft <= 24 ? state.hoursLeft + 'h' : null;
      // Urgency: time-bounded, with concrete loss framing
      cta.innerHTML =
        `<span class="pro-cta-line1">Trial · ${hourLabel || dayLabel} left → lock in Pro</span>` +
        '<span class="pro-cta-line2">Keep Monte Carlo + Improve Odds · $149/yr · cancel anytime</span>';
    } else if (state.tier === 'paid') {
      const d = new Date(state.expiresAt);
      const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      cta.innerHTML =
        '<span class="pro-cta-line1">Pro active ✓</span>' +
        `<span class="pro-cta-line2">Until ${dateStr} · thanks for supporting PolyParlay</span>`;
    } else {
      // Expired — loss-aversion + recovery
      cta.innerHTML =
        '<span class="pro-cta-line1">Renew Pro — your simulator + rebalancer are locked</span>' +
        '<span class="pro-cta-line2">$149/yr · pay once on Polygon · cancel anytime</span>';
    }
  }

  // Update the leg-4 gate upgrade button too
  const upgradeBtn = document.getElementById('upgrade');
  if (upgradeBtn) {
    if (state.tier === 'free') upgradeBtn.textContent = 'Start 7-day free trial';
    else if (state.tier === 'trial') upgradeBtn.textContent = `Pay $149 — ${state.daysLeft}d trial left`;
    else if (state.tier === 'paid') upgradeBtn.textContent = 'Pro active';
    else upgradeBtn.textContent = 'Renew Pro — $149/year';
  }

  // Header conversion CTA — context-aware pill that's always visible at the top
  const headerCta = document.getElementById('headerCta');
  if (headerCta) {
    headerCta.classList.remove('cta-trial', 'cta-paid', 'cta-expired');
    if (state.tier === 'free') {
      headerCta.textContent = '🔥 Try Pro free →';
      headerCta.title = '7-day free trial · no card required · $149/yr after';
    } else if (state.tier === 'trial') {
      const dayLabel = state.daysLeft === 1 ? '1 day' : state.daysLeft + ' days';
      headerCta.textContent = `⏱ Trial · ${dayLabel} left`;
      headerCta.title = 'Pay $149 to lock in Pro · cancel anytime';
      headerCta.classList.add('cta-trial');
    } else if (state.tier === 'paid') {
      headerCta.textContent = '⭐ Pro active';
      headerCta.title = 'Pro until ' + new Date(state.expiresAt).toLocaleDateString();
      headerCta.classList.add('cta-paid');
    } else {
      headerCta.textContent = 'Trial expired · Renew';
      headerCta.title = '$149/yr · on-chain payment, no subscription';
      headerCta.classList.add('cta-expired');
    }
  }

  // Footer tier indicator
  const tierEl = document.getElementById('proTierIndicator');
  if (tierEl) {
    if (state.tier === 'paid') {
      tierEl.textContent = 'Pro';
      tierEl.className = 'pro-tier-indicator tier-paid';
    } else if (state.tier === 'trial') {
      tierEl.textContent = `Trial · ${state.daysLeft}d`;
      tierEl.className = 'pro-tier-indicator tier-trial';
    } else if (state.tier === 'expired') {
      tierEl.textContent = 'Trial expired';
      tierEl.className = 'pro-tier-indicator tier-expired';
    } else {
      tierEl.textContent = 'Free';
      tierEl.className = 'pro-tier-indicator tier-free';
    }
  }

  return state;
}

// Truncate long question text for the rebalance suggestion display
function truncate(s, n) {
  if (!s) return '';
  s = String(s);
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
}

// Suggest a rebalance: identify the weakest leg, then evaluate two amendments:
//   - FLIP direction (if the opposite outcome is favored — e.g. YES at \$0.05
//     flipped to NO at \$0.95 is a 19× win-rate improvement on that leg)
//   - DROP the leg entirely
// Picks whichever yields the bigger win-rate improvement. Flip is preferred
// when tied because it preserves the user's intent (they get a position, just
// on the other side) rather than removing it outright.
function suggestRebalance(legs) {
  if (!legs.length || legs.length <= 1) return null;

  let worstIdx = 0;
  let worstPrice = Number(legs[0].price) || 1;
  for (let i = 1; i < legs.length; i++) {
    const p = Number(legs[i].price) || 1;
    if (p < worstPrice) {
      worstPrice = p;
      worstIdx = i;
    }
  }
  if (worstPrice >= 0.20) return null; // parlay isn't lottery-shaped

  const oldCost = legs.reduce((acc, l) => acc * (Number(l.price) || 0), 1);
  if (oldCost <= 0) return null;

  const worstLeg = legs[worstIdx];

  // -- Option A: FLIP direction --
  // Works when the leg has 2+ outcomes and the other outcome is meaningfully
  // higher priced. Multi-outcome markets (e.g. 'Trump | Harris | Other') skip
  // this — we only flip true binary YES/NO pairs.
  let flipOption = null;
  if (Array.isArray(worstLeg.outcomes) && worstLeg.outcomes.length >= 2 &&
      Array.isArray(worstLeg.prices) && worstLeg.prices.length >= 2) {
    const curIdx = typeof worstLeg.selectedIndex === 'number' ? worstLeg.selectedIndex : 0;
    const otherIdx = curIdx === 0 ? 1 : 0;
    const otherPrice = Number(worstLeg.prices[otherIdx]) || 0;
    if (otherPrice > worstPrice + 0.05) {
      const flipPrices = legs.map((l, i) => (i === worstIdx ? otherPrice : Number(l.price) || 0));
      const flipCost = flipPrices.reduce((a, b) => a * b, 1);
      if (flipCost > 0) {
        flipOption = {
          type: 'flip',
          legIdx: worstIdx,
          flipLegId: worstLeg.id,
          flipFromLabel: worstLeg.outcomes[curIdx] || worstLeg.direction || 'YES',
          flipToLabel: worstLeg.outcomes[otherIdx] || 'NO',
          legQuestion: worstLeg.question,
          legPrice: worstPrice,
          newLegPrice: otherPrice,
          oldWinRate: oldCost,
          newWinRate: flipCost,
          oldMultiplier: 1 / oldCost,
          newMultiplier: 1 / flipCost
        };
      }
    }
  }

  // -- Option B: DROP leg --
  const remaining = legs.filter((_, i) => i !== worstIdx);
  const dropCost = remaining.reduce((acc, l) => acc * (Number(l.price) || 0), 1);
  const dropOption = dropCost > 0
    ? {
        type: 'drop',
        legIdx: worstIdx,
        removeLegId: worstLeg.id,
        removedQuestion: worstLeg.question,
        removedPrice: worstPrice,
        oldWinRate: oldCost,
        newWinRate: dropCost,
        oldMultiplier: 1 / oldCost,
        newMultiplier: 1 / dropCost
      }
    : null;

  // Pick the better option (higher new win rate). Tie-break to flip since it
  // preserves the user's exposure to the event instead of removing it.
  const candidates = [flipOption, dropOption].filter(Boolean);
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    if (a.newWinRate !== b.newWinRate) return b.newWinRate - a.newWinRate;
    return a.type === 'flip' ? -1 : 1;
  });

  // Normalize so renderImproveOdds + Apply handler can read common fields
  const winner = candidates[0];
  return {
    ...winner,
    // legacy compatibility fields used by the rebalance banner on the slip card
    removedQuestion: winner.legQuestion || winner.removedQuestion,
    removedPrice: winner.legPrice || winner.removedPrice
  };
}

// Smart Money: top 3 reference wallets the user can look at.
// Tries the Polymarket leaderboard API first, falls back to a curated stub
// list (replace with verified top-profitable PM addresses before launch).
const FALLBACK_SMART_WALLETS = [
  // Replace these with real addresses from EdgeClaw research before shipping.
  // Until then the leaderboard renders an honest "configure curated wallets" state.
];

async function fetchLeaderboard() {
  // Try the public Polymarket leaderboard endpoint. Endpoint URL/shape is
  // unverified; if it fails, fall through to FALLBACK_SMART_WALLETS.
  const candidates = [
    'https://lb-api.polymarket.com/profit?period=monthly&limit=3',
    'https://lb-api.polymarket.com/leaderboard?period=monthly&limit=3'
  ];
  for (const url of candidates) {
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!r.ok) continue;
      const data = await r.json();
      const arr = Array.isArray(data) ? data : (data.result || data.data || []);
      if (Array.isArray(arr) && arr.length) {
        return arr.slice(0, 3).map((row, i) => ({
          addr: (row.address || row.user || row.wallet || '').toLowerCase(),
          label: row.username || row.name || row.handle || (row.address || '').slice(0, 8) + '…',
          profit: Number(row.profit || row.amount || row.value || 0),
          winRate: row.winRate != null ? Number(row.winRate) : null,
          rank: i + 1
        })).filter((w) => /^0x[a-f0-9]{40}$/.test(w.addr));
      }
    } catch {
      // continue to next candidate
    }
  }
  return null; // signal "leaderboard unavailable"
}

async function loadSmartMoney() {
  // Cache for 10 min
  if (smartMoneyCache && Date.now() - smartMoneyLoadedAt < 10 * 60 * 1000) {
    return smartMoneyCache;
  }
  let wallets = await fetchLeaderboard();
  if (!wallets || !wallets.length) {
    wallets = FALLBACK_SMART_WALLETS.map((w, i) => ({ ...w, rank: i + 1 }));
  }
  // Fetch positions for each wallet in parallel so we can compute slip agreement
  const positionsByWallet = await Promise.all(
    wallets.map((w) => fetchWalletPositions(w.addr))
  );
  smartMoneyCache = wallets.map((w, i) => ({ ...w, positions: positionsByWallet[i] || [] }));
  smartMoneyLoadedAt = Date.now();
  return smartMoneyCache;
}

// Count, across the supplied smart money wallets, how many hold a position
// that matches each leg in the slip (same conditionId or slug, same direction).
function smartMoneyAgreement(legs, smartMoney) {
  if (!legs.length || !smartMoney.length) return null;
  let agreeTotal = 0;
  let possible = 0;
  for (const leg of legs) {
    for (const sm of smartMoney) {
      possible++;
      const match = (sm.positions || []).find((p) => {
        if (!p) return false;
        const pid = String(p.conditionId || p.id || '').toLowerCase();
        const pslug = String(p.slug || '').toLowerCase();
        const lid = String(leg.id || '').toLowerCase();
        const lslug = String(leg.slug || '').toLowerCase();
        return (pid && pid === lid) || (pslug && pslug === lslug);
      });
      if (!match) continue;
      const expectedDir = String(leg.direction || 'YES').toLowerCase();
      const actualDir = String(match.outcome || match.direction || '').toLowerCase();
      if (actualDir === expectedDir) agreeTotal++;
    }
  }
  return { agree: agreeTotal, possible, ratio: possible > 0 ? agreeTotal / possible : 0 };
}

// True per-leg probability after applying user edge.
// Clamps are tight (1e-6) — only to prevent NaN/Infinity downstream. Real PM
// markets do trade sub-penny (e.g. $0.0005), so a 0.001 floor would inflate the
// true prob and create a phantom positive EV when edge=0.
function trueProb(legPrice, edgePp) {
  const p = (Number(legPrice) || 0) + (Number(edgePp) || 0) / 100;
  if (p <= 1e-6) return 1e-6;
  if (p >= 1 - 1e-6) return 1 - 1e-6;
  return p;
}

// Joint true probability across legs assuming independence
function jointTrueProb(legs, edgePp) {
  if (!legs.length) return null;
  return legs.reduce((acc, l) => acc * trueProb(l.price, edgePp), 1);
}

// Expected ROI per dollar staked given user's edge claim
function expectedRoi(legs, edgePp) {
  const m = multiplier(legs);
  const p = jointTrueProb(legs, edgePp);
  if (!m || p == null) return null;
  return p * m - 1;
}

// Kelly fraction = (b·p - q) / b where b = decimal_odds - 1 = multiplier - 1
function kellyFraction(legs, edgePp) {
  const m = multiplier(legs);
  const p = jointTrueProb(legs, edgePp);
  if (!m || p == null || m <= 1) return null;
  const b = m - 1;
  const q = 1 - p;
  return (b * p - q) / b;
}

// Fetch resolved positions from a wallet via Polymarket data-api.
// Used to compute "Your record on this category" — wins/losses for a category.
async function fetchWalletPositions(addr) {
  if (!addr || !/^0x[a-f0-9]{40}$/i.test(addr.trim())) return null;
  try {
    const r = await fetch(`https://data-api.polymarket.com/positions?user=${addr.trim()}&sizeThreshold=0.5`);
    if (!r.ok) return null;
    const data = await r.json();
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

// Given fetched positions and the current slip's primary category,
// estimate the user's hit/miss record in that category from RESOLVED positions only.
function recordForCategory(positions, category) {
  if (!positions || !positions.length || !category) return null;
  const cat = category.toLowerCase();
  let wins = 0;
  let losses = 0;
  for (const pos of positions) {
    // Heuristic: data-api position objects typically expose `redeemable`,
    // `outcome`, `outcomeIndex`, `eventCategory` or similar; check a couple of
    // possibilities since the schema varies.
    const posCat = String(pos.eventCategory || pos.category || pos.eventTitle || '').toLowerCase();
    if (!posCat.includes(cat)) continue;
    // Position is resolved if `redeemable` exists or `cashedOut` is true
    const resolved = pos.redeemable != null || pos.cashedOut === true || pos.curPrice === 0 || pos.curPrice === 1;
    if (!resolved) continue;
    // Won = current price hit 1, lost = hit 0 (atomic resolution)
    if (Number(pos.curPrice) === 1 || pos.outcome === 'Yes' && Number(pos.realizedPnl) > 0) wins++;
    else losses++;
  }
  if (wins + losses === 0) return null;
  return { wins, losses, total: wins + losses, rate: wins / (wins + losses) };
}

// ---------- render ----------
function renderLegs() {
  const container = document.getElementById('legs');
  container.innerHTML = '';

  const countEl = document.getElementById('legsCount');
  if (countEl) {
    const n = currentSlip.legs.length;
    countEl.textContent = n === 1 ? '1 leg' : `${n} legs`;
  }

  if (!currentSlip.legs.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.innerHTML = '<strong>No legs yet</strong>Open a Polymarket market and click "+ Add to slip"';
    container.appendChild(empty);
    appendAddLegButton(container);
    return;
  }

  // Free tier: show first FREE_LEG_LIMIT legs as active, rest as locked
  const visible = currentSlip.legs.slice(0, FREE_LEG_LIMIT);
  visible.forEach((leg, i) => container.appendChild(renderLeg(leg, i)));
  appendAddLegButton(container);

  // Locked preview block
  const lockedSection = document.getElementById('locked');
  const lockedPreview = document.getElementById('lockedPreview');
  if (currentSlip.legs.length > FREE_LEG_LIMIT) {
    const allLegsMult = multiplier(currentSlip.legs);
    const freeLegsMult = multiplier(visible);
    lockedPreview.innerHTML =
      `<div>${currentSlip.legs.length - FREE_LEG_LIMIT} more leg${currentSlip.legs.length - FREE_LEG_LIMIT > 1 ? 's' : ''} ready</div>` +
      `<span class="would">Multiplier would jump from ${fmtMult(freeLegsMult)} to ${fmtMult(allLegsMult)}</span>`;
    lockedSection.classList.remove('hidden');
  } else if (currentSlip.legs.length === FREE_LEG_LIMIT) {
    // Tease: a 4th leg would multiply by ~1.6× on average — but we don't know the price.
    // Show a generic conversion line instead.
    lockedPreview.innerHTML =
      '<div>Add a 4th leg for higher multipliers</div>' +
      '<span class="would">Free tier capped at 3 legs · Pro unlocks unlimited</span>';
    lockedSection.classList.remove('hidden');
  } else {
    lockedSection.classList.add('hidden');
  }
}

function appendAddLegButton(container) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'add-leg-btn';
  btn.innerHTML = '<span class="add-leg-plus">+</span> Add another leg';
  btn.title = 'Opens Polymarket — find a market and use the floating + pill';
  btn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://polymarket.com/markets' });
  });
  container.appendChild(btn);
}

function renderLeg(leg, idx) {
  const div = document.createElement('div');
  div.className = 'leg';

  // Determine current outcome label and the next one (for the flip button)
  const outcomes = Array.isArray(leg.outcomes) && leg.outcomes.length
    ? leg.outcomes
    : [leg.direction || 'YES', leg.direction === 'YES' ? 'NO' : 'YES'];
  const cur = typeof leg.selectedIndex === 'number'
    ? leg.selectedIndex
    : Math.max(0, outcomes.findIndex((o) => o === leg.direction));
  const dirLabel = outcomes[cur] || leg.direction || 'YES';
  const nextLabel = outcomes[(cur + 1) % outcomes.length];

  // Color: YES=green, NO=red, anything else = accent purple
  let dirClass = 'dir-other';
  if (/^yes$/i.test(dirLabel)) dirClass = 'dir-yes';
  else if (/^no$/i.test(dirLabel)) dirClass = 'dir-no';

  div.innerHTML = `
    <div class="leg-body">
      <div class="q">${escapeHtml(leg.question)}</div>
      <div class="meta">
        <span class="${dirClass}">${escapeHtml(dirLabel)}</span>
        ${leg.category ? ' · ' + escapeHtml(leg.category) : ''}
        ${leg.endDate ? ' · resolves ' + new Date(leg.endDate).toLocaleDateString() : ''}
      </div>
      <div class="leg-secondary">
        <button data-flip="${leg.id}" title="Switch outcome">Flip to ${escapeHtml(nextLabel)}</button>
        <button data-open="${leg.id}" title="Open on Polymarket">Open ↗</button>
      </div>
    </div>
    <div class="price">
      ${fmtPrice(leg.price)}
      <small>leg ${idx + 1}</small>
    </div>
    <button class="leg-remove" data-remove="${leg.id}" title="Remove leg" aria-label="Remove leg ${idx + 1}">×</button>
  `;
  return div;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// No-op setter so removed/renamed elements don't throw and stop rendering.
// (v0.1.6 removed several rows but renderSummary kept setting their textContent,
// which threw before multiplier and payout were rendered — hence the blanks.)
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}
function toggleHidden(id, hide) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('hidden', !!hide);
}

function renderSummary() {
  // Only count free-tier legs in summary (the locked-leg multiplier is visible in the locked block)
  const eligible = currentSlip.legs.slice(0, FREE_LEG_LIMIT);
  // Defensive: stake can be undefined on legacy slips. Always fall back to 10.
  const stake = Number(currentSlip.stake);
  const safeStake = isFinite(stake) && stake >= 0 ? stake : 10;
  const cost = combinedCost(eligible);
  const mult = multiplier(eligible);
  const payout = maxPayout(eligible, safeStake);

  setText('combinedCost', cost == null ? '—' : fmtPercent(cost, cost < 0.01 ? 3 : 2));
  setText('multiplier', fmtMult(mult));
  setText('maxPayout', fmt$(payout));
  setValue('stake', safeStake);

  // Live analytics — free tier (some IDs may not exist depending on layout)
  const lossP = lossProbability(eligible);
  setText('lossProb', fmtPercent(lossP, 2));

  const indPay = independentMaxPayout(eligible, safeStake);
  setText('indSum', indPay != null ? fmt$(indPay) + ' max' : '—');

  const lastReso = lastResolutionDate(eligible);
  setText('lastReso', lastReso ? fmtRelativeDate(lastReso) : '—');

  const vol = totalVolume24h(eligible);
  setText('volSum', vol != null ? fmtCompactDollar(vol) : 'data unavailable');

  const conc = categoryConcentration(eligible);
  if (conc) {
    toggleHidden('concentrationWarn', false);
    setText('concentrationText', conc.message);
  } else {
    toggleHidden('concentrationWarn', true);
  }

  // Real Pro analytics — 3 open rows (computed live from public data)
  const risk = riskScore(eligible);
  setText('proRisk', risk || '—');
  const slipVol = totalVolume24h(eligible);
  setText('proVol24', slipVol != null ? fmtCompactDollar(slipVol) : '—');
  const drift = avg24hDrift(eligible);
  if (drift != null) {
    const sign = drift >= 0 ? '+' : '';
    setText('proDrift', sign + (drift * 100).toFixed(1) + 'pp');
  } else {
    setText('proDrift', '—');
  }
  // The 6 blurred locked rows ship with illustrative sample values in HTML —
  // they unblur in Preview Pro mode so the user can see the full UX. Real
  // data piping for those (smart money, signal archive, etc.) ships in v1.0.

  const hasLegs = eligible.length > 0;
  const shareBtn = document.getElementById('shareX');
  if (shareBtn) shareBtn.disabled = !hasLegs;
  const downloadBtn = document.getElementById('downloadTop');
  if (downloadBtn) downloadBtn.disabled = !hasLegs;

  // Auto-render the slip card when there are legs so the user always sees what they're about to share
  if (hasLegs) {
    drawCard();
    toggleHidden('cardWrap', false);
  } else {
    toggleHidden('cardWrap', true);
  }
  // Improve Odds now lives at the bottom of the sim results panel (so its
  // connection to Monte Carlo is visual). It refreshes from renderSimResults,
  // not from here.
}

// ---------- actions ----------
async function loadSlip() {
  const resp = await chrome.runtime.sendMessage({ type: 'getSlip' });
  if (resp && resp.ok) currentSlip = resp.slip;
  renderLegs();
  renderSummary();
}

async function refreshPrices() {
  const btn = document.getElementById('refresh');
  btn.disabled = true;
  btn.textContent = '…';
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'refreshPrices' });
    if (resp && resp.ok) currentSlip = resp.slip;
    renderLegs();
    renderSummary();
  } finally {
    btn.disabled = false;
    btn.textContent = '↻';
  }
}

async function clearSlip() {
  if (!confirm('Clear all legs?')) return;
  const resp = await chrome.runtime.sendMessage({ type: 'clearSlip' });
  if (resp && resp.ok) currentSlip = resp.slip;
  lastRebalance = null; // banner is per-active-slip, drop when cleared
  document.getElementById('cardWrap').classList.add('hidden');
  renderLegs();
  renderSummary();
}

async function setStake(v) {
  const resp = await chrome.runtime.sendMessage({ type: 'setStake', stake: v });
  if (resp && resp.ok) currentSlip = resp.slip;
  renderSummary();
}

async function flipLeg(id) {
  const resp = await chrome.runtime.sendMessage({ type: 'flipLeg', legId: id });
  if (resp && resp.ok) currentSlip = resp.slip;
  renderLegs();
  renderSummary();
}

async function removeLeg(id) {
  const resp = await chrome.runtime.sendMessage({ type: 'removeLeg', legId: id });
  if (resp && resp.ok) currentSlip = resp.slip;
  renderLegs();
  renderSummary();
}

// ---------- canvas card ----------
// Canvas roundRect polyfill (built-in isn't reliable across all Chrome MV3 contexts).
function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawCard() {
  const eligible = currentSlip.legs.slice(0, FREE_LEG_LIMIT);
  const canvas = document.getElementById('card');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;   // 1200
  const H = canvas.height;  // 630

  // --- BACKGROUND: deep gradient with subtle vignette accent ---
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0a0c14');
  bg.addColorStop(0.55, '#0e1322');
  bg.addColorStop(1, '#161a2e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Top-right accent glow
  const glow = ctx.createRadialGradient(W * 0.82, H * 0.1, 10, W * 0.82, H * 0.1, 380);
  glow.addColorStop(0, 'rgba(99,102,241,0.32)');
  glow.addColorStop(1, 'rgba(99,102,241,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Bottom-left amber accent
  const glow2 = ctx.createRadialGradient(80, H - 60, 10, 80, H - 60, 320);
  glow2.addColorStop(0, 'rgba(245,158,11,0.18)');
  glow2.addColorStop(1, 'rgba(245,158,11,0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  // --- HEADER: brand mark + tagline ---
  // Purple dot mark
  ctx.fillStyle = '#6366f1';
  ctx.beginPath();
  ctx.arc(64, 64, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(99,102,241,0.32)';
  ctx.beginPath();
  ctx.arc(64, 64, 18, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f9fafb';
  ctx.font = '800 30px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText('PolyParlay', 88, 73);

  ctx.fillStyle = '#a5b4fc';
  ctx.font = '600 13px -apple-system, sans-serif';
  ctx.fillText('MONTE CARLO + ODDS OPTIMIZER', 88, 96);

  // Top-right corner — for Pro users, show a gold PRO badge instead of the
  // date stamp. Creates a visual status symbol that free users see in shared
  // cards (aspirational lever for upgrade).
  const isPro = document.body.classList.contains('state-paid') ||
                document.body.classList.contains('state-trial');
  if (isPro) {
    ctx.fillStyle = '#fbbf24';
    roundRect(ctx, W - 110, 50, 60, 28, 6);
    ctx.fill();
    ctx.fillStyle = '#0a0c14';
    ctx.font = '900 14px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PRO', W - 80, 70);
    ctx.textAlign = 'left';
  } else {
    const now = new Date();
    const dateStr = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    ctx.fillStyle = '#6b7280';
    ctx.font = '500 13px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(dateStr.toUpperCase(), W - 60, 73);
    ctx.textAlign = 'left';
  }

  // --- LEGS ---
  const startY = 160;
  const lineH = 70;
  eligible.forEach((leg, i) => {
    const y = startY + i * lineH;

    // Number badge (small purple square instead of circle — more modern)
    ctx.fillStyle = 'rgba(99,102,241,0.16)';
    roundRect(ctx, 60, y - 22, 32, 32, 8);
    ctx.fill();
    ctx.fillStyle = '#a5b4fc';
    ctx.font = '800 14px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), 76, y - 1);
    ctx.textAlign = 'left';

    // Direction pill (YES/NO/etc) — bumped to 14px font / 25px tall for thumbnail legibility
    const label = (leg.direction || (leg.outcomes && leg.outcomes[leg.selectedIndex || 0]) || 'YES').toUpperCase();
    let dirBg, dirFg;
    if (/^YES$/i.test(label)) { dirBg = 'rgba(34,197,94,0.22)'; dirFg = '#4ade80'; }
    else if (/^NO$/i.test(label)) { dirBg = 'rgba(239,68,68,0.22)'; dirFg = '#f87171'; }
    else { dirBg = 'rgba(99,102,241,0.22)'; dirFg = '#a5b4fc'; }
    ctx.font = '800 14px -apple-system, sans-serif';
    const dirW = ctx.measureText(label).width + 20;
    ctx.fillStyle = dirBg;
    roundRect(ctx, 105, y - 18, dirW, 25, 6);
    ctx.fill();
    ctx.fillStyle = dirFg;
    ctx.fillText(label, 115, y - 1);

    // Question — bumped 21px → 24px so it stays legible after X feed thumbnail crop.
    // Word-boundary truncation (avoids cutting mid-word like '$7.0B at market...')
    const questionX = 113 + dirW + 8;
    ctx.fillStyle = '#f9fafb';
    ctx.font = '600 24px -apple-system, sans-serif';
    const maxW = W - questionX - 200;
    let q = leg.question || 'Market';
    if (ctx.measureText(q).width > maxW) {
      const words = q.split(' ');
      let trimmed = '';
      while (words.length > 1) {
        words.pop();
        const candidate = words.join(' ') + '…';
        if (ctx.measureText(candidate).width <= maxW) { trimmed = candidate; break; }
      }
      if (!trimmed) {
        // Single very-long word — fall back to char truncation
        trimmed = q;
        while (trimmed.length > 4 && ctx.measureText(trimmed + '…').width > maxW) {
          trimmed = trimmed.slice(0, -1);
        }
        trimmed = trimmed + '…';
      }
      q = trimmed;
    }
    ctx.fillText(q, questionX, y);

    // Resolution date subtitle
    if (leg.endDate) {
      const d = new Date(leg.endDate);
      if (!isNaN(d.getTime())) {
        ctx.fillStyle = '#6b7280';
        ctx.font = '500 13px -apple-system, sans-serif';
        ctx.fillText('Resolves ' + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), questionX, y + 24);
      }
    }

    // Price (adaptive precision, right-aligned). Dropped the redundant "LEG N"
    // caption — the number badge on the left already conveys position.
    ctx.fillStyle = '#f9fafb';
    ctx.font = '800 28px -apple-system, sans-serif';
    const p = Number(leg.price) || 0;
    const priceText = p > 0 && p < 0.01 ? '$' + p.toFixed(4) : p < 0.10 ? '$' + p.toFixed(3) : '$' + p.toFixed(2);
    ctx.textAlign = 'right';
    ctx.fillText(priceText, W - 60, y);
    ctx.textAlign = 'left';
  });

  // --- STORY BANNER ---
  // Story this card needs to tell: PolyParlay's algorithm made this parlay
  // viable (rebalance case) OR ran a real simulation behind the multiplier
  // (default case). Either way fills the dead-space above the footer.
  const bannerY = H - 270;
  if (lastRebalance) {
    // Green rebalance banner — punchier, dramatic copy
    ctx.fillStyle = 'rgba(34, 197, 94, 0.12)';
    roundRect(ctx, 60, bannerY, W - 120, 52, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.42)';
    ctx.lineWidth = 1;
    roundRect(ctx, 60, bannerY, W - 120, 52, 10);
    ctx.stroke();

    ctx.fillStyle = '#4ade80';
    ctx.font = '800 13px -apple-system, sans-serif';
    ctx.fillText('↗ ODDS REBALANCED BY POLYPARLAY', 80, bannerY + 20);

    ctx.fillStyle = '#f9fafb';
    ctx.font = '700 16px -apple-system, sans-serif';
    const before = fmtPercentSmart(lastRebalance.oldWinRate);
    const after = fmtPercentSmart(lastRebalance.newWinRate);
    ctx.fillText(`Win rate ${before} → ${after}`, 80, bannerY + 40);
  } else {
    // Default state — small Monte Carlo provenance pill so the space tells
    // a story even without a rebalance. Subtle purple, brand-affirming.
    ctx.fillStyle = 'rgba(99, 102, 241, 0.10)';
    roundRect(ctx, 60, bannerY, W - 120, 52, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.32)';
    ctx.lineWidth = 1;
    roundRect(ctx, 60, bannerY, W - 120, 52, 10);
    ctx.stroke();

    ctx.fillStyle = '#a5b4fc';
    ctx.font = '800 13px -apple-system, sans-serif';
    ctx.fillText('🎲 MONTE CARLO SIMULATED · 10,000 OUTCOMES', 80, bannerY + 20);

    ctx.fillStyle = '#cbd5ff';
    ctx.font = '500 14px -apple-system, sans-serif';
    ctx.fillText('Win rate computed live · not just the implied multiplier', 80, bannerY + 40);
  }

  // --- FOOTER PAYOUT BLOCK ---
  const footerY = H - 200;

  // Divider
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, footerY - 10);
  ctx.lineTo(W - 60, footerY - 10);
  ctx.stroke();

  // Multiplier — hero number on left. Sized BIG so it survives X feed thumbnail
  // crops (which scale 1200×630 down to ~600×315 in timeline). Has to read at
  // that size or the share is wasted.
  const mult = multiplier(eligible);
  ctx.fillStyle = '#9ca3af';
  ctx.font = '800 12px -apple-system, sans-serif';
  ctx.fillText('IF ALL HIT', 60, footerY + 18);

  const multText = fmtMult(mult);
  ctx.fillStyle = '#a5b4fc';
  ctx.font = '900 112px -apple-system, sans-serif';
  ctx.fillText(multText, 60, footerY + 110);

  // Run Monte Carlo for win rate (adaptive iterations)
  let winRateText = '—';
  let winRateColor = '#fbbf24'; // default amber
  if (eligible.length) {
    const cost = combinedCost(eligible);
    const sims = cost != null && cost < 0.001 ? 100000 : 10000;
    const r = runMonteCarlo(eligible, currentSlip.stake || 10, sims);
    if (r) {
      winRateText = fmtPercentSmart(r.winRate);
      // Color-code: green if sim win rate is at/above implied (favorable),
      // red if sim is meaningfully below (unfavorable), amber otherwise.
      if (cost != null) {
        if (r.winRate >= cost * 1.02) winRateColor = '#4ade80';
        else if (r.winRate < cost * 0.98) winRateColor = '#f87171';
      }
    }
  }

  // Right-side metrics cluster: WIN RATE / STAKE / MAX PAYOUT
  const payout = maxPayout(eligible, currentSlip.stake);
  const stake = Number(currentSlip.stake) || 0;
  ctx.textAlign = 'right';

  // WIN RATE — bumped 28→36px and color-coded (this is our unique value-add)
  ctx.fillStyle = '#9ca3af';
  ctx.font = '800 12px -apple-system, sans-serif';
  ctx.fillText('SIM WIN RATE', W - 380, footerY + 18);
  ctx.fillStyle = winRateColor;
  ctx.font = '900 36px -apple-system, sans-serif';
  ctx.fillText(winRateText, W - 380, footerY + 60);

  ctx.fillStyle = '#9ca3af';
  ctx.font = '800 12px -apple-system, sans-serif';
  ctx.fillText('STAKE', W - 220, footerY + 18);
  ctx.fillStyle = '#f9fafb';
  ctx.font = '800 32px -apple-system, sans-serif';
  ctx.fillText('$' + stake.toFixed(0), W - 220, footerY + 60);

  ctx.fillStyle = '#9ca3af';
  ctx.font = '800 12px -apple-system, sans-serif';
  ctx.fillText('MAX PAYOUT', W - 60, footerY + 18);
  ctx.fillStyle = '#4ade80';
  ctx.font = '900 48px -apple-system, sans-serif';
  ctx.fillText(fmt$(payout), W - 60, footerY + 66);
  ctx.textAlign = 'left';

  // --- WATERMARK ---
  // Dropped the "Information only" disclaimer that was on the right — pure
  // visual noise in a shareable image. Just the brand watermark now.
  ctx.fillStyle = '#6b7280';
  ctx.font = '700 14px -apple-system, sans-serif';
  ctx.fillText('polyparlay.app', 60, H - 28);
  ctx.fillStyle = '#4b5563';
  ctx.font = '500 12px -apple-system, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('Built with Monte Carlo + Odds Optimizer', W - 60, H - 28);
  ctx.textAlign = 'left';
}

function buildShareUrl() {
  const eligible = currentSlip.legs.slice(0, FREE_LEG_LIMIT);
  const compact = {
    v: 1,
    s: currentSlip.stake,
    l: eligible.map((l) => ({
      q: l.question,
      d: l.direction,
      p: l.price,
      e: l.endDate || null,
      u: l.url || null
    }))
  };
  const hash = b64UrlEncode(safeJSON(compact));
  return `${VIEWER_BASE}#${hash}`;
}

function setShareStatus(msg, color) {
  const el = document.getElementById('shareStatus');
  if (!el) return;
  el.textContent = msg || '';
  el.style.color = color || '';
}

function downloadCard() {
  const canvas = document.getElementById('card');
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `polyparlay-slip-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setShareStatus('PNG downloaded — attach it to a post manually.', '');
  }, 'image/png');
}

async function copyImageToClipboard() {
  const canvas = document.getElementById('card');
  if (!canvas) return false;
  try {
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) return false;
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard || !navigator.clipboard.write) {
      return false;
    }
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch (e) {
    return false;
  }
}

async function shareToX() {
  const eligible = currentSlip.legs.slice(0, FREE_LEG_LIMIT);
  if (!eligible.length) return;
  // Make sure the canvas is current
  drawCard();

  const mult = multiplier(eligible);
  const text = `${eligible.length}-leg Polymarket parlay. ${fmtMult(mult)} if all hit. Built with @polyparlay`;
  const intent = `https://x.com/intent/post?text=${encodeURIComponent(text)}`;

  setShareStatus('Copying slip image to clipboard…', '');
  const copied = await copyImageToClipboard();

  if (copied) {
    setShareStatus('Slip image copied — paste (⌘/Ctrl+V) in the X composer that just opened.', '#22c55e');
  } else {
    setShareStatus('Couldn\'t copy image — use Download PNG and attach manually.', '#f59e0b');
  }
  chrome.tabs.create({ url: intent });
}

// ---------- wiring ----------
function systemPrefersLight() {
  try {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  } catch {
    return false;
  }
}

async function applyTheme() {
  // 'Native' = OS preference. PM-page sync is unreliable across SPAs and
  // was producing stale dark-mode for light-OS users. OS prefers-color-scheme
  // is the source of truth. We deliberately ignore the stored pmTheme.
  document.body.setAttribute('data-theme', systemPrefersLight() ? 'light' : 'dark');
}

// Live-react to OS theme changes even before PM syncs
if (window.matchMedia) {
  try {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', applyTheme);
  } catch {}
}

document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  loadSlip();

  document.getElementById('refresh').addEventListener('click', refreshPrices);
  document.getElementById('clear').addEventListener('click', clearSlip);
  document.getElementById('stake').addEventListener('change', (e) => {
    setStake(Number(e.target.value || 0));
  });
  document.getElementById('legs').addEventListener('click', (e) => {
    const t = e.target;
    if (t.dataset.flip) flipLeg(t.dataset.flip);
    if (t.dataset.remove) removeLeg(t.dataset.remove);
    if (t.dataset.open) {
      const leg = currentSlip.legs.find((l) => String(l.id) === String(t.dataset.open));
      if (leg && leg.url) chrome.tabs.create({ url: withRef(leg.url) });
    }
  });
  document.getElementById('shareX').addEventListener('click', shareToX);
  document.getElementById('downloadTop').addEventListener('click', downloadCard);
  document.getElementById('upgrade').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://polyparlay.app/upgrade?from=leg-gate' });
  });
  // addCurrent button was removed in v1.0.6 (the floating pill on PM pages
  // handles adding legs). Guard the listener so a missing element doesn't
  // throw and abort the rest of init (which would silently break other
  // handlers like the Run Sim button below).
  const addCurrentBtn = document.getElementById('addCurrent');
  if (addCurrentBtn) addCurrentBtn.addEventListener('click', addCurrentTab);

  // Single Pro upgrade CTA at the bottom of the consolidated Pro section
  const mainCta = document.getElementById('proMainCta');
  if (mainCta) {
    mainCta.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://polyparlay.app/upgrade?from=main-cta' });
    });
  }

  // Every Pro feature element with a data-pro attribute opens the upgrade page
  // with feature attribution, so future analytics can track which surface drove the click.
  document.querySelectorAll('[data-pro]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (el.id === 'proMainCta') return;
      e.preventDefault();
      const feature = el.getAttribute('data-pro') || 'unknown';
      chrome.tabs.create({
        url: `https://polyparlay.app/upgrade?from=slip-${encodeURIComponent(feature)}`
      });
    });
  });

  // Analytics inline unlock CTA + clicking any blurred Pro row -> start trial
  const analyticsUnlock = document.getElementById('analyticsUnlock');
  const startTrialFromContext = async (sourceLabel) => {
    await startTrial();
    await applyProState();
    showTrialToast();
    renderLegs();
    renderSummary();
  };
  if (analyticsUnlock) {
    analyticsUnlock.addEventListener('click', () => startTrialFromContext('analytics-unlock'));
  }
  document.querySelectorAll('.analytics-blur-row').forEach((row) => {
    row.addEventListener('click', async () => {
      const state = await getProState();
      if (state.tier === 'free' || state.tier === 'expired') {
        await startTrialFromContext('analytics-row-' + (row.dataset.proRow || 'unknown'));
      }
    });
  });

  // Run Sim button — locked for free tier (routes to trial), runs locally for trial/paid
  const simBtn = document.getElementById('runSimBtn');
  if (simBtn) {
    simBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const state = await getProState();
      if (state.tier === 'free' || state.tier === 'expired') {
        // Lockout — start trial with celebratory toast, then run sim so the
        // click feels rewarded (user sees something obviously happen)
        await startTrial();
        await applyProState();
        showTrialToast();
        // Now that trial is active, fire the sim so the click feels rewarded
        runAndShowSim();
        return;
      }
      runAndShowSim();
    });
  }
  const simClose = document.getElementById('simClose');
  if (simClose) {
    simClose.addEventListener('click', () => {
      toggleHidden('simResults', true);
      // Restore the run-sim button when results close — the button and the
      // results panel are mutually exclusive (results expand from the button's
      // location instead of pushing below the fold).
      const btn = document.getElementById('runSimBtn');
      if (btn) btn.classList.remove('hidden');
    });
  }

  // Pro CTA action — shared by the main bottom button AND the header pill.
  // free → start trial in-extension (instant unlock + toast)
  // anything else → upgrade page (Polygon payment flow)
  async function handleProCtaClick(source) {
    const state = await getProState();
    if (state.tier === 'free') {
      await startTrial();
      await applyProState();
      showTrialToast();
      renderLegs();
      renderSummary();
    } else {
      chrome.tabs.create({
        url: `https://polyparlay.app/upgrade?from=${encodeURIComponent(source)}`
      });
    }
  }

  const proMainCta = document.getElementById('proMainCta');
  if (proMainCta) proMainCta.addEventListener('click', () => handleProCtaClick('main-cta'));

  const headerCta = document.getElementById('headerCta');
  if (headerCta) headerCta.addEventListener('click', () => handleProCtaClick('header-cta'));

  // Pro Preview toggle removed — state machine is the single source of truth.
  // For local dev: open DevTools console and run
  //   chrome.storage.local.set({proState:{trialStartedAt:Date.now(),trialEndsAt:Date.now()+7*86400000}})
  // to simulate an active trial.

  // One-time free-tier reset for v1.0.15 — fires once per install, then a no-op.
  maybeForceFreeReset().then(() => applyProState());

  // After initial render, sync from worker in the background so an external
  // payment (made on polyparlay.app/upgrade) gets reflected without a manual reload.
  syncProFromWorker().then((next) => {
    if (next) applyProState();
  });

  // Dev affordance: click the footer tier pill to cycle through
  //   free → trial → paid → expired → free
  // Production-gated: only enabled when localStorage.polyparlay_dev === '1'.
  // To enable in your own browser: open the popup, then in DevTools console:
  //   localStorage.setItem('polyparlay_dev', '1')
  // and reopen the popup. To turn off: localStorage.removeItem('polyparlay_dev').
  // Without this flag a public user clicking the footer pill does nothing —
  // they can't accidentally (or deliberately) flip themselves to Paid.
  const tierEl = document.getElementById('proTierIndicator');
  const devCycleEnabled = (() => {
    try { return localStorage.getItem('polyparlay_dev') === '1'; }
    catch { return false; }
  })();
  if (tierEl && devCycleEnabled) {
    tierEl.style.cursor = 'pointer';
    tierEl.title = 'DEV: Click to cycle state (Free → Trial → Paid → Expired)';
    tierEl.addEventListener('click', async (e) => {
      e.preventDefault();
      const { proState } = await chrome.storage.local.get(['proState']);
      const now = Date.now();
      let cur = 'free';
      if (proState) {
        if (proState.paidUntilAt && proState.paidUntilAt > now) cur = 'paid';
        else if (proState.trialEndsAt && proState.trialEndsAt > now) cur = 'trial';
        else if (proState.trialStartedAt) cur = 'expired';
      }
      const next = { free: 'trial', trial: 'paid', paid: 'expired', expired: 'free' }[cur];
      if (next === 'free') {
        await chrome.storage.local.remove(['proState']);
      } else if (next === 'trial') {
        await chrome.storage.local.set({
          proState: { trialStartedAt: now, trialEndsAt: now + 7 * 86400000 }
        });
      } else if (next === 'paid') {
        await chrome.storage.local.set({
          proState: { paidUntilAt: now + 365 * 86400000, paidAt: Math.floor(now / 1000) }
        });
      } else if (next === 'expired') {
        await chrome.storage.local.set({
          proState: { trialStartedAt: now - 8 * 86400000, trialEndsAt: now - 86400000 }
        });
      }
      await applyProState();
      renderLegs();
      renderSummary();
    });
  }
});

async function loadAndRenderLeaderboard() {
  const status = document.getElementById('lbStatus');
  const list = document.getElementById('lbList');
  const foot = document.getElementById('lbAgreement');
  if (!list) return;

  if (status) status.textContent = 'loading…';
  let wallets;
  try {
    wallets = await loadSmartMoney();
  } catch {
    wallets = null;
  }

  if (!wallets || !wallets.length) {
    list.innerHTML =
      '<div class="pro-lb-row pro-lb-empty">Smart money leaderboard unavailable. Curated wallet list lands in v1.0.</div>';
    if (status) status.textContent = 'v1.0';
    if (foot) foot.textContent = '';
    renderSummary();
    return;
  }

  if (status) status.textContent = 'live';
  list.innerHTML = wallets.map((w) => {
    const handle = w.label || (w.addr.slice(0, 6) + '…' + w.addr.slice(-4));
    const profit = w.profit > 0 ? '+$' + Math.round(w.profit).toLocaleString() : '$' + Math.round(w.profit).toLocaleString();
    const profileUrl = `https://polymarket.com/profile/${w.addr}`;
    return `<a class="pro-lb-row" href="${profileUrl}" target="_blank" rel="noopener" data-pro="lb-${w.rank}">
      <span class="pro-lb-rank">#${w.rank}</span>
      <span class="pro-lb-name">${handle}</span>
      <span class="pro-lb-stat">${profit}</span>
    </a>`;
  }).join('');

  // Slip-level agreement footer
  if (foot) {
    const eligible = currentSlip.legs.slice(0, FREE_LEG_LIMIT);
    if (eligible.length) {
      const a = smartMoneyAgreement(eligible, wallets);
      if (a && a.possible > 0) {
        const pct = (a.ratio * 100).toFixed(0);
        foot.classList.toggle('has-agreement', a.agree > 0);
        foot.textContent = a.agree > 0
          ? `Smart money agreement on this slip: ${a.agree} of ${a.possible} (${pct}%)`
          : 'No smart money positions match your current slip';
      } else {
        foot.textContent = '';
      }
    } else {
      foot.textContent = 'Add legs to see smart money agreement';
    }
  }

  // Re-render summary so smart-money-derived rows populate
  renderSummary();
}

function runAndShowSim() {
  const eligible = currentSlip.legs.slice(0, FREE_LEG_LIMIT);
  if (!eligible.length) return;
  const stake = Number(currentSlip.stake) || 10;
  const desc = document.getElementById('runSimDesc');

  // Adaptive iteration count: scale up for very low joint probabilities so
  // we get a non-zero win count to display. Below 0.01% needs ~1M sims for
  // ~100 expected wins; below 0.1% needs ~100K. Cap at 1M to stay <500ms.
  const cost = combinedCost(eligible);
  let iterations = 10000;
  let label = '10,000';
  if (cost != null) {
    if (cost < 0.0001) { iterations = 1000000; label = '1,000,000'; }
    else if (cost < 0.001) { iterations = 100000; label = '100,000'; }
    else if (cost < 0.01) { iterations = 50000; label = '50,000'; }
  }
  if (desc) desc.textContent = `Running ${label}…`;

  setTimeout(() => {
    const result = runMonteCarlo(eligible, stake, iterations);
    if (desc) desc.textContent = 'Distribution of payouts, win rate, drawdown — runs in your browser';
    renderSimResults(result);
  }, 30);
}

function fmtPercentSmart(p) {
  // Show enough precision to be non-zero. 0.000043 → "0.0043%" not "0.00%".
  if (p == null || isNaN(p)) return '—';
  const pct = p * 100;
  if (pct === 0) return '0.00%';
  if (pct >= 1) return pct.toFixed(2) + '%';
  if (pct >= 0.01) return pct.toFixed(3) + '%';
  if (pct >= 0.0001) return pct.toFixed(5) + '%';
  return pct.toExponential(2) + '%';
}

function renderSimResults(r) {
  const panel = document.getElementById('simResults');
  const grid = document.getElementById('simGrid');
  if (!panel || !grid) return;
  if (!r) {
    grid.innerHTML = '<div class="sim-cell" style="grid-column: 1 / -1; text-align: center; color: var(--muted);">No data — add at least one leg with a price.</div>';
    toggleHidden('simResults', false);
    return;
  }
  const itLabel = r.iterations.toLocaleString();
  const cells = [
    { label: 'Win rate (sim)', value: fmtPercentSmart(r.winRate), cls: '' },
    { label: 'Implied win rate', value: fmtPercentSmart(r.impliedWinRate), cls: '' },
    { label: 'Multiplier', value: r.multiplier.toFixed(2) + '×', cls: '' },
    { label: 'Win payout', value: '$' + r.winPayout.toFixed(2), cls: 'pos' },
    { label: `Wins / ${itLabel}`, value: r.wins.toLocaleString(), cls: r.wins > 0 ? 'pos' : '' },
    { label: `Losses / ${itLabel}`, value: r.losses.toLocaleString(), cls: 'neg' },
    { label: 'Avg P&L per parlay', value: (r.avgReturnPerParlay >= 0 ? '+' : '') + '$' + r.avgReturnPerParlay.toFixed(2), cls: r.avgReturnPerParlay >= 0 ? 'pos' : 'neg' },
    { label: 'Expected ROI', value: (r.expectedRoi >= 0 ? '+' : '') + (r.expectedRoi * 100).toFixed(2) + '%', cls: r.expectedRoi >= 0 ? 'pos' : 'neg' },
    { label: 'Longest win streak', value: r.maxWinStreak.toString(), cls: '' },
    { label: 'Longest loss streak', value: r.maxLossStreak.toString(), cls: 'neg' },
    { label: 'Max drawdown', value: '$' + r.maxDrawdown.toFixed(0), cls: 'neg' },
    { label: `Cumulative P&L (${itLabel})`, value: (r.totalReturn >= 0 ? '+' : '') + '$' + r.totalReturn.toFixed(0), cls: r.totalReturn >= 0 ? 'pos' : 'neg' }
  ];
  grid.innerHTML = cells.map((c) =>
    `<div class="sim-cell">
      <div class="sim-cell-label">${c.label}</div>
      <div class="sim-cell-value ${c.cls}">${c.value}</div>
    </div>`
  ).join('');
  setText('simHeadLabel', `Monte Carlo · ${itLabel} sims`);
  toggleHidden('simResults', false);

  // Hide the Run Sim button while the results panel is open — the panel takes
  // its place in the layout so users see the simulation expand FROM where they
  // clicked, not get pushed off-screen requiring a scroll.
  const btn = document.getElementById('runSimBtn');
  if (btn) btn.classList.add('hidden');

  // Render Improve Odds at the bottom of the panel after sim results render
  renderImproveOdds();
}

// Improve Odds — always visible at the bottom of the Monte Carlo sim panel.
// Three states:
//   - 'ok'        Lowest leg ≥ $0.20 — nothing to rebalance, show green check
//   - 'free pitch'  Improvable + free user — pitch + Apply (click starts trial)
//   - 'pro suggest' Improvable + trial/paid — specific recommendation + Apply
async function renderImproveOdds() {
  const el = document.getElementById('improveOdds');
  if (!el) return;
  const eligible = currentSlip.legs.slice(0, FREE_LEG_LIMIT);
  const desc = document.getElementById('improveOddsDesc');
  const apply = document.getElementById('improveOddsApply');
  const title = el.querySelector('.improve-odds-title');
  if (!desc || !apply || !title) return;

  // Hide entirely only when there are no legs to evaluate
  if (!eligible.length) {
    el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');

  const suggest = suggestRebalance(eligible);

  // STATE 1: All clear — parlay is balanced, show positive confirmation
  if (!suggest) {
    el.classList.add('improve-odds-ok');
    title.innerHTML = '✓ Parlay looks balanced';
    desc.classList.remove('improve-odds-pitch');
    desc.innerHTML = 'No weak leg detected — lowest priced above $0.20. Run the simulation above to see the full distribution.';
    apply.style.display = 'none';
    apply.onclick = null;
    return;
  }

  // STATE 2/3: There IS a rebalance candidate — show title + Apply
  el.classList.remove('improve-odds-ok');
  apply.style.display = '';
  title.innerHTML = '↗ Improve odds';

  const state = await getProState();
  const isPro = state.tier === 'trial' || state.tier === 'paid';

  if (isPro) {
    desc.classList.remove('improve-odds-pitch');
    if (suggest.type === 'flip') {
      desc.innerHTML =
        `Flip "<strong>${escapeHtml(truncate(suggest.legQuestion, 28))}</strong>" ` +
        `from <strong>${escapeHtml(suggest.flipFromLabel)}</strong> → ` +
        `<strong>${escapeHtml(suggest.flipToLabel)}</strong> ` +
        `(${fmtPrice(suggest.legPrice)} → ${fmtPrice(suggest.newLegPrice)}). ` +
        `Win rate <span class="rebal-up">${fmtPercentSmart(suggest.oldWinRate)} → ${fmtPercentSmart(suggest.newWinRate)}</span>.`;
    } else {
      desc.innerHTML =
        `Drop "<strong>${escapeHtml(truncate(suggest.removedQuestion, 32))}</strong>" ` +
        `(priced ${fmtPrice(suggest.removedPrice)}). ` +
        `Win rate <span class="rebal-up">${fmtPercentSmart(suggest.oldWinRate)} → ${fmtPercentSmart(suggest.newWinRate)}</span>. ` +
        `Multiplier ${suggest.oldMultiplier.toFixed(1)}× → ${suggest.newMultiplier.toFixed(1)}×.`;
    }
  } else {
    desc.classList.add('improve-odds-pitch');
    desc.innerHTML =
      'Use our odds algorithm to optimize position direction or drop weak legs ' +
      'for higher win probability. <strong>Apply</strong> to see the specific recommendation.';
  }

  apply.onclick = async () => {
    apply.disabled = true;
    const prevText = apply.textContent;
    apply.textContent = '…';
    try {
      const curState = await getProState();
      const wasFree = curState.tier === 'free' || curState.tier === 'expired';
      if (wasFree) {
        await startTrial();
        await applyProState();
        showTrialToast(); // celebrate the conversion
      }
      // Capture before/after for the slip-card rebalance banner
      lastRebalance = {
        type: suggest.type,
        removedQuestion: suggest.removedQuestion || suggest.legQuestion,
        removedPrice: suggest.removedPrice || suggest.legPrice,
        oldMultiplier: suggest.oldMultiplier,
        newMultiplier: suggest.newMultiplier,
        oldWinRate: suggest.oldWinRate,
        newWinRate: suggest.newWinRate,
        at: Date.now()
      };
      // Branch by amendment type — flip (preserves exposure) or drop
      if (suggest.type === 'flip') {
        await chrome.runtime.sendMessage({ type: 'flipLeg', legId: suggest.flipLegId });
      } else {
        await chrome.runtime.sendMessage({ type: 'removeLeg', legId: suggest.removeLegId });
      }
      const resp = await chrome.runtime.sendMessage({ type: 'getSlip' });
      if (resp && resp.ok) currentSlip = resp.slip;
      renderLegs();
      renderSummary();
      runAndShowSim(); // re-run so user sees the improved outcome
    } finally {
      apply.disabled = false;
      apply.textContent = prevText;
    }
  };
}

// Brief celebratory toast when trial activates
function showTrialToast() {
  const existing = document.getElementById('trialToast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.id = 'trialToast';
  t.className = 'trial-toast';
  t.innerHTML = '<span>🎉</span><span>Pro trial activated · 7 days unlocked</span>';
  document.body.appendChild(t);
  // Trigger CSS transition
  requestAnimationFrame(() => t.classList.add('trial-toast-show'));
  setTimeout(() => {
    t.classList.remove('trial-toast-show');
    setTimeout(() => t.remove(), 300);
  }, 2800);
}

// Execute menu — open all current legs on Polymarket (each in a new tab, with referral).
// Top-level since popup.js loads after DOM (script tag at end of body).
document.addEventListener('DOMContentLoaded', () => {
  const openAllBtn = document.getElementById('openAllLegs');
  if (!openAllBtn) return;
  openAllBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const eligible = currentSlip.legs.slice(0, FREE_LEG_LIMIT);
    const refUrls = eligible
      .map((l) => l.url)
      .filter(Boolean)
      .map((u) => withRef(u));
    if (!refUrls.length) {
      setShareStatus('No leg URLs to open. Add at least one leg first.', '#f59e0b');
      return;
    }
    refUrls.forEach((u, i) => {
      // Stagger slightly to avoid Chrome blocking the burst of tabs
      setTimeout(() => chrome.tabs.create({ url: u, active: i === 0 }), i * 80);
    });
    const menu = document.getElementById('executeMenu');
    if (menu) menu.removeAttribute('open');
  });
});

async function addCurrentTab() {
  const btn = document.getElementById('addCurrent');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Reading current tab…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
      btn.textContent = 'No active tab';
      setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1400);
      return;
    }
    const url = new URL(tab.url);
    if (!/(?:^|\.)polymarket\.com$/.test(url.hostname)) {
      btn.textContent = 'Open a Polymarket tab first';
      setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1800);
      return;
    }
    const path = url.pathname;
    const eventMatch = path.match(/^\/event\/([^/?#]+)(?:\/([^/?#]+))?/);
    const marketMatch = path.match(/^\/markets?\/([^/?#]+)/);
    let detected = null;
    if (eventMatch) {
      detected = { kind: eventMatch[2] ? 'submarket' : 'event', slug: eventMatch[2] || eventMatch[1] };
    } else if (marketMatch) {
      detected = { kind: 'market', slug: marketMatch[1] };
    }
    if (!detected) {
      btn.textContent = 'No market in URL';
      setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1800);
      return;
    }
    const resp = await chrome.runtime.sendMessage({
      type: 'addLeg',
      detected,
      pageTitle: tab.title || 'Polymarket market',
      url: tab.url
    });
    if (resp && resp.ok) {
      btn.textContent = resp.message || 'Added';
      currentSlip = (await chrome.runtime.sendMessage({ type: 'getSlip' })).slip;
      renderLegs();
      renderSummary();
    } else {
      btn.textContent = (resp && resp.error) || 'Could not add';
    }
    setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1400);
  } catch (err) {
    btn.textContent = 'Error: ' + (err.message || err);
    setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1800);
  }
}

// React to background storage changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.slip) {
    currentSlip = changes.slip.newValue || { legs: [], stake: 10 };
    renderLegs();
    renderSummary();
  }
  // pmTheme storage updates intentionally ignored — OS prefers-color-scheme
  // is the single source of truth (see applyTheme).
});
