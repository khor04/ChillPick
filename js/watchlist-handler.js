// Watchlist functionality for detail pages
document.addEventListener("DOMContentLoaded", function () {

  // Check if user is logged in
  if (!currentUser) {
    return;
  }

  // Get the watchlist button
  const watchlistBtn =
    document.getElementById("btnWatchlist") ||
    document.getElementById("btnBooklist");

  if (!watchlistBtn) {
    return;
  }

  // Initialize button state
  initializeWatchlistButton();

  // Add click event listener
  watchlistBtn.addEventListener("click", handleWatchlistClick);

  /**
   * Initialize the watchlist button state
   */
  async function initializeWatchlistButton() {
    try {

      // Get current item data
      const itemData = getCurrentItemData();
      if (!itemData) {
        return;
      }

      // Check if item is in watchlist
      const isInWatchlist = await checkWatchlistStatus(
        itemData.itemId,
        itemData.type
      );
      updateButtonState(isInWatchlist);
    } catch (error) {
      console.error("❌ Error initializing watchlist button:", error);
    }
  }

  /**
   * Handle watchlist button click
   */
  async function handleWatchlistClick(event) {
    event.preventDefault();

    try {
      // Disable button during request
      watchlistBtn.disabled = true;
      watchlistBtn.innerHTML =
        '<i class="bi bi-hourglass-split"></i> Loading...';

      // Get current item data
      const itemData = getCurrentItemData();
      if (!itemData) {
        throw new Error("Could not get item data");
      }

      // Make API call
      const response = await fetch("/api/watchlist/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(itemData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to update watchlist");
      }

      // Update button state
      const isInWatchlist = result.action === "added";
      updateButtonState(isInWatchlist);

      // Show success message
      showToast(result.message, "success");
    } catch (error) {
      console.error("❌ Watchlist error:", error);
      showToast(error.message || "Failed to update watchlist", "error");

      // Reset button on error
      updateButtonState(false);
    } finally {
      // Re-enable button
      watchlistBtn.disabled = false;
    }
  }

  /**
   * Get current item data from the page
   */
  function getCurrentItemData() {
    try {

      // Method 1: Check URL path
      const path = window.location.pathname;

      if (path.includes("/movie_detail/")) {
        return getMovieData();
      }

      if (path.includes("/book_detail/")) {
        return getBookData();
      }

      // Method 2: Check for specific elements and data attributes
      const movieIdAttr = document.body.getAttribute("data-movie-id");
      if (movieIdAttr) {
        return getMovieData();
      }

      // Method 3: Check for global variables (from EJS templates)
      if (typeof movie !== "undefined" && movie) {
        return getMovieDataFromGlobal();
      }

      if (typeof book !== "undefined" && book) {
        return getBookDataFromGlobal();
      }

      // Method 4: Check for specific button IDs
      if (document.getElementById("btnWatchlist")) {
        return getMovieData();
      }

      if (document.getElementById("btnBooklist")) {
        return getBookData();
      }

      // Method 5: Look for specific page elements
      const filmIcon = document.querySelector(".bi-film");
      const bookIcon = document.querySelector(".bi-book");

      if (filmIcon) {
        return getMovieData();
      }

      if (bookIcon) {
        return getBookData();
      }

      return null;
    } catch (error) {
      console.error("❌ Error getting item data:", error);
      return null;
    }
  }

  /**
   * Get movie data from the page DOM
   */
  function getMovieData() {
    try {
      // Try to get movie ID from URL first
      const pathParts = window.location.pathname.split("/");
      const movieId =
        pathParts[pathParts.length - 1] ||
        document.body.getAttribute("data-movie-id");

      if (!movieId) {
        return null;
      }

      // Get title
      const titleElement =
        document.querySelector("h1") || document.querySelector(".movie-title");
      const title = titleElement
        ? titleElement.textContent.trim()
        : "Unknown Movie";

      // Get poster image
      const posterElement =
        document.querySelector(".col-md-4 img") ||
        document.querySelector(".movie-poster") ||
        document.querySelector('img[alt*="poster"]');
      const poster = posterElement
        ? posterElement.src
        : "/images/default-movie.jpg";

      // Get rating - look for various rating displays
      let rating = null;
      const ratingElements = document.querySelectorAll(
        'h5, .rating, [class*="rating"]'
      );
      for (const element of ratingElements) {
        const text = element.textContent;
        const match = text.match(/(\d+\.?\d*)\s*\/\s*10/);
        if (match) {
          rating = (parseFloat(match[1]) / 2).toFixed(1); // Convert to 5-point scale
          break;
        }
      }

      // Get genres - look for badges or genre indicators
      const genreElements = document.querySelectorAll(
        '.badge, .genre-tag, [class*="genre"]'
      );
      const genres = Array.from(genreElements)
        .map((el) => el.textContent.trim())
        .filter(
          (text) => text && !text.includes("Movie") && !text.includes("Film")
        );

      // Get synopsis
      const synopsisElement =
        document.querySelector(".lead") ||
        document.querySelector(".overview") ||
        document.querySelector(".synopsis") ||
        document.querySelector('p[class*="description"]');
      const synopsis = synopsisElement
        ? synopsisElement.textContent.trim()
        : "No synopsis available";

      return {
        itemId: movieId,
        type: "movie",
        title: title,
        image: poster,
        rating: rating,
        genres: genres,
        synopsis: synopsis,
      };
    } catch (error) {
      console.error("❌ Error extracting movie data:", error);
      return null;
    }
  }

  /**
   * Get movie data from global variable (if available)
   */
  function getMovieDataFromGlobal() {
    try {
      if (typeof movie === "undefined") {
        return getMovieData(); // Fallback to DOM extraction
      }

      return {
        itemId: movie.id.toString(),
        type: "movie",
        title: movie.title || "Unknown Movie",
        image: movie.poster_path || "/images/default-movie.jpg",
        rating: movie.vote_average ? (movie.vote_average / 2).toFixed(1) : null,
        genres: movie.genres ? movie.genres.map((g) => g.name) : [],
        synopsis: movie.overview || "No synopsis available",
      };
    } catch (error) {
      console.error("❌ Error getting movie data from global:", error);
      return getMovieData(); // Fallback to DOM extraction
    }
  }

  /**
   * Get book data from the page DOM
   */
  function getBookData() {
    try {
      // Try to get book ID from URL first
      const pathParts = window.location.pathname.split("/");
      const bookId = pathParts[pathParts.length - 1];

      if (!bookId) {
        return null;
      }

      // Get title
      const titleElement =
        document.querySelector("h1") || document.querySelector(".book-title");
      const title = titleElement
        ? titleElement.textContent.trim()
        : "Unknown Book";

      // Get book image
      const imageElement =
        document.querySelector(".col-md-4 img") ||
        document.querySelector(".book-cover") ||
        document.querySelector('img[alt*="cover"]');
      const image = imageElement
        ? imageElement.src
        : "/images/default-book.jpg";

      // Get rating
      let rating = null;
      const ratingElements = document.querySelectorAll(
        'h5, .rating, [class*="rating"]'
      );
      for (const element of ratingElements) {
        const text = element.textContent;
        const match = text.match(/(\d+\.?\d*)\s*\/\s*5/);
        if (match) {
          rating = parseFloat(match[1]).toFixed(1);
          break;
        }
      }

      // Get genres/categories
      const genreElements = document.querySelectorAll(
        '.badge, .category-tag, [class*="category"]'
      );
      const genres = Array.from(genreElements)
        .map((el) => el.textContent.trim())
        .filter((text) => text && !text.includes("Book"));

      // Get description
      const descriptionElement =
        document.querySelector(".lead") ||
        document.querySelector(".description") ||
        document.querySelector('p[class*="description"]');
      const synopsis = descriptionElement
        ? descriptionElement.textContent.trim()
        : "No description available";

      return {
        itemId: bookId,
        type: "book",
        title: title,
        image: image,
        rating: rating,
        genres: genres,
        synopsis: synopsis,
      };
    } catch (error) {
      console.error("❌ Error extracting book data:", error);
      return null;
    }
  }

  /**
   * Get book data from global variable (if available)
   */
  function getBookDataFromGlobal() {
    try {
      if (typeof book === "undefined") {
        return getBookData(); // Fallback to DOM extraction
      }

      const bookData = book.volumeInfo || book;

      return {
        itemId: book.id,
        type: "book",
        title: bookData.title || "Unknown Title",
        image: bookData.imageLinks?.thumbnail || "/images/default-book.jpg",
        rating: bookData.averageRating || null,
        genres: bookData.categories || [],
        synopsis: bookData.description || "No description available",
      };
    } catch (error) {
      console.error("❌ Error getting book data from global:", error);
      return getBookData(); // Fallback to DOM extraction
    }
  }

  /**
   * Check if item is in watchlist
   */
  async function checkWatchlistStatus(itemId, type) {
    try {
      const response = await fetch("/api/watchlist");
      if (!response.ok) {
        throw new Error("Failed to fetch watchlist");
      }

      const watchlist = await response.json();
      return watchlist.some(
        (item) => item.itemId === itemId && item.type === type
      );
    } catch (error) {
      console.error("❌ Error checking watchlist status:", error);
      return false;
    }
  }

  /**
   * Update button appearance based on watchlist status
   */
  function updateButtonState(isInWatchlist) {
    watchlistBtn.classList.remove(
      "btn-outline-primary",
      "btn-warning",
      "btn-outline-warning"
    );

    if (isInWatchlist) {
      watchlistBtn.innerHTML = '<i class="bi bi-check-lg"></i> In Watchlist';
    } else {
      watchlistBtn.innerHTML = '<i class="bi bi-plus-lg"></i> Add to Watchlist';
    }

    watchlistBtn.classList.add("btn-outline-warning", "text-dark");
  }

  /**
   * Show toast notification
   */
  function showToast(message, type = "info") {
    // Create toast element
    const toastContainer =
      document.getElementById("toast-container") || createToastContainer();

    const toastId = "toast-" + Date.now();
    const toastClass =
      type === "success"
        ? "bg-success"
        : type === "error"
        ? "bg-danger"
        : "bg-info";

    const toastHTML = `
            <div id="${toastId}" class="toast ${toastClass} text-white" role="alert" aria-live="assertive" aria-atomic="true">
                <div class="toast-header ${toastClass} text-white border-0">
                    <i class="bi bi-${
                      type === "success"
                        ? "check-circle"
                        : type === "error"
                        ? "exclamation-circle"
                        : "info-circle"
                    } me-2"></i>
                    <strong class="me-auto">Watchlist</strong>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast"></button>
                </div>
                <div class="toast-body">
                    ${message}
                </div>
            </div>
        `;

    toastContainer.insertAdjacentHTML("beforeend", toastHTML);

    // Initialize and show toast
    const toastElement = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastElement);
    toast.show();

    // Remove toast element after it's hidden
    toastElement.addEventListener("hidden.bs.toast", () => {
      toastElement.remove();
    });
  }

  /**
   * Create toast container if it doesn't exist
   */
  function createToastContainer() {
    const container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container position-fixed bottom-0 end-0 p-3";
    container.style.zIndex = "1050";
    document.body.appendChild(container);
    return container;
  }
});
