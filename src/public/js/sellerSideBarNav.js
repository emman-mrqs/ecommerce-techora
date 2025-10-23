// src/public/js/sellerSideBarNav.js
// Sidebar toggles + seller notification polling & robust "mark all read" handling

// ---------- Sidebar toggle ----------
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (!sidebar || !overlay) return;
  sidebar.classList.toggle('show');
  overlay.classList.toggle('show');
}

// Close sidebar when clicking outside (on mobile)
document.addEventListener('click', function(event) {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const menuBtn = document.querySelector('.mobile-menu-btn');
  if (!sidebar || !overlay || !menuBtn) return;

  if (window.innerWidth <= 768) {
    if (!sidebar.contains(event.target) && !menuBtn.contains(event.target) && sidebar.classList.contains('show')) {
      sidebar.classList.remove('show');
      overlay.classList.remove('show');
    }
  }
});

// Reset on resize
window.addEventListener('resize', function() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (!sidebar || !overlay) return;
  if (window.innerWidth > 768) {
    sidebar.classList.remove('show');
    overlay.classList.remove('show');
  }
});

// ---------- Seller notifications (polling + mark-all-read) ----------
document.addEventListener('DOMContentLoaded', () => {
  const POLL_URL = '/seller/notifications/poll-json';
  const MARK_SEEN_URL = '/seller/notifications/mark-seen';
  const POLL_INTERVAL = 12000; // 12s

  const badge = document.getElementById('sellerNotifBadge');
  const list = document.getElementById('sellerNotifList');
  const markBtn = document.getElementById('sellerMarkAllRead');

  if (!badge || !list) return;

  const shown = new Set();

  // Preload keys from server-rendered items (covers orders, low-stock, promo, etc.)
  document.querySelectorAll('#sellerNotifList .notification-item').forEach(li => {
    const key = li.getAttribute('data-key');
    if (key) shown.add(key);
  });

  function fmtDate(d) {
    try { return new Date(d).toLocaleString(); } catch (e) { return d; }
  }

  function escapeHtml(s) {
    if (!s && s !== 0) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function actorHtml(actor) {
    if (!actor) return '';
    const display = (actor.name && actor.name !== 'null') ? actor.name
                  : (actor.email && actor.email !== 'null') ? actor.email
                  : ('User #' + actor.id);
    return `<div class="small text-muted">By: ${escapeHtml(display)}</div>`;
  }

  function addItem(n) {
    if (!n) return;

    // remove "No notifications" placeholder on first insert
    const empty = document.getElementById('sellerNotifEmpty');
    if (empty) empty.remove();

    const li = document.createElement('li');
    li.className = 'px-2 py-2 notification-item';
    const key = n.ref_id ? `ref_${n.ref_id}` : `id_${n.id}`;
    li.setAttribute('data-key', key);

    const href = (n.kind === 'order' && n.ref_id) ? `/seller/orders/${n.ref_id}` : '#';
    li.innerHTML = `
      <a href="${escapeHtml(href)}" class="d-block text-decoration-none text-dark">
        <div><small>${escapeHtml(n.title || '')}</small></div>
        ${n.actor ? actorHtml(n.actor) : ''}
        ${n.body ? `<div class="small text-muted">${escapeHtml(n.body)}</div>` : ''}
        <div class="small text-muted mt-1">${fmtDate(n.created_at)}</div>
      </a>
    `;
    const divider = document.createElement('li');
    divider.innerHTML = '<hr class="dropdown-divider">';
    list.insertBefore(divider, list.firstChild);
    list.insertBefore(li, divider);
  }

  function setBadge(count) {
    const c = Number(count) || 0;
    if (c > 0) {
      badge.style.display = 'inline-block';
      badge.textContent = String(c);
    } else {
      badge.style.display = 'none';
      badge.textContent = '0';
    }
  }

  async function poll() {
    try {
      const res = await fetch(POLL_URL, { credentials: 'same-origin' });
      if (!res.ok) return;

      const data = await res.json();
      const items = data.items || [];
      let added = 0;

      for (const n of items) {
        const key = n.ref_id ? `ref_${n.ref_id}` : `id_${n.id}`;
        if (shown.has(key)) continue;
        shown.add(key);
        addItem(n);
        added++;
      }

      if (added) {
        const current = Number(badge.textContent || 0);
        setBadge(current + added);
      }
    } catch (_) {
      // ignore polling errors
    }
  }

  // initial poll + interval
  poll();
  const pollId = setInterval(poll, POLL_INTERVAL);
  window.addEventListener('beforeunload', () => clearInterval(pollId));

  // Mark-all-read
  async function markAllRead() {
    const prior = Number(badge.textContent || 0);
    try {
      setBadge(0);
      const r = await fetch(MARK_SEEN_URL, { method: 'POST', credentials: 'same-origin' });
      const ok = r.ok && (await r.json().catch(() => ({}))).ok;
      if (!ok) setBadge(prior);
    } catch {
      setBadge(prior);
    }
  }

  document.addEventListener('click', (ev) => {
    const el = ev.target?.closest?.('#sellerMarkAllRead');
    if (el) { ev.preventDefault(); markAllRead(); }
  });
  if (markBtn) markBtn.addEventListener('click', (e) => { e.preventDefault(); markAllRead(); });
});
