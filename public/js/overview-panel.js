// public/js/overview-panel.js
// Landing tab: the two-column chart row (completeness area chart + status donut)
// plus a short preview of the worst data issues, linking through to the full
// Data Quality tab. Reads from the shared data-store, no fetch of its own.

import { subscribe, loadQuality } from './data-store.js';
import { el, clear } from './dom.js';
import { normalizeAllMetrics } from './quality-normalize.js';
import { renderCompletenessChart, renderStatusDonut } from './charts.js';
import { severityMeta, badge } from './badges.js';

export function initOverviewPanel({ onViewAllIssues } = {}) {
  const stateEl = document.getElementById('overviewState');
  const chartsEl = document.getElementById('overviewCharts');
  const completenessMount = document.getElementById('completenessChartMount');
  const donutMount = document.getElementById('statusDonutMount');
  const donutSub = document.getElementById('donutSub');
  const legendEl = document.getElementById('statusLegend');
  const issuesCard = document.getElementById('issuesPreviewCard');
  const issuesList = document.getElementById('issuesPreviewList');
  const viewAllBtn = document.getElementById('viewAllIssuesBtn');

  viewAllBtn.addEventListener('click', () => onViewAllIssues && onViewAllIssues());

  subscribe((state) => {
    const { quality, qualityLoading, qualityError } = state;
    clear(stateEl);

    if (qualityError && !quality) {
      stateEl.hidden = false;
      chartsEl.hidden = true;
      issuesCard.hidden = true;
      stateEl.appendChild(el('div', { class: 'panel-state panel-state-error' }, [
        el('p', { class: 'panel-state-message', text: qualityError }),
      ]));
      return;
    }

    if (qualityLoading && !quality) {
      stateEl.hidden = false;
      chartsEl.hidden = true;
      issuesCard.hidden = true;
      stateEl.appendChild(el('div', { class: 'panel-state panel-state-loading' }, [
        el('p', { class: 'panel-state-message', text: 'Computing data quality metrics…' }),
      ]));
      return;
    }

    if (!quality) return;
    stateEl.hidden = true;
    chartsEl.hidden = false;

    const metrics = normalizeAllMetrics(quality.quality_metrics)
      .map((m) => ({ title: m.title, presentPct: m.presentPct }));
    renderCompletenessChart(completenessMount, metrics);
    renderStatusDonut(donutMount, legendEl, donutSub, quality.quality_metrics?.status?.distribution);

    const issues = Array.isArray(quality.data_issues) ? quality.data_issues.slice(0, 4) : [];
    clear(issuesList);
    issuesCard.hidden = issues.length === 0;
    for (const issue of issues) {
      issuesList.appendChild(el('li', { class: 'issue-row' }, [
        el('span', { class: 'issue-row-field', text: issue.field ?? '—' }),
        el('span', { class: 'issue-row-type', text: issue.issue_type ?? '—' }),
        el('span', { class: 'issue-row-count', text: String(issue.count ?? 0) }),
        badge(severityMeta(issue.severity)),
      ]));
    }
  });

  loadQuality();
}
