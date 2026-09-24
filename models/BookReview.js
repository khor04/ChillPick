const mongoose = require("mongoose");
const { Schema } = mongoose;

// Reply schema for nested replies
const replySchema = new Schema({
  username: {
    type: String,
    required: true,
    trim: true,
  },
  userId: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: [300, "Reply cannot exceed 300 characters"],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const reviewSchema = new Schema(
  {
    bookId: {
      type: String,
      required: [true, "Book ID is required"],
      trim: true,
    },
    bookTitle: {
      type: String,
      required: [true, "Book title is required"],
      trim: true,
    },
    userId: {
      type: String,
      required: [true, "User ID is required"],
    },
    username: {
      type: String,
      required: [true, "Username is required"],
      trim: true,
    },
    rating: {
      type: Number,
      required: [true, "Rating is required"],
      min: [1, "Rating must be at least 1"],
      max: [5, "Rating must be at most 5"],
    },
    comment: {
      type: String,
      required: [true, "Comment is required"],
      trim: true,
      minlength: [1, "Comment must be at least 1 character"],
      maxlength: [500, "Comment cannot exceed 500 characters"],
    },
    spoiler: {
      type: Boolean,
      default: false,
    },
    likes: [
      {
        userId: {
          type: String,
          required: true,
        },
        username: {
          type: String,
          required: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    replies: [replySchema],
    likeCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Method to return client-safe JSON
reviewSchema.methods.toClientJSON = function (currentUserId = null) {
  const isLiked = currentUserId
    ? this.likes.some((like) => like.userId === currentUserId)
    : false;

  return {
    _id: this._id,
    bookId: this.bookId,
    bookTitle: this.bookTitle,
    username: this.username,
    rating: this.rating,
    comment: this.comment,
    spoiler: this.spoiler,
    createdAt: this.createdAt,
    likeCount: this.likeCount,
    isLiked: isLiked,
    replies: this.replies.map((reply) => ({
      _id: reply._id,
      username: reply.username,
      userId: reply.userId,
      content: reply.content,
      createdAt: reply.createdAt,
    })),
  };
};

const BookReview = mongoose.model("BookReview", reviewSchema);

module.exports = BookReview;
