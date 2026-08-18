// public/js/quality-panel.js
import { subscribe, loadQuality } from './data-store.js';
import { el, clear, formatDate, formatNumber } from './dom.js';
import { normalizeAllMetrics } from './quality-normalize.js';
import { severityMeta, badge } from './badges.js';

export function initQualityPanel() {
  const metaEl = document.getElementById('qualityMeta');
  const stateEl = document.getElementById('qualityState');
  const gridEl = document.getElementById('metricGrid');
  const issuesCard = document.getElementById('issuesCard');
  const issuesBody = document.getElementById('issuesBody');
  const issuesEmpty = document.getElementById('issuesEmpty');
  const refreshBtn = document.getElementById('qualityRefreshBtn');

  let lastAnalyzedAt = null;

  refreshBtn.addEventListener('click', () => loadQuality({ force: true }));

  subscribe((state) => {
    const { quality, qualityLoading, qualityError, qualityComputeMs } = state;

    refreshBtn.disabled = qualityLoading;
    refreshBtn.classList.toggle('is-loading', qualityLoading);

    clear(stateEl);

    if (qualityError && !quality) {
      stateEl.hidden = false;
      gridEl.hidden = true;
      issuesCard.hidden = true;
      clear(metaEl);
      stateEl.appendChild(el('div', { class: 'panel-state panel-state-error' }, [
        el('p', { class: 'panel-state-message', text: qualityError }),
        retryButton(),
      ]));
      return;
    }

    if (qualityLoading && !quality) {
      stateEl.hidden = false;
      gridEl.hidden = true;
      issuesCard.hidden = true;
      stateEl.appendChild(el('div', { class: 'panel-state panel-state-loading' }, [
        el('p', { class: 'panel-state-message', text: 'Computing data quality metrics across all records…' }),
      ]));
      return;
    }

    if (!quality) return;

    stateEl.hidden = true;
    gridEl.hidden = false;
    issuesCard.hidden = false;

    renderMeta(quality, qualityComputeMs);
    renderMetricGrid(quality.quality_metrics);
    renderIssues(quality.data_issues || []);

    if (quality.analyzed_at !== lastAnalyzedAt) {
      lastAnalyzedAt = quality.analyzed_at;
      window.dispatchEvent(new CustomEvent('activity:log', {
        detail: { message: `Data quality scan completed — ${formatNumber(quality.total_records)} records in ${qualityComputeMs}ms` },
      }));
    }
  });

  function retryButton() {
    const btn = el('button', { type: 'button', class: 'btn btn-ghost', text: 'Try again' });
    btn.addEventListener('click', () => loadQuality({ force: true }));
    return btn;
  }

  function renderMeta(data, computeMs) {
    clear(metaEl);
    metaEl.appendChild(el('span', { class: 'meta-item', text: `Analyzed ${formatDate(data.analyzed_at)}` }));
    metaEl.appendChild(el('span', { class: 'meta-dot', text: '·' }));
    metaEl.appendChild(el('span', { class: 'meta-item meta-time', text: `Computed in ${computeMs}ms` }));
    metaEl.appendChild(el('span', { class: 'meta-dot', text: '·' }));
    metaEl.appendChild(el('span', { class: 'meta-item', text: `${formatNumber(data.total_records)} records` }));
  }

  function renderMetricGrid(qualityMetrics) {
    clear(gridEl);
    for (const normalized of normalizeAllMetrics(qualityMetrics)) {
      gridEl.appendChild(metricCard(normalized));
    }
  }

  function metricCard(normalized) {
    const pctValue = Math.max(0, Math.min(100, normalized.presentPct));
    const card = el('article', { class: 'metric-card' });
    card.appendChild(el('h2', { class: 'metric-title', text: normalized.title }));
    card.appendChild(el('div', { class: 'metric-head' }, [
      el('span', { class: 'metric-pct', text: `${pctValue.toFixed(1)}%` }),
      el('span', { class: 'metric-pct-label', text: 'complete' }),
    ]));

    const track = el('div', { class: 'bar-track' });
    const fill = el('div', { class: 'bar-fill' });
    track.appendChild(fill);
    card.appendChild(track);
    requestAnimationFrame(() => {
      fill.style.transform = `scaleX(${pctValue / 100})`;
    });

    card.appendChild(el('p', { class: 'metric-sub', text: `${formatNumber(normalized.present)} present · ${formatNumber(normalized.missing)} missing` }));

    const factsList = el('dl', { class: 'metric-facts' });
    for (const [label, value] of normalized.facts) {
      factsList.appendChild(el('div', { class: 'metric-fact' }, [
        el('dt', { text: label }),
        el('dd', { text: value }),
      ]));
    }
    card.appendChild(factsList);
    return card;
  }

  function renderIssues(issues) {
    clear(issuesBody);
    issuesEmpty.hidden = issues.length > 0;
    for (const issue of issues) {
      const tr = el('tr', {});
      tr.appendChild(el('td', { text: issue.field ?? '—' }));
      tr.appendChild(el('td', { text: issue.issue_type ?? '—' }));
      tr.appendChild(el('td', { class: 'cell-mono', text: formatNumber(issue.count) }));
      const sevTd = el('td', {});
      sevTd.appendChild(badge(severityMeta(issue.severity)));
      tr.appendChild(sevTd);
      issuesBody.appendChild(tr);
    }
  }

  loadQuality();
}
