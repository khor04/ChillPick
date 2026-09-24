const Notification = require("../models/Notification");

// Notifies a review's owner that someone liked or replied to it.
// Silently skips self-notifications and never throws - a notification
// failing to save should never break the like/reply action it's attached to.
const notifyReviewOwner = async ({
  ownerId,
  actorId,
  actorUsername,
  type,
  itemType,
  itemId,
  itemTitle,
  reviewId,
}) => {
  if (String(ownerId) === String(actorId)) return;

  const message =
    type === "like"
      ? `${actorUsername} liked your review of "${itemTitle}"`
      : `${actorUsername} replied to your review of "${itemTitle}"`;
  const link =
    itemType === "movie" ? `/movie_detail/${itemId}` : `/book_detail/${itemId}`;

  try {
    await Notification.create({
      userId: ownerId,
      type,
      fromUserId: actorId,
      fromUsername: actorUsername,
      itemType,
      itemId,
      itemTitle,
      reviewId,
      message,
      link,
    });
  } catch (err) {
    console.error("Failed to create notification:", err.message);
  }
};

module.exports = { notifyReviewOwner };
