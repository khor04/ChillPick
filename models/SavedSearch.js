const mongoose = require("mongoose");

const userInteractionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User", 
    required: true,
  },

  interactionType: {
    type: String,
    required: true,
    enum: [
      "search",
      "filter genre",
      "filter rating",
      "add to watchlist",
      "item clicked",
      "like",
    ],
  },

  // For search interactions
  query: {
    type: String,
  },

  // For genre filter interactions
  genre: {
    type: String,
  },

  // For rating filter interactions
  rating: {
    type: String,
  },

  // For watchlist interactions
  itemDetails: {
    title: String,
    rating: String,
    image: String,
    type: {
      type: String,
      enum: ["movie", "book"],
    },
    detailURL: String,
    genres: [String],
  },

  // For item clicked interactions
  clickedItem: {
    id: String,
    title: String,
    type: {
      type: String,
      enum: ["movie", "book"],
    },
    genres: [String],
  },

  timestamp: {
    type: Date,
    default: Date.now,
  },
});

// Custom validation logic
userInteractionSchema.pre("validate", function (next) {
  const { interactionType } = this;

  if (interactionType === "search" && !this.query) {
    return next(new Error("Query is required for search interactions."));
  }

  if (interactionType === "filter genre" && !this.genre) {
    return next(new Error("Genre is required for filter genre interactions."));
  }

  if (interactionType === "filter rating" && !this.rating) {
    return next(
      new Error("Rating is required for filter rating interactions.")
    );
  }

  if (interactionType === "add to watchlist") {
    const item = this.itemDetails || {};
    if (!item.title || !item.rating || !item.type || !item.detailURL) {
      return next(
        new Error(
          "Complete itemDetails are required for add to watchlist interactions."
        )
      );
    }
  }

  if (interactionType === "item clicked") {
    const item = this.clickedItem || {};
    if (!item.title || !item.type || !item.id) {
      return next(
        new Error(
          "Complete clickedItem is required for item clicked interactions."
        )
      );
    }
  }

  next();
});
module.exports =
  mongoose.models.UserInteraction ||
  mongoose.model("UserInteraction", userInteractionSchema);
