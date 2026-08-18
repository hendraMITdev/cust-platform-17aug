// public/js/router.js
// Hash-based router and sole navigation controller — replaces the old tab
// strip. Sidebar items are real <a href="#/..."> anchors, so browser
// back/forward, deep links, and middle-click/open-in-new-tab all work for
// free; this just keeps sidebar active state + panel visibility in sync with
// location.hash, and normalizes empty/unknown hashes to the default route.

const ROUTES = ['overview', 'search', 'quality', 'duplicates', 'user-profile'];
const DEFAULT_ROUTE = 'overview';

function parseRoute(hash) {
  const match = /^#\/([a-z-]+)/.exec(hash || '');
  const id = match ? match[1] : '';
  return ROUTES.includes(id) ? id : DEFAULT_ROUTE;
}

export function initRouter() {
  const navLinks = Array.from(document.querySelectorAll('.sidebar-nav [data-route]'));
  const panels = Array.from(document.querySelectorAll('#mainContent [data-route]'));
  const mainContent = document.getElementById('mainContent');

  function applyRoute(routeId) {
    navLinks.forEach((link) => {
      const isActive = link.dataset.route === routeId;
      link.classList.toggle('is-active', isActive);
      if (isActive) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.route !== routeId;
    });
  }

  function syncFromHash({ moveFocus = false } = {}) {
    const routeId = parseRoute(location.hash);
    const canonicalHash = `#/${routeId}`;
    if (location.hash !== canonicalHash) {
      history.replaceState(null, '', canonicalHash);
    }
    applyRoute(routeId);
    if (moveFocus && mainContent) mainContent.focus();
  }

  window.addEventListener('hashchange', () => syncFromHash({ moveFocus: true }));
  syncFromHash();

  return {
    navigate(routeId) {
      if (!ROUTES.includes(routeId)) return;
      const target = `#/${routeId}`;
      if (location.hash === target) {
        // Already on this route (e.g. re-triggering a cross-panel action) —
        // still (re)apply so callers can rely on a consistent post-call state.
        applyRoute(routeId);
      } else {
        location.hash = target;
      }
    },
  };
}
