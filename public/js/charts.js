// public/js/charts.js
// Hand-drawn inline SVG charts, no libraries. All interpolated values are either
// numbers (coerced/formatted before insertion) or fixed field/status labels we
// control — never raw API text — so building markup via innerHTML here is safe.

import { clear, el, formatNumber } from './dom.js';

const TEAL = '#12a594';
const AXIS_COLOR = '#94a3b8';
const GRID_COLOR = '#e6ebf1';

// Status colors intentionally match the badge tones used elsewhere (statusMeta in
// badges.js) so the donut legend reads consistently with the rest of the app —
// teal stays reserved for the single-series area chart, nav, tabs, and buttons.
const STATUS_COLORS = { '1': '#16a34a', '0': '#64748b', '-1': '#e11d48' };
const STATUS_LABELS = { '1': 'Active', '0': 'Pending', '-1': 'Suspended' };
const STATUS_ORDER = ['1', '0', '-1'];

function buildSmoothPath(points) {
  if (!points.length) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cpx = (p0.x + p1.x) / 2;
    d += ` C ${cpx} ${p0.y}, ${cpx} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

/** metrics: [{ title, presentPct }] — e.g. the normalized email/phone/birth_date/hobbies metrics. */
export function renderCompletenessChart(container, metrics) {
  clear(container);
  if (!metrics.length) return;

  const width = 640;
  const height = 260;
  const padLeft = 42;
  const padRight = 20;
  const padTop = 24;
  const padBottom = 36;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;
  const n = metrics.length;

  const points = metrics.map((m, i) => {
    const pct = Math.max(0, Math.min(100, Number(m.presentPct) || 0));
    const x = n <= 1 ? padLeft : padLeft + (i / (n - 1)) * plotWidth;
    const y = padTop + (1 - pct / 100) * plotHeight;
    return { x, y, pct, title: m.title };
  });

  const gridLines = [0, 25, 50, 75, 100].map((pct) => {
    const y = padTop + (1 - pct / 100) * plotHeight;
    return `<line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" stroke="${GRID_COLOR}" stroke-width="1" stroke-dasharray="3 4" />`
      + `<text x="${padLeft - 10}" y="${y + 3}" text-anchor="end" font-size="10" fill="${AXIS_COLOR}">${pct}%</text>`;
  }).join('');

  const linePath = buildSmoothPath(points);
  const baseline = padTop + plotHeight;
  const areaPath = `${linePath} L ${points[n - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`;

  const dots = points.map((p) => (
    `<text x="${p.x}" y="${p.y - 12}" text-anchor="middle" font-size="11" font-weight="600" fill="#0f172a">${p.pct.toFixed(1)}%</text>`
    + `<circle cx="${p.x}" cy="${p.y}" r="4" fill="#ffffff" stroke="${TEAL}" stroke-width="2.25" />`
  )).join('');

  const xLabels = points.map((p) => (
    `<text x="${p.x}" y="${height - 10}" text-anchor="middle" font-size="11" fill="${AXIS_COLOR}">${p.title}</text>`
  )).join('');

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Data completeness by field">
      <defs>
        <linearGradient id="completenessGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${TEAL}" stop-opacity="0.22" />
          <stop offset="100%" stop-color="${TEAL}" stop-opacity="0" />
        </linearGradient>
      </defs>
      ${gridLines}
      <path d="${areaPath}" fill="url(#completenessGradient)" stroke="none" />
      <path d="${linePath}" fill="none" stroke="${TEAL}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      ${dots}
      ${xLabels}
    </svg>
  `;
}

/** distribution: { "-1": n, "0": n, "1": n } from quality_metrics.status.distribution */
export function renderStatusDonut(mountEl, legendEl, subEl, distribution) {
  clear(mountEl);
  clear(legendEl);

  const dist = distribution || {};
  const total = STATUS_ORDER.reduce((sum, key) => sum + (Number(dist[key]) || 0), 0);

  if (subEl) subEl.textContent = total ? `${formatNumber(total)} accounts` : 'No data available';

  if (!total) {
    mountEl.innerHTML = '<svg viewBox="0 0 160 160" role="img" aria-label="Status distribution"><circle cx="80" cy="80" r="62" fill="none" stroke="#eef1f5" stroke-width="24" /></svg>';
    return;
  }

  const size = 160;
  const r = 62;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  let offsetPct = 0;
  const segments = STATUS_ORDER.map((key) => {
    const count = Number(dist[key]) || 0;
    const pct = (count / total) * 100;
    const dash = (pct / 100) * circumference;
    const seg = {
      key,
      count,
      pct,
      dasharray: `${dash} ${circumference - dash}`,
      dashoffset: -((offsetPct / 100) * circumference),
      color: STATUS_COLORS[key],
    };
    offsetPct += pct;
    return seg;
  }).filter((seg) => seg.count > 0);

  const rings = segments.map((seg) => (
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="24" `
    + `stroke-dasharray="${seg.dasharray}" stroke-dashoffset="${seg.dashoffset}" `
    + `transform="rotate(-90 ${cx} ${cy})" stroke-linecap="butt" />`
  )).join('');

  mountEl.innerHTML = `
    <svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Status distribution">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#eef1f5" stroke-width="24" />
      ${rings}
    </svg>
  `;

  for (const seg of segments) {
    legendEl.appendChild(el('li', { class: 'legend-row' }, [
      el('span', { class: 'legend-dot', style: `background:${seg.color}` }),
      el('span', { class: 'legend-label', text: STATUS_LABELS[seg.key] }),
      el('span', { class: 'legend-value', text: `${formatNumber(seg.count)} · ${seg.pct.toFixed(1)}%` }),
    ]));
  }
}
