const express = require("express");
const axios = require("axios");
const router = express.Router();
const Review = require("../models/Review");
const User = require("../models/User");
const { cached } = require("../services/cache");
const { reviewLimiter } = require("../middleware/rateLimiters");
const { notifyReviewOwner } = require("../services/notificationService");
require("dotenv").config();

const TMDB_API_KEY = process.env.TMDB_API_KEY || "your_api_key_here";
const DETAIL_TTL = 30 * 60 * 1000; // 30 minutes - movie metadata barely changes

const genreMap = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Science Fiction",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
};

// Login check used by the detail page script. Returns only what the page
// needs - never the session ID or cookies.
router.get("/check-session", (req, res) => {
  res.json({
    success: true,
    isLoggedIn: !!req.session?.user?.id,
    user: req.session?.user || null,
  });
});

// Auth middleware
const requireAuth = (req, res, next) => {
  if (req.session?.user?.id) {
    req.user = req.session.user;
    return next();
  }
  res.status(401).json({ success: false, message: "Not logged in" });
};

// Helper to get recommendations
async function getRecommendationsByMovieGenres(movie) {
  const genreIds = (movie.genres || [])
    .map((g) => Object.keys(genreMap).find((k) => genreMap[k] === g.name))
    .filter(Boolean);

  if (genreIds.length === 0) return [];

  try {
    // Cached by genre so different movies sharing a primary genre reuse the
    // same fetch; the current-movie filter/slice below runs per-call.
    const results = await cached(
      `tmdb:discoverByGenre:${genreIds[0]}`,
      DETAIL_TTL,
      async () => {
        const { data } = await axios.get(
          "https://api.themoviedb.org/3/discover/movie",
          {
            params: {
              api_key: TMDB_API_KEY,
              with_genres: genreIds[0],
              sort_by: "popularity.desc",
              language: "en-US",
              page: 1,
            },
          }
        );
        return data.results || [];
      }
    );

    return results
      .filter((m) => m.id !== movie.id)
      .slice(0, 4)
      .map((m) => ({
        id: m.id,
        title: m.title,
        year: m.release_date?.split("-")[0] || "N/A",
        genres: m.genre_ids.map((id) => genreMap[id] || "Unknown").join(" • "),
        image: m.poster_path
          ? `https://image.tmdb.org/t/p/w500${m.poster_path}`
          : "/images/default-movie.jpg",
      }));
  } catch (err) {
    console.error("Failed to get recommendations:", err.message);
    return [];
  }
}

// Movie detail route
router.get("/:id", async (req, res) => {
  try {
    const movieId = req.params.id;

    if (!req.session.user) {
      return res.redirect("/account/login");
    }

    // Cached responses are shared across requests, so clone the movie object
    // before mutating it below - mutating the cached copy directly would
    // corrupt it for the next request that hits the same cache entry.
    const rawMovie = await cached(
      `tmdb:movieDetail:${movieId}`,
      DETAIL_TTL,
      async () => {
        const { data } = await axios.get(
          `https://api.themoviedb.org/3/movie/${movieId}?api_key=${TMDB_API_KEY}`
        );
        return data;
      }
    );
    const movie = { ...rawMovie };
    movie.genres = movie.genres || [];

    // These three don't depend on each other, so run them concurrently
    // instead of stacking three sequential round trips.
    const [videos, watchProvidersResults, recommendations] = await Promise.all([
      cached(`tmdb:movieVideos:${movieId}`, DETAIL_TTL, async () => {
        const { data } = await axios.get(
          `https://api.themoviedb.org/3/movie/${movieId}/videos?api_key=${TMDB_API_KEY}`
        );
        return data;
      }),
      cached(`tmdb:watchProviders:${movieId}`, DETAIL_TTL, async () => {
        const { data } = await axios.get(
          `https://api.themoviedb.org/3/movie/${movieId}/watch/providers?api_key=${TMDB_API_KEY}`
        );
        return data.results || {};
      }).catch((err) => {
        console.error("⚠️ Could not fetch watch providers:", err.message);
        return null;
      }),
      getRecommendationsByMovieGenres(movie),
    ]);

    movie.watchProviders = null;
    if (watchProvidersResults) {
      const regionData =
        watchProvidersResults.US ||
        Object.values(watchProvidersResults)[0] ||
        null;

      if (regionData) {
        movie.watchProviders = {
          link: regionData.link,
          flatrate: regionData.flatrate || [],
          rent: regionData.rent || [],
          buy: regionData.buy || [],
        };
      }
    }

    movie.trailerKey =
      videos.results?.find(
        (v) =>
          v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser")
      )?.key || null;
    movie.backdrop_path = movie.backdrop_path
      ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}`
      : movie.poster_path
      ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
      : "/images/default-backdrop.jpg";

    movie.runtimeFormatted = movie.runtime
      ? `${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m`
      : null;
    movie.releaseYear = movie.release_date
      ? new Date(movie.release_date).getFullYear()
      : null;

    res.render("detail_page/movie_detail", {
      movie,
      recommendations,
      isLoggedIn: !!req.session?.user,
      currentUser: req.session?.user || null,
    });
  } catch (error) {
    console.error("❌ Error fetching movie detail:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Submit review route
router.post("/reviews", requireAuth, reviewLimiter, async (req, res) => {
  const { movieId, rating, comment, spoiler } = req.body;

  if (!movieId || !rating || !comment) {
    return res
      .status(400)
      .json({ success: false, message: "All fields required" });
  }

  try {
    // 1. Fetch movie details from TMDB
    let movieTitle = "Unknown Movie";
    try {
      const { data: movie } = await axios.get(
        `https://api.themoviedb.org/3/movie/${movieId}`,
        {
          params: { api_key: TMDB_API_KEY },
          timeout: 5000, // 5 second timeout
        }
      );
      movieTitle = movie.title || "Unknown Movie";
    } catch (apiError) {
      console.error("⚠️ Could not fetch movie details:", apiError.message);
    }

    // 2. Create and save the review with movie title
    const review = new Review({
      movieId: movieId.trim(),
      movieTitle: movieTitle, // Store the title
      userId: req.session.user.id,
      username: req.session.user.username,
      rating: parseInt(rating),
      comment: comment.trim(),
      spoiler: Boolean(spoiler),
    });

    const saved = await review.save();
    res.json({
      success: true,
      review: {
        ...saved.toClientJSON(),
        movieTitle: saved.movieTitle, // Include title in response
      },
    });
  } catch (err) {
    console.error("❌ Save review failed:", err);
    res.status(500).json({
      success: false,
      message: err.message,
      details: err,
    });
  }
});

router.post("/reviews/:reviewId/like", requireAuth, reviewLimiter, async (req, res) => {
  try {
    const review = await Review.findById(req.params.reviewId);
    if (!review) {
      return res
        .status(404)
        .json({ success: false, message: "Review not found" });
    }

    // Ensure likes is at least an empty array
    review.likes = review.likes || [];

    const userId = req.user.id;
    const username = req.user.username;

    const existingIndex = review.likes.findIndex(
      (like) => like.userId === userId
    );

    let liked;
    if (existingIndex !== -1) {
      // Unlike
      review.likes.splice(existingIndex, 1);
      review.likeCount = Math.max(0, review.likeCount - 1);
      liked = false;
    } else {
      // Like
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
        itemType: "movie",
        itemId: review.movieId,
        itemTitle: review.movieTitle,
        reviewId: review._id,
      });
    }

    // Save interaction (if needed)
    const UserInteraction = require("../models/SavedSearch.js");
    await UserInteraction.create({
      userId,
      interactionType: "like",
      itemDetails: {
        title: review.movieTitle,
        rating: review.rating?.toString() || "",
        type: "movie",
        detailURL: `/movie_detail/${review.movieId}`,
        image: "/images/default-movie.jpg", 
        genres: [], 
      },
      timestamp: new Date(),
    });
    res.json({
      success: true,
      likes: review.likeCount,
      liked,
    });
  } catch (err) {
    console.error("❌ Like error:", err);
    res.status(500).json({ success: false, message: "Error updating like" });
  }
});

router.post("/reviews/reply", requireAuth, reviewLimiter, async (req, res) => {
  const { reviewId, content } = req.body;

  if (!reviewId || !content || content.trim().length === 0) {
    return res
      .status(400)
      .json({ success: false, message: "Missing reviewId or content" });
  }

  try {
    const review = await Review.findById(reviewId);
    if (!review) {
      return res
        .status(404)
        .json({ success: false, message: "Review not found" });
    }

    const reply = {
      userId: req.user.id,
      username: req.user.username,
      content: content.trim(),
      createdAt: new Date(),
    };

    review.replies.push(reply);
    await review.save();

    await notifyReviewOwner({
      ownerId: review.userId,
      actorId: req.user.id,
      actorUsername: req.user.username,
      type: "reply",
      itemType: "movie",
      itemId: review.movieId,
      itemTitle: review.movieTitle,
      reviewId: review._id,
    });

    res.json({ success: true, reply });
  } catch (error) {
    console.error("❌ Reply error:", error);
    res.status(500).json({ success: false, message: "Error submitting reply" });
  }
});
// Get reviews route
// movie_detail.js

router.get("/reviews/:movieId", async (req, res) => {
  const movieId = req.params.movieId;
  const page = parseInt(req.query.page) || 1;
  const limit = 2;
  const skip = (page - 1) * limit;

  try {
    const reviews = await Review.find({ movieId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Review.countDocuments({ movieId });

    const currentUserId = req.session?.user?.id || null;

    const formattedReviews = reviews.map((r) => r.toClientJSON(currentUserId));

    res.json({
      success: true,
      reviews: formattedReviews,
      page,
      hasMore: page * limit < total,
    });
  } catch (err) {
    console.error("❌ Error fetching movie reviews:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
