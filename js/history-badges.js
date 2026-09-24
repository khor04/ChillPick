// Shared "Watched / Read" and "In Watchlist" badge logic for pages outside
// the Discover grid (which has its own copy of this same idea baked into
// discover.js, since it already fetches the watchlist for its buttons).
// Usage: give any card element data-history-id + data-history-type, add
// `.completed-badge` and/or `.watchlist-badge` elements inside its
// `.poster-wrapper`, then call ChillPickHistoryBadges.applyAllBadges('<card selector>').
(function () {
  let historyCache = null;
  let watchlistCache = null;

  async function getHistory() {
    if (historyCache !== null) return historyCache;
    try {
      const res = await fetch("/api/history", { credentials: "include" });
      historyCache = res.ok ? await res.json() : [];
    } catch (err) {
      console.error("Failed to load history for badges:", err);
      historyCache = [];
    }
    return historyCache;
  }

  async function getWatchlist() {
    if (watchlistCache !== null) return watchlistCache;
    try {
      const res = await fetch("/api/watchlist", { credentials: "include" });
      watchlistCache = res.ok ? await res.json() : [];
    } catch (err) {
      console.error("Failed to load watchlist for badges:", err);
      watchlistCache = [];
    }
    return watchlistCache;
  }

  function isCompleted(history, itemId, type) {
    return history.some(
      (h) =>
        String(h.itemId) === String(itemId) &&
        h.type === type &&
        h.status === "completed"
    );
  }

  function isInWatchlist(watchlist, itemId, type) {
    return watchlist.some(
      (w) => String(w.itemId) === String(itemId) && w.type === type
    );
  }

  async function applyAllBadges(cardSelector) {
    const [history, watchlist] = await Promise.all([
      getHistory(),
      getWatchlist(),
    ]);

    document.querySelectorAll(cardSelector).forEach((card) => {
      const itemId = card.dataset.historyId;
      const itemType = card.dataset.historyType;
      if (!itemId || !itemType) return;

      const completedBadge = card.querySelector(".completed-badge");
      if (completedBadge) {
        completedBadge.classList.toggle(
          "show",
          isCompleted(history, itemId, itemType)
        );
      }

      const watchlistBadge = card.querySelector(".watchlist-badge");
      if (watchlistBadge) {
        watchlistBadge.classList.toggle(
          "show",
          isInWatchlist(watchlist, itemId, itemType)
        );
      }
    });
  }

  window.ChillPickHistoryBadges = {
    getHistory,
    getWatchlist,
    isCompleted,
    isInWatchlist,
    applyAllBadges,
    // Kept for backward compatibility with any existing callers.
    applyHistoryBadges: applyAllBadges,
  };
})();
