const rateLimit = require("express-rate-limit");

// Shared JSON error response so client-side fetch() error handling
// (which expects a `message` field) keeps working when a limit is hit.
const jsonLimitHandler = (req, res) => {
  res.status(429).json({
    message: "Too many requests. Please try again later.",
  });
};

// Login/register/password-reset: the highest-value target for credential
// stuffing and spam-account creation, so this is the strictest limiter.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonLimitHandler,
});

// Reviews, replies, and likes: real users post occasionally, so this only
// needs to catch scripted spam, not slow down normal use.
const reviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonLimitHandler,
});

// Contact form: unauthenticated, so it's an easy spam target.
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.redirect("/contactus?error=too_many_requests");
  },
});

module.exports = { authLimiter, reviewLimiter, contactLimiter };
