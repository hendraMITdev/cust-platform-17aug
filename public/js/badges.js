// public/js/badges.js
// Status/confidence/severity -> label + color tone, and a badge element builder.
// Tone colors are semantic (green/amber/red/slate) — never the brand teal, which is
// reserved for navigation, tabs, charts, and primary actions.

import { el } from './dom.js';

const STATUS_META = {
  '1': { label: 'Active', tone: 'green' },
  '0': { label: 'Pending', tone: 'slate' },
  '-1': { label: 'Suspended', tone: 'red' },
};

export function statusMeta(status) {
  return STATUS_META[String(status)] ?? { label: `Status ${status}`, tone: 'slate' };
}

const CONFIDENCE_META = {
  high: { label: 'High confidence', tone: 'green' },
  medium: { label: 'Medium confidence', tone: 'amber' },
  low: { label: 'Low confidence', tone: 'slate' },
};

export function confidenceMeta(level) {
  return CONFIDENCE_META[String(level).toLowerCase()] ?? { label: String(level ?? 'Unknown'), tone: 'slate' };
}

const SEVERITY_META = {
  high: { label: 'High', tone: 'red' },
  medium: { label: 'Medium', tone: 'amber' },
  low: { label: 'Low', tone: 'slate' },
};

export function severityMeta(level) {
  return SEVERITY_META[String(level).toLowerCase()] ?? { label: String(level ?? 'Unknown'), tone: 'slate' };
}

export function badge({ label, tone }) {
  return el('span', { class: `badge badge-${tone}`, text: label });
}
