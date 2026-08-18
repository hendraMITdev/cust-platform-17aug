// public/js/duplicates-panel.js
import { el, clear, formatNumber, formatDate } from './dom.js';
import { fetchDuplicates, fetchDuplicateGroups, ApiError } from './api.js';
import { confidenceMeta, badge } from './badges.js';

const FINDER_LIMIT = 50;
const MEMBER_CHIP_CAP = 8;
const ATTRIBUTE_TYPE_LABELS = {
  ip_address: 'IP address',
  order_history: 'Order history',
  activity_pattern: 'Activity pattern',
};

export function initDuplicatesPanel() {
  const form = document.getElementById('dupForm');
  const input = document.getElementById('dupUserId');
  const submitBtn = document.getElementById('dupSubmit');
  const stateEl = document.getElementById('dupState');
  const resultEl = document.getElementById('dupResult');
  const targetEl = document.getElementById('dupTarget');
  const listEl = document.getElementById('dupList');
  const countEl = document.getElementById('dupCount');

  const finderForm = document.getElementById('dupFinderForm');
  const finderMethod = document.getElementById('dupFinderMethod');
  const finderSubmit = document.getElementById('dupFinderSubmit');
  const finderMeta = document.getElementById('dupFinderMeta');
  const finderState = document.getElementById('dupFinderState');
  const finderGroups = document.getElementById('dupFinderGroups');

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const id = input.value.trim();
    if (!id) return;
    runLookup(id);
  });

  finderForm.addEventListener('submit', (event) => {
    event.preventDefault();
    runFinder(finderMethod.value);
  });

  function logActivity(message) {
    window.dispatchEvent(new CustomEvent('activity:log', { detail: { message } }));
  }

  async function runLookup(id) {
    submitBtn.disabled = true;
    submitBtn.classList.add('is-loading');
    resultEl.hidden = true;
    clear(stateEl);
    stateEl.hidden = false;
    stateEl.appendChild(el('div', { class: 'panel-state panel-state-loading' }, [
      el('p', { class: 'panel-state-message', text: `Scanning for duplicates of user ${id}…` }),
    ]));
    try {
      const data = await fetchDuplicates(id);
      stateEl.hidden = true;
      renderResult(data, id);
      const count = data.total_possible_duplicates ?? 0;
      logActivity(`Duplicate check for user ${id} — ${formatNumber(count)} match${count === 1 ? '' : 'es'}`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not run duplicate detection.';
      clear(stateEl);
      stateEl.appendChild(el('div', { class: 'panel-state panel-state-error' }, [
        el('p', { class: 'panel-state-message', text: message }),
      ]));
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove('is-loading');
    }
  }

  function renderResult(data, requestedId) {
    resultEl.hidden = false;
    clear(targetEl);
    clear(listEl);

    const found = Boolean(data.full_name || data.user_email || data.user_phone);
    if (!found) {
      targetEl.appendChild(el('p', { class: 'panel-state-message', text: `No user found with ID ${requestedId}.` }));
      countEl.textContent = '';
      return;
    }

    targetEl.appendChild(el('span', { class: 'target-label', text: 'Target user' }));
    targetEl.appendChild(el('div', { class: 'target-name' }, [el('h3', { text: data.full_name || '—' })]));

    const details = el('dl', { class: 'target-details' });
    details.appendChild(el('div', {}, [el('dt', { text: 'User ID' }), el('dd', { class: 'cell-mono', text: String(data.user_id) })]));
    details.appendChild(el('div', {}, [el('dt', { text: 'Email' }), el('dd', { class: 'cell-mono', text: data.user_email || '—' })]));
    details.appendChild(el('div', {}, [el('dt', { text: 'Phone' }), el('dd', { class: 'cell-mono', text: data.user_phone || '—' })]));
    targetEl.appendChild(details);

    const dups = Array.isArray(data.possible_duplicates) ? data.possible_duplicates : [];
    countEl.textContent = String(data.total_possible_duplicates ?? dups.length);

    if (!dups.length) {
      listEl.appendChild(el('li', { class: 'dup-empty', text: 'No likely duplicates found for this user.' }));
      return;
    }
    for (const dup of dups) {
      listEl.appendChild(renderDupItem(dup));
    }
  }

  function renderDupItem(dup) {
    const li = el('li', { class: 'dup-item' });
    li.appendChild(el('div', { class: 'dup-item-head' }, [
      el('h4', { text: dup.full_name || '—' }),
      badge(confidenceMeta(dup.confidence)),
    ]));

    const details = el('dl', { class: 'dup-item-details' });
    details.appendChild(el('div', {}, [el('dt', { text: 'User ID' }), el('dd', { class: 'cell-mono', text: String(dup.user_id) })]));
    details.appendChild(el('div', {}, [el('dt', { text: 'Email' }), el('dd', { class: 'cell-mono', text: dup.user_email || '—' })]));
    details.appendChild(el('div', {}, [el('dt', { text: 'Phone' }), el('dd', { class: 'cell-mono', text: dup.user_phone || '—' })]));
    li.appendChild(details);

    const pct = Math.round((Number(dup.similarity_score) || 0) * 100);
    const track = el('div', { class: 'bar-track bar-track-inline' });
    const fill = el('div', { class: 'bar-fill' });
    track.appendChild(fill);
    li.appendChild(el('div', { class: 'score-row' }, [
      el('span', { class: 'score-label', text: 'Similarity' }),
      track,
      el('span', { class: 'score-value', text: `${pct}%` }),
    ]));
    requestAnimationFrame(() => { fill.style.transform = `scaleX(${pct / 100})`; });

    if (Array.isArray(dup.match_reasons) && dup.match_reasons.length) {
      const chips = el('div', { class: 'chip-row' });
      for (const reason of dup.match_reasons) {
        chips.appendChild(el('span', { class: 'chip', text: prettifyReason(reason) }));
      }
      li.appendChild(chips);
    }
    return li;
  }

  async function runFinder(method) {
    finderSubmit.disabled = true;
    finderSubmit.classList.add('is-loading');
    finderGroups.hidden = true;
    clear(finderMeta);
    clear(finderState);
    finderState.hidden = false;
    finderState.appendChild(el('div', { class: 'panel-state panel-state-loading' }, [
      el('p', { class: 'panel-state-message', text: 'Scanning for duplicate clusters — this can take a while for order/activity signals…' }),
    ]));

    const startedAt = performance.now();
    try {
      const data = await fetchDuplicateGroups({ method, limit: FINDER_LIMIT });
      const roundTripMs = Math.round(performance.now() - startedAt);
      const groups = Array.isArray(data.duplicate_groups) ? data.duplicate_groups : [];
      renderFinderMeta(data, roundTripMs);

      if (groups.length === 0) {
        finderState.hidden = false;
        finderGroups.hidden = true;
        clear(finderState);
        finderState.appendChild(el('div', { class: 'panel-state panel-state-empty' }, [
          el('p', { class: 'panel-state-message', text: `No duplicate groups found for ${ATTRIBUTE_TYPE_LABELS[method] || method}.` }),
        ]));
      } else {
        finderState.hidden = true;
        finderGroups.hidden = false;
        clear(finderGroups);
        for (const group of groups) {
          finderGroups.appendChild(renderFinderGroup(group));
        }
      }
      logActivity(`Duplicate finder (${ATTRIBUTE_TYPE_LABELS[method] || method}) — ${formatNumber(groups.length)} group${groups.length === 1 ? '' : 's'} in ${roundTripMs}ms`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not run the duplicate finder.';
      clear(finderState);
      finderState.hidden = false;
      finderGroups.hidden = true;
      finderState.appendChild(el('div', { class: 'panel-state panel-state-error' }, [
        el('p', { class: 'panel-state-message', text: message }),
      ]));
      clear(finderMeta);
    } finally {
      finderSubmit.disabled = false;
      finderSubmit.classList.remove('is-loading');
    }
  }

  function renderFinderMeta(data, roundTripMs) {
    clear(finderMeta);
    const groupCount = Array.isArray(data.duplicate_groups) ? data.duplicate_groups.length : 0;
    finderMeta.appendChild(el('span', { class: 'meta-item', text: `${formatNumber(groupCount)} group${groupCount === 1 ? '' : 's'}` }));
    finderMeta.appendChild(el('span', { class: 'meta-dot', text: '·' }));
    finderMeta.appendChild(el('span', { class: 'meta-item', text: `${formatNumber(data.total_duplicate_users ?? 0)} accounts involved` }));
    finderMeta.appendChild(el('span', { class: 'meta-dot', text: '·' }));
    finderMeta.appendChild(el('span', { class: 'meta-item meta-time', text: `Round-trip ${roundTripMs}ms` }));
  }

  function renderFinderGroup(group) {
    const li = el('li', { class: 'dup-item' });
    li.appendChild(el('div', { class: 'dup-item-head' }, [
      el('h4', { class: 'cell-mono', text: group.shared_attribute ?? '—' }),
      badge(confidenceMeta(group.confidence)),
    ]));

    const details = el('dl', { class: 'dup-item-details' });
    details.appendChild(el('div', {}, [el('dt', { text: 'Signal' }), el('dd', { text: ATTRIBUTE_TYPE_LABELS[group.attribute_type] || group.attribute_type || '—' })]));
    details.appendChild(el('div', {}, [el('dt', { text: 'Users' }), el('dd', { class: 'cell-mono', text: formatNumber(group.user_count) })]));
    details.appendChild(el('div', {}, [el('dt', { text: 'First seen' }), el('dd', { class: 'cell-mono', text: formatDate(group.first_activity) })]));
    details.appendChild(el('div', {}, [el('dt', { text: 'Last seen' }), el('dd', { class: 'cell-mono', text: formatDate(group.last_activity) })]));
    li.appendChild(details);

    const ids = Array.isArray(group.user_ids) ? group.user_ids : [];
    const names = Array.isArray(group.user_names) ? group.user_names : [];
    const chips = el('div', { class: 'chip-row' });
    const shown = ids.slice(0, MEMBER_CHIP_CAP);
    shown.forEach((id, i) => {
      chips.appendChild(el('span', { class: 'chip', text: `${names[i] || 'Unknown'} · #${id}` }));
    });
    if (ids.length > MEMBER_CHIP_CAP) {
      chips.appendChild(el('span', { class: 'chip', text: `+${ids.length - MEMBER_CHIP_CAP} more` }));
    }
    li.appendChild(chips);
    return li;
  }

  return {
    lookupUser(id) {
      input.value = id;
      runLookup(id);
    },
  };
}

function prettifyReason(reason) {
  return String(reason).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
