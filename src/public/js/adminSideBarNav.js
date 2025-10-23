// Toggle Sidebar
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  
  sidebar.classList.toggle('show');
  overlay.classList.toggle('show');
}

// Close sidebar when clicking outside (on mobile)
document.addEventListener('click', function(event) {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const menuBtn = document.querySelector('.mobile-menu-btn');

  if (window.innerWidth <= 768) {
    if (
      !sidebar.contains(event.target) &&
      !menuBtn.contains(event.target) &&
      sidebar.classList.contains('show')
    ) {
      sidebar.classList.remove('show');
      overlay.classList.remove('show');
    }
  }
});

// Reset on resize
window.addEventListener('resize', function() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');

  if (window.innerWidth > 768) {
    sidebar.classList.remove('show');
    overlay.classList.remove('show');
  }
});

/* ========== OPTIONAL: Collapsible Submenus ========== */
document.querySelectorAll('.submenu-toggle').forEach(toggle => {
  toggle.addEventListener('click', function(e) {
    e.preventDefault();
    const parent = this.closest('.has-submenu');
    parent.classList.toggle('open');
    
    const submenu = parent.querySelector('.submenu');
    if (submenu) {
      submenu.classList.toggle('show');
    }
  });
});


/* ========== Notification  ========== */
document.addEventListener("DOMContentLoaded", () => {
  const notifList = document.getElementById("notifList");
  const notifCount = document.getElementById("notifCount");
  const noNotif = document.getElementById("noNotif");
  const markAllBtn = document.getElementById("markAllBtn");

  async function fetchNotifications() {
    try {
      const res = await fetch("/admin/notifications/unread");
      const data = await res.json();

      if (!data.ok) return;

      const notifications = data.notifications;
      notifList.innerHTML = "";

      if (notifications.length === 0) {
        noNotif.classList.remove("d-none");
        notifCount.classList.add("d-none");
        return;
      }

      noNotif.classList.add("d-none");
      notifCount.textContent = notifications.length;
      notifCount.classList.remove("d-none");

      notifications.forEach((n) => {
        const li = document.createElement("li");
        li.classList.add("dropdown-item", "border-bottom", "small");
        li.style.cursor = "pointer";
        li.innerHTML = `
          <div class="fw-semibold">${n.actor_name || "Unknown"} ${n.action || ""}</div>
          <div class="text-muted">${n.resource || ""}</div>
          <div class="text-muted" style="font-size: 0.75rem;">${new Date(n.created_at).toLocaleString()}</div>
        `;
        li.addEventListener("click", async () => {
          await fetch(`/admin/notifications/read/${n.id}`, { method: "POST" });
          li.remove();
          if (notifList.children.length === 0) {
            noNotif.classList.remove("d-none");
            notifCount.classList.add("d-none");
          } else {
            notifCount.textContent = notifList.children.length;
          }
        });
        notifList.appendChild(li);
      });
    } catch (err) {
      console.error("Failed to load notifications", err);
    }
  }

  // mark all as read
  if (markAllBtn) {
    markAllBtn.addEventListener("click", async () => {
      await fetch("/admin/notifications/read-all", { method: "POST" });
      notifList.innerHTML = "";
      notifCount.classList.add("d-none");
      noNotif.classList.remove("d-none");
    });
  }

  // poll every 15s
  fetchNotifications();
  setInterval(fetchNotifications, 15000);
});


