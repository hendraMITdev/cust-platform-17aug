// public/js/search-panel.js
import { el, clear, formatDate, formatNumber } from './dom.js';
import { fetchSearch, ApiError } from './api.js';
import { statusMeta, badge } from './badges.js';

const LIMIT_CAP = 100;
const TYPE_PLACEHOLDERS = {
  name: 'e.g. Jane Doe',
  email: 'e.g. jane@example.com',
  phone: 'e.g. 081234567890',
  user_id: 'e.g. 4821093',
};

const SORT_ACCESSORS = {
  user_id: (r) => Number(r.user_id),
  full_name: (r) => (r.full_name || '').toLowerCase(),
  status: (r) => Number(r.status),
  created_at: (r) => new Date(r.created_at || 0).getTime(),
};

export function initSearchPanel({ onCheckDuplicates } = {}) {
  const form = document.getElementById('searchForm');
  const queryInput = document.getElementById('searchQuery');
  const typeSelect = document.getElementById('searchType');
  const limitSelect = document.getElementById('searchLimit');
  const submitBtn = document.getElementById('searchSubmit');
  const metaEl = document.getElementById('searchMeta');
  const stateEl = document.getElementById('searchState');
  const tableWrap = document.getElementById('resultsTableWrap');
  const tbody = document.getElementById('resultsBody');
  const paginationEl = document.getElementById('searchPagination');
  const prevBtn = document.getElementById('prevPage');
  const nextBtn = document.getElementById('nextPage');
  const pageInfo = document.getElementById('pageInfo');
  const headers = Array.from(document.querySelectorAll('#resultsTable th[aria-sort]'));

  const state = {
    q: '', type: 'name', limit: 10, offset: 0, total: 0,
    results: [], sortKey: null, sortDir: 'asc', hasSearched: false,
  };

  applyPlaceholder();
  typeSelect.addEventListener('change', applyPlaceholder);

  function applyPlaceholder() {
    queryInput.placeholder = TYPE_PLACEHOLDERS[typeSelect.value] || '';
    queryInput.setAttribute('inputmode', typeSelect.value === 'user_id' ? 'numeric' : 'text');
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    state.q = queryInput.value.trim();
    state.type = typeSelect.value;
    state.limit = Math.min(LIMIT_CAP, Number(limitSelect.value) || 10);
    state.offset = 0;
    state.sortKey = null;
    runSearch();
  });

  prevBtn.addEventListener('click', () => {
    state.offset = Math.max(0, state.offset - state.limit);
    runSearch();
  });
  nextBtn.addEventListener('click', () => {
    state.offset += state.limit;
    runSearch();
  });

  headers.forEach((th) => {
    const sortBtn = th.querySelector('.th-sort');
    if (!sortBtn) return;
    sortBtn.addEventListener('click', () => {
      const key = sortBtn.dataset.sort;
      state.sortDir = state.sortKey === key && state.sortDir === 'asc' ? 'desc' : 'asc';
      state.sortKey = key;
      renderTable();
    });
  });

  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.classList.toggle('is-loading', isLoading);
    prevBtn.disabled = isLoading || state.offset <= 0;
    nextBtn.disabled = isLoading || state.offset + state.limit >= state.total;
  }

  function renderStatus(kind, message) {
    clear(stateEl);
    if (!kind) {
      stateEl.hidden = true;
      tableWrap.hidden = false;
      return;
    }
    stateEl.hidden = false;
    tableWrap.hidden = true;
    stateEl.appendChild(el('div', { class: `panel-state panel-state-${kind}` }, [
      el('p', { class: 'panel-state-message', text: message }),
    ]));
  }

  function logActivity(message) {
    window.dispatchEvent(new CustomEvent('activity:log', { detail: { message } }));
  }

  async function runSearch() {
    setLoading(true);
    renderStatus('loading', 'Searching…');
    paginationEl.hidden = true;
    const startedAt = performance.now();
    try {
      const data = await fetchSearch(state);
      const roundTripMs = Math.round(performance.now() - startedAt);
      state.total = data.total ?? 0;
      state.results = Array.isArray(data.results) ? data.results : [];
      state.hasSearched = true;
      renderMeta(data, roundTripMs);
      if (state.results.length === 0) {
        renderStatus('empty', state.q ? `No customers matched "${state.q}".` : 'No customers found.');
      } else {
        renderStatus(null);
        renderTable();
      }
      renderPagination();
      logActivity(`Searched ${state.type} "${state.q || '(empty)'}" — ${formatNumber(state.total)} result${state.total === 1 ? '' : 's'} in ${data.took_ms ?? roundTripMs}ms`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong while searching.';
      renderStatus('error', message);
      clear(metaEl);
      paginationEl.hidden = true;
    } finally {
      setLoading(false);
    }
  }

  function renderMeta(data, roundTripMs) {
    clear(metaEl);
    metaEl.appendChild(el('span', { class: 'meta-item', text: `${formatNumber(data.total ?? 0)} result${data.total === 1 ? '' : 's'}` }));
    metaEl.appendChild(el('span', { class: 'meta-dot', text: '·' }));
    metaEl.appendChild(el('span', { class: 'meta-item meta-time', text: `Server ${data.took_ms ?? '—'}ms` }));
    metaEl.appendChild(el('span', { class: 'meta-dot', text: '·' }));
    metaEl.appendChild(el('span', { class: 'meta-item meta-time', text: `Round-trip ${roundTripMs}ms` }));
  }

  function sortedResults() {
    if (!state.sortKey) return state.results;
    const accessor = SORT_ACCESSORS[state.sortKey];
    const dir = state.sortDir === 'asc' ? 1 : -1;
    return [...state.results].sort((a, b) => {
      const av = accessor(a);
      const bv = accessor(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }

  function renderTable() {
    clear(tbody);
    headers.forEach((th) => {
      const sortBtn = th.querySelector('.th-sort');
      const key = sortBtn ? sortBtn.dataset.sort : null;
      th.setAttribute('aria-sort', key && key === state.sortKey ? (state.sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
    });
    for (const row of sortedResults()) {
      tbody.appendChild(renderRow(row));
    }
  }

  function renderRow(row) {
    const tr = el('tr', {});
    tr.appendChild(el('td', { class: 'cell-mono', text: String(row.user_id) }));
    tr.appendChild(el('td', { text: row.full_name || '—' }));
    tr.appendChild(el('td', { class: 'cell-mono cell-muted', text: row.user_email || '—' }));
    tr.appendChild(el('td', { class: 'cell-mono cell-muted', text: row.msisdn || '—' }));

    const statusTd = el('td', {});
    statusTd.appendChild(badge(statusMeta(row.status)));
    tr.appendChild(statusTd);

    tr.appendChild(el('td', { class: 'cell-mono cell-muted', text: formatDate(row.created_at) }));

    const actionTd = el('td', { class: 'cell-action' });
    const actionBtn = el('button', { type: 'button', class: 'btn-link', text: 'Check duplicates' });
    actionBtn.addEventListener('click', () => onCheckDuplicates && onCheckDuplicates(row.user_id));
    actionTd.appendChild(actionBtn);
    tr.appendChild(actionTd);
    return tr;
  }

  function renderPagination() {
    if (!state.hasSearched || state.total === 0) {
      paginationEl.hidden = true;
      return;
    }
    paginationEl.hidden = false;
    const from = state.offset + 1;
    const to = Math.min(state.offset + state.limit, state.total);
    pageInfo.textContent = `${formatNumber(from)}–${formatNumber(to)} of ${formatNumber(state.total)}`;
    prevBtn.disabled = state.offset <= 0;
    nextBtn.disabled = state.offset + state.limit >= state.total;
  }

  renderStatus('idle', 'Start by entering a name, email, phone, or user ID above.');

  return {
    runQuery(q, type) {
      queryInput.value = q;
      typeSelect.value = type;
      applyPlaceholder();
      state.q = q.trim();
      state.type = type;
      state.offset = 0;
      state.sortKey = null;
      runSearch();
    },
  };
}
