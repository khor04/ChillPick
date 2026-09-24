const express = require("express");
const router = express.Router();
const Watchlist = require("../models/Watchlist");
const History = require("../models/History");

// Middleware to check authentication
const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Unauthorized - Please log in" });
  }
  next();
};
// Test route (no auth required for testing)
router.get("/test", (req, res) => {
  res.json({
    message: "Watchlist router is working!",
    timestamp: new Date().toISOString(),
    sessionExists: !!req.session,
    userExists: !!req.session?.user,
  });
});

// Apply auth middleware to all watchlist routes
router.use(requireAuth);
// Middleware to validate session and add error handling
router.use((err, req, res, next) => {
  console.error("❌ Watchlist route error:", err);

  res.status(500).json({
    success: false,
    error: "Internal server error",
    message: "An unexpected error occurred",
  });
});

// POST /api/watchlist/add - Add or remove item from watchlist
router.post("/add", async (req, res) => {
  try {
    // Check if user is authenticated
    if (!req.session?.user?.id) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
        message: "Please log in to manage your watchlist",
      });
    }

    const { itemId, type, title, image, rating, genres, synopsis } = req.body;
    const userId = req.session.user.id;

    // Validate required fields
    if (!itemId || !type) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        message: "Item ID and type are required",
      });
    }

    // Find or create user's watchlist
    let watchlist = await Watchlist.findOne({ userId });
    if (!watchlist) {
      watchlist = new Watchlist({ userId, items: [] });
    }

    // Check if item already exists
    const existingItemIndex = watchlist.items.findIndex(
      (item) => item.itemId === itemId && item.type === type
    );

    if (existingItemIndex !== -1) {
      // Item exists - remove it (toggle behavior)
      watchlist.items.splice(existingItemIndex, 1);
      await watchlist.save();

      return res.json({
        success: true,
        action: "removed",
        message: `"${title}" removed from watchlist`,
        itemId,
        type,
      });
    } else {
      // Sanitize rating
      let safeRating = null;
      if (
        rating !== undefined &&
        rating !== null &&
        rating !== "N/A" &&
        !isNaN(Number(rating))
      ) {
        safeRating = Number(rating);
      }

      const newItem = {
        itemId,
        type,
        title: title || "Unknown Title",
        image: image || "",
        rating: safeRating,
        genres: genres || [],
        synopsis: synopsis || "No synopsis available",
        addedAt: new Date(),
      };
      watchlist.items.push(newItem);
      await watchlist.save();

      return res.json({
        success: true,
        action: "added",
        message: `"${title}" added to watchlist`,
        itemId,
        type,
        item: newItem,
      });
    }
  } catch (error) {
    console.error("❌ Watchlist add error:", error);

    // Handle specific MongoDB errors
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        error: "Validation error",
        message: "Invalid data provided",
        details: error.message,
      });
    }

    if (error.name === "MongoError" || error.name === "MongoServerError") {
      return res.status(500).json({
        success: false,
        error: "Database error",
        message: "Unable to update watchlist due to database error",
      });
    }

    return res.status(500).json({
      success: false,
      error: "Server error",
      message: "An unexpected error occurred",
    });
  }
});

// Enhanced POST /api/watchlist/complete - Mark item as completed
router.post("/complete", async (req, res) => {
  try {
    if (!req.session?.user?.id) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    const { itemId, type } = req.body;
    const userId = req.session.user.id;

    if (!itemId || !type) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
      });
    }

    // Find the item in watchlist
    const watchlist = await Watchlist.findOne({ userId });

    if (!watchlist) {
      return res.status(404).json({
        success: false,
        error: "Watchlist not found",
      });
    }

    const itemIndex = watchlist.items.findIndex(
      (item) => item.itemId === itemId && item.type === type
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        error: "Item not found in watchlist",
      });
    }

    // Get the item data
    const item = watchlist.items[itemIndex];

    // Remove from watchlist
    watchlist.items.splice(itemIndex, 1);
    await watchlist.save();

    // Add to history
    let history = await History.findOne({ userId });
    if (!history) {
      history = new History({ userId, items: [] });
    }

    // Check if already in history (prevent duplicates)
    const existsInHistory = history.items.some(
      (historyItem) =>
        historyItem.itemId === itemId && historyItem.type === type
    );

    if (!existsInHistory) {
      history.items.push({
        ...item.toObject(),
        completedAt: new Date(),
      });
      await history.save();
    }

    res.json({
      success: true,
      message: `"${item.title}" marked as completed`,
      item,
    });
  } catch (error) {
    console.error("❌ Error marking as completed:", error);

    return res.status(500).json({
      success: false,
      error: "Server error",
      message: "Unable to mark item as completed",
    });
  }
});

// Enhanced DELETE /api/watchlist/remove - Remove specific item
router.delete("/remove", async (req, res) => {
  try {
    if (!req.session?.user?.id) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
        message: "Please log in to manage your watchlist",
      });
    }

    const { itemId, type } = req.body;
    const userId = req.session.user.id;

    if (!itemId || !type) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        message: "Item ID and type are required",
      });
    }

    const watchlist = await Watchlist.findOne({ userId });

    if (!watchlist) {
      return res.status(404).json({
        success: false,
        error: "Watchlist not found",
        message: "No watchlist found for this user",
      });
    }

    const itemIndex = watchlist.items.findIndex(
      (item) => item.itemId === itemId && item.type === type
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        error: "Item not found",
        message: "Item not found in watchlist",
      });
    }

    const removedItem = watchlist.items[itemIndex];
    watchlist.items.splice(itemIndex, 1);
    await watchlist.save();

    res.json({
      success: true,
      message: `"${removedItem.title}" removed from watchlist`,
      removedItem,
    });
  } catch (error) {
    console.error("❌ Error removing from watchlist:", error);

    return res.status(500).json({
      success: false,
      error: "Server error",
      message: "Unable to remove item from watchlist",
    });
  }
});

// Enhanced GET /api/watchlist - Get user's watchlist with error handling
router.get("/", async (req, res) => {
  try {
    if (!req.session?.user?.id) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
        message: "Please log in to view your watchlist",
      });
    }

    const userId = req.session.user.id;

    const watchlist = await Watchlist.findOne({ userId });

    if (!watchlist) {
      // Return empty array instead of error for new users
      return res.json([]);
    }

    // Sort items by most recently added first
    const sortedItems = watchlist.items.sort(
      (a, b) => new Date(b.addedAt) - new Date(a.addedAt)
    );

    res.json(sortedItems);
  } catch (error) {
    console.error("❌ Error fetching watchlist:", error);

    return res.status(500).json({
      success: false,
      error: "Server error",
      message: "Unable to fetch watchlist",
    });
  }
});

module.exports = router;
