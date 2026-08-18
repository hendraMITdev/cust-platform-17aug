// public/js/sidebar.js
// Mobile off-canvas sidebar: hamburger opens it, backdrop/close/Escape/nav-click close it.
// Desktop layout (>768px) never triggers this — the sidebar is simply always visible there.

const MOBILE_QUERY = '(max-width: 768px)';

export function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const hamburger = document.getElementById('hamburgerBtn');
  const closeBtn = document.getElementById('sidebarClose');
  const navItems = sidebar.querySelectorAll('[data-route]');
  const mobileQuery = window.matchMedia(MOBILE_QUERY);

  // On mobile the sidebar sits off-screen (transform, not display:none) while
  // closed, so it stays keyboard-reachable unless explicitly made inert. On
  // desktop it's always visible regardless of the open/close state, so inert
  // must only ever apply while the mobile query actually matches.
  function syncInert() {
    sidebar.inert = mobileQuery.matches && !sidebar.classList.contains('is-open');
  }

  function open() {
    sidebar.classList.add('is-open');
    backdrop.hidden = false;
    requestAnimationFrame(() => backdrop.classList.add('is-visible'));
    hamburger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    syncInert();
  }

  function close() {
    sidebar.classList.remove('is-open');
    backdrop.classList.remove('is-visible');
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    syncInert();
    setTimeout(() => {
      if (!sidebar.classList.contains('is-open')) backdrop.hidden = true;
    }, 260);
  }

  hamburger.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  navItems.forEach((item) => item.addEventListener('click', close));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sidebar.classList.contains('is-open')) close();
  });

  mobileQuery.addEventListener('change', syncInert);
  syncInert();
}
