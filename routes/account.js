const express = require("express");
const router = express.Router();
const User = require("../models/User");
const bcrypt = require("bcrypt");
const multer = require("multer");
const SessionModel = require("../models/Session");
const { sendMail } = require("../services/mailer");
const crypto = require("crypto");
const { authLimiter } = require("../middleware/rateLimiters");

require("dotenv").config();

// Server-side password rules, shared by register / reset / change-password so
// they can't be bypassed by skipping the client-side checks.
// Returns an error message, or null if the password is acceptable.
function getPasswordError(password) {
  if (typeof password !== "string" || password.length < 8) {
    return "Password must be at least 8 characters long.";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must contain at least 1 uppercase letter.";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must contain at least 1 lowercase letter.";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must contain at least 1 digit.";
  }
  return null;
}

// ---Middleware to protect routes---
async function enforceSingleSession(req, res, next) {
  if (!req.session.userId) {
    return next(); 
  }

  const user = await User.findById(req.session.userId);
  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (user.sessionId && user.sessionId !== req.session.id) {
    req.session.destroy(() => {
      return res
        .status(401)
        .json({ message: "Session expired. Logged in from another location." });
    });
    return;
  }

  next();
}

// Case-insensitive exact-match query value. User input is regex-escaped so
// characters like "." or "*" can't widen the match.
function exactIgnoreCase(value) {
  const escaped = String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}$`, "i");
}

// POST /account/check-username - live availability check on the register form
router.post("/check-username", async (req, res) => {
  const { username } = req.body;
  if (!username) return res.json({ exists: false });
  const user = await User.exists({ username: exactIgnoreCase(username) });
  res.json({ exists: !!user });
});

// POST /account/check-email - live availability check on the register form
router.post("/check-email", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ exists: false });
  const user = await User.exists({ email: exactIgnoreCase(email) });
  res.json({ exists: !!user });
});

// POST /account/check-password - live "current password" check on the profile page
router.post("/check-password", authLimiter, async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  const user = await User.findById(req.session.userId);
  if (!user) return res.status(404).json({ message: "User not found" });

  const match = await bcrypt.compare(req.body.currentPassword || "", user.password);
  if (!match) {
    return res.status(400).json({ message: "Current password is incorrect." });
  }
  res.json({ valid: true });
});

// POST /account/register
router.post("/register", authLimiter, async (req, res) => {
  try {
    const { username, phone, password } = req.body;
    const email = String(req.body.email || "").trim().toLowerCase();

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username || "")) {
      return res.status(400).json({
        message: "Username must be 3-20 characters (letters, numbers, underscores).",
      });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "")) {
      return res.status(400).json({ message: "Please enter a valid email address." });
    }
    if (!String(phone || "").trim()) {
      return res.status(400).json({ message: "Phone number is required." });
    }
    const passwordError = getPasswordError(password);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    // Check if username or email already exists (ignoring letter case, so
    // "Alice" can't register alongside "alice")
    const existingUsername = await User.findOne({
      username: exactIgnoreCase(username),
    });
    if (existingUsername) {
      return res.status(400).json({ message: "Username already exists." });
    }

    const existingEmail = await User.findOne({ email: exactIgnoreCase(email) });
    if (existingEmail) {
      return res.status(400).json({ message: "Email already exists." });
    }

    // Generate token
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    // Create new user
    const newUser = new User({
      username,
      email,
      phone: String(phone).trim(),
      password,
      verified: false,
      verificationToken,
      verificationTokenExpires,
    });

    await newUser.save();

    // Both awaited in sequence (rather than fired-and-forgotten callbacks) so
    // exactly one response is ever sent - previously, if either callback was
    // slow to fire (e.g. under Mongo latency), its own error response could
    // land after the success response below had already gone out, crashing
    // the process with ERR_HTTP_HEADERS_SENT.
    await new Promise((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });

    req.session.userId = newUser._id;
    req.session.user = {
      id: newUser._id,
      username: newUser.username,
      email: newUser.email,
    };
    req.session.isFirstLogin = true;

    await new Promise((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });

    const verifyUrl = `${
      process.env.CLIENT_URL || "http://localhost:3000"
    }/account/verify?token=${verificationToken}`;
    const mailOptions = {
      to: email,
      subject: "ChillPick Account Verification",
      html: `
        <h2>Welcome to ChillPick, ${username}!</h2>
        <p>Click the link below to verify your account:</p>
        <a href="${verifyUrl}">Verify My Account</a>
        <p>This link expires in 24 hours.</p>
      `,
    };

    // The account is already saved at this point, so an email failure must not
    // turn into "registration failed" - retrying would only say "Username
    // already exists". Report it instead so the page can offer Resend.
    try {
      await sendMail(mailOptions);
    } catch (mailError) {
      console.error("Verification email failed to send:", mailError.message);
      return res.status(200).json({
        message: "Registration successful, but the verification email could not be sent.",
        emailSent: false,
      });
    }

    res.status(200).json({
      message: "Registration successful. Verification email sent.",
      emailSent: true,
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

// GET /account/verify
router.get("/verify", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send("Missing verification token.");

  try {
    const user = await User.findOne({
      verificationToken: token,
      verificationTokenExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res
        .status(400)
        .send("Verification link is invalid or has expired.");
    }

    user.verified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save();

    res.send(`
      <h1>Account Verified!</h1>
      <h4>Your account has been successfully activated. You can now <a href="/account/login">log in</a>.</h4>
    `);
  } catch (error) {
    console.error("Verification error:", error);
    res.status(500).send("Server error during verification.");
  }
});

// POST /account/resend-verification
router.post("/resend-verification", authLimiter, async (req, res) => {
  // Email from the register page's Resend button, or username from the login
  // page's "Resend verification email" link.
  const { email, username } = req.body;

  if (!email && !username) {
    return res.status(400).json({ message: "Email or username is required." });
  }

  try {
    const user = await User.findOne(
      email
        ? { email: exactIgnoreCase(email) }
        : { username: exactIgnoreCase(username) }
    );

    if (!user) return res.status(404).json({ message: "User not found." });
    if (user.verified)
      return res.status(400).json({ message: "User already verified." });

    // Generate new token
    const token = crypto.randomBytes(32).toString("hex");
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    user.verificationToken = token;
    user.verificationTokenExpires = verificationTokenExpires;
    await user.save();

    const verifyUrl = `${
      process.env.CLIENT_URL || "http://localhost:3000"
    }/account/verify?token=${token}`;

    const mailOptions = {
      to: user.email,
      subject: "Verify Your Account - ChillPick",
      html: `
        <p>Hello ${user.username},</p>
        <p>Here is your new verification link. Click to activate your account:</p>
        <a href="${verifyUrl}">Verify My Account</a>
        <p>This link will expire in 24 hours.</p>
      `,
    };

    await sendMail(mailOptions);
    res.status(200).json({ message: "Verification email resent." });
  } catch (error) {
    console.error("Resend verification error:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

// ---Login with session management---
router.post("/login", authLimiter, async (req, res) => {

  const { username, password, force } = req.body;

  try {
   // First check if user exists
       const user = await User.findOne({ username });

    if (!user) {
      return res
        .status(400)
        .json({ type: "username", message: "Username does not exist" });
    }

 if (!user.verified) {
  // If user is not verified, return a specific error
  return res
    .status(403)
    .json({ type: "verification", message: "Account not verified" });
}

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ type: "password", message: "Wrong password" });
    }

    const existingSession = await SessionModel.findOne({ userId: user._id });

    if (
      existingSession &&
      existingSession.sessionId !== req.sessionID &&
      !force
    ) {
      return res.status(409).json({ activeSessionDetected: true });
    }

    req.session.regenerate(async (err) => {
      if (err) {
        console.error("❌ Session regeneration failed:", err);
        return res
          .status(500)
          .json({ message: "Failed to regenerate session" });
      }

      req.session.userId = user._id;
      req.session.user = {
        id: user._id,
        username: user.username,
        email: user.email,
      };
      req.session.isFirstLogin = true;
      req.session.save(async (err) => {
        if (err) {
          console.error("❌ Failed to save new session:", err);
          return res.status(500).json({ message: "Failed to save session" });
        }

        try {
          // Destroy old session in MongoStore if applicable
          if (existingSession && req.sessionStore?.destroy) {
            req.sessionStore.destroy(existingSession.sessionId, (err) => {
              if (err)
                console.error(
                  "❌ Failed to destroy old session in store:",
                  err
                );
            });
          }

          // Clean up existing session in your custom SessionModel
          await SessionModel.deleteMany({ userId: user._id });
          await SessionModel.create({
            userId: user._id,
            sessionId: req.sessionID,
          });

          // Update user's sessionId
          await User.updateOne({ _id: user._id }, { sessionId: req.sessionID });

          return res.status(200).json({
            message: "Login successful",
            onboardingCompleted: user.onboardingCompleted,
          });
        } catch (dbErr) {
          console.error("❌ Error during DB session update:", dbErr);
          return res
            .status(500)
            .json({ message: "Login failed during session update" });
        }
      });
    });
  } catch (err) {
    console.error("❌ Login route error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// ---Return session user info---
router.get("/me", (req, res) => {
  if (req.session?.user) {
    res.json({
      id: req.session.user.id,
      username: req.session.user.username,
      email: req.session.user.email,
    });
  } else {
    res.status(401).json({ error: "Not authenticated" });
  }
});
//check session-status
router.get("/session-status", async (req, res) => {
  if (!req.session.userId || !req.session.token) {
    return res.status(401).json({ message: "Session invalid or expired." });
  }

  const user = await User.findById(req.session.userId);
  if (!user || user.sessionToken !== req.session.token) {
    return res
      .status(401)
      .json({ message: "Session invalidated by another login." });
  }

  return res.status(200).json({ message: "Session is valid." });
});

// Helper function to clean up user session data
async function cleanUpUserSession(userId, sessionIdToDestroy) {
  try {
    if (userId) {
      await User.updateOne({ _id: userId }, { $unset: { sessionId: "" } });
      await SessionModel.deleteOne({ sessionId: sessionIdToDestroy }); // Optional: if you're storing sessions here
    }
  } catch (err) {
    console.error("❌ Cleanup error:", err);
  }
}

//---extend session---
router.post("/extend-session", async (req, res) => {
  try {
    // Ensure session exists
    if (!req.session) {
      return res.status(401).json({ message: "Session not found" });
    }

    // 1. Touch session (update expiration)
    req.session.touch(); // marks session as active for store

    // 2. Also update in MongoStore (important for connect-mongo)
    // You may use req.sessionID to find it in SessionModel
    const sessionId = req.sessionID;
    const userId = req.session.userId;

    if (sessionId) {
      await SessionModel.updateOne(
        { sessionId },
        { $set: { lastExtended: new Date() } } 
      );
    }

    // 3. Optional: make sure user's sessionId is consistent
    if (userId) {
      const user = await User.findById(userId);
      if (!user.sessionId || user.sessionId !== sessionId) {
        await User.updateOne({ _id: userId }, { $set: { sessionId } });
      }
    }
    return res.status(200).json({ message: "Session extended" });
  } catch (error) {
    console.error("❌ Extend session error:", error);
    return res.status(500).json({ message: "Failed to extend session" });
  }
});

//---force logout---
router.post("/force-logout", async (req, res) => {
  try {
    const sessionId = req.sessionID;
    const userId = req.session?.userId;

    if (!sessionId || !userId) {
      return res.status(400).json({ message: "No session to destroy." });
    }

    // Destroy the session from the store
    req.session.destroy(async (err) => {
      if (err) {
        console.error("❌ Error destroying session:", err);
        // Still proceed to delete session manually
      }

      // Delete from SessionModel (if manually tracked)
      await SessionModel.deleteOne({ sessionId });

      // Clear sessionId from User document
      await User.updateOne({ _id: userId }, { $set: { sessionId: null } });

      // Clear the browser session cookie
      res.clearCookie("connect.sid");

      return res
        .status(200)
        .json({
          message: "✅ User forcefully logged out and session cleared.",
        });
    });
  } catch (err) {
    console.error("❌ Force logout error:", err);
    return res.status(500).json({ message: "Internal server error." });
  }
});

//logout for logout now button
// In routes/account.js
router.post("/logout-now", async (req, res) => {
  const sessionId = req.sessionID;
  const userId = req.session?.userId;

  try {
    if (!sessionId) {
      console.warn("⚠️ No session ID found in request.");
      return res.status(400).json({ message: "No active session" });
    }

    // Destroy session (in-memory + cookie)
    req.session.destroy(async (err) => {
      if (err) {
        console.error("❌ Error destroying session:", err);
        return res.status(500).json({ message: "Logout failed" });
      }

      // Delete session from SessionModel (MongoDB)
      try {
        await SessionModel.deleteOne({ sessionId: sessionId });
      } catch (dbErr) {}

      // Clear sessionId in User document (optional)
      if (userId) {
        try {
          const updateResult = await User.updateOne(
            { _id: userId },
            { $set: { sessionId: null } }
          );
        } catch (userErr) {
          console.error("❌ Failed to update user:", userErr);
        }
      }

      // Clear session cookie
      res.clearCookie("connect.sid");

      return res.status(200).json({ message: "Logout successful" });
    });
  } catch (error) {
    console.error("❌ Logout-now error:", error);
    return res.status(500).json({ message: "Internal error during logout" });
  }
});

router.get("/check-session", (req, res) => {
  if (req.session && req.session.userId) {
    return res.status(200).json({ message: "Session active" });
  }
  return res.status(401).json({ message: "Session expired" });
});

// Forgot Password Route
router.post("/forgot-password", authLimiter, async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email: exactIgnoreCase(email || "") });

    if (!user) {
      return res.status(400).json({ message: "Email not found." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 1000 * 60 * 60; // 1 hour
    await user.save();

    const resetLink = `${
      process.env.CLIENT_URL || "http://localhost:3000"
    }/account/reset-password?token=${token}`;

    const mailOptions = {
      to: user.email,
      subject: "Reset Your Password",
      html: `
        <p>Hi ${user.username},</p>
        <p>Click the link below to reset your password. This link expires in 1 hour.</p>
        <a href="${resetLink}">Reset Password</a>
      `,
    };

    await sendMail(mailOptions);

    res.status(200).json({ message: "Reset email sent." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// GET Reset Password Page
router.get("/reset-password", async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).send("Missing token.");
  }

  try {
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).send("Reset token is invalid or has expired.");
    }

    res.render("account/reset-password", { token });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error.");
  }
});

// POST Reset Password Logic
router.post("/reset-password", authLimiter, async (req, res) => {
  const { token, password } = req.body;

  try {
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token." });
    }

    const passwordError = getPasswordError(password);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: "Password reset successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error." });
  }
});

// ---Get user profile for fetching user data---
router.get("/profile-data", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" }); // Return 401 if no session
  }

  try {
    const user = await User.findById(req.session.userId).select("-password"); // Exclude password
    if (!user) {
      return res.status(404).json({ message: "User not found" }); // Return 404 if user not found
    }

    res.status(200).json(user); // Send user data as JSON
  } catch (err) {
    console.error("Error fetching user data:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ---Taste onboarding quiz---
const ONBOARDING_GENRES = [
  "Action",
  "Adventure",
  "Animation",
  "Comedy",
  "Crime",
  "Documentary",
  "Drama",
  "Family",
  "Fantasy",
  "History",
  "Horror",
  "Music",
  "Mystery",
  "Romance",
  "Science Fiction",
  "Thriller",
  "War",
  "Western",
];

router.get("/onboarding", async (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/account/login");
  }
  const user = await User.findById(req.session.userId).select("preferredGenres");
  // Opened from the profile page's "Edit favourite genres" button: pre-select
  // the current picks and return to the profile afterwards.
  const editing = req.query.from === "profile";
  res.render("account/onboarding", {
    genres: ONBOARDING_GENRES,
    selectedGenres: user?.preferredGenres || [],
    editing,
    returnTo: editing ? "/account/profile" : "/dashboard",
  });
});

router.post("/onboarding", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const { genres } = req.body;
    const selected = Array.isArray(genres)
      ? genres.filter((g) => ONBOARDING_GENRES.includes(g))
      : [];

    await User.updateOne(
      { _id: req.session.userId },
      { $set: { preferredGenres: selected, onboardingCompleted: true } }
    );

    res.status(200).json({ message: "Preferences saved" });
  } catch (error) {
    console.error("Onboarding save error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

//---rendering profile page---
router.get("/profile", enforceSingleSession, async (req, res) => {

  if (!req.session.userId) {
    return res.redirect("/account/login"); // Redirect to login if no session
  }

  try {
    const user = await User.findById(req.session.userId).select("-password"); // Exclude password
    if (!user) {
      return res.redirect("/account/login"); // Redirect if user not found
    }

    res.render("account/profile", { user }); // Render the profile page with user data
  } catch (err) {
    console.error("Error fetching user data:", err);
    res.status(500).send("Internal Server Error");
  }
});

// ---Update profile details---
router.put("/profile", async (req, res) => {
  try {
    const { bio, phone, gender } = req.body;

    const updatedFields = {};
    if (bio !== undefined) updatedFields.bio = bio;
    if (phone !== undefined) updatedFields.phone = phone;
    if (gender !== undefined) updatedFields.gender = gender;

    const updatedUser = await User.findByIdAndUpdate(
      req.session.userId,
      updatedFields,
      { new: true, runValidators: true }
    ).select("-password");

    if (!updatedUser)
      return res.status(404).json({ message: "User not found" });

    res
      .status(200)
      .json({ message: "Profile updated successfully", user: updatedUser });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

//---upload profile picture---
const imagekitService = require("../services/imagekitService");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
});

// ---Route to handle profile image upload---
router.post(
  "/upload-profile-picture",
  upload.single("profileImage"),
  async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      if (!req.file) {
        return res.status(400).json({ message: "No image file provided" });
      }

      const user = await User.findById(req.session.userId);
      if (!user) return res.status(404).send("User not found");

      const result = await imagekitService.uploadProfilePicture(
        req.file.buffer,
        req.session.userId
      );

      user.profilePicture = result.url;
      await user.save();

      res.json({ imagePath: result.url });
    } catch (err) {
      console.error(err);
      res.status(500).send("Upload failed");
    }
  }
);

// ---Change password---
router.put("/change-password", async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!currentPassword) {
      return res.status(400).json({ message: "Current password is required." });
    }

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) {
      return res
        .status(400)
        .json({ message: "Current password is incorrect." });
    }

    if (!newPassword) {
      return res.status(400).json({ message: "New password is required." });
    }

    const passwordError = getPasswordError(newPassword);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    if (newPassword === currentPassword) {
      return res
        .status(400)
        .json({
          message: "New password must be different from the current password.",
        });
    }

    user.password = newPassword;
    await user.save();

    return res.json({ message: "Password updated successfully." });
  } catch (error) {
    console.error("Password update error:", error);
    return res.status(500).json({ message: "Server error." });
  }
});

// ---Logout Route---
const destroySession = (req) => {
  return new Promise((resolve, reject) => {
    req.session.destroy((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

router.post("/logout", async (req, res) => {
  const sessionId = req.sessionID;
  const userId = req.session?.userId;

  try {
    // 1. Destroy session
    await destroySession(req);

    // 2. Delete session from SessionModel
    if (sessionId) {
      await SessionModel.deleteOne({ sessionId });
    }

    // 3. Set sessionId to null in user document
    if (userId) {
      await User.updateOne({ _id: userId }, { $set: { sessionId: null } });
    }

    // 4. Clear cookie
    res.clearCookie("connect.sid");
    return res.status(200).json({ message: "Logout successful" });
  } catch (error) {
    console.error("❌ Logout error:", error);
    return res.status(500).json({ message: "Logout failed" });
  }
});

// ---Verify Password Route---
router.post("/verify-password", authLimiter, async (req, res) => {
  const { userId } = req.session;
  const { password } = req.body;

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(403).json({ error: "Incorrect password" });
    }

    res.status(200).json({ message: "Password verified" });
  } catch (err) {
    console.error("Password verification error:", err);
    res
      .status(500)
      .json({ error: "Server error during password verification" });
  }
});

// Removes everything tied to a user so a deleted account leaves nothing
// behind: their lists, activity log, notifications, their own reviews, and
// their likes/replies on other people's reviews.
async function deleteUserData(userId) {
  const Watchlist = require("../models/Watchlist");
  const History = require("../models/History");
  const Notification = require("../models/Notification");
  const UserInteraction = require("../models/SavedSearch");
  const MovieReview = require("../models/Review");
  const BookReview = require("../models/BookReview");
  const id = String(userId);

  await Promise.all([
    Watchlist.deleteMany({ userId: id }),
    History.deleteMany({ userId: id }),
    Notification.deleteMany({ $or: [{ userId: id }, { fromUserId: id }] }),
    UserInteraction.deleteMany({ userId: id }),
    SessionModel.deleteMany({ userId: id }),
  ]);

  for (const Review of [MovieReview, BookReview]) {
    await Review.deleteMany({ userId: id });
    await Review.updateMany({ "replies.userId": id }, { $pull: { replies: { userId: id } } });

    // likeCount is stored separately from likes[], so re-sync it after removing the like
    const liked = await Review.find({ "likes.userId": id });
    for (const review of liked) {
      review.likes = review.likes.filter((like) => like.userId !== id);
      review.likeCount = review.likes.length;
      await review.save();
    }
  }
}

// ---Delete Account Route---
router.post("/delete", async (req, res) => {
  const { userId } = req.session;
  const { password } = req.body;
  const sessionId = req.sessionID;

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(403).json({ error: "Incorrect password" });
    }

    // Delete the user's data first, then the user
    await deleteUserData(userId);
    await User.findByIdAndDelete(userId);

    // Destroy the session
    req.session.destroy(async (err) => {
      if (err) {
        console.error("❌ Error destroying session:", err);
        return res.status(500).json({ error: "Failed to destroy session" });
      }

      try {
        // Remove session record from SessionModel
        await SessionModel.deleteOne({ sessionId });
      } catch (sessionErr) {
        console.error(
          "❌ Error deleting session from SessionModel:",
          sessionErr
        );
      }

      // Clear cookie
      res.clearCookie("connect.sid");
      res.status(200).json({ message: "Account deleted successfully" });
    });
  } catch (err) {
    console.error("❌ Delete account error:", err);
    res.status(500).json({ error: "Server error during account deletion" });
  }
});

module.exports = router;
