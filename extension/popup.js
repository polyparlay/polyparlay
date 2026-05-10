// PolyParlay popup
// Renders slip, computes multiplier, generates Canvas card, shares.

const FREE_LEG_LIMIT = 3;
const VIEWER_BASE = 'https://polyparlay.io/slip';
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
// Adaptive precision for prices: low-priced legs (under $0.10) need 3 decimals
// so the user can mentally verify the multiplier. $0.02 vs $0.025 changes the math
// by ~20% on a single leg, more on a multi-leg parlay.
function fmtPrice(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const v = Number(n);
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
// Positive = legs have moved up; negative = moved down.
function avg24hDrift(legs) {
  const drifts = legs.map((l) => l.priceChange24h).filter((d) => d != null && !isNaN(d));
  if (!drifts.length) return null;
  return drifts.reduce((a, b) => a + b, 0) / drifts.length;
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
let userInputs = { edge: 0, bankroll: 1000, wallet: '' };
let walletPositionsCache = null; // populated when wallet pasted

// True per-leg probability after applying user edge (clamped to keep math sane)
function trueProb(legPrice, edgePp) {
  const p = (Number(legPrice) || 0) + (Number(edgePp) || 0) / 100;
  if (p <= 0.001) return 0.001;
  if (p >= 0.999) return 0.999;
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

  if (!currentSlip.legs.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.innerHTML = '<strong>No legs yet</strong>Open a Polymarket market and click "+ Add to slip"';
    container.appendChild(empty);
    return;
  }

  // Free tier: show first FREE_LEG_LIMIT legs as active, rest as locked
  const visible = currentSlip.legs.slice(0, FREE_LEG_LIMIT);
  visible.forEach((leg, i) => container.appendChild(renderLeg(leg, i)));

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

  // Real Pro analytics — open rows
  const risk = riskScore(eligible);
  setText('proRisk', risk || '—');
  const slipVol = totalVolume24h(eligible);
  setText('proVol24', slipVol != null ? fmtCompactDollar(slipVol) : '—');
  const drift = avg24hDrift(eligible);
  if (drift != null) {
    const sign = drift >= 0 ? '+' : '';
    setText('proDrift', sign + (drift * 100).toFixed(1) + 'pp');
    const driftEl = document.getElementById('proDrift');
    if (driftEl) {
      driftEl.classList.toggle('drift-up', drift > 0);
      driftEl.classList.toggle('drift-down', drift < 0);
    }
  } else {
    setText('proDrift', '—');
  }

  // Real Pro analytics — locked rows that depend on user inputs (edge / bankroll / wallet)
  const edgePp = Number(userInputs.edge) || 0;
  const winP = jointTrueProb(eligible, edgePp);
  setText('proWinProb', winP != null ? (winP * 100).toFixed(2) + '%' : '—');

  const evRoi = expectedRoi(eligible, edgePp);
  if (evRoi != null) {
    const sign = evRoi >= 0 ? '+' : '';
    setText('proExpectedRoi', sign + (evRoi * 100).toFixed(2) + '%');
  } else {
    setText('proExpectedRoi', '—');
  }

  const kf = kellyFraction(eligible, edgePp);
  const bankroll = Number(userInputs.bankroll) || 0;
  if (kf != null && bankroll > 0) {
    const kellyDollars = Math.max(0, kf * bankroll);
    const halfKelly = kellyDollars / 2;
    setText('proKelly', kf > 0 ? `$${halfKelly.toFixed(0)} (½) · $${kellyDollars.toFixed(0)} (full)` : '$0 (no edge)');
  } else {
    setText('proKelly', '—');
  }

  // Your record — derived from cached wallet positions
  if (walletPositionsCache && eligible.length) {
    const cat = eligible[0].category;
    const rec = recordForCategory(walletPositionsCache, cat);
    if (rec) {
      setText('proRecord', `${rec.wins}-${rec.losses} (${(rec.rate * 100).toFixed(0)}%) in ${cat}`);
    } else if (cat) {
      setText('proRecord', `0 resolved in ${cat}`);
    } else {
      setText('proRecord', 'no category match');
    }
  } else if (userInputs.wallet) {
    setText('proRecord', 'fetching…');
  } else {
    setText('proRecord', 'paste wallet ↑');
  }

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
function drawCard() {
  const eligible = currentSlip.legs.slice(0, FREE_LEG_LIMIT);
  const canvas = document.getElementById('card');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0a0c12');
  bg.addColorStop(1, '#13182a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle accent line
  ctx.strokeStyle = '#6366f1';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(60, 80);
  ctx.lineTo(180, 80);
  ctx.stroke();

  // Brand
  ctx.fillStyle = '#f9fafb';
  ctx.font = '600 28px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText('POLYPARLAY', 60, 70);

  // Title
  ctx.fillStyle = '#9ca3af';
  ctx.font = '500 18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText('Polymarket parlay slip', 60, 110);

  // Legs
  const startY = 170;
  const lineH = 64;
  ctx.font = '600 22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  eligible.forEach((leg, i) => {
    const y = startY + i * lineH;
    // Number circle
    ctx.fillStyle = '#1e2230';
    ctx.beginPath();
    ctx.arc(80, y - 8, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#9ca3af';
    ctx.font = '700 16px -apple-system, sans-serif';
    ctx.fillText(String(i + 1), 75, y - 3);

    // Question (truncate)
    ctx.fillStyle = '#f9fafb';
    ctx.font = '600 22px -apple-system, sans-serif';
    const maxW = 700;
    let q = leg.question;
    if (ctx.measureText(q).width > maxW) {
      while (q.length > 4 && ctx.measureText(q + '…').width > maxW) q = q.slice(0, -1);
      q = q + '…';
    }
    ctx.fillText(q, 120, y);

    // Direction
    const label = leg.direction || (leg.outcomes && leg.outcomes[leg.selectedIndex || 0]) || 'YES';
    let dirColor = '#6366f1';
    if (/^yes$/i.test(label)) dirColor = '#22c55e';
    else if (/^no$/i.test(label)) dirColor = '#ef4444';
    ctx.fillStyle = dirColor;
    ctx.font = '700 14px -apple-system, sans-serif';
    ctx.fillText(label, 120, y + 24);

    // Price (adaptive precision)
    ctx.fillStyle = '#f9fafb';
    ctx.font = '700 24px -apple-system, sans-serif';
    const p = Number(leg.price) || 0;
    const priceText = p < 0.10 ? '$' + p.toFixed(3) : '$' + p.toFixed(2);
    const priceW = ctx.measureText(priceText).width;
    ctx.fillText(priceText, W - 60 - priceW, y);
  });

  // Divider
  ctx.strokeStyle = '#1e2230';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, H - 220);
  ctx.lineTo(W - 60, H - 220);
  ctx.stroke();

  // Multiplier (huge)
  const mult = multiplier(eligible);
  ctx.fillStyle = '#9ca3af';
  ctx.font = '500 16px -apple-system, sans-serif';
  ctx.fillText('IF ALL HIT', 60, H - 175);
  ctx.fillStyle = '#f9fafb';
  ctx.font = '700 96px -apple-system, sans-serif';
  ctx.fillText(fmtMult(mult), 60, H - 90);

  // Stake / payout
  const payout = maxPayout(eligible, currentSlip.stake);
  ctx.fillStyle = '#9ca3af';
  ctx.font = '500 16px -apple-system, sans-serif';
  ctx.fillText('STAKE', W - 380, H - 175);
  ctx.fillText('MAX PAYOUT', W - 220, H - 175);
  ctx.fillStyle = '#f9fafb';
  ctx.font = '700 32px -apple-system, sans-serif';
  ctx.fillText('$' + currentSlip.stake.toFixed(0), W - 380, H - 130);
  ctx.fillStyle = '#22c55e';
  ctx.fillText(fmt$(payout).replace('$', '$'), W - 220, H - 130);

  // Watermark
  ctx.fillStyle = '#4b5563';
  ctx.font = '500 14px -apple-system, sans-serif';
  ctx.fillText('polyparlay.io', 60, H - 30);
  ctx.textAlign = 'right';
  ctx.fillText('Information only — verify on Polymarket', W - 60, H - 30);
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
async function applyTheme() {
  try {
    const { pmTheme } = await chrome.storage.local.get(['pmTheme']);
    document.body.setAttribute('data-theme', pmTheme === 'light' ? 'light' : 'dark');
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
    chrome.tabs.create({ url: 'https://polyparlay.io/upgrade?from=leg-gate' });
  });
  document.getElementById('addCurrent').addEventListener('click', addCurrentTab);

  // Single Pro upgrade CTA at the bottom of the consolidated Pro section
  const mainCta = document.getElementById('proMainCta');
  if (mainCta) {
    mainCta.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://polyparlay.io/upgrade?from=main-cta' });
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
        url: `https://polyparlay.io/upgrade?from=slip-${encodeURIComponent(feature)}`
      });
    });
  });

  // Run Sim button — runs Monte Carlo locally and shows results
  const simBtn = document.getElementById('runSimBtn');
  if (simBtn) {
    simBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      runAndShowSim();
    });
  }
  const simClose = document.getElementById('simClose');
  if (simClose) {
    simClose.addEventListener('click', () => {
      toggleHidden('simResults', true);
    });
  }

  // Pro Preview toggle — defaults ON so the user can try every feature unlocked.
  const previewToggle = document.getElementById('proPreview');
  if (previewToggle) {
    chrome.storage.local.get(['proPreview']).then(({ proPreview }) => {
      // Default to true if the key has never been set
      const enabled = proPreview === undefined ? true : !!proPreview;
      previewToggle.checked = enabled;
      document.body.classList.toggle('preview-pro', enabled);
      if (proPreview === undefined) {
        chrome.storage.local.set({ proPreview: true });
      }
    });
    previewToggle.addEventListener('change', () => {
      const on = previewToggle.checked;
      document.body.classList.toggle('preview-pro', on);
      chrome.storage.local.set({ proPreview: on });
    });
  }

  // Edge / bankroll / wallet inputs — drive the real Pro analytics computations
  const edgeInput = document.getElementById('edgeInput');
  const bankrollInput = document.getElementById('bankrollInput');
  const walletInput = document.getElementById('walletInput');

  // Restore persisted inputs so the user doesn't re-type each time
  chrome.storage.local.get(['userInputs']).then(({ userInputs: stored }) => {
    if (stored) {
      userInputs = { ...userInputs, ...stored };
      if (edgeInput) edgeInput.value = userInputs.edge;
      if (bankrollInput) bankrollInput.value = userInputs.bankroll;
      if (walletInput) walletInput.value = userInputs.wallet;
      if (userInputs.wallet) refreshWalletPositions();
    }
    renderSummary();
  });

  function persistInputs() {
    chrome.storage.local.set({ userInputs });
  }

  if (edgeInput) {
    edgeInput.addEventListener('input', () => {
      userInputs.edge = Number(edgeInput.value) || 0;
      persistInputs();
      renderSummary();
    });
  }
  if (bankrollInput) {
    bankrollInput.addEventListener('input', () => {
      userInputs.bankroll = Number(bankrollInput.value) || 0;
      persistInputs();
      renderSummary();
    });
  }
  if (walletInput) {
    walletInput.addEventListener('change', () => {
      userInputs.wallet = walletInput.value.trim();
      persistInputs();
      walletPositionsCache = null;
      renderSummary();
      if (userInputs.wallet) refreshWalletPositions();
    });
  }
});

async function refreshWalletPositions() {
  if (!userInputs.wallet) return;
  const positions = await fetchWalletPositions(userInputs.wallet);
  walletPositionsCache = positions || [];
  renderSummary();
}

function runAndShowSim() {
  const eligible = currentSlip.legs.slice(0, FREE_LEG_LIMIT);
  if (!eligible.length) return;
  const stake = Number(currentSlip.stake) || 10;
  const desc = document.getElementById('runSimDesc');
  if (desc) desc.textContent = 'Running…';

  // Defer to next tick so the UI updates before the (fast) compute hogs the thread
  setTimeout(() => {
    const result = runMonteCarlo(eligible, stake, 10000);
    if (desc) desc.textContent = 'Distribution of payouts, win rate, drawdown — runs in your browser';
    renderSimResults(result);
  }, 30);
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
  const cells = [
    { label: 'Win rate (sim)', value: (r.winRate * 100).toFixed(2) + '%', cls: '' },
    { label: 'Implied win rate', value: (r.impliedWinRate * 100).toFixed(2) + '%', cls: '' },
    { label: 'Multiplier', value: r.multiplier.toFixed(2) + '×', cls: '' },
    { label: 'Win payout', value: '$' + r.winPayout.toFixed(2), cls: 'pos' },
    { label: 'Wins / 10K', value: r.wins.toLocaleString(), cls: 'pos' },
    { label: 'Losses / 10K', value: r.losses.toLocaleString(), cls: 'neg' },
    { label: 'Avg P&L per parlay', value: (r.avgReturnPerParlay >= 0 ? '+' : '') + '$' + r.avgReturnPerParlay.toFixed(2), cls: r.avgReturnPerParlay >= 0 ? 'pos' : 'neg' },
    { label: 'Expected ROI', value: (r.expectedRoi >= 0 ? '+' : '') + (r.expectedRoi * 100).toFixed(2) + '%', cls: r.expectedRoi >= 0 ? 'pos' : 'neg' },
    { label: 'Longest win streak', value: r.maxWinStreak.toString(), cls: '' },
    { label: 'Longest loss streak', value: r.maxLossStreak.toString(), cls: 'neg' },
    { label: 'Max drawdown', value: '$' + r.maxDrawdown.toFixed(0), cls: 'neg' },
    { label: 'Cumulative P&L (10K)', value: (r.totalReturn >= 0 ? '+' : '') + '$' + r.totalReturn.toFixed(0), cls: r.totalReturn >= 0 ? 'pos' : 'neg' }
  ];
  grid.innerHTML = cells.map((c) =>
    `<div class="sim-cell">
      <div class="sim-cell-label">${c.label}</div>
      <div class="sim-cell-value ${c.cls}">${c.value}</div>
    </div>`
  ).join('');
  toggleHidden('simResults', false);
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
  if (changes.pmTheme) {
    document.body.setAttribute(
      'data-theme',
      changes.pmTheme.newValue === 'light' ? 'light' : 'dark'
    );
  }
});
