// Sitewide notification bell: shows recent "someone liked/replied to your
// review" notifications. Relies on window.chillPickAuthCheck (set in
// partials/header.ejs) and the #notifBell markup also living there, so this
// runs on every page that includes the header.
(function () {
  document.addEventListener("DOMContentLoaded", async function () {
    if (!window.chillPickAuthCheck) return;

    const currentUser = await window.chillPickAuthCheck;
    if (!currentUser || !currentUser.username) return; // not logged in

    const bellEl = document.getElementById("notifBell");
    const badgeEl = document.getElementById("notifBadge");
    const listEl = document.getElementById("notifList");
    const markAllBtn = document.getElementById("markAllReadBtn");

    if (!bellEl || !badgeEl || !listEl) return;

    function timeAgo(dateStr) {
      const diffSeconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
      if (diffSeconds < 60) return "Just now";
      if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
      if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
      return `${Math.floor(diffSeconds / 86400)}d ago`;
    }

    function escapeHtml(str) {
      const div = document.createElement("div");
      div.textContent = str;
      return div.innerHTML;
    }

    function renderNotifications(notifications) {
      if (notifications.length === 0) {
        listEl.innerHTML = `<div class="text-center text-muted py-4 small">No notifications yet</div>`;
        return;
      }

      listEl.innerHTML = notifications
        .map(
          (n) => `
            <a href="${n.link}" class="notif-item${n.read ? "" : " unread"}" data-id="${n._id}">
              ${escapeHtml(n.message)}
              <span class="notif-time">${timeAgo(n.createdAt)}</span>
            </a>
          `
        )
        .join("");

      listEl.querySelectorAll(".notif-item").forEach((el) => {
        el.addEventListener("click", () => {
          fetch(`/api/notifications/${el.dataset.id}/read`, {
            method: "POST",
            credentials: "include",
          }).catch(() => {});
        });
      });
    }

    function updateBadge(count) {
      if (count > 0) {
        badgeEl.textContent = count > 99 ? "99+" : String(count);
        badgeEl.classList.remove("d-none");
      } else {
        badgeEl.classList.add("d-none");
      }
    }

    async function loadNotifications() {
      try {
        const res = await fetch("/api/notifications", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        renderNotifications(data.notifications || []);
        updateBadge(data.unreadCount || 0);
      } catch (err) {
        console.error("Failed to load notifications:", err);
        listEl.innerHTML = `<div class="text-center text-muted py-4 small">Failed to load notifications</div>`;
      }
    }

    markAllBtn?.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        await fetch("/api/notifications/read-all", {
          method: "POST",
          credentials: "include",
        });
        loadNotifications();
      } catch (err) {
        console.error("Failed to mark all as read:", err);
      }
    });

    bellEl.addEventListener("show.bs.dropdown", loadNotifications);

    loadNotifications();
    setInterval(loadNotifications, 60 * 1000);
  });
})();
