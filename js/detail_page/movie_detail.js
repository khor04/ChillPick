document.addEventListener("DOMContentLoaded", () => {
  const getMovieIdFromUrl = () => {
    const pathParts = window.location.pathname
      .split("/")
      .filter((part) => part.length > 0);
    const movieDetailIndex = pathParts.findIndex(
      (part) => part === "movie_detail" || part === "movies"
    );
    if (movieDetailIndex !== -1 && pathParts[movieDetailIndex + 1]) {
      return pathParts[movieDetailIndex + 1];
    }
    return pathParts[pathParts.length - 1];
  };

  const movieId = getMovieIdFromUrl();

  let currentPage = 1;
  let selectedRating = 0;
  let isLoading = false;
  let currentUserData = null;
  let userLikedReviews = []; // Track user's liked reviews from session

  const loadMoreBtn = document.querySelector(".load-more-reviews-btn");

  const checkAuthStatus = async () => {
    try {
      if (typeof currentUser !== "undefined" && currentUser && currentUser.id) {
        currentUserData = currentUser;
        return true;
      }

      const response = await fetch("/movie_detail/check-session", {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-cache",
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.isLoggedIn && data.user && data.user.id) {
          currentUserData = data.user;
          userLikedReviews = data.likedReviews || []; // Get liked reviews from session
          return true;
        }
      }

      currentUserData = null;
      userLikedReviews = [];
      return false;
    } catch (error) {
      console.error("Auth check failed:", error);
      currentUserData = null;
      userLikedReviews = [];
      return false;
    }
  };

  const setupReviewForm = () => {
    const reviewForm = document.getElementById("reviewForm");
    const writeReviewBtn = document.getElementById("writeReviewBtn");
    const ratingStars = document.querySelectorAll("#ratingInput i");
    const textarea = reviewForm?.querySelector("textarea");
    const submitButton = reviewForm?.querySelector('button[type="submit"]');
    const spoilerCheckbox = document.getElementById("confirmRatingCheck");

    if (
      !reviewForm ||
      !writeReviewBtn ||
      !ratingStars ||
      !textarea ||
      !submitButton
    ) {
      console.error("Review form elements not found");
      return;
    }

    writeReviewBtn.addEventListener("click", async () => {
      writeReviewBtn.textContent = "Checking...";
      writeReviewBtn.disabled = true;

      try {
        const isAuthenticated = await checkAuthStatus();
        if (!isAuthenticated) {
          if (
            confirm(
              "You need to be logged in to write a review. Go to login page?"
            )
          ) {
            window.location.href =
              "/account/login?redirect=" +
              encodeURIComponent(window.location.pathname);
          }
          return;
        }

        reviewForm.classList.toggle("d-none");
      } catch (error) {
        console.error("Error checking auth:", error);
        alert("Something went wrong. Please refresh the page.");
      } finally {
        writeReviewBtn.textContent = "Write a Review";
        writeReviewBtn.disabled = false;
      }
    });

    ratingStars.forEach((star, index) => {
      star.addEventListener("click", () => {
        selectedRating = index + 1;
        updateStarDisplay();
      });

      star.addEventListener("mouseenter", () => {
        highlightStars(index + 1);
      });
    });

    document
      .getElementById("ratingInput")
      .addEventListener("mouseleave", () => {
        updateStarDisplay();
      });

    submitButton.addEventListener("click", async (e) => {
      e.preventDefault();

      if (selectedRating === 0) {
        alert("Please select a rating");
        return;
      }
      if (!textarea.value.trim()) {
        alert("Please write your review");
        return;
      }
      if (!movieId) {
        alert("Movie ID is missing");
        return;
      }

      try {
        submitButton.disabled = true;
        submitButton.textContent = "Submitting...";

        const isAuthenticated = await checkAuthStatus();
        if (!isAuthenticated) {
          alert("Your session has expired. Please log in again.");
          window.location.href =
            "/account/login?redirect=" +
            encodeURIComponent(window.location.pathname);
          return;
        }

        const reviewData = {
          movieId: movieId,
          rating: selectedRating,
          comment: textarea.value.trim(),
          spoiler: spoilerCheckbox?.checked || false,
        };

        const response = await fetch("/movie_detail/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(reviewData),
        });

        const result = await response.json();

        if (response.ok && result.success) {
          alert("Review submitted successfully!");
          reviewForm.classList.add("d-none");
          textarea.value = "";
          selectedRating = 0;
          if (spoilerCheckbox) spoilerCheckbox.checked = false;
          updateStarDisplay();

          const container = document.getElementById("reviewsContainer");
          if (container) container.innerHTML = "";
          currentPage = 1;
          loadReviews(1, true);
        } else {
          throw new Error(result.message || "Submission failed");
        }
      } catch (error) {
        console.error("Submit error:", error);
        alert(error.message || "Error submitting review");
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Submit Review";
      }
    });

    const highlightStars = (rating) => {
      ratingStars.forEach((star, index) => {
        star.style.color = index < rating ? "#ffc107" : "#ddd";
      });
    };

    const updateStarDisplay = () => {
      highlightStars(selectedRating);
    };

    updateStarDisplay();
  };
  const displayNoReviews = () => {
    const container = document.getElementById("reviewsContainer");
    const loadMoreBtn = document.querySelector(".load-more-reviews-btn");

    if (container) {
      container.innerHTML = `
            <div class="alert alert-info text-center">
                <h5>No reviews yet</h5>
                <p>Be the first to review this movie!</p>
            </div>
        `;
    }

    if (loadMoreBtn) {
      loadMoreBtn.style.display = "none"; 
    }
  };

  const displayReviews = (reviews) => {
    const container = document.getElementById("reviewsContainer");
    if (!container) return;

    reviews.forEach((review) => {
      const reviewHTML = createReviewHTML(review);
      container.insertAdjacentHTML("beforeend", reviewHTML);
    });
  };
  const createReviewHTML = (review) => {

    const reviewDate = new Date(review.createdAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    const username = review.username || review.user?.username || "Anonymous";
    const rating = review.rating || 0;
    const comment = review.comment || "";
    const spoiler = review.spoiler || false;
    const reviewId = review.id || review._id || "";
    const likeCount = review.likeCount || 0;

    // Generate replies HTML if replies exist
    let repliesHTML = "";
    if (review.replies && review.replies.length > 0) {
      repliesHTML = review.replies
        .map((reply) => createReplyHTML(reply))
        .join("");
    }

    return `
            <div class="card mb-3 review-card" data-review-id="${reviewId}">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <div>
                            <strong>${escapeHtml(username)}</strong>
                            <div class="rating-stars text-warning small">
                                ${"★".repeat(rating)}${"☆".repeat(5 - rating)}
                            </div>
                        </div>
                        <div class="d-flex align-items-center">
                            <small class="text-muted me-2">${reviewDate}</small>
                            ${
                              spoiler
                                ? '<button class="btn btn-sm btn-outline-secondary eye-btn" title="Show Spoiler"><i class="bi bi-eye"></i></button>'
                                : ""
                            }
                        </div>
                    </div>
                    <div class="review-content ${
                      spoiler ? "blurred-content" : ""
                    }">
                        <p class="card-text">${escapeHtml(comment)}</p>
                    </div>
                    <div class="review-actions mt-3 d-flex gap-3">
                        <button class="btn btn-sm like-btn ${
                          review.isLiked ? "text-danger" : "btn-outline-primary"
                        }" 
        data-review-id="${reviewId}" 
        data-liked="${review.isLiked}">
  <i class="bi ${review.isLiked ? "bi-heart-fill" : "bi-heart"}"></i>
  <span class="like-count">${likeCount}</span>
</button>
                        <button class="btn btn-sm btn-outline-secondary reply-btn">
                            <i class="bi bi-reply"></i> Reply
                        </button>
                    </div>
                    <div class="reply-form mt-3" style="display: none;">
                        <div class="mb-2">
                            <textarea class="form-control reply-textarea" rows="2" placeholder="Write your reply..."></textarea>
                        </div>
                        <div class="d-flex gap-2">
                            <button class="btn btn-sm btn-primary reply-submit-btn">Submit</button>
                            <button class="btn btn-sm btn-secondary reply-cancel-btn">Cancel</button>
                        </div>
                    </div>
                    <div class="replies-section mt-3">${repliesHTML}</div>
                </div>
            </div>
        `;
  };

  const setupEventDelegation = () => {
    const container = document.getElementById("reviewsContainer");
    if (!container) return;

    // Handle spoiler toggle
    container.addEventListener("click", function (e) {
      const eyeBtn = e.target.closest(".eye-btn");
      if (eyeBtn) {
        e.preventDefault();
        e.stopPropagation();

        const reviewCard = eyeBtn.closest(".review-card");
        const contentBox = reviewCard.querySelector(".blurred-content");
        const icon = eyeBtn.querySelector("i");

        if (contentBox && icon) {
          contentBox.classList.toggle("show-content");

          if (contentBox.classList.contains("show-content")) {
            icon.className = "bi bi-eye-slash";
            eyeBtn.title = "Hide Spoiler";
          } else {
            icon.className = "bi bi-eye";
            eyeBtn.title = "Show Spoiler";
          }
        }
      }
    });

    // Handle like button click - Updated to properly sync with database
    container.addEventListener("click", async function (e) {
      const likeBtn = e.target.closest(".like-btn");
      if (likeBtn) {
        e.preventDefault();
        e.stopPropagation();

        if (likeBtn.disabled || likeBtn.classList.contains("processing"))
          return;

        const reviewCard = likeBtn.closest(".review-card");
        if (!reviewCard) return;

        const reviewId =
          reviewCard.dataset.reviewId ||
          reviewCard.getAttribute("data-review-id");
        const countSpan = likeBtn.querySelector(".like-count");
        const heartIcon = likeBtn.querySelector("i");

        if (!reviewId || !countSpan || !heartIcon) {
          console.error("Missing required elements for like functionality");
          return;
        }

        const isAuthenticated = await checkAuthStatus();
        if (!isAuthenticated) {
          alert("You need to be logged in to like reviews");
          return;
        }

        likeBtn.disabled = true;
        likeBtn.classList.add("processing");

        const originalCount = parseInt(countSpan.textContent) || 0;
        const wasLiked =
          likeBtn.classList.contains("liked") ||
          likeBtn.dataset.liked === "true";

        // Optimistic UI update
        const newCount = wasLiked
          ? Math.max(0, originalCount - 1)
          : originalCount + 1;
        countSpan.textContent = newCount;

        if (wasLiked) {
          likeBtn.classList.remove("liked");
          likeBtn.dataset.liked = "false";
          heartIcon.className = "bi bi-heart";
        } else {
          likeBtn.classList.add("liked");
          likeBtn.dataset.liked = "true";
          heartIcon.className = "bi bi-heart-fill text-danger";
        }

        try {
          const response = await fetch(
            `/movie_detail/reviews/${reviewId}/like`,
            {
              method: "POST",
              credentials: "include",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
              },
            }
          );

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const data = await response.json();

          if (data.success) {
            // Update with server response - ensure consistency with database
            const serverCount = parseInt(data.likes) || 0;
            const serverLiked = data.liked;

            countSpan.textContent = serverCount;

            if (serverLiked) {
              likeBtn.classList.add("liked");
              likeBtn.dataset.liked = "true";
              heartIcon.className = "bi bi-heart-fill text-danger";
              // Add to local tracking
              if (!userLikedReviews.includes(reviewId)) {
                userLikedReviews.push(reviewId);
              }
            } else {
              likeBtn.classList.remove("liked");
              likeBtn.dataset.liked = "false";
              heartIcon.className = "bi bi-heart";
              // Remove from local tracking
              userLikedReviews = userLikedReviews.filter(
                (id) => id !== reviewId
              );
            }

            // Animation effect
            likeBtn.style.transform = "scale(1.1)";
            likeBtn.style.transition = "all 0.2s ease";

            setTimeout(() => {
              likeBtn.style.transform = "scale(1)";
              setTimeout(() => {
                likeBtn.style.transition = "";
              }, 200);
            }, 150);

          } else {
            throw new Error(data.message || "Like operation failed");
          }
        } catch (error) {
          console.error("Like request failed:", error);

          // Revert optimistic update on error
          countSpan.textContent = originalCount;

          if (wasLiked) {
            likeBtn.classList.add("liked");
            likeBtn.dataset.liked = "true";
            heartIcon.className = "bi bi-heart-fill text-danger";
          } else {
            likeBtn.classList.remove("liked");
            likeBtn.dataset.liked = "false";
            heartIcon.className = "bi bi-heart";
          }

          alert("Error processing like. Please try again.");
        } finally {
          likeBtn.disabled = false;
          likeBtn.classList.remove("processing");
        }
      }
    });

    // Handle reply button click
    container.addEventListener("click", async function (e) {
      if (e.target.closest(".reply-btn")) {
        e.preventDefault();
        const isAuthenticated = await checkAuthStatus();
        if (!isAuthenticated) {
          alert("You need to be logged in to reply to reviews");
          return;
        }

        const reviewCard = e.target.closest(".review-card");
        const replyForm = reviewCard.querySelector(".reply-form");

        if (replyForm) {
          replyForm.style.display =
            replyForm.style.display === "none" ? "block" : "none";
          const textarea = replyForm.querySelector(".reply-textarea");
          if (textarea) textarea.focus();
        }
      }
    });

    // Handle reply submission
    container.addEventListener("click", async function (e) {
      if (e.target.closest(".reply-submit-btn")) {
        e.preventDefault();
        const btn = e.target.closest(".reply-submit-btn");
        const reviewCard = btn.closest(".review-card");
        const reviewId = reviewCard.dataset.reviewId;
        const textarea = reviewCard.querySelector(".reply-textarea");
        const repliesSection = reviewCard.querySelector(".replies-section");
        const replyForm = reviewCard.querySelector(".reply-form");

        if (!textarea.value.trim()) {
          alert("Please write a reply");
          return;
        }

        try {
          btn.disabled = true;
          btn.textContent = "Submitting...";

          const response = await fetch("/movie_detail/reviews/reply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              reviewId,
              content: textarea.value.trim(),
            }),
          });

          const result = await response.json();
          if (result.success) {
            const replyHTML = createReplyHTML(result.reply);
            if (repliesSection) {
              repliesSection.insertAdjacentHTML("beforeend", replyHTML);
            }

            textarea.value = "";
            replyForm.style.display = "none";
          } else {
            alert(result.message || "Failed to submit reply");
          }
        } catch (error) {
          console.error("Error submitting reply:", error);
          alert("Error submitting reply. Please try again.");
        } finally {
          btn.disabled = false;
          btn.textContent = "Submit";
        }
      }
    });

    // Handle reply cancellation
    container.addEventListener("click", function (e) {
      if (e.target.closest(".reply-cancel-btn")) {
        e.preventDefault();
        const replyForm = e.target.closest(".reply-form");
        const textarea = replyForm.querySelector(".reply-textarea");
        textarea.value = "";
        replyForm.style.display = "none";
      }
    });
  };

  const createReplyHTML = (reply) => {
    const replyDate = new Date(
      reply.date || reply.createdAt
    ).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    const replyUsername = reply.username || reply.user?.username || "Anonymous";
    const replyContent = reply.text || reply.content || "";

    return `
            <div class="reply-item border-start border-3 border-primary ps-3 mb-2">
                <div class="reply-header d-flex justify-content-between align-items-center mb-1">
                    <span class="reply-author fw-bold text-primary small">${escapeHtml(
                      replyUsername
                    )}</span>
                    <span class="reply-date text-muted small">${replyDate}</span>
                </div>
                <p class="reply-content mb-0 small">${escapeHtml(
                  replyContent
                )}</p>
            </div>
        `;
  };

  const escapeHtml = (text) => {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  };

  const updateLoadMoreButton = (hasMore) => {
    if (!loadMoreBtn) return;
    loadMoreBtn.style.display = hasMore ? "inline-block" : "none";
  };

  // Load reviews function - ensure auth check before displaying reviews
  const loadReviews = async (page = 1, clear = false) => {
    if (isLoading) return;
    isLoading = true;

    const container = document.getElementById("reviewsContainer");
    if (clear && container) container.innerHTML = "";

    try {
      // Ensure we have current user data and liked reviews before loading reviews
      await checkAuthStatus();

      const url = `/movie_detail/reviews/${encodeURIComponent(
        movieId
      )}?page=${page}`;

      const response = await fetch(url, {
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-cache",
        },
      });
      const result = await response.json();

      if (result.success) {
        if (result.reviews && result.reviews.length > 0) {
          displayReviews(result.reviews);
          currentPage = result.page;
          updateLoadMoreButton(result.hasMore);
        } else if (page === 1) {
          displayNoReviews();
        } else {
          updateLoadMoreButton(false);
        }
      } else {
        console.error("Failed to load reviews:", result.message);
        if (page === 1) displayNoReviews();
      }
    } catch (error) {
      console.error("Error loading reviews:", error);
      if (page === 1) displayNoReviews();
    } finally {
      isLoading = false;
    }
  };

  // Load more button handler
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", () => {
      loadReviews(currentPage + 1);
    });
  }

  // Validate movie ID
  if (!movieId || movieId.length === 0) {
    console.error("No movie ID found in URL");
    const container = document.getElementById("reviewsContainer");
    if (container) {
      container.innerHTML = `
                <div class="alert alert-danger text-center">
                    <h5>Error: Unable to load reviews</h5>
                    <p>The movie ID could not be determined from the current URL.</p>
                </div>
            `;
    }
    return;
  }

  // Initialize the page
  checkAuthStatus().then(() => {
    setupReviewForm();
    setupEventDelegation();
    loadReviews(); 
  });
});
