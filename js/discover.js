let currentPage = 1;
const itemsPerPage = 20;

let combined = [];
let allMovies = [];
let allBooks = [];
let filteredData = [];
let searchResults = [];

async function getCurrentUserId() {
  try {
    const res = await fetch("/account/me");
    if (!res.ok) throw new Error("Not authenticated");
    const data = await res.json();
    return data.id;
  } catch (err) {
    console.error("❌ Failed to get current user ID:", err);
    return null;
  }
}

async function fetchData() {
  try {
    document.getElementById("loadingIndicator").style.display = "block";
    document.getElementById("mediaContainer").style.opacity = "0.3";

    // Fetch 5 random movie pages
    const fixedPages = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const moviePromises = fixedPages.map((page) =>
      fetch(`/api/discover/movies?page=${page}&_=${Date.now()}`)
    );

    // Fetch 5 random book sets
    const fixedStartIndexes = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const bookPromises = fixedStartIndexes.map((startIndex) =>
      fetch(`/api/discover/books?startIndex=${startIndex}&_=${Date.now()}`)
    );
    const movieResults = await Promise.all(moviePromises);
    const bookResults = await Promise.all(bookPromises);

    const movies = (
      await Promise.all(movieResults.map((r) => r.json()))
    ).flat();
    const books = (await Promise.all(bookResults.map((r) => r.json()))).flat();

    allMovies = movies;
    allBooks = books;
    combined = [...allMovies, ...allBooks];

    const genresSet = new Set();
    combined.forEach((item) => {
      if (Array.isArray(item.genres)) {
        item.genres.forEach((g) => genresSet.add(g));
      }
    });

    const genres = [...genresSet].sort();
    updateGenreFilter(genres);
    updateRatingFilter();

    shuffleArray(combined);
    searchResults = [...combined];
    filteredData = [...combined];

    renderCards(currentPage);
    renderPagination(Math.ceil(filteredData.length / itemsPerPage));
  } catch (err) {
    console.error("❌ Failed to load content:", err);
  } finally {
    document.getElementById("loadingIndicator").style.display = "none";
    document.getElementById("mediaContainer").style.opacity = "1";
  }
}
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function findItemById(itemId) {
  let foundItem = combined.find((item) => item.id === itemId);
  if (!foundItem) {
    foundItem = [...combined, ...liveSearchItems].find(
      (item) => String(item.id) === String(itemId)
    );
  }
  return foundItem;
}

function renderCards(page) {
  const container = document.getElementById("mediaContainer");
  const startIndex = (page - 1) * itemsPerPage;
  const endIndex = Math.min(page * itemsPerPage, filteredData.length);
  const itemsToDisplay = filteredData.slice(startIndex, endIndex);

  let html = "";
  if (itemsToDisplay.length === 0) {
    html = `<div class="text-center w-100 py-5"><h5 class="text-muted">No results found.</h5></div>`;
  } else {
    itemsToDisplay.forEach((item) => {
      const isMovie = item.type === "movie";
      html += `
        <div class="col">
          <a href="${
            isMovie ? `/movie_detail/${item.id}` : `/book_detail/${item.id}`
          }" class="text-decoration-none text-dark" onclick="event.preventDefault(); trackItemClickAndNavigate('${
        item.id
      }', '${item.title.replace(/'/g, "\\'")}', '${item.type}', this)">
            <div class="card card-custom h-100" data-item-id="${item.id}" data-type="${item.type}">
              <div class="poster-wrapper">
                <img src="${item.image}" class="card-img-top" alt="${item.title}">
                <span class="completed-badge" style="display:none;">
                  <i class="bi bi-check-circle-fill"></i> ${isMovie ? "Watched" : "Read"}
                </span>
                <span class="watchlist-badge" style="display:none;">
                  <i class="bi bi-bookmark-check-fill"></i> In Watchlist
                </span>
              </div>
              <div class="card-body">
                <h6 class="fw-bold">${item.title}</h6>
                <div class="d-flex align-items-center small text-muted mt-1">
                  <i class="bi ${isMovie ? "bi-film" : "bi-book"} me-1"></i> ${
        isMovie ? "Movie" : "Book"
      }
                  <span class="ms-auto text-dark fw-semibold">${
                    item.rating
                  } <i class="bi bi-star-fill rating-star"></i></span>
                </div>
                <button class="btn watchlist-btn mt-3 w-100" 
                        data-id="${item.id}" 
                        data-type="${item.type}"
                        onclick="handleWatchlistClick(event)">
                  <i class="bi bi-plus-circle me-1"></i> Watchlist
                </button>
              </div>
            </div>
          </a>
        </div>
      `;
    });
  }

  container.innerHTML = html;

  // Add this to sync button states after DOM is updated
  initializeWatchlistButtons();
  initializeHistoryBadges();
}

let userHistory = null; // cached after first fetch so we don't re-fetch on every render

function updateCardBadges(card) {
  const itemId = card.dataset.itemId;
  const itemType = card.dataset.type;

  const isCompleted = (userHistory || []).some(
    (h) =>
      String(h.itemId) === String(itemId) &&
      h.type === itemType &&
      h.status === "completed"
  );
  const completedBadge = card.querySelector(".completed-badge");
  if (completedBadge) completedBadge.style.display = isCompleted ? "flex" : "none";

  // Reuses userWatchlist (already kept in sync live by handleWatchlistClick)
  // rather than a separate fetch, so this badge never goes stale after an
  // add/remove without needing a page reload.
  const isInWatchlist = userWatchlist.some(
    (w) => String(w.itemId) === String(itemId) && w.type === itemType
  );
  const watchlistBadge = card.querySelector(".watchlist-badge");
  if (watchlistBadge) watchlistBadge.style.display = isInWatchlist ? "flex" : "none";
}

async function initializeHistoryBadges() {
  try {
    if (userHistory === null) {
      const response = await fetch("/api/history", { credentials: "include" });
      userHistory = response.ok ? await response.json() : [];
    }

    document.querySelectorAll(".card-custom").forEach(updateCardBadges);
  } catch (error) {
    console.error("❌ Error initializing history badges:", error);
  }
}
async function trackItemClickAndNavigate(
  itemId,
  itemTitle,
  itemType,
  linkElement
) {
  await trackItemClick(itemId, itemTitle, itemType);
  window.location.href = linkElement.href;
}

async function trackItemClick(itemId, itemTitle, itemType) {
  const itemData = findItemById(itemId);
  const clickedItem = {
    id: itemId,
    title: itemTitle,
    type: itemType,
    genres: itemData?.genres || [],
  };
  await saveUserInteraction("item clicked", { clickedItem });
}

function renderPagination(totalPages) {
  const paginationContainer = document.getElementById("pagination");
  paginationContainer.innerHTML = "";

  const maxVisiblePages = 5;
  let html = "";

  // Previous
  html += `
    <li class="page-item ${currentPage === 1 ? "disabled" : ""}">
      <button class="page-link" onclick="changePage(${
        currentPage - 1
      })">Previous</button>
    </li>
  `;

  let pages = [];

  if (totalPages <= maxVisiblePages) {
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
  } else {
    pages.push(1);
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    if (start > 2) pages.push("...");
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages - 1) pages.push("...");
    pages.push(totalPages);
  }

  pages.forEach((p) => {
    if (p === "...") {
      html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
    } else {
      html += `
        <li class="page-item ${p === currentPage ? "active" : ""}">
          <button class="page-link" onclick="changePage(${p})">${p}</button>
        </li>
      `;
    }
  });

  // Next
  html += `
    <li class="page-item ${currentPage === totalPages ? "disabled" : ""}">
      <button class="page-link" onclick="changePage(${
        currentPage + 1
      })">Next</button>
    </li>
  `;

  paginationContainer.innerHTML = html;
}

function changePage(pageNumber) {
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  if (pageNumber < 1 || pageNumber > totalPages) return;
  currentPage = pageNumber;
  renderCards(currentPage);
  renderPagination(totalPages);
}

function filter(type, btn) {
  document
    .querySelectorAll(".filter-buttons .btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  btn.dataset.type = type;
  currentPage = 1;
  applyFilters();
}

function applyFilters() {
  const activeBtn = document.querySelector(".filter-buttons .active");
  const type = activeBtn?.dataset.type || "all";
  const genre = document.getElementById("genreSelect").value;
  const rating = document.getElementById("ratingSelect").value;

  let base = [...searchResults];

  if (type === "movie") {
    base = base.filter((item) => item.type === "movie");
  } else if (type === "book") {
    base = base.filter((item) => item.type === "book");
  }

  if (genre !== "All Genres") {
    base = base.filter((item) => item.genres?.includes(genre));
  }

  if (rating !== "Any Rating") {
    const threshold = parseFloat(rating.split("+")[0]);
    base = base.filter((item) => parseFloat(item.rating) >= threshold);
  }

  filteredData = [...base];
  renderCards(currentPage);
  renderPagination(Math.ceil(filteredData.length / itemsPerPage));
}

function updateGenreFilter(genres) {
  const genreSelect = document.getElementById("genreSelect");
  genreSelect.innerHTML = `<option>All Genres</option>`;
  genres.forEach((g) => {
    genreSelect.innerHTML += `<option>${g}</option>`;
  });
}

function updateRatingFilter() {
  const ratingSelect = document.getElementById("ratingSelect");
  ratingSelect.innerHTML = `<option>Any Rating</option>`;
  const steps = [
    9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6, 5.5, 5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1,
  ];
  steps.forEach((r) => {
    ratingSelect.innerHTML += `<option>${r}+ Stars</option>`;
  });
}

let userWatchlist = []; // Global variable to track watchlist items

async function handleWatchlistClick(event) {
  event.preventDefault();
  event.stopPropagation();

  const button = event.currentTarget;
  const itemId = button.dataset.id;
  const itemType = button.dataset.type;
  const isAdded = button.classList.contains("added");

  // Show loading state
  const originalHtml = button.innerHTML;
  button.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;
  button.disabled = true;

  try {
    // First check if user is logged in
    const userId = await getCurrentUserId();
    if (!userId) {
      showAlert("Please log in to add items to your watchlist", "warning");
      window.location.href = `/account/login?redirect=${encodeURIComponent(
        window.location.pathname
      )}`;
      return;
    }

    const itemData = findItemById(itemId);
    if (!itemData) {
      throw new Error("Item data not found");
    }

    const watchlistData = {
      itemId,
      type: itemType,
      title: itemData.title || "",
      image: itemData.image || "",
      rating: itemData.rating || 0,
      genres: itemData.genres || [],
      synopsis:
        itemData.synopsis || itemData.description || "No synopsis available",
    };

    // Make API call
    const response = await fetch("/api/watchlist/add", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      credentials: "include",
      body: JSON.stringify(watchlistData),
    });

    // Handle different response statuses
    if (response.status === 404) {
      console.error("❌ Watchlist endpoint not found");
      showAlert(
        "Watchlist feature is currently unavailable. Please try again later.",
        "error"
      );
      return;
    }

    if (response.status === 401) {
      showAlert("Your session has expired. Please log in again.", "warning");
      window.location.href = `/account/login?redirect=${encodeURIComponent(
        window.location.pathname
      )}`;
      return;
    }

    if (response.status === 409) {
      // Item already exists - handle gracefully
      showAlert(`"${itemData.title}" is already in your watchlist!`, "info");
      // Update UI to reflect current state
      button.classList.add("added");
      button.innerHTML = `<i class="bi bi-check-circle me-1"></i> Added`;
      return;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Watchlist error response:", errorText);

      // Try to parse error message
      let errorMessage = "Failed to update watchlist";
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch (e) {
        // If not JSON, use the text as is or default message
        errorMessage = errorText || errorMessage;
      }

      throw new Error(`${errorMessage} (Status: ${response.status})`);
    }

    // Parse successful response
    const result = await response.json();

    const card = button.closest(".card-custom");

    // Handle different actions returned from server
    if (result.action === "removed") {
      userWatchlist = userWatchlist.filter(
        (item) => !(item.itemId === itemId && item.type === itemType)
      );
      button.classList.remove("added");
      button.innerHTML = `<i class="bi bi-plus-circle me-1"></i> Watchlist`;
      showAlert(`"${itemData.title}" removed from watchlist`, "success");
    } else if (result.action === "added") {
      // Check if item already exists before adding to local array
      if (
        !userWatchlist.some(
          (item) => item.itemId === itemId && item.type === itemType
        )
      ) {
        userWatchlist.push(watchlistData);
      }
      button.classList.add("added");
      button.innerHTML = `<i class="bi bi-check-circle me-1"></i> Added`;
      showAlert(`"${itemData.title}" added to watchlist!`, "success");

      // The server requires title/rating/type/detailURL; genres are what
      // the recommendation engine actually learns from.
      await saveUserInteraction("add to watchlist", {
        itemDetails: {
          id: itemId,
          title: itemData.title,
          rating: String(itemData.rating ?? "N/A"),
          image: itemData.image || "",
          type: itemType,
          detailURL: `/${itemType}_detail/${itemId}`,
          genres: itemData.genres || [],
        },
      });
    } else if (result.action === "already_exists") {
      // Handle case where server reports item already exists
      showAlert(`"${itemData.title}" is already in your watchlist!`, "info");
      button.classList.add("added");
      button.innerHTML = `<i class="bi bi-check-circle me-1"></i> Added`;

      // Ensure local array is in sync
      if (
        !userWatchlist.some(
          (item) => item.itemId === itemId && item.type === itemType
        )
      ) {
        userWatchlist.push(watchlistData);
      }
    } else {
      // Unknown action
      console.warn("Unknown action returned from server:", result.action);
      showAlert("Watchlist updated successfully", "success");
    }

    if (card) updateCardBadges(card);
  } catch (err) {
    console.error("Watchlist error:", err);

    // Handle different types of errors
    if (err.message.includes("401") || err.message.includes("unauthorized")) {
      showAlert("Please log in to use this feature", "warning");
      window.location.href = `/account/login?redirect=${encodeURIComponent(
        window.location.pathname
      )}`;
    } else if (err.message.includes("404")) {
      showAlert(
        "Watchlist feature is currently unavailable. Please contact support.",
        "error"
      );
    } else if (
      err.message.includes("409") ||
      err.message.toLowerCase().includes("already exists")
    ) {
      showAlert("This item is already in your watchlist!", "info");
    } else if (err.message.includes("Network")) {
      showAlert(
        "Network error. Please check your connection and try again.",
        "error"
      );
    } else {
      // Generic error with specific message if available
      const errorMsg =
        err.message || "Unable to update watchlist. Please try again.";
      showAlert(errorMsg, "error");
    }

    // Reset button to original state on error
    button.innerHTML = originalHtml;
  } finally {
    button.disabled = false;
  }
}
function saveSearchHistory(query) {
  if (!query) return;

  let history = JSON.parse(localStorage.getItem("searchHistory")) || [];
  // Avoid duplicates and keep max 5 entries
  history = [query, ...history.filter((q) => q !== query)].slice(0, 5);
  localStorage.setItem("searchHistory", JSON.stringify(history));
}
// Enhanced alert function to show user-friendly messages
function showAlert(message, type = "info") {
  // Remove any existing alerts
  const existingAlert = document.querySelector(".custom-alert");
  if (existingAlert) {
    existingAlert.remove();
  }

  // Create alert element
  const alert = document.createElement("div");
  alert.className = `custom-alert alert-${type}`;

  // Set styles based on type
  const styles = {
    info: {
      bg: "#d1ecf1",
      border: "#bee5eb",
      text: "#0c5460",
      icon: "bi-info-circle",
    },
    success: {
      bg: "#d4edda",
      border: "#c3e6cb",
      text: "#155724",
      icon: "bi-check-circle",
    },
    warning: {
      bg: "#fff3cd",
      border: "#ffeaa7",
      text: "#856404",
      icon: "bi-exclamation-triangle",
    },
    error: {
      bg: "#f8d7da",
      border: "#f5c6cb",
      text: "#721c24",
      icon: "bi-x-circle",
    },
  };

  const style = styles[type] || styles.info;

  alert.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 1050;
    min-width: 300px;
    max-width: 400px;
    padding: 12px 16px;
    background-color: ${style.bg};
    border: 1px solid ${style.border};
    border-radius: 6px;
    color: ${style.text};
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    transform: translateX(100%);
    transition: transform 0.3s ease;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.4;
  `;

  alert.innerHTML = `
    <div style="display: flex; align-items: center;">
      <i class="bi ${style.icon}" style="margin-right: 8px; font-size: 16px;"></i>
      <span style="flex: 1;">${message}</span>
      <button onclick="this.parentElement.parentElement.remove()" 
              style="background: none; border: none; color: ${style.text}; font-size: 18px; cursor: pointer; margin-left: 8px; padding: 0; line-height: 1;">
        ×
      </button>
    </div>
  `;

  document.body.appendChild(alert);

  // Animate in
  setTimeout(() => {
    alert.style.transform = "translateX(0)";
  }, 10);

  // Auto remove after 5 seconds
  setTimeout(() => {
    if (alert.parentNode) {
      alert.style.transform = "translateX(100%)";
      setTimeout(() => {
        if (alert.parentNode) {
          alert.remove();
        }
      }, 300);
    }
  }, 5000);
}
async function initializeWatchlistButtons() {
  try {

    const response = await fetch("/api/watchlist", {
      credentials: "include",
    });

    if (response.ok) {
      userWatchlist = await response.json();

      // Update button states
      document.querySelectorAll(".watchlist-btn").forEach((button) => {
        const itemId = button.dataset.id;
        const itemType = button.dataset.type;

        if (
          userWatchlist.some(
            (item) => item.itemId === itemId && item.type === itemType
          )
        ) {
          button.classList.add("added");
          button.innerHTML = `<i class="bi bi-check-circle me-1"></i> Added`;
        }
      });
    } else if (response.status === 401) {
      // User not logged in - this is normal, don't show error
      userWatchlist = [];
    } else {
      console.warn(
        "Unexpected response when loading watchlist:",
        response.status
      );
    }
  } catch (error) {
    console.error("❌ Error initializing watchlist buttons:", error);
    // Don't show user error for initialization failures
    userWatchlist = [];
  }
}

let liveSearchItems = []; // results from the live search API, kept so watchlist/click handlers can find them
let searchSeq = 0; // ignores responses from an older search that finishes late

const itemKey = (item) => `${item.type}:${item.id}`;

// Search button / Enter: grid matches plus a live TMDB + Google Books search,
// so titles outside the preloaded grid (the ones autocomplete suggests) show up too.
async function runFullSearch() {
  const query = document
    .getElementById("searchInput")
    .value.toLowerCase()
    .trim();
  hideSuggestions();
  currentPage = 1;
  // Every search (even clearing the box) invalidates any live search still in
  // flight, so a slow earlier response can't overwrite the current results.
  const seq = ++searchSeq;
  const loading = document.getElementById("loadingIndicator");
  const container = document.getElementById("mediaContainer");
  loading.style.display = "none";
  container.style.opacity = "1";

  if (query === "") {
    searchResults = [...combined];
    applyFilters();
    return;
  }

  saveUserInteraction("search", { query });
  saveSearchHistory(query);

  const localMatches = combined.filter((item) =>
    item.title.toLowerCase().includes(query)
  );
  if (query.length < 2) {
    searchResults = localMatches;
    applyFilters();
    return;
  }

  loading.style.display = "block";
  container.style.opacity = "0.3";

  let liveResults = [];
  try {
    const response = await fetch(
      `/api/discover/search?full=1&q=${encodeURIComponent(query)}`
    );
    if (response.ok) liveResults = await response.json();
  } catch (err) {
    console.error("❌ Live search failed, showing grid matches only:", err);
  }
  if (seq !== searchSeq) return; // a newer search has started

  const seen = new Set(localMatches.map(itemKey));
  const extra = liveResults.filter((item) => !seen.has(itemKey(item)));
  const known = new Set(liveSearchItems.map(itemKey));
  liveSearchItems.push(...extra.filter((item) => !known.has(itemKey(item))));

  searchResults = [...localMatches, ...extra];
  applyFilters();
  loading.style.display = "none";
  container.style.opacity = "1";
}

document.getElementById("searchBtn").addEventListener("click", runFullSearch);

// --- Search autocomplete ---
let suggestionDebounceTimer = null;
let currentSuggestions = [];
let activeSuggestionIndex = -1;

const searchInputEl = document.getElementById("searchInput");
const suggestionsEl = document.getElementById("searchSuggestions");

function hideSuggestions() {
  suggestionsEl.classList.remove("show");
  suggestionsEl.innerHTML = "";
  currentSuggestions = [];
  activeSuggestionIndex = -1;
}

function renderSuggestions(items) {
  currentSuggestions = items;
  activeSuggestionIndex = -1;

  if (items.length === 0) {
    suggestionsEl.innerHTML = `<div class="search-suggestion-empty">No matches found</div>`;
    suggestionsEl.classList.add("show");
    return;
  }

  const history = userHistory || [];

  suggestionsEl.innerHTML = items
    .map((item, index) => {
      const isMovie = item.type === "movie";
      const detailUrl = isMovie
        ? `/movie_detail/${item.id}`
        : `/book_detail/${item.id}`;
      const isCompleted = history.some(
        (h) =>
          String(h.itemId) === String(item.id) &&
          h.type === item.type &&
          h.status === "completed"
      );
      const isInWatchlist = userWatchlist.some(
        (w) => String(w.itemId) === String(item.id) && w.type === item.type
      );
      const suggestionBadge = isCompleted
        ? `<span class="suggestion-completed-badge" title="${isMovie ? "Watched" : "Read"}"><i class="bi bi-check-circle-fill"></i></span>`
        : isInWatchlist
        ? `<span class="suggestion-watchlist-badge" title="In Watchlist"><i class="bi bi-bookmark-check-fill"></i></span>`
        : "";
      return `
        <a href="${detailUrl}" class="search-suggestion-item" data-index="${index}">
          <div class="search-suggestion-thumb">
            <img src="${item.image}" alt="${item.title}" loading="lazy" />
            ${suggestionBadge}
          </div>
          <div class="search-suggestion-info">
            <div class="search-suggestion-title">${item.title}</div>
            <div class="search-suggestion-meta">
              <span class="badge">${isMovie ? "Movie" : "Book"}</span>
              <span>${item.subtitle || ""}</span>
            </div>
          </div>
        </a>
      `;
    })
    .join("");

  suggestionsEl.classList.add("show");

  suggestionsEl.querySelectorAll(".search-suggestion-item").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      selectSuggestion(parseInt(el.dataset.index, 10));
    });
  });
}

function selectSuggestion(index) {
  const item = currentSuggestions[index];
  if (!item) return;

  saveSearchHistory(item.title);
  saveUserInteraction("item clicked", {
    clickedItem: {
      id: item.id,
      title: item.title,
      type: item.type,
      genres: item.genres || [],
    },
  });

  const detailUrl =
    item.type === "movie"
      ? `/movie_detail/${item.id}`
      : `/book_detail/${item.id}`;
  hideSuggestions();
  window.location.href = detailUrl;
}

function updateActiveSuggestion(items) {
  items.forEach((el, i) => {
    el.classList.toggle("active", i === activeSuggestionIndex);
  });
  const activeEl = items[activeSuggestionIndex];
  if (activeEl) {
    activeEl.scrollIntoView({ block: "nearest" });
  }
}

async function fetchSuggestions(query) {
  try {
    suggestionsEl.innerHTML = `<div class="search-suggestion-loading">Searching...</div>`;
    suggestionsEl.classList.add("show");

    const response = await fetch(
      `/api/discover/search?q=${encodeURIComponent(query)}`
    );
    if (!response.ok) throw new Error("Search request failed");
    const items = await response.json();

    // Ignore stale responses if the input has since changed
    if (searchInputEl.value.trim().toLowerCase() !== query.toLowerCase()) {
      return;
    }

    renderSuggestions(items);
  } catch (err) {
    console.error("❌ Autocomplete search failed:", err);
    suggestionsEl.innerHTML = `<div class="search-suggestion-empty">Something went wrong</div>`;
  }
}

searchInputEl.addEventListener("input", () => {
  const query = searchInputEl.value.trim();
  clearTimeout(suggestionDebounceTimer);

  if (query.length < 2) {
    hideSuggestions();
    return;
  }

  suggestionDebounceTimer = setTimeout(() => fetchSuggestions(query), 250);
});

searchInputEl.addEventListener("keydown", (e) => {
  const items = Array.from(
    suggestionsEl.querySelectorAll(".search-suggestion-item")
  );

  if (e.key === "ArrowDown" && items.length > 0) {
    e.preventDefault();
    activeSuggestionIndex = (activeSuggestionIndex + 1) % items.length;
    updateActiveSuggestion(items);
  } else if (e.key === "ArrowUp" && items.length > 0) {
    e.preventDefault();
    activeSuggestionIndex =
      (activeSuggestionIndex - 1 + items.length) % items.length;
    updateActiveSuggestion(items);
  } else if (e.key === "Enter") {
    if (activeSuggestionIndex >= 0 && currentSuggestions[activeSuggestionIndex]) {
      e.preventDefault();
      selectSuggestion(activeSuggestionIndex);
    } else {
      runFullSearch();
    }
  } else if (e.key === "Escape") {
    hideSuggestions();
  }
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-wrapper")) {
    hideSuggestions();
  }
});

document.getElementById("genreSelect").addEventListener("change", () => {
  const selectedGenre = document.getElementById("genreSelect").value;
  currentPage = 1;
  applyFilters();
  if (selectedGenre !== "All Genres") {
    saveUserInteraction("filter genre", { genre: selectedGenre });
  }
});

document.getElementById("ratingSelect").addEventListener("change", () => {
  const selectedRating = document.getElementById("ratingSelect").value;
  currentPage = 1;
  applyFilters();
  if (selectedRating !== "Any Rating") {
    saveUserInteraction("filter rating", { rating: selectedRating });
  }
});

window.onload = () => {
  fetchData();
  initializeWatchlistButtons();
};

async function saveUserInteraction(interactionType, payload = {}) {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.warn("Cannot save interaction: No user ID available");
    return;
  }
  const data = {
    userId,
    interactionType,
    timestamp: new Date().toISOString(),
    ...payload,
  };
  try {
    const response = await fetch("/api/interactions/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "❌ Server responded with error:",
        response.status,
        errorText
      );
      throw new Error(`Server error: ${response.status}`);
    }
  } catch (err) {
    console.error("Failed to save interaction:", err.message);
  }
}
