const mongoose = require('mongoose');
const { Schema } = mongoose;

// Shared reply schema
const replySchema = new Schema({
  username: {
    type: String,
    required: true,
    trim: true
  },
  userId: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: [300, 'Reply cannot exceed 300 characters']
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const reviewSchema = new Schema(
  {
    movieId: {
      type: String,
      required: [true, 'Movie ID is required'],
      trim: true,
    },
    movieTitle: {
      type: String,
      required: [true, 'Movie title is required'],
      trim: true,
    },
    userId: {
      type: String,
      required: [true, 'User ID is required'],
    },
    username: {
      type: String,
      required: [true, 'Username is required'],
      trim: true,
    },
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: [1, 'Rating must be at least 1'],
      max: [5, 'Rating must be at most 5'],
    },
    comment: {
      type: String,
      required: [true, 'Comment is required'],
      trim: true,
      minlength: [1, 'Comment must be at least 1 character'],
      maxlength: [500, 'Comment cannot exceed 500 characters'],
    },
    spoiler: {
      type: Boolean,
      default: false,
    },
    likes: [{
      userId: {
        type: String,
        required: true
      },
      username: {
        type: String,
        required: true
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    }],
    likeCount: {
      type: Number,
      default: 0
    },
    replies: [replySchema]
  },
  {
    timestamps: true,
  }
);

// Return client-friendly JSON
reviewSchema.methods.toClientJSON = function(currentUserId = null) {
  const isLiked = currentUserId ? this.likes?.some(like => like.userId === currentUserId) : false;

  return {
    _id: this._id,
    movieId: this.movieId,
    movieTitle: this.movieTitle,
    username: this.username,
    rating: this.rating,
    comment: this.comment,
    spoiler: this.spoiler,
    createdAt: this.createdAt,
    likeCount: this.likes?.length || 0,
    isLiked: isLiked,
    replies: this.replies.map(reply => ({
      _id: reply._id,
      username: reply.username,
      userId: reply.userId,
      content: reply.content,
      createdAt: reply.createdAt
    }))
  };
};

const MovieReview = mongoose.model('MovieReview', reviewSchema);
module.exports = MovieReview;