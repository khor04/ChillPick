const express = require("express");
const axios = require("axios");
const router = express.Router();
const Review = require("../models/BookReview");
const User = require("../models/User");
const mongoose = require("mongoose");
const { cached } = require("../services/cache");
const { reviewLimiter } = require("../middleware/rateLimiters");
const { notifyReviewOwner } = require("../services/notificationService");
require("dotenv").config();

const GOOGLE_BOOKS_API_KEY =
  process.env.GOOGLE_BOOKS_API_KEY || "your_api_key_here";
const DETAIL_TTL = 30 * 60 * 1000; // 30 minutes - book metadata barely changes

// Login check used by the detail page script. Returns only what the page
// needs - never the session ID or cookies.
router.get("/check-session", (req, res) => {
  res.json({
    success: true,
    isLoggedIn: !!req.session?.user?.id,
    user: req.session?.user || null,
  });
});

const requireAuth = (req, res, next) => {
  if (req.session?.user?.id) {
    req.user = req.session.user;
    return next();
  }
  res.status(401).json({ success: false, message: "Not logged in" });
};

//Recommendation
async function getBookRecommendations(book) {
  try {
    const MAX_RECOMMENDATIONS = 8;
    const FINAL_RECOMMENDATIONS = 4;

    // 1. Extract and normalize genres from the current book
    const rawCategories = book.volumeInfo?.categories || ["Fiction"];
    const genres = rawCategories
      .flatMap((category) => {
        // Split on common delimiters and normalize
        return category
          .split(/[\/,&\-\|]/)
          .map((g) => g.trim())
          .filter((g) => g.length > 2)
          .map((g) =>
            g
              .toLowerCase()
              .replace(/[^a-z0-9\s]/g, "")
              .trim()
          );
      })
      .filter(
        (genre, index, self) =>
          genre.length > 0 && self.indexOf(genre) === index
      );

    let recommendations = [];
    const seenIds = new Set([book.id]);

    // 2. Search by primary genres first (most relevant).
    // Fire every genre/query-variant search concurrently instead of serially
    // (the old code awaited each one in turn with a 100ms delay between them,
    // which could add several seconds to every book detail page load).
    const primaryGenres = genres.slice(0, 3);

    const genreSearches = primaryGenres.flatMap((genre) => {
      const searchQueries = [
        `subject:"${genre}"`,
        `category:"${genre}"`,
        `"${genre}" books`,
      ];
      // Cached by query string - many different books share genres like
      // "fiction", so this is reused heavily across detail page visits.
      return searchQueries.map((query) =>
        cached(`googlebooks:genreSearch:${query}`, DETAIL_TTL, async () => {
          const res = await axios.get(
            "https://www.googleapis.com/books/v1/volumes",
            {
              params: {
                q: query,
                maxResults: 15,
                orderBy: "relevance",
                key: GOOGLE_BOOKS_API_KEY,
                printType: "books",
                filter: "ebooks",
              },
              timeout: 5000,
            }
          );
          return res.data;
        })
          .then((data) => ({ genre, data }))
          .catch((err) => {
            console.error(`❌ Error searching genre "${genre}":`, err.message);
            return null;
          })
      );
    });

    const genreResults = await Promise.all(genreSearches);

    for (const result of genreResults) {
      if (recommendations.length >= MAX_RECOMMENDATIONS) break;
      if (!result || !result.data.items) continue;
      const { genre, data } = result;

      for (const item of data.items) {
        if (recommendations.length >= MAX_RECOMMENDATIONS) break;

        // Better filtering criteria
        if (!item.id || seenIds.has(item.id)) continue;
        if (!item.volumeInfo?.title) continue;

        // Check if book has valid image or use default
        const thumbnail =
          item.volumeInfo.imageLinks?.thumbnail ||
          item.volumeInfo.imageLinks?.smallThumbnail ||
          "/images/default-book.jpg";

        // Ensure the book has some genre information
        const bookGenres = item.volumeInfo.categories || [genre];

        seenIds.add(item.id);
        recommendations.push({
          id: item.id,
          title: item.volumeInfo.title,
          authors: item.volumeInfo.authors?.join(", ") || "Unknown Author",
          year: item.volumeInfo.publishedDate?.substring(0, 4) || "N/A",
          genres: bookGenres,
          image: thumbnail,
          relevanceScore: calculateRelevanceScore(bookGenres, genres),
          searchGenre: genre,
        });
      }
    }

    // 3. If still need more, search by author
    if (
      recommendations.length < MAX_RECOMMENDATIONS &&
      book.volumeInfo?.authors?.length > 0
    ) {
      const author = book.volumeInfo.authors[0];
      try {
        const { data } = await axios.get(
          "https://www.googleapis.com/books/v1/volumes",
          {
            params: {
              q: `inauthor:"${author}"`,
              maxResults: 8,
              key: GOOGLE_BOOKS_API_KEY,
              printType: "books",
            },
            timeout: 5000,
          }
        );

        if (data.items) {
          for (const item of data.items) {
            if (recommendations.length >= MAX_RECOMMENDATIONS) break;
            if (!item.id || seenIds.has(item.id)) continue;
            if (!item.volumeInfo?.title) continue;

            const thumbnail =
              item.volumeInfo.imageLinks?.thumbnail ||
              item.volumeInfo.imageLinks?.smallThumbnail ||
              "/images/default-book.jpg";

            seenIds.add(item.id);
            recommendations.push({
              id: item.id,
              title: item.volumeInfo.title,
              authors: item.volumeInfo.authors?.join(", ") || "Unknown Author",
              year: item.volumeInfo.publishedDate?.substring(0, 4) || "N/A",
              genres: item.volumeInfo.categories || ["Same Author"],
              image: thumbnail,
              relevanceScore: 0.5,
              searchGenre: "author",
            });
          }
        }
      } catch (err) {
        console.error("❌ Error searching by author:", err.message);
      }
    }

    // 4. Sort by relevance and return top results
    const sortedRecommendations = recommendations
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, FINAL_RECOMMENDATIONS);

    return sortedRecommendations;
  } catch (err) {
    console.error("Recommendation system error:", err);
    return [];
  }
}

// Helper function to calculate relevance score
function calculateRelevanceScore(bookGenres, targetGenres) {
  if (!bookGenres || !targetGenres) return 0;

  const normalizedBookGenres = bookGenres.map((g) =>
    g
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .trim()
  );

  let score = 0;
  let matches = 0;

  for (const targetGenre of targetGenres) {
    for (const bookGenre of normalizedBookGenres) {
      // Exact match
      if (bookGenre === targetGenre) {
        score += 2;
        matches++;
      }
      // Partial match (one contains the other)
      else if (
        bookGenre.includes(targetGenre) ||
        targetGenre.includes(bookGenre)
      ) {
        score += 1;
        matches++;
      }
    }
  }

  // Bonus for multiple matches
  if (matches > 1) score += matches * 0.5;

  return score;
}

// Book detail route with improved error handling
router.get("/:id", async (req, res) => {
  if (!req.session?.userId) {
    return res.redirect(
      `/account/login?redirect=/book_detail/${req.params.id}`
    );
  }

  try {

    // 1. Get the main book details
    const book = await cached(
      `googlebooks:detail:${req.params.id}`,
      DETAIL_TTL,
      async () => {
        const { data } = await axios.get(
          `https://www.googleapis.com/books/v1/volumes/${req.params.id}`,
          {
            params: { key: GOOGLE_BOOKS_API_KEY },
            timeout: 10000,
          }
        );
        return data;
      }
    );

    // 2. Get recommendations with better error handling
    let recommendations = [];
    try {
      recommendations = await getBookRecommendations(book);
    } catch (err) {
      console.error("❌ Recommendation error:", err.message);
      recommendations = []; // Ensure it's always an array
    }

    // 3. Render the page with all data
    res.render("detail_page/book_detail", {
      book,
      recommendations: recommendations || [],
      isLoggedIn: !!req.session?.user,
      currentUser: req.session?.user || null,
    });
  } catch (error) {
    console.error("Book detail error:", error.message);

    // Better error handling - try to still show something useful
    res.render("detail_page/book_detail", {
      book: {
        id: req.params.id,
        volumeInfo: {
          title: "Book Not Found",
          description: "Sorry, we could not load the details for this book.",
        },
      },
      recommendations: [],
      isLoggedIn: !!req.session?.user,
      currentUser: req.session?.user || null,
      error: "Failed to load book details. Please try again later.",
    });
  }
});

//Submit review route with better debugging
router.post("/reviews", requireAuth, reviewLimiter, async (req, res) => {
  const { bookId, rating, comment, spoiler } = req.body;

  if (!bookId || !rating || !comment) {
    return res
      .status(400)
      .json({ success: false, message: "All fields required" });
  }

  // Normalize bookId - remove any extra characters and trim
  const normalizedBookId = bookId.toString().trim();

  try {
    // Fetch book details from Google Books API to get the title
    const { data: bookData } = await axios.get(
      `https://www.googleapis.com/books/v1/volumes/${normalizedBookId}`,
      {
        params: { key: GOOGLE_BOOKS_API_KEY },
        timeout: 10000,
      }
    );

    const bookTitle = bookData.volumeInfo?.title || "Unknown Title";

    const review = new Review({
      bookId: normalizedBookId,
      bookTitle: bookTitle,
      userId: req.session.user.id,
      username: req.session.user.username,
      rating: parseInt(rating),
      comment: comment.trim(),
      spoiler: Boolean(spoiler),
      likes: [], // Initialize empty likes array
      replies: [], // Initialize empty replies array
      likeCount: 0, // Initialize like count
    });

    const saved = await review.save();

    // Return the review with proper ID formatting and book details
    const reviewResponse = {
      id: saved._id.toString(), // Convert ObjectId to string
      _id: saved._id.toString(),
      bookId: saved.bookId,
      bookTitle: saved.bookTitle,
      bookAuthor: saved.bookAuthor,
      bookImage: saved.bookImage,
      userId: saved.userId,
      username: saved.username,
      rating: saved.rating,
      comment: saved.comment,
      spoiler: saved.spoiler,
      likes: saved.likes || [],
      replies: saved.replies || [],
      likeCount: saved.likeCount || 0,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    };

    res.json({ success: true, review: reviewResponse });
  } catch (err) {
    console.error("❌ Error saving review:", err);

    // If Google Books API fails, still try to save the review with minimal info
    if (err.response?.status === 404 || err.code === "ECONNABORTED") {

      try {
        const review = new Review({
          bookId: normalizedBookId,
          bookTitle: "Unknown Title",
          bookAuthor: "Unknown Author",
          bookImage: null,
          userId: req.session.user.id,
          username: req.session.user.username,
          rating: parseInt(rating),
          comment: comment.trim(),
          spoiler: Boolean(spoiler),
          likes: [],
          replies: [],
          likeCount: 0,
        });

        const saved = await review.save();

        const reviewResponse = {
          id: saved._id.toString(),
          _id: saved._id.toString(),
          bookId: saved.bookId,
          bookTitle: saved.bookTitle,
          userId: saved.userId,
          username: saved.username,
          rating: saved.rating,
          comment: saved.comment,
          spoiler: saved.spoiler,
          likes: saved.likes || [],
          replies: saved.replies || [],
          likeCount: saved.likeCount || 0,
          createdAt: saved.createdAt,
          updatedAt: saved.updatedAt,
        };

        res.json({ success: true, review: reviewResponse });
      } catch (saveErr) {
        console.error("❌ Error saving review with fallback:", saveErr);
        res.status(500).json({ success: false, message: saveErr.message });
      }
    } else {
      res.status(500).json({ success: false, message: err.message });
    }
  }
});

// Get reviews route
router.get("/reviews/:bookId", async (req, res) => {
  const bookId = req.params.bookId;
  const page = parseInt(req.query.page) || 1;
  const limit = 2;
  const skip = (page - 1) * limit;

  try {
    // Exact match only - partial ID matching used to show another book's reviews
    const reviews = await Review.find({ bookId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Review.countDocuments({ bookId });

    // Format the response properly
    const currentUserId = req.session?.user?.id || null;

    let formattedReviews = reviews.map((review) => {
      const reviewObj = review.toObject();
      const isLiked = currentUserId
        ? reviewObj.likes?.some((like) => like.userId === currentUserId)
        : false;

      return {
        id: reviewObj._id.toString(),
        _id: reviewObj._id.toString(),
        bookId: reviewObj.bookId,
        bookTitle: reviewObj.bookTitle || "Unknown Title",
        userId: reviewObj.userId,
        username: reviewObj.username,
        rating: reviewObj.rating || 0,
        comment: reviewObj.comment || "",
        spoiler: reviewObj.spoiler || false,
        likes: reviewObj.likes || [],
        replies: reviewObj.replies || [],
        likeCount: reviewObj.likeCount || 0,
        createdAt: reviewObj.createdAt,
        updatedAt: reviewObj.updatedAt,
        isLiked, // ✅ Correctly reflect if this user liked
      };
    });

    res.json({
      success: true,
      reviews: formattedReviews,
      page,
      hasMore: page * limit < total,
    });
  } catch (err) {
    console.error("❌ Error fetching reviews:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch reviews",
      error: err.message,
    });
  }
});

// SIMPLIFIED: Like review functionality - only increment/decrement likeCount
// Toggle like/unlike logic
router.post("/reviews/:reviewId/like", requireAuth, reviewLimiter, async (req, res) => {
  try {
    const review = await Review.findById(req.params.reviewId);
    if (!review) {
      return res
        .status(404)
        .json({ success: false, message: "Review not found" });
    }

    review.likes = review.likes || [];

    const userId = req.user.id;
    const username = req.user.username;

    const existingIndex = review.likes.findIndex(
      (like) => like.userId === userId
    );

    let liked;
    if (existingIndex !== -1) {
      review.likes.splice(existingIndex, 1);
      review.likeCount = Math.max(0, review.likeCount - 1);
      liked = false;
    } else {
      review.likes.push({
        userId,
        username,
        createdAt: new Date(),
      });
      review.likeCount += 1;
      liked = true;
    }

    await review.save();

    if (liked) {
      await notifyReviewOwner({
        ownerId: review.userId,
        actorId: userId,
        actorUsername: username,
        type: "like",
        itemType: "book",
        itemId: review.bookId,
        itemTitle: review.bookTitle,
        reviewId: review._id,
      });
    }

    // ✅ Removed interaction logging block here

    res.json({
      success: true,
      likeCount: review.likeCount, // ✅ match what frontend expects
      liked,
    });
  } catch (err) {
    console.error("❌ Like error:", err);
    res.status(500).json({ success: false, message: "Error updating like" });
  }
});
// Reply to review functionality with proper validation and error handling
router.post("/reviews/reply", requireAuth, reviewLimiter, async (req, res) => {
  const { reviewId, content } = req.body;

  // Validate input
  if (!reviewId) {
    return res
      .status(400)
      .json({ success: false, message: "Review ID is required" });
  }

  if (!content?.trim()) {
    return res
      .status(400)
      .json({ success: false, message: "Reply content is required" });
  }

  // Validate ObjectId format
  if (!mongoose.Types.ObjectId.isValid(reviewId)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid review ID format" });
  }

  try {
    // Find the review by ID
    const review = await Review.findById(reviewId);
    if (!review) {
      return res
        .status(404)
        .json({ success: false, message: "Review not found" });
    }

    // Create reply object
    const reply = {
      userId: req.session.user.id,
      username: req.session.user.username,
      content: content.trim(),
      createdAt: new Date(),
    };

    // Initialize replies array if it doesn't exist
    if (!review.replies) {
      review.replies = [];
    }

    // Add the reply
    review.replies.push(reply);

    // Save changes
    await review.save();

    await notifyReviewOwner({
      ownerId: review.userId,
      actorId: req.session.user.id,
      actorUsername: req.session.user.username,
      type: "reply",
      itemType: "book",
      itemId: review.bookId,
      itemTitle: review.bookTitle,
      reviewId: review._id,
    });

    // Return the new reply (get the last added reply)
    const newReply = review.replies[review.replies.length - 1];

    res.json({
      success: true,
      reply: {
        id: newReply._id ? newReply._id.toString() : Date.now().toString(), // Ensure ID is present
        userId: newReply.userId,
        username: newReply.username,
        content: newReply.content,
        createdAt: newReply.createdAt,
      },
      debug: {
        reviewId: reviewId,
        repliesCount: review.replies.length,
        replyId: newReply._id,
      },
    });
  } catch (err) {
    console.error("❌ Error adding reply:", err);
    console.error("Error details:", {
      name: err.name,
      message: err.message,
      stack: err.stack,
    });
    res.status(500).json({
      success: false,
      message: "Failed to add reply",
      error: err.message,
    });
  }
});

module.exports = router;
