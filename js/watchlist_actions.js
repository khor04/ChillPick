// Watchlist Actions JavaScript
document.addEventListener("DOMContentLoaded", function () {
  document.addEventListener("click", function (e) {
    if (e.target.classList.contains("mark-btn")) {
      handleMarkCompleted(e.target);
    }
  });

  // Handle Remove buttons
  document.addEventListener("click", function (e) {
    if (e.target.classList.contains("remove-btn")) {
      handleRemoveItem(e.target);
    }
  });

  // Handle More buttons (both watchlist and history)
  document.addEventListener("click", function (e) {
    if (e.target.classList.contains("more-btn")) {
      handleMoreButton(e.target);
    }
  });

  // Function to handle More button clicks
  function handleMoreButton(button) {
    try {
      // Check if we're on the watchlist page or history page
      const watchlistItem = button.closest(".watchlist-item");
      const historyItem = button.closest(".history-item");

      let itemType, itemId;

      if (watchlistItem) {
        // Handle watchlist items
        itemType = watchlistItem.getAttribute("data-type");
        itemId = watchlistItem.getAttribute("data-id");
      } else if (historyItem) {
        // Handle history items
        itemType = historyItem.getAttribute("data-type");
        itemId = historyItem.getAttribute("data-id");
      } else {
        throw new Error("Could not find watchlist or history item");
      }

      if (!itemId) {
        throw new Error("Missing item ID");
      }

      // Navigate to appropriate detail page based on type
      if (itemType === "movie") {
        window.location.href = `/movie_detail/${itemId}`;
      } else if (itemType === "book") {
        window.location.href = `/book_detail/${itemId}`;
      } else {
        throw new Error(`Unknown item type: ${itemType}`);
      }
    } catch (error) {
      console.error("Error navigating to details:", error);
      showToast("Error: " + error.message, "error");
    }
  }

  // Function to mark item as completed
  async function handleMarkCompleted(button) {
    try {
      const watchlistItem = button.closest(".watchlist-item");
      if (!watchlistItem) throw new Error("Could not find watchlist item");

      const itemData = extractItemData(watchlistItem);

      if (
        !confirm(
          `Mark "${itemData.title}" as completed? This will move it to your history.`
        )
      )
        return;

      button.disabled = true;
      button.textContent = "Marking...";

      const response = await fetch("/api/watchlist/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: itemData.itemId, type: itemData.type }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        showToast("Item marked as completed and moved to history!", "success");
        watchlistItem.style.transition = "opacity 0.3s ease";
        watchlistItem.style.opacity = "0";
        setTimeout(() => {
          watchlistItem.remove();
          updateEmptyState();
        }, 300);
      } else {
        throw new Error(result.error || "Failed to mark item as completed");
      }
    } catch (error) {
      console.error("Error marking item as completed:", error);
      showToast("Error: " + error.message, "error");
      button.disabled = false;
      button.textContent = "Mark as completed";
    }
  }

  // Function to remove item from watchlist
  async function handleRemoveItem(button) {
    try {
      const watchlistItem = button.closest(".watchlist-item");
      if (!watchlistItem) throw new Error("Could not find watchlist item");

      const itemData = extractItemData(watchlistItem);

      if (!confirm(`Remove "${itemData.title}" from your watchlist?`)) return;

      button.disabled = true;
      button.textContent = "Removing...";

      const response = await fetch("/api/watchlist/remove", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: itemData.itemId, type: itemData.type }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        showToast("Item removed from watchlist!", "success");
        watchlistItem.style.transition = "opacity 0.3s ease";
        watchlistItem.style.opacity = "0";
        setTimeout(() => {
          watchlistItem.remove();
          updateEmptyState();
        }, 300);
      } else {
        throw new Error(result.error || "Failed to remove item");
      }
    } catch (error) {
      console.error("Error removing item:", error);
      showToast("Error: " + error.message, "error");
      button.disabled = false;
      button.textContent = "Remove";
    }
  }

  // Function to extract item data from watchlist item element
  function extractItemData(watchlistItem) {
    const title = watchlistItem.querySelector("h2").textContent.trim();
    const type = watchlistItem.getAttribute("data-type");
    const image = watchlistItem.querySelector(".item-image").src;
    const itemId = watchlistItem.getAttribute("data-id");

    if (!itemId) {
      throw new Error(
        "Missing itemId. Ensure each .watchlist-item has a data-id attribute."
      );
    }

    return { itemId, title, type, image };
  }

  // Function to show toast notification (reusing the existing showToast implementation)
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

  // Function to create toast container if it doesn't exist
  function createToastContainer() {
    const container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container position-fixed bottom-0 end-0 p-3";
    container.style.zIndex = "1050";
    document.body.appendChild(container);
    return container;
  }

  function updateEmptyState() {
    const watchlistItems = document.querySelectorAll(".watchlist-item");
    const container = document.querySelector("main.container");

    if (watchlistItems.length === 0) {
      if (!document.querySelector(".empty-state")) {
        const emptyState = document.createElement("div");
        emptyState.className = "empty-state text-center mt-5";
        emptyState.innerHTML = `
                    <div class="empty-icon mb-3">
                        <i class="bi bi-bookmark-heart" style="font-size: 4rem; color: #6c757d;"></i>
                    </div>
                    <h3 class="text-muted">Your watchlist is empty</h3>
                    <p class="text-muted">Start adding movies and books to keep track of what you want to watch or read!</p>
                    <a href="/discover" class="btn btn-primary">Discover Content</a>
                `;
        const filterWrapper = document.querySelector(".filter-wrapper");
        if (filterWrapper) {
          filterWrapper.insertAdjacentElement("afterend", emptyState);
        } else {
          container.appendChild(emptyState);
        }
      }
    }
  }
});
