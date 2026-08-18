// public/app.js
// Entry point: wires the sidebar + hash router, the four tool panels, the
// Overview landing page, and the topbar together. The sidebar is the sole
// navigation surface — each item is a full page reached via #/route. Cross-
// panel actions (a search result's "Check duplicates" button, the global
// topbar search) are threaded through explicit callbacks; passive updates
// (activity feed) go through the 'activity:log' window event instead — see
// topbar.js.

import { initSidebar } from './js/sidebar.js';
import { initRouter } from './js/router.js';
import { initTopbar } from './js/topbar.js';
import { initStatGrid } from './js/stat-grid.js';
import { initOverviewPanel } from './js/overview-panel.js';
import { initSearchPanel } from './js/search-panel.js';
import { initQualityPanel } from './js/quality-panel.js';
import { initDuplicatesPanel } from './js/duplicates-panel.js';
import { initUserProfilePanel } from './js/user-profile-panel.js';
import { subscribe, loadHealth } from './js/data-store.js';

function renderHealthDot(state) {
  const dot = document.querySelector('#apiStatus .status-dot');
  const label = document.querySelector('#apiStatus .status-label');
  if (!state.healthChecked) {
    dot.dataset.state = 'checking';
    label.textContent = 'Checking API…';
    return;
  }
  const online = Boolean(state.health && state.health.database === 'connected');
  dot.dataset.state = online ? 'online' : 'offline';
  label.textContent = online ? 'API online' : 'API unreachable';
}

document.addEventListener('DOMContentLoaded', () => {
  initSidebar();
  const router = initRouter();
  initStatGrid();

  const duplicatesPanel = initDuplicatesPanel();
  const searchPanel = initSearchPanel({
    onCheckDuplicates: (userId) => {
      router.navigate('duplicates');
      duplicatesPanel.lookupUser(String(userId));
    },
  });
  initQualityPanel();
  initOverviewPanel({ onViewAllIssues: () => router.navigate('quality') });
  initUserProfilePanel();

  initTopbar({
    onSearch: (q, type) => {
      router.navigate('search');
      searchPanel.runQuery(q, type);
    },
  });

  subscribe(renderHealthDot);
  loadHealth();
});
