const mongoose = require("mongoose");

const historyItemSchema = new mongoose.Schema(
  {
    itemId: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["movie", "book"],
      required: true,
    },
    image: {
      type: String,
      default: "",
    },
    rating: {
      type: String,
      default: "",
    },
    genres: [
      {
        type: String,
      },
    ],
    synopsis: {
      type: String,
      default: "",
    },
    completedAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["completed", "dropped"],
      default: "completed",
    },
  },
  { timestamps: true }
);

const historySchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
    },
    items: [historyItemSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("History", historySchema);
