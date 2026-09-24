require("dotenv").config();
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const session = require("express-session");
const cors = require("cors");
const MongoStore = require("connect-mongo");
const app = express();
const compression = require("compression");

app.use(compression()); // Enable compression for all routes

// Render (and most hosts) put one proxy in front of the app. Trusting that one
// hop makes req.ip the real visitor's address instead of the proxy's, so the
// rate limiters count each visitor separately instead of everyone together.
app.set("trust proxy", 1);
// Models and services
const SessionModel = require("./models/Session");
const Contact = require("./models/Contact");
const User = require("./models/User");
const recommendationService = require("./services/recommendationService");
const watchlistRoutes = require("./routes/watchlist");
const History = require("./models/History");
const BookReview = require("./models/BookReview");
const MovieReview = require("./models/Review");
const { contactLimiter } = require("./middleware/rateLimiters");

// Middleware
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use("/css", express.static(path.join(__dirname, "css")));
app.use("/js", express.static(path.join(__dirname, "js")));
app.use("/images", express.static(path.join(__dirname, "images")));

app.use(
  cors({
    origin: "http://your-frontend.com",
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (!process.env.SESSION_SECRET) {
  console.error("❌ SESSION_SECRET is not set in .env");
  process.exit(1);
}

// MongoDB session setup
const uri = process.env.MONGODB_URI;
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true, // refresh the cookie's expiry on every request, so "Stay Logged In" actually extends the session
    store: MongoStore.create({
      mongoUrl: uri,
      ttl: 180 * 60, // seconds - must match cookie.maxAge below, not the 15-minute value this used to be
      autoRemove: "native",
    }),
    cookie: {
      secure: false,
      httpOnly: true,
      sameSite: "lax",
      maxAge: 180 * 60 * 1000,
    },
  })
);

// MongoDB connection
mongoose
  .connect(uri)
  .then(() => console.log("Successfully connected to MongoDB"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });

// Hourly check for unverified accounts due a reminder email
const cron = require("node-cron");
const { sendVerificationReminders } = require("./services/verificationReminderService");
cron.schedule("0 * * * *", () => {
  sendVerificationReminders().catch((err) =>
    console.error("❌ Verification reminder job failed:", err.message)
  );
});

// Session-based navbar visibility
app.use((req, res, next) => {
  const isLoggedIn = req.session?.user;
  res.locals.currentUser = isLoggedIn ? req.session.user : null;
  res.locals.showHomeLink = isLoggedIn;
  res.locals.showDashboardLink = isLoggedIn;
  res.locals.showDiscoverLink = isLoggedIn;
  res.locals.showWatchlistLink = isLoggedIn;
  res.locals.isLoggedIn = isLoggedIn;
  next();
});

// ✅ Movie detail and Book detail routes must come AFTER session middleware
const movieDetailRoutes = require("./routes/movie_detail");
app.use("/movie_detail", movieDetailRoutes);
const bookDetailRoutes = require("./routes/book_detail");
app.use("/book_detail", bookDetailRoutes);

// Other routes
const accountRoutes = require("./routes/account");
const discoverRoutes = require("./routes/discover");
const saveSearchRoutes = require("./routes/save-search");
const recommendationRoutes = require("./routes/recommendations");
const notificationRoutes = require("./routes/notifications");
const Watchlist = require("./models/Watchlist");

app.use("/account", accountRoutes);
app.use("/api/discover", discoverRoutes);
app.use("/api/recommendations", recommendationRoutes);
app.use("/api/interactions", saveSearchRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/", discoverRoutes);
app.use("/api/watchlist", watchlistRoutes);

// Views
app.get("/", (req, res) => res.render("landing"));
app.get("/dashboard", async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) return res.redirect("/account/login");

    // Get recommendations
    const recommendations = await recommendationService.getRecommendations(
      userId
    );

    // Get top 3 recently added watchlist items
    const watchlist = await Watchlist.findOne({ userId });
    const recentlyAdded = watchlist?.items
      ? watchlist.items
          .sort(
            (a, b) =>
              new Date(b.createdAt || b.addedAt) -
              new Date(a.createdAt || a.addedAt)
          )
          .slice(0, 3)
      : [];

    // Fetch recent activity - now including replies and likes
    const [
      bookReviews,
      movieReviews,
      bookReplies,
      movieReplies,
      bookLikes,
      movieLikes,
    ] = await Promise.all([
      BookReview.find().sort({ createdAt: -1 }).limit(3).lean(),
      MovieReview.find().sort({ createdAt: -1 }).limit(3).lean(),
      BookReview.aggregate([
        { $unwind: "$replies" },
        { $sort: { "replies.createdAt": -1 } },
        { $limit: 3 },
        {
          $project: {
            _id: 0,
            type: { $literal: "book_reply" },
            reply: "$replies",
            bookId: 1,
            bookTitle: 1,
            reviewId: "$_id",
          },
        },
      ]),
      MovieReview.aggregate([
        { $unwind: "$replies" },
        { $sort: { "replies.createdAt": -1 } },
        { $limit: 3 },
        {
          $project: {
            _id: 0,
            type: { $literal: "movie_reply" },
            reply: "$replies",
            movieId: 1,
            movieTitle: 1,
            reviewId: "$_id",
          },
        },
      ]),
      BookReview.aggregate([
        { $unwind: "$likes" },
        { $sort: { "likes.createdAt": -1 } },
        { $limit: 3 },
        {
          $project: {
            _id: 0,
            type: { $literal: "book_like" },
            like: "$likes",
            bookId: 1,
            bookTitle: 1,
            reviewId: "$_id",
          },
        },
      ]),
      MovieReview.aggregate([
        { $unwind: "$likedBy" },
        { $sort: { "likedBy.date": -1 } },
        { $limit: 3 },
        {
          $project: {
            _id: 0,
            type: { $literal: "movie_like" },
            like: "$likedBy",
            movieId: 1,
            movieTitle: 1,
            reviewId: "$_id",
          },
        },
      ]),
    ]);

    // Get all unique user IDs from all activity types
    const allUserIds = [
      ...new Set([
        ...bookReviews.map((r) => r.userId),
        ...movieReviews.map((r) => r.userId),
        ...bookReplies.map((r) => r.reply.userId),
        ...movieReplies.map((r) => r.reply.userId),
        ...bookLikes.map((r) => r.like.userId),
        ...movieLikes.map((r) => r.like.userId),
      ]),
    ];

    // Fetch all users data at once for better performance
    const users = await User.find({ _id: { $in: allUserIds } })
      .select("_id username profilePicture")
      .lean();

    // Create a user map for quick lookup
    const userMap = users.reduce((map, user) => {
      map[user._id.toString()] = user;
      return map;
    }, {});

    // Format all activity data
    const recentActivity = await Promise.all([
      // Book reviews
      ...bookReviews.map((r) =>
        formatReviewActivity(r, "book", userMap, userId)
      ),
      // Movie reviews
      ...movieReviews.map((r) =>
        formatReviewActivity(r, "movie", userMap, userId)
      ),
      // Book replies
      ...bookReplies.map((r) =>
        formatReplyActivity(r, "book", userMap, userId)
      ),
      // Movie replies
      ...movieReplies.map((r) =>
        formatReplyActivity(r, "movie", userMap, userId)
      ),
    ]);

    // Sort by most recent and take top 3
    const sortedActivity = recentActivity
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 3); // Show 3 most recent activities

    res.render("dashboard", {
      recommendations,
      recentlyAdded,
      recentActivity: sortedActivity,
      currentUser: req.session.user,
    });
  } catch (error) {
    console.error("Error loading dashboard:", error);
    res.status(500).send("Error loading dashboard");
  }
});

// Helper functions to format different types of activities
function formatReviewActivity(review, type, userMap, currentUserId) {
  const user = userMap[review.userId.toString()] || {};
  const isCurrentUser = review.userId.toString() === currentUserId.toString();

  return {
    type: `${type}_review`,
    activityType: "review",
    username: isCurrentUser ? "You" : user.username || review.username,
    userId: review.userId,
    itemId: review[`${type}Id`],
    itemTitle: review[`${type}Title`] || `${type} ID: ${review[`${type}Id`]}`,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt,
    profilePic: user.profilePicture || "../images/profile_pic.png",
    timeAgo: getTimeAgo(review.createdAt),
    detailUrl: `/${type}_detail/${review[`${type}Id`]}`,
    reviewId: review._id.toString(),
  };
}

function formatReplyActivity(replyData, type, userMap, currentUserId) {
  const reply = replyData.reply;
  const user = userMap[reply.userId.toString()] || {};
  const isCurrentUser = reply.userId.toString() === currentUserId.toString();

  return {
    type: `${type}_reply`,
    activityType: "reply",
    username: isCurrentUser ? "You" : user.username || reply.username,
    userId: reply.userId,
    itemId: replyData[`${type}Id`],
    itemTitle:
      replyData[`${type}Title`] || `${type} ID: ${replyData[`${type}Id`]}`,
    content: reply.content || reply.text,
    createdAt: reply.createdAt || reply.date,
    profilePic: user.profilePicture || "../images/profile_pic.png",
    timeAgo: getTimeAgo(reply.createdAt || reply.date),
    detailUrl: `/${type}_detail/${replyData[`${type}Id`]}`,
    reviewId: replyData.reviewId.toString(),
  };
}

function formatLikeActivity(likeData, type, userMap, currentUserId) {
  const like = likeData.like;
  const user = userMap[like.userId.toString()] || {};
  const isCurrentUser = like.userId.toString() === currentUserId.toString();

  return {
    type: `${type}_like`,
    activityType: "like",
    username: isCurrentUser ? "You" : user.username || like.username,
    userId: like.userId,
    itemId: likeData[`${type}Id`],
    itemTitle:
      likeData[`${type}Title`] || `${type} ID: ${likeData[`${type}Id`]}`,
    createdAt: like.createdAt || like.date,
    profilePic: user.profilePicture || "../images/profile_pic.png",
    timeAgo: getTimeAgo(like.createdAt || like.date),
    detailUrl: `/${type}_detail/${likeData[`${type}Id`]}`,
    reviewId: likeData.reviewId.toString(),
  };
}

function getTimeAgo(date) {
  const now = new Date();
  const diffInSeconds = Math.floor((now - new Date(date)) / 1000);

  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600)
    return `${Math.floor(diffInSeconds / 60)} minutes ago`;
  if (diffInSeconds < 86400)
    return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  if (diffInSeconds < 604800)
    return `${Math.floor(diffInSeconds / 86400)} days ago`;
  return `${Math.floor(diffInSeconds / 604800)} weeks ago`;
}

// Helper function to format time ago (if not already present)
function getTimeAgo(date) {
  const now = new Date();
  const diffInSeconds = Math.floor((now - new Date(date)) / 1000);

  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600)
    return `${Math.floor(diffInSeconds / 60)} minutes ago`;
  if (diffInSeconds < 86400)
    return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  if (diffInSeconds < 604800)
    return `${Math.floor(diffInSeconds / 86400)} days ago`;
  return `${Math.floor(diffInSeconds / 604800)} weeks ago`;
}

app.get("/discover", (req, res) => res.render("discover"));
app.get("/watchlist", async (req, res) => {
  if (!req.session?.user?.id) {
    return res.redirect("/account/login");
  }

  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 5; // Items per page
    const skip = (page - 1) * limit;

    const watchlist = await Watchlist.findOne({ userId: req.session.user.id });
    const allItems = watchlist?.items || [];

    // Calculate pagination
    const totalItems = allItems.length;
    const totalPages = Math.ceil(totalItems / limit);
    const items = allItems.slice(skip, skip + limit);

    // Calculate pagination info
    const startItem = skip + 1;
    const endItem = Math.min(skip + limit, totalItems);

    res.render("watchlist/watchlist", {
      items,
      currentUser: req.session.user,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit,
        startItem,
        endItem,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        nextPage: page + 1,
        prevPage: page - 1,
      },
    });
  } catch (error) {
    console.error("Error fetching watchlist:", error);
    res.status(500).send("Error loading watchlist");
  }
});
app.get("/history", async (req, res) => {
  if (!req.session?.user?.id) {
    return res.redirect("/account/login");
  }
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 5; // Items per page
    const skip = (page - 1) * limit;

    const History = require("./models/History");
    const history = await History.findOne({ userId: req.session.user.id });
    const allItems = history?.items || [];

    // Sort by completedAt date (most recent first)
    allItems.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

    // Calculate pagination
    const totalItems = allItems.length;
    const totalPages = Math.ceil(totalItems / limit);
    const items = allItems.slice(skip, skip + limit);

    // Calculate pagination info
    const startItem = skip + 1;
    const endItem = Math.min(skip + limit, totalItems);

    res.render("watchlist/history", {
      items,
      currentUser: req.session.user,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit,
        startItem,
        endItem,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        nextPage: page + 1,
        prevPage: page - 1,
      },
    });
  } catch (error) {
    console.error("Error fetching history:", error);
    res.status(500).send("Error loading history");
  }
});

app.get("/login", (req, res) => res.redirect("/account/login"));
app.get("/register", (req, res) => res.render("account/register"));
app.get("/forgotPassword", (req, res) => res.render("account/forgotPassword"));

app.get("/profile", (req, res) => {
  if (res.locals.currentUser) {
    res.redirect("/account/profile");
  } else {
    res.redirect("/account/login");
  }
});

app.get("/account/login", (req, res) => res.render("account/login"));
app.get("/account/register", (req, res) => res.render("account/register"));
app.get("/account/forgotPassword", (req, res) =>
  res.render("account/forgotPassword")
);

// Utility pages
app.get("/aboutus", (req, res) => res.render("utility/AboutUs"));
app.get("/contactus", (req, res) =>
  res.render("utility/ContactUs", {
    success: req.query.success,
    error: req.query.error,
  })
);
app.get("/faq", (req, res) => res.render("utility/FAQ"));
app.get("/privacypolicy", (req, res) => res.render("utility/PrivacyPolicy"));

app.post("/contactus", contactLimiter, async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
      return res.redirect("/contactus?error=missing_fields");
    }
    const newContact = new Contact({ name, email, message });
    await newContact.save();
    res.redirect("/contactus?success=true");
  } catch (error) {
    console.error("Error saving contact:", error);
    res.redirect("/contactus?error=server_error");
  }
});

// Debug endpoints
app.post("/api/recommendations/refresh", async (req, res) => {
  try {
    const userId = req.session?.userId;
    const result = await recommendationService.refreshRecommendations();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/debug/googlebooks", async (req, res) => {
  try {
    const googleBooksService = require("./services/googleBooksService");
    const books = await googleBooksService.getPopularBooks(3);
    res.json({ books });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/debug/all", async (req, res) => {
  try {
    const tmdbService = require("./services/tmdbService");
    const googleBooksService = require("./services/googleBooksService");
    const [movies, books] = await Promise.all([
      tmdbService.getTrendingMovies(3),
      googleBooksService.getPopularBooks(3),
    ]);
    res.json({ movies, books });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/debug/tmdb", async (req, res) => {
  try {
    const tmdbService = require("./services/tmdbService");
    const movies = await tmdbService.getTrendingMovies(3);
    res.json({ movies });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/history", async (req, res) => {
  if (!req.session?.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const History = require("./models/History");
    const history = await History.findOne({ userId: req.session.user.id });
    res.json(history?.items || []);
  } catch (error) {
    console.error("Error fetching history:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Server running at http://localhost:${PORT}`)
);
