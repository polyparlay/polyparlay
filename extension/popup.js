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

// ---------- state ----------
let currentSlip = { legs: [], stake: 10 };

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
  const dirClass = leg.direction === 'YES' ? 'dir-yes' : 'dir-no';
  const dirLabel = leg.direction || 'YES';
  div.innerHTML = `
    <div>
      <div class="q">${escapeHtml(leg.question)}</div>
      <div class="meta">
        <span class="${dirClass}">${dirLabel}</span>
        ${leg.category ? ' · ' + escapeHtml(leg.category) : ''}
        ${leg.endDate ? ' · resolves ' + new Date(leg.endDate).toLocaleDateString() : ''}
      </div>
    </div>
    <div class="price">
      ${fmt$(leg.price)}
      <small>leg ${idx + 1}</small>
    </div>
    <div class="leg-actions">
      <button data-open="${leg.id}" title="Open on Polymarket">↗</button>
      <button data-flip="${leg.id}">Flip</button>
      <button data-remove="${leg.id}">×</button>
    </div>
  `;
  return div;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function renderSummary() {
  // Only count free-tier legs in summary (the locked-leg multiplier is visible in the locked block)
  const eligible = currentSlip.legs.slice(0, FREE_LEG_LIMIT);
  const cost = combinedCost(eligible);
  const mult = multiplier(eligible);
  const payout = maxPayout(eligible, currentSlip.stake);

  document.getElementById('combinedCost').textContent =
    cost == null ? '—' : (cost * 100).toFixed(1) + '¢ / $1';
  document.getElementById('multiplier').textContent = fmtMult(mult);
  document.getElementById('maxPayout').textContent = fmt$(payout);
  document.getElementById('stake').value = currentSlip.stake;

  const hasLegs = eligible.length > 0;
  document.getElementById('generate').disabled = !hasLegs;
  document.getElementById('share').disabled = true;
  document.getElementById('open').disabled = true;
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
    ctx.fillStyle = leg.direction === 'NO' ? '#ef4444' : '#22c55e';
    ctx.font = '700 14px -apple-system, sans-serif';
    ctx.fillText(leg.direction || 'YES', 120, y + 24);

    // Price
    ctx.fillStyle = '#f9fafb';
    ctx.font = '700 24px -apple-system, sans-serif';
    const priceText = '$' + (leg.price || 0).toFixed(2);
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

function generate() {
  drawCard();
  document.getElementById('cardWrap').classList.remove('hidden');
  document.getElementById('share').disabled = false;
  document.getElementById('open').disabled = false;
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
  }, 'image/png');
}

async function copyLink() {
  const url = buildShareUrl();
  try {
    await navigator.clipboard.writeText(url);
    const btn = document.getElementById('copyLink');
    const t = btn.textContent;
    btn.textContent = 'Copied';
    setTimeout(() => (btn.textContent = t), 1200);
  } catch {
    prompt('Copy this link:', url);
  }
}

function shareToX() {
  const eligible = currentSlip.legs.slice(0, FREE_LEG_LIMIT);
  const mult = multiplier(eligible);
  const url = buildShareUrl();
  const text = `Built a ${eligible.length}-leg Polymarket parlay. ${fmtMult(mult)} if all hit.`;
  const intent = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  window.open(intent, '_blank');
}

function openViewer() {
  window.open(buildShareUrl(), '_blank');
}

// ---------- wiring ----------
document.addEventListener('DOMContentLoaded', () => {
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
  document.getElementById('generate').addEventListener('click', generate);
  document.getElementById('download').addEventListener('click', downloadCard);
  document.getElementById('copyLink').addEventListener('click', copyLink);
  document.getElementById('share').addEventListener('click', shareToX);
  document.getElementById('open').addEventListener('click', openViewer);
  document.getElementById('upgrade').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://polyparlay.io/upgrade' });
  });
});

// React to background storage changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.slip) {
    currentSlip = changes.slip.newValue || { legs: [], stake: 10 };
    renderLegs();
    renderSummary();
  }
});
