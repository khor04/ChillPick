const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  sessionId: { type: String, required: true },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 60 * 15, // 15 minutes
  },
});

module.exports = mongoose.model("Session", sessionSchema);
