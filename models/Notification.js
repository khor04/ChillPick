const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true }, // recipient
    type: { type: String, enum: ["like", "reply"], required: true },
    fromUserId: { type: String, required: true },
    fromUsername: { type: String, required: true },
    itemType: { type: String, enum: ["movie", "book"], required: true },
    itemId: { type: String, required: true },
    itemTitle: { type: String, required: true },
    reviewId: { type: String, required: true },
    message: { type: String, required: true },
    link: { type: String, required: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
