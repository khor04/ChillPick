const express = require("express");
const router = express.Router();
const db = require("../models/History");

// GET /history
router.get("/history", async (req, res) => {
  try {
    const userId = req.session.userId; 

    const historyItems = await db.query(
      "SELECT * FROM watchlist WHERE user_id = ? AND completed_at IS NOT NULL ORDER BY completed_at DESC",
      [userId]
    );

    res.render("watchlist/history", { items: historyItems });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});

module.exports = router;
