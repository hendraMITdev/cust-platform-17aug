// public/js/stat-grid.js
// Persistent KPI row at the top of the content area. Subscribes to the shared
// data-store so it updates the moment /api/quality and /api/health resolve,
// with no fetch of its own.

import { subscribe } from './data-store.js';
import { el, clear, formatNumber, formatPercent } from './dom.js';

const ICONS = {
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.4 2.1L8 9.9a16 16 0 0 0 6 6l1.4-1.4a2 2 0 0 1 2.1-.4c.9.3 1.8.5 2.7.6A2 2 0 0 1 22 16.9z"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  shield: '<path d="M12 2l8 4v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V6l8-4z"/><path d="M9 12l2 2 4-4"/>',
  cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  wallet: '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
  pulse: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
};

function iconSvg(name) {
  return `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

// Exported so other panels (e.g. the User Profile page) can render the same
// stat-card shape without duplicating the markup/icon-lookup logic — they
// bring their own grid wrapper since .stat-grid's 6/3/2/1 breakpoints are
// tuned specifically for 6 cards and must stay untouched.
export function statCard({ title, value, sub, icon, tint }) {
  const card = el('article', { class: 'stat-card' });
  card.appendChild(el('p', { class: 'stat-card-title', text: title }));
  card.appendChild(el('p', { class: 'stat-card-value', text: value }));
  // Always render the sub line (using a non-breaking space as a quiet fallback)
  // so every card has the same three-row shape — that's what keeps the grid
  // symmetrical instead of some cards being shorter than others.
  card.appendChild(el('p', { class: 'stat-card-sub', text: sub || ' ' }));
  card.appendChild(el('span', { class: `stat-card-icon tint-${tint}`, html: iconSvg(icon) }));
  return card;
}

export function initStatGrid() {
  const grid = document.getElementById('statGrid');

  subscribe((state) => {
    clear(grid);
    const { quality, qualityLoading, qualityError, qualityDupsPending, health, healthChecked } = state;
    const qm = quality?.quality_metrics || {};
    const placeholder = qualityLoading ? '…' : '—';
    // All five quality-derived cards share one failure reason, but each still
    // renders on its own — the grid must always show exactly 6 equal cards,
    // never collapse down to a single combined error card.
    const errorSub = qualityError && !quality ? 'Could not load' : null;

    const emailPresentPct = qm.email ? 100 - (qm.email.missing_percent ?? 0) : null;
    const phonePresentPct = qm.phone ? 100 - (qm.phone.missing_percent ?? 0) : null;

    grid.appendChild(statCard({
      title: 'Total records',
      value: quality ? formatNumber(quality.total_records) : placeholder,
      sub: errorSub || 'Across all customer accounts',
      icon: 'database',
      tint: 'blue',
    }));
    grid.appendChild(statCard({
      title: 'Email completeness',
      value: emailPresentPct != null ? formatPercent(emailPresentPct) : placeholder,
      sub: errorSub || (qm.email ? `${formatNumber(qm.email.missing_count)} missing` : 'Awaiting data'),
      icon: 'mail',
      tint: 'teal',
    }));
    grid.appendChild(statCard({
      title: 'Phone completeness',
      value: phonePresentPct != null ? formatPercent(phonePresentPct) : placeholder,
      sub: errorSub || (qm.phone ? `${formatNumber(qm.phone.missing_count)} missing` : 'Awaiting data'),
      icon: 'phone',
      tint: 'violet',
    }));
    grid.appendChild(statCard({
      title: 'Duplicate emails',
      value: qm.email && qm.email.duplicate_count != null ? formatNumber(qm.email.duplicate_count) : (qualityDupsPending ? '…' : placeholder),
      sub: errorSub || (qm.email && qm.email.duplicate_count == null && qualityDupsPending ? 'computing exact count…' : 'Shared across accounts'),
      icon: 'copy',
      tint: 'amber',
    }));
    grid.appendChild(statCard({
      title: 'Duplicate phones',
      value: qm.phone && qm.phone.duplicate_count != null ? formatNumber(qm.phone.duplicate_count) : (qualityDupsPending ? '…' : placeholder),
      sub: errorSub || (qm.phone && qm.phone.duplicate_count == null && qualityDupsPending ? 'computing exact count…' : 'Shared across accounts'),
      icon: 'copy',
      tint: 'rose',
    }));

    const dbConnected = health?.database === 'connected';
    grid.appendChild(statCard({
      title: 'Database',
      value: !healthChecked ? 'Checking…' : dbConnected ? 'Connected' : 'Unreachable',
      sub: health?.status ? `Status: ${health.status}` : healthChecked ? 'No response' : 'Pinging API…',
      icon: 'shield',
      tint: !healthChecked ? 'violet' : dbConnected ? 'green' : 'rose',
    }));
  });
}
