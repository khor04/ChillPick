const crypto = require("crypto");
const { sendMail } = require("./mailer");
const User = require("../models/User");

const REMINDER_DELAY_MS = 24 * 60 * 60 * 1000; // send once, 24h after signup

// Finds accounts that registered 24+ hours ago, are still unverified, and
// haven't already been sent a reminder, then emails each one a fresh
// verification link (reusing the same flow as the "resend" button) and
// marks them so they're never reminded twice.
const sendVerificationReminders = async () => {
  const cutoff = new Date(Date.now() - REMINDER_DELAY_MS);

  const candidates = await User.find({
    verified: false,
    verificationReminderSentAt: null,
    createdAt: { $lte: cutoff },
  });

  if (candidates.length === 0) {
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const user of candidates) {
    try {
      // Issue a fresh token rather than reusing the original, since it may
      // already be close to (or past) its own 24h expiry by now.
      const token = crypto.randomBytes(32).toString("hex");
      user.verificationToken = token;
      user.verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const verifyUrl = `${
        process.env.CLIENT_URL || "http://localhost:3000"
      }/account/verify?token=${token}`;

      await sendMail({
        to: user.email,
        subject: "Don't forget to verify your ChillPick account",
        html: `
          <p>Hi ${user.username},</p>
          <p>You signed up for ChillPick but haven't verified your email yet - your account is still inactive until you do.</p>
          <p>Click below to verify now:</p>
          <a href="${verifyUrl}">Verify My Account</a>
          <p>This link expires in 24 hours.</p>
        `,
      });

      user.verificationReminderSentAt = new Date();
      await user.save();
      sent += 1;
    } catch (err) {
      console.error(`❌ Failed to send verification reminder to ${user.email}:`, err.message);
      failed += 1;
    }
  }

  console.log(`✅ Verification reminders: ${sent} sent, ${failed} failed.`);
  return { sent, failed };
};

module.exports = { sendVerificationReminders };
