// public/js/topbar.js
// Global search (Cmd/Ctrl+K to focus, Enter to run — jumps to the Search tab with
// a type guessed from the query shape) and the notification bell, which doubles
// as a lightweight activity feed fed by 'activity:log' events from the panels.

export function initTopbar({ onSearch } = {}) {
  const form = document.getElementById('topbarSearchForm');
  const input = document.getElementById('topbarSearchInput');
  const bellBtn = document.getElementById('bellBtn');
  const bellDot = document.getElementById('bellDot');
  const bellDropdown = document.getElementById('bellDropdown');
  const activityList = document.getElementById('activityList');
  const activityEmpty = document.getElementById('activityEmpty');

  const MAX_ACTIVITY = 5;
  const activity = [];

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    onSearch && onSearch(q, detectType(q));
  });

  document.addEventListener('keydown', (event) => {
    const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
    if (isShortcut) {
      event.preventDefault();
      input.focus();
      input.select();
    }
    if (event.key === 'Escape' && !bellDropdown.hidden) {
      closeBell();
    }
  });

  bellBtn.addEventListener('click', () => {
    if (bellDropdown.hidden) openBell(); else closeBell();
  });

  document.addEventListener('click', (event) => {
    if (bellDropdown.hidden) return;
    if (!bellDropdown.contains(event.target) && !bellBtn.contains(event.target)) {
      closeBell();
    }
  });

  window.addEventListener('activity:log', (event) => {
    logActivity(event.detail.message);
  });

  function openBell() {
    bellDropdown.hidden = false;
    bellBtn.setAttribute('aria-expanded', 'true');
    bellDot.hidden = true;
  }

  function closeBell() {
    bellDropdown.hidden = true;
    bellBtn.setAttribute('aria-expanded', 'false');
  }

  function logActivity(message) {
    activity.unshift({ message, ts: new Date().toISOString() });
    activity.length = Math.min(activity.length, MAX_ACTIVITY);
    renderActivity();
    if (bellDropdown.hidden) bellDot.hidden = false;
  }

  function renderActivity() {
    activityList.innerHTML = '';
    activityEmpty.hidden = activity.length > 0;
    for (const item of activity) {
      const li = document.createElement('li');
      li.className = 'activity-item';
      const p = document.createElement('p');
      p.textContent = item.message;
      const time = document.createElement('time');
      time.dateTime = item.ts;
      time.textContent = new Date(item.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      li.appendChild(p);
      li.appendChild(time);
      activityList.appendChild(li);
    }
  }
}

function detectType(query) {
  if (/@/.test(query)) return 'email';
  const digitsOnly = query.replace(/[\s-]/g, '');
  if (/^\+?\d+$/.test(digitsOnly)) {
    return digitsOnly.replace(/^\+/, '').length >= 10 ? 'phone' : 'user_id';
  }
  return 'name';
}
