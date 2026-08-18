// public/js/user-profile-panel.js
// Single-user profile lookup: identity + status from ws_user, plus order/
// transaction/activity rollups from GET /api/user-profile/:user_id. msisdn
// arrives already masked from the server — never re-derive or unmask it here.

import { el, clear, formatDate, formatNumber, formatRelativeTime } from './dom.js';
import { fetchUserProfile, ApiError } from './api.js';
import { statusMeta, badge } from './badges.js';
import { statCard } from './stat-grid.js';

export function initUserProfilePanel() {
  const form = document.getElementById('profileForm');
  const input = document.getElementById('profileUserId');
  const submitBtn = document.getElementById('profileSubmit');
  const metaEl = document.getElementById('profileMeta');
  const stateEl = document.getElementById('profileState');
  const resultEl = document.getElementById('profileResult');
  const cardEl = document.getElementById('profileCard');
  const statGridEl = document.getElementById('profileStatGrid');

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const id = input.value.trim();
    if (!id) return;
    runLookup(id);
  });

  function logActivity(message) {
    window.dispatchEvent(new CustomEvent('activity:log', { detail: { message } }));
  }

  async function runLookup(id) {
    submitBtn.disabled = true;
    submitBtn.classList.add('is-loading');
    resultEl.hidden = true;
    clear(metaEl);
    clear(stateEl);
    stateEl.hidden = false;
    stateEl.appendChild(el('div', { class: 'panel-state panel-state-loading' }, [
      el('p', { class: 'panel-state-message', text: `Loading profile for user ${id}…` }),
    ]));

    const startedAt = performance.now();
    try {
      const data = await fetchUserProfile(id);
      const roundTripMs = Math.round(performance.now() - startedAt);
      stateEl.hidden = true;
      renderMeta(roundTripMs);
      renderResult(data);
      logActivity(`Profile lookup for user ${id} — ${roundTripMs}ms`);
    } catch (err) {
      clear(metaEl);
      clear(stateEl);
      stateEl.hidden = false;
      if (err instanceof ApiError && err.status === 404) {
        stateEl.appendChild(el('div', { class: 'panel-state panel-state-empty' }, [
          el('p', { class: 'panel-state-message', text: `No user found with ID ${id}.` }),
        ]));
      } else {
        const message = err instanceof ApiError ? err.message : 'Could not load this user profile.';
        stateEl.appendChild(el('div', { class: 'panel-state panel-state-error' }, [
          el('p', { class: 'panel-state-message', text: message }),
        ]));
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove('is-loading');
    }
  }

  function renderMeta(roundTripMs) {
    clear(metaEl);
    metaEl.appendChild(el('span', { class: 'meta-item meta-time', text: `Round-trip ${roundTripMs}ms` }));
  }

  function renderResult(data) {
    resultEl.hidden = false;
    clear(cardEl);
    clear(statGridEl);

    cardEl.appendChild(el('span', { class: 'target-label', text: 'Account' }));
    cardEl.appendChild(el('div', { class: 'target-name' }, [
      el('h3', { text: data.full_name || '—' }),
      badge(statusMeta(data.status)),
    ]));

    const details = el('dl', { class: 'target-details' });
    details.appendChild(el('div', {}, [el('dt', { text: 'User ID' }), el('dd', { class: 'cell-mono', text: String(data.user_id) })]));
    details.appendChild(el('div', {}, [el('dt', { text: 'Email' }), el('dd', { class: 'cell-mono', text: data.user_email || '—' })]));
    details.appendChild(el('div', {}, [el('dt', { text: 'Phone' }), el('dd', { class: 'cell-mono', text: data.msisdn || '—' })]));
    details.appendChild(el('div', {}, [el('dt', { text: 'Member since' }), el('dd', { class: 'cell-mono', text: formatDate(data.created_at) })]));
    cardEl.appendChild(details);

    statGridEl.appendChild(statCard({
      title: 'Orders',
      value: formatNumber(data.order_count),
      sub: 'Total orders placed',
      icon: 'cart',
      tint: 'teal',
    }));
    statGridEl.appendChild(statCard({
      title: 'Transaction total',
      value: formatNumber(data.transaction_total),
      sub: 'Lifetime transaction value',
      icon: 'wallet',
      tint: 'green',
    }));
    statGridEl.appendChild(statCard({
      title: 'Activity events',
      value: formatNumber(data.activity_count),
      sub: 'Recorded interactions',
      icon: 'pulse',
      tint: 'blue',
    }));
    statGridEl.appendChild(statCard({
      title: 'Last activity',
      value: formatDate(data.last_activity),
      sub: formatRelativeTime(data.last_activity),
      icon: 'clock',
      tint: 'violet',
    }));
  }

  stateEl.hidden = false;
  clear(stateEl);
  stateEl.appendChild(el('div', { class: 'panel-state panel-state-idle' }, [
    el('p', { class: 'panel-state-message', text: 'Enter a user ID to load their profile.' }),
  ]));
}
