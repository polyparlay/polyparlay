// PolyParlay content script
// Injects a floating "Add to slip" button on Polymarket market pages.
// On click: extracts slug from URL, sends message to background to fetch and store.

(function () {
  const BUTTON_ID = 'polyparlay-floating-btn';
  const BADGE_ID = 'polyparlay-floating-badge';

  function extractSlug() {
    // PM URLs:
    //   /event/<event-slug>
    //   /event/<event-slug>/<market-slug>
    //   /market/<market-slug>
    const path = window.location.pathname;
    const eventMatch = path.match(/^\/event\/([^/?#]+)(?:\/([^/?#]+))?/);
    const marketMatch = path.match(/^\/market\/([^/?#]+)/);
    if (marketMatch) return { kind: 'market', slug: marketMatch[1] };
    if (eventMatch) {
      // Sub-market path beats event path
      return { kind: eventMatch[2] ? 'submarket' : 'event', slug: eventMatch[2] || eventMatch[1] };
    }
    return null;
  }

  function isMarketPage() {
    return !!extractSlug();
  }

  function ensureButton() {
    if (document.getElementById(BUTTON_ID)) return;

    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.type = 'button';
    btn.innerHTML = '<span class="pw-plus">+</span><span class="pw-label">Add to slip</span><span id="' + BADGE_ID + '" class="pw-badge"></span>';
    btn.title = 'PolyParlay — Add this market to your parlay slip';

    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      const detected = extractSlug();
      if (!detected) {
        flashButton('No market detected', '#dc2626');
        return;
      }
      btn.classList.add('pw-busy');
      try {
        const resp = await chrome.runtime.sendMessage({
          type: 'addLeg',
          detected,
          pageTitle: document.title,
          url: window.location.href
        });
        if (resp && resp.ok) {
          flashButton(resp.message || 'Added', '#16a34a');
          updateBadge(resp.legCount);
        } else {
          flashButton((resp && resp.error) || 'Could not add', '#dc2626');
        }
      } catch (err) {
        flashButton('Error', '#dc2626');
      } finally {
        btn.classList.remove('pw-busy');
      }
    });

    document.body.appendChild(btn);
    refreshBadge();
  }

  function flashButton(text, color) {
    const btn = document.getElementById(BUTTON_ID);
    if (!btn) return;
    const label = btn.querySelector('.pw-label');
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
      // ignore
    }
  }

  function maintain() {
    if (isMarketPage()) {
      ensureButton();
    } else {
      const existing = document.getElementById(BUTTON_ID);
      if (existing) existing.remove();
    }
  }

  // PM is an SPA — watch for URL changes
  let lastUrl = window.location.href;
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      maintain();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Refresh badge when storage changes
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.slip) {
      const newSlip = changes.slip.newValue;
      updateBadge(newSlip ? newSlip.legs.length : 0);
    }
  });

  // Initial render
  maintain();
})();
