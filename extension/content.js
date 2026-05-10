// PolyParlay content script v0.1.3
// Changes vs v0.1.1/0.1.2:
// - Slim icon-only floating button by default; expands on hover
// - Slide-out slip preview that appears after every successful add
// - Inline injection regex now matches Up/Down/Higher/Lower in addition to Yes/No
// - Better error diagnostics (failed slugs surface in the preview, not just a flash)

(function () {
  const BTN_ID = 'polyparlay-floating-btn';
  const BADGE_ID = 'polyparlay-floating-badge';
  const PREVIEW_ID = 'polyparlay-preview';
  const INLINE_TAG = 'data-polyparlay-inline';
  const DEBUG = false;
  const log = (...a) => DEBUG && console.log('[PolyParlay]', ...a);

  // -------- URL/slug detection --------
  function extractSlug() {
    const path = window.location.pathname;
    const eventMatch = path.match(/^\/event\/([^/?#]+)(?:\/([^/?#]+))?/);
    const marketMatch = path.match(/^\/markets?\/([^/?#]+)/);
    if (eventMatch) {
      return { kind: eventMatch[2] ? 'submarket' : 'event', slug: eventMatch[2] || eventMatch[1] };
    }
    if (marketMatch) {
      return { kind: 'market', slug: marketMatch[1] };
    }
    return null;
  }

  function isOnPolymarket() {
    return /(?:^|\.)polymarket\.com$/.test(window.location.hostname);
  }

  // -------- Slim floating button --------
  function ensureButton() {
    if (!isOnPolymarket() || !document.body) return;
    if (document.getElementById(BTN_ID)) return;

    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.innerHTML =
      '<span class="pw-icon" aria-hidden="true">+</span>' +
      '<span class="pw-text">Add to slip</span>' +
      '<span id="' + BADGE_ID + '" class="pw-badge"></span>';
    btn.title = 'PolyParlay';
    btn.addEventListener('click', (e) => handleAdd(e));
    document.body.appendChild(btn);
    log('button injected');
    refreshButton();
    refreshBadge();
  }

  function refreshButton() {
    const btn = document.getElementById(BTN_ID);
    if (!btn) return;
    const detected = extractSlug();
    const text = btn.querySelector('.pw-text');
    if (detected) {
      btn.classList.remove('pw-disabled');
      if (text) text.textContent = 'Add to slip';
      btn.title = 'Add this market to your PolyParlay slip';
    } else {
      btn.classList.add('pw-disabled');
      if (text) text.textContent = 'Open a market';
      btn.title = 'Open a Polymarket event or market page to add a leg';
    }
  }

  function updateBadge(count) {
    const b = document.getElementById(BADGE_ID);
    if (!b) return;
    if (count && count > 0) {
      b.textContent = String(count);
      b.style.display = 'inline-block';
    } else {
      b.style.display = 'none';
    }
  }
  async function refreshBadge() {
    try {
      const { slip } = await chrome.storage.local.get(['slip']);
      updateBadge(slip ? slip.legs.length : 0);
    } catch {}
  }

  // -------- Slide-out preview --------
  function ensurePreview() {
    if (!isOnPolymarket() || !document.body) return null;
    let p = document.getElementById(PREVIEW_ID);
    if (p) return p;
    p = document.createElement('div');
    p.id = PREVIEW_ID;
    p.className = 'pw-preview pw-hidden';
    p.innerHTML =
      '<div class="pw-preview-head">' +
      '  <span class="pw-preview-title">Slip</span>' +
      '  <button class="pw-preview-close" aria-label="Close">×</button>' +
      '</div>' +
      '<div class="pw-preview-legs"></div>' +
      '<div class="pw-preview-summary"></div>' +
      '<div class="pw-preview-footer">' +
      '  <span class="pw-preview-status"></span>' +
      '  <button class="pw-preview-popup">Open extension</button>' +
      '</div>';
    document.body.appendChild(p);
    p.querySelector('.pw-preview-close').addEventListener('click', () => hidePreview(true));
    p.querySelector('.pw-preview-popup').addEventListener('click', () => {
      try {
        chrome.runtime.sendMessage({ type: 'openPopup' });
      } catch {}
    });
    return p;
  }

  let hideTimer = null;
  function showPreview(slip, status) {
    const p = ensurePreview();
    if (!p) return;
    renderPreview(p, slip, status);
    p.classList.remove('pw-hidden');
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => hidePreview(), 6000);
  }
  function hidePreview(immediate) {
    const p = document.getElementById(PREVIEW_ID);
    if (!p) return;
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    p.classList.add('pw-hidden');
  }

  function fmtPrice(n) {
    if (n == null || isNaN(n)) return '—';
    const v = Number(n);
    return v < 0.1 ? '$' + v.toFixed(3) : '$' + v.toFixed(2);
  }
  function fmtMult(n) {
    if (!isFinite(n) || n <= 0) return '—';
    return n.toFixed(2) + '×';
  }
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }

  function renderPreview(p, slip, status) {
    const legsEl = p.querySelector('.pw-preview-legs');
    const summaryEl = p.querySelector('.pw-preview-summary');
    const statusEl = p.querySelector('.pw-preview-status');

    const legs = (slip && slip.legs) || [];
    if (!legs.length) {
      legsEl.innerHTML = '<div class="pw-preview-empty">No legs yet</div>';
      summaryEl.innerHTML = '';
    } else {
      legsEl.innerHTML = legs
        .map((leg, i) => {
          const label =
            leg.direction ||
            (leg.outcomes && leg.outcomes[leg.selectedIndex || 0]) ||
            'YES';
          let cls = 'pw-other';
          if (/^yes$/i.test(label)) cls = 'pw-yes';
          else if (/^no$/i.test(label)) cls = 'pw-no';
          return (
            '<div class="pw-pleg">' +
            '  <span class="pw-pleg-num">' + (i + 1) + '</span>' +
            '  <div class="pw-pleg-q">' + escapeHtml(leg.question || 'Market') + '<span class="pw-pleg-meta"><span class="' + cls + '">' + escapeHtml(label) + '</span> · ' + fmtPrice(leg.price) + '</span></div>' +
            '</div>'
          );
        })
        .join('');

      const cost = legs.reduce((acc, l) => acc * (Number(l.price) || 0), 1);
      const mult = cost > 0 ? 1 / cost : 0;
      summaryEl.innerHTML =
        '<span>Multiplier</span><strong>' + fmtMult(mult) + '</strong>';
    }
    statusEl.textContent = status || '';
  }

  // -------- Add leg flow --------
  async function handleAdd(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const detected = extractSlug();
    const btn = document.getElementById(BTN_ID);
    if (!detected) {
      // Surface the URL so the user can tell us what pattern we're missing
      showPreview(null, 'No market detected at ' + window.location.pathname);
      flashButton('No market here', '#dc2626');
      return;
    }
    if (btn) btn.classList.add('pw-busy');
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'addLeg',
        detected,
        pageTitle: document.title,
        url: window.location.href
      });
      if (resp && resp.ok) {
        const { slip, legs } = await chrome.storage.local.get(['slip']);
        const finalSlip = (resp.slip || slip);
        flashButton(resp.message || 'Added', '#16a34a');
        updateBadge(resp.legCount);
        showPreview(finalSlip, resp.message || 'Added');
      } else {
        const errMsg = (resp && resp.error) || 'Could not add';
        flashButton(errMsg, '#dc2626');
        showPreview(null, errMsg);
      }
    } catch (err) {
      log('addLeg error', err);
      flashButton('Error', '#dc2626');
    } finally {
      if (btn) btn.classList.remove('pw-busy');
    }
  }

  function flashButton(text, color) {
    const btn = document.getElementById(BTN_ID);
    if (!btn) return;
    const t = btn.querySelector('.pw-text');
    if (!t) return;
    const original = t.textContent;
    t.textContent = text;
    btn.style.background = color;
    btn.classList.add('pw-flash');
    setTimeout(() => {
      t.textContent = original;
      btn.style.background = '';
      btn.classList.remove('pw-flash');
    }, 1400);
  }

  // -------- Inline injection (best-effort) --------
  function injectInlineButtons() {
    if (!isOnPolymarket()) return;
    const detected = extractSlug();
    if (!detected) return;

    const candidates = document.querySelectorAll('button, [role="button"], a');
    const seen = new Set();
    const targets = [];

    for (const el of candidates) {
      const text = (el.textContent || '').trim();
      if (text.length > 18) continue;
      // Common 2-outcome label sets
      if (!/^(Yes|No|Up|Down|Higher|Lower|Buy\s+(Yes|No|Up|Down))$/i.test(text)) continue;
      let container = el.parentElement;
      let depth = 0;
      while (container && depth < 5) {
        const inner = container.querySelectorAll('button, [role="button"], a');
        let hasA = false;
        let hasB = false;
        for (const ib of inner) {
          const t = (ib.textContent || '').trim();
          if (/^(Yes|Up|Higher|Buy\s+(Yes|Up))$/i.test(t)) hasA = true;
          if (/^(No|Down|Lower|Buy\s+(No|Down))$/i.test(t)) hasB = true;
        }
        if (hasA && hasB) {
          if (!seen.has(container)) {
            seen.add(container);
            targets.push(container);
          }
          break;
        }
        container = container.parentElement;
        depth++;
      }
    }

    for (const c of targets) {
      if (c.querySelector('[' + INLINE_TAG + ']')) continue;
      const inline = document.createElement('button');
      inline.setAttribute(INLINE_TAG, '1');
      inline.type = 'button';
      inline.className = 'polyparlay-inline-btn';
      inline.title = 'Add to PolyParlay slip';
      inline.textContent = '+ slip';
      inline.addEventListener('click', (e) => handleAdd(e));
      try {
        c.appendChild(inline);
      } catch {}
    }
  }

  // -------- SPA routing detection --------
  function patchHistory() {
    const op = history.pushState;
    const or = history.replaceState;
    history.pushState = function () {
      const r = op.apply(this, arguments);
      window.dispatchEvent(new Event('polyparlay:locationchange'));
      return r;
    };
    history.replaceState = function () {
      const r = or.apply(this, arguments);
      window.dispatchEvent(new Event('polyparlay:locationchange'));
      return r;
    };
    window.addEventListener('popstate', () => {
      window.dispatchEvent(new Event('polyparlay:locationchange'));
    });
  }

  let lastUrl = window.location.href;
  function maintain() {
    ensureButton();
    refreshButton();
    injectInlineButtons();
  }
  window.addEventListener('polyparlay:locationchange', () => {
    if (window.location.href === lastUrl) return;
    lastUrl = window.location.href;
    log('route →', lastUrl);
    maintain();
  });

  const obs = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      maintain();
    }
  });
  if (document.body) obs.observe(document.body, { childList: true, subtree: true });
  else
    document.addEventListener('DOMContentLoaded', () =>
      obs.observe(document.body, { childList: true, subtree: true })
    );

  setInterval(maintain, 1500);

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.slip) {
      const newSlip = changes.slip.newValue;
      updateBadge(newSlip ? newSlip.legs.length : 0);
    }
  });

  patchHistory();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', maintain);
  } else {
    maintain();
  }
})();
