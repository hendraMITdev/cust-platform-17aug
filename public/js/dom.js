// public/js/dom.js
// Small DOM helpers. Elements are built with createElement/textContent (not innerHTML)
// so API-derived strings (names, emails, etc.) can never be interpreted as markup.

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value; // only ever used with trusted, static strings
    else if (key.startsWith('data-') || key.startsWith('aria-') || key === 'role' || key === 'for') {
      node.setAttribute(key, value);
    } else {
      node[key] = value;
    }
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDate(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  return DATE_FORMATTER.format(date);
}

export function formatRelativeTime(isoString) {
  if (!isoString) return '';
  const then = new Date(isoString).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  return `${diffHr}h ago`;
}

const NUMBER_FORMATTER = new Intl.NumberFormat('en-US');

export function formatNumber(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return NUMBER_FORMATTER.format(Number(n));
}

export function formatPercent(n, digits = 1) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `${Number(n).toFixed(digits)}%`;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
