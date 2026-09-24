const express = require("express");
const router = express.Router();
const Notification = require("../models/Notification");

const requireAuth = (req, res, next) => {
  if (req.session?.user?.id) return next();
  res.status(401).json({ message: "Not logged in" });
};

// GET /api/notifications - most recent notifications + unread count
router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ userId }).sort({ createdAt: -1 }).limit(30),
      Notification.countDocuments({ userId, read: false }),
    ]);

    res.json({ notifications, unreadCount });
  } catch (err) {
    console.error("❌ Error fetching notifications:", err);
    res.status(500).json({ message: "Failed to fetch notifications" });
  }
});

// POST /api/notifications/:id/read - mark one as read
router.post("/:id/read", requireAuth, async (req, res) => {
  try {
    await Notification.updateOne(
      { _id: req.params.id, userId: req.session.user.id },
      { $set: { read: true } }
    );
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Error marking notification read:", err);
    res.status(500).json({ message: "Failed to update notification" });
  }
});

// POST /api/notifications/read-all - mark all as read
router.post("/read-all", requireAuth, async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.session.user.id, read: false },
      { $set: { read: true } }
    );
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Error marking all notifications read:", err);
    res.status(500).json({ message: "Failed to update notifications" });
  }
});

module.exports = router;
