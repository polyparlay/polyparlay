// PolyParlay content script v0.1.1
// - Floating button is always visible on polymarket.com (disabled state when no market detected)
// - Detects /event/, /market/, /markets/ URL patterns
// - SPA routing: patches pushState/replaceState + listens for popstate, plus MutationObserver fallback
// - Inline injection: scans for YES/NO button pairs and injects a small "+" near them (best-effort)

(function () {
  const BUTTON_ID = 'polyparlay-floating-btn';
  const BADGE_ID = 'polyparlay-floating-badge';
  const INLINE_TAG = 'data-polyparlay-inline';
  const DEBUG = false; // flip to true to console.log injection lifecycle
  const log = (...args) => DEBUG && console.log('[PolyParlay]', ...args);

  // -------- URL/slug detection --------
  function extractSlug() {
    const path = window.location.pathname;
    // /event/<slug> or /event/<event-slug>/<sub-market-slug>
    const eventMatch = path.match(/^\/event\/([^/?#]+)(?:\/([^/?#]+))?/);
    // /market/<slug> (singular) or /markets/<slug> (plural — some PM routes)
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

  // -------- Floating button --------
  function ensureFloatingButton() {
    if (!isOnPolymarket()) return;
    if (!document.body) return;
    if (document.getElementById(BUTTON_ID)) return;

    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.type = 'button';
    btn.innerHTML =
      '<span class="pw-plus">+</span>' +
      '<span class="pw-label">Add to slip</span>' +
      '<span id="' + BADGE_ID + '" class="pw-badge"></span>';
    btn.title = 'PolyParlay';
    btn.addEventListener('click', (e) => handleAdd(e));
    document.body.appendChild(btn);
    log('floating button injected');
    refreshFloatingState();
    refreshBadge();
  }

  function refreshFloatingState() {
    const btn = document.getElementById(BUTTON_ID);
    if (!btn) return;
    const detected = extractSlug();
    const label = btn.querySelector('.pw-label');
    if (detected) {
      btn.classList.remove('pw-disabled');
      if (label) label.textContent = 'Add to slip';
      btn.title = 'PolyParlay — Add this market to your parlay slip';
    } else {
      btn.classList.add('pw-disabled');
      if (label) label.textContent = 'Open a market';
      btn.title = 'PolyParlay — Open a Polymarket event or market page to add a leg';
    }
  }

  function flashFloating(text, color) {
    const btn = document.getElementById(BUTTON_ID);
    if (!btn) return;
    const label = btn.querySelector('.pw-label');
    if (!label) return;
    const original = label.textContent;
    label.textContent = text;
    btn.style.background = color;
    setTimeout(() => {
      label.textContent = original;
      btn.style.background = '';
    }, 1400);
  }

  function updateBadge(count) {
    const badge = document.getElementById(BADGE_ID);
    if (!badge) return;
    if (count && count > 0) {
      badge.textContent = String(count);
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }

  async function refreshBadge() {
    try {
      const { slip } = await chrome.storage.local.get(['slip']);
      updateBadge(slip ? slip.legs.length : 0);
    } catch (e) {
      log('badge refresh failed', e);
    }
  }

  // -------- Add leg flow --------
  async function handleAdd(e, overrideSlug) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const detected = overrideSlug || extractSlug();
    const btn = document.getElementById(BUTTON_ID);
    if (!detected) {
      flashFloating('No market here', '#dc2626');
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
        flashFloating(resp.message || 'Added', '#16a34a');
        updateBadge(resp.legCount);
      } else {
        flashFloating((resp && resp.error) || 'Could not add', '#dc2626');
      }
    } catch (err) {
      log('addLeg error', err);
      flashFloating('Error', '#dc2626');
    } finally {
      if (btn) btn.classList.remove('pw-busy');
    }
  }

  // -------- Inline injection (best-effort) --------
  // Strategy: find buttons whose text matches Yes/No/Buy Yes/Buy No, group adjacent pairs by
  // shared parent, and inject a small "+" button into that parent.
  // PM redesigns will break this — the floating button remains the resilient fallback.
  function injectInlineButtons() {
    if (!isOnPolymarket()) return;
    const detected = extractSlug();
    if (!detected) return; // only inject on market pages

    const candidates = document.querySelectorAll('button, [role="button"], a');
    const yesNoPairs = [];
    const seenContainers = new Set();

    for (const el of candidates) {
      const text = (el.textContent || '').trim();
      if (text.length > 16) continue;
      if (!/^(Yes|No|Buy\s+(Yes|No))$/i.test(text)) continue;
      // Walk up to find a container that holds both a Yes and a No button
      let container = el.parentElement;
      let depth = 0;
      while (container && depth < 5) {
        const innerButtons = container.querySelectorAll('button, [role="button"], a');
        let hasYes = false;
        let hasNo = false;
        for (const ib of innerButtons) {
          const t = (ib.textContent || '').trim();
          if (/^(Yes|Buy\s+Yes)$/i.test(t)) hasYes = true;
          if (/^(No|Buy\s+No)$/i.test(t)) hasNo = true;
        }
        if (hasYes && hasNo) {
          if (!seenContainers.has(container)) {
            seenContainers.add(container);
            yesNoPairs.push(container);
          }
          break;
        }
        container = container.parentElement;
        depth++;
      }
    }

    for (const container of yesNoPairs) {
      if (container.querySelector('[' + INLINE_TAG + ']')) continue;
      const inline = document.createElement('button');
      inline.setAttribute(INLINE_TAG, '1');
      inline.type = 'button';
      inline.className = 'polyparlay-inline-btn';
      inline.title = 'Add to PolyParlay slip';
      inline.textContent = '+ slip';
      inline.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleAdd(e);
      });
      try {
        container.appendChild(inline);
        log('inline button injected', container);
      } catch (err) {
        log('inline injection failed', err);
      }
    }
  }

  // -------- Maintenance loop --------
  function maintain() {
    ensureFloatingButton();
    refreshFloatingState();
    injectInlineButtons();
  }

  // -------- SPA routing detection --------
  function patchHistory() {
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function () {
      const r = origPush.apply(this, arguments);
      window.dispatchEvent(new Event('polyparlay:locationchange'));
      return r;
    };
    history.replaceState = function () {
      const r = origReplace.apply(this, arguments);
      window.dispatchEvent(new Event('polyparlay:locationchange'));
      return r;
    };
    window.addEventListener('popstate', () => {
      window.dispatchEvent(new Event('polyparlay:locationchange'));
    });
  }

  let lastUrl = window.location.href;
  function onLocationChange() {
    if (window.location.href === lastUrl) return;
    lastUrl = window.location.href;
    log('location changed →', lastUrl);
    maintain();
  }
  window.addEventListener('polyparlay:locationchange', onLocationChange);

  // MutationObserver as fallback for any SPAs that rewrite the body
  const obs = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      maintain();
    }
  });
  if (document.body) {
    obs.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      obs.observe(document.body, { childList: true, subtree: true });
    });
  }

  // Periodic poll: cheap insurance against any routing edge case
  setInterval(maintain, 1500);

  // React to slip changes from the popup
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.slip) {
      const newSlip = changes.slip.newValue;
      updateBadge(newSlip ? newSlip.legs.length : 0);
    }
  });

  // Boot
  patchHistory();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', maintain);
  } else {
    maintain();
  }
})();
