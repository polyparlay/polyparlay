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

  // After the extension reloads/updates, the chrome.runtime reference in
  // already-injected content scripts goes stale. Any sendMessage/storage
  // call from the stale script throws "Extension context invalidated."
  // We detect this and surface a clear "reload page" message instead of
  // a generic Error flash.
  function isExtensionContextValid() {
    try {
      return Boolean(chrome && chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  // True once we've detected an invalidated context. Prevents repeated
  // sendMessage attempts that would each throw + log noise.
  let contextInvalidated = false;
  function markContextInvalidated() {
    if (contextInvalidated) return;
    contextInvalidated = true;
    const btn = document.getElementById(BTN_ID);
    if (btn) {
      btn.classList.add('pw-disabled');
      btn.title = 'PolyParlay was updated — reload this page to use it again';
      const t = btn.querySelector('.pw-text');
      if (t) t.textContent = 'Reload page';
    }
  }

  // -------- URL/slug detection --------
  // Known top-level segments on polymarket.com that are NOT market slugs.
  // Used to filter out non-market routes during the generic fallback below.
  const RESERVED_PM_PATHS = new Set([
    '', 'home', 'profile', 'profiles', 'portfolio', 'leaderboard',
    'markets', 'market', 'event', 'events', 'search', 'login', 'signup',
    'about', 'terms', 'privacy', 'docs', 'help', 'support', 'settings',
    'feed', 'activity', 'rewards', 'referral', 'earn', 'wallet'
  ]);

  // Read og:url meta as canonical fallback — PM sets this on every market page
  // and it often contains the cleanest slug even when the visible URL has been
  // rewritten (e.g. live game pages with extra path segments).
  function ogUrl() {
    const meta = document.querySelector('meta[property="og:url"]');
    if (!meta) return null;
    const href = meta.getAttribute('content');
    if (!href) return null;
    try {
      return new URL(href, window.location.origin);
    } catch {
      return null;
    }
  }

  function extractSlugFromPath(path) {
    // 1. /event/<slug> or /event/<event-slug>/<sub-market-slug>
    const eventMatch = path.match(/^\/event\/([^/?#]+)(?:\/([^/?#]+))?/);
    if (eventMatch) {
      return { kind: eventMatch[2] ? 'submarket' : 'event', slug: eventMatch[2] || eventMatch[1] };
    }
    // 2. /market/<slug> or /markets/<slug>
    const marketMatch = path.match(/^\/markets?\/([^/?#]+)/);
    if (marketMatch) return { kind: 'market', slug: marketMatch[1] };

    // 3. Category-prefixed URLs — handles ARBITRARY DEPTH for sports/live paths
    //    like /sports/nfl/2024-season-mvp/josh-allen-mvp or
    //    /live/nba/lal-vs-bos/q3/total-points.
    //    Walks backwards through the path, picks the deepest slug-shaped segment.
    const parts = path.split('/').filter(Boolean);
    if (parts.length >= 2) {
      const category = parts[0].toLowerCase();
      if (!RESERVED_PM_PATHS.has(category)) {
        for (let i = parts.length - 1; i >= 1; i--) {
          const candidate = parts[i];
          if (
            candidate.length > 5 &&
            candidate.includes('-') &&
            !RESERVED_PM_PATHS.has(candidate.toLowerCase())
          ) {
            return { kind: category, slug: candidate };
          }
        }
      }
    }

    // 4. Last-resort: any slug-shaped segment in the path
    if (parts.length >= 1) {
      for (let i = parts.length - 1; i >= 0; i--) {
        const candidate = parts[i];
        if (
          candidate.length > 5 &&
          candidate.includes('-') &&
          !RESERVED_PM_PATHS.has(candidate.toLowerCase())
        ) {
          return { kind: 'guess', slug: candidate };
        }
      }
    }
    return null;
  }

  function extractSlug() {
    // Try the visible URL first
    const fromVisible = extractSlugFromPath(window.location.pathname);
    if (fromVisible) return fromVisible;
    // Fallback to og:url meta — catches sports/live pages where the visible URL
    // has been client-side rewritten but the canonical og:url is still clean
    const og = ogUrl();
    if (og) {
      const fromOg = extractSlugFromPath(og.pathname);
      if (fromOg) return fromOg;
    }
    return null;
  }

  function isOnPolymarket() {
    return /(?:^|\.)polymarket\.com$/.test(window.location.hostname);
  }

  // -------- Theme sync — OS prefers-color-scheme is the single source
  // of truth. We tried multi-tier SPA detection (body text color, computed
  // bg, declarative attribute/class, meta color-scheme). Every approach
  // had false positives on PM because their SPA leaves stale class="dark"
  // on root + transparent body bg + various edge cases. The user wants the
  // drawer to match the OS theme, so we honor that directly.
  function detectTheme() {
    if (window.matchMedia) {
      if (matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
      if (matchMedia('(prefers-color-scheme: light)').matches) return 'light';
    }
    return 'light';
  }

  // lastTheme intentionally allowed to be re-evaluated on every syncTheme;
  // we don't memoize across calls because PM can flip themes via user setting
  // changes that don't fire location-change events.
  let lastTheme = null;
  function syncTheme(opts) {
    const t = detectTheme();
    const force = opts && opts.force;
    if (!force && t === lastTheme) return;
    lastTheme = t;
    if (isExtensionContextValid()) {
      try {
        chrome.storage.local.set({ pmTheme: t });
      } catch (err) {
        const m = String(err && err.message || err);
        if (/Extension context invalidated/i.test(m)) markContextInvalidated();
      }
    }
    document.documentElement.setAttribute('data-pw-theme', t);
    const btn = document.getElementById(BTN_ID);
    if (btn) btn.setAttribute('data-pw-theme', t);
    const preview = document.getElementById(PREVIEW_ID);
    if (preview) preview.setAttribute('data-pw-theme', t);
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
    if (!isExtensionContextValid()) { markContextInvalidated(); return; }
    try {
      const { slip } = await chrome.storage.local.get(['slip']);
      updateBadge(slip ? slip.legs.length : 0);
    } catch (err) {
      const m = String(err && err.message || err);
      if (/Extension context invalidated/i.test(m)) markContextInvalidated();
    }
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
      if (!isExtensionContextValid()) { markContextInvalidated(); return; }
      try {
        chrome.runtime.sendMessage({ type: 'openPopup' });
      } catch (err) {
        const m = String(err && err.message || err);
        if (/Extension context invalidated/i.test(m)) markContextInvalidated();
      }
    });
    return p;
  }

  let hideTimer = null;
  function showPreview(slip, status) {
    const p = ensurePreview();
    if (!p) return;
    // Re-evaluate theme every time the drawer opens so it matches PM's
    // CURRENT theme. Wrapped because any computed-style edge case must
    // not be allowed to crash the preview render below.
    try { syncTheme({ force: true }); } catch (e) { log('syncTheme threw', e); }
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
  function truncateText(s, n) {
    if (!s) return 'Market';
    s = String(s);
    return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
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

  // Wrap chrome.runtime.sendMessage with a wake-and-retry. MV3 service workers
  // suspend after ~30s of idle; the first send returns undefined or throws.
  // Retry once or twice with a short delay so the click doesn't appear to fail.
  async function sendWithRetry(msg, retries = 2) {
    if (!isExtensionContextValid()) {
      markContextInvalidated();
      throw new Error('Extension reloaded — refresh this page');
    }
    let lastErr = null;
    for (let i = 0; i <= retries; i++) {
      try {
        const resp = await chrome.runtime.sendMessage(msg);
        if (resp !== undefined) return resp;
        lastErr = new Error('Service worker returned no response');
      } catch (err) {
        lastErr = err;
        // Detect context-invalidated errors mid-retry and bail out — no
        // amount of retrying will fix it, the page needs a reload.
        const m = String(err && err.message || err);
        if (/Extension context invalidated|Receiving end does not exist/i.test(m)
            || !isExtensionContextValid()) {
          markContextInvalidated();
          throw new Error('Extension reloaded — refresh this page');
        }
      }
      if (i < retries) await new Promise((r) => setTimeout(r, 120 + i * 80));
    }
    throw lastErr || new Error('Send failed');
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
      showPreview(null, 'No market detected at ' + window.location.pathname);
      flashButton('No market here', '#dc2626');
      return;
    }
    if (btn) btn.classList.add('pw-busy');
    try {
      const resp = await sendWithRetry({
        type: 'addLeg',
        detected,
        pageTitle: document.title,
        url: window.location.href
      });
      if (resp && resp.ok) {
        const { slip } = await chrome.storage.local.get(['slip']);
        const finalSlip = (resp.slip || slip);
        flashButton(resp.message || 'Added', '#16a34a');
        updateBadge(resp.legCount);
        // Wrap showPreview so a downstream render/theme exception can't
        // bubble into the outer catch and turn a successful add into a
        // red "Error" flash.
        try {
          showPreview(finalSlip, resp.message || 'Added');
        } catch (renderErr) {
          // eslint-disable-next-line no-console
          console.warn('[PolyParlay] showPreview threw after successful add', renderErr);
        }
      } else {
        const errMsg = (resp && resp.error) || 'Could not add';
        flashButton(errMsg, '#dc2626');
        // eslint-disable-next-line no-console
        console.warn('[PolyParlay] Add failed', {
          error: errMsg,
          detectedSlug: detected,
          pageUrl: window.location.href,
          pathname: window.location.pathname,
          pageTitle: document.title,
          ogUrlMeta: document.querySelector('meta[property="og:url"]')?.getAttribute('content') || null
        });
        try {
          const { slip } = await chrome.storage.local.get(['slip']);
          showPreview(slip || null, errMsg + ' · check DevTools for details');
        } catch {}
      }
    } catch (err) {
      // Show the actual error text (truncated for the pill) — DO NOT
      // also flash a generic 'Error' afterwards (that masked the real
      // cause). Caller can inspect DevTools console for full detail.
      // eslint-disable-next-line no-console
      console.warn('[PolyParlay] handleAdd threw', err);
      const msg = (err && err.message) ? err.message : String(err);
      flashButton(msg.slice(0, 24) || 'Send failed', '#dc2626');
      try {
        const { slip } = await chrome.storage.local.get(['slip']);
        showPreview(slip || null, 'Send failed: ' + msg);
      } catch {}
      log('addLeg error', err);
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
    syncTheme();
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
