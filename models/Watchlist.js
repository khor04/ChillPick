const mongoose = require("mongoose");

const watchlistItemSchema = new mongoose.Schema({
  itemId: { type: String, required: true },
  title: { type: String, required: true },
  synopsis: { type: String, default: "" },
  type: { type: String, required: true, enum: ["movie", "book"] }, 
  image: { type: String, default: "" },
  rating: {
    type: Number,
    default: null,
    validate: {
      validator: function (v) {
        return v === null || typeof v === "number";
      },
      message: (props) => `${props.value} is not a valid number`,
    },
  },
  genres: [{ type: String }],
  addedAt: { type: Date, default: Date.now },
});

const watchlistSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
  },
  items: [watchlistItemSchema],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update the updatedAt field whenever the watchlist is modified
watchlistSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Index for faster queries
watchlistSchema.index({ "items.itemId": 1, "items.type": 1 });
module.exports = mongoose.model("Watchlist", watchlistSchema);
