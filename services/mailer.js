const axios = require("axios");
const nodemailer = require("nodemailer");

// Single place that sends every ChillPick email (verification, resend,
// password reset, verification reminders).
//
// - BREVO_API_KEY set: sends through Brevo's HTTP API. Needed on Render's free
//   plan, which blocks outgoing SMTP (ports 25/465/587) - this uses HTTPS.
// - Otherwise: falls back to Gmail SMTP (EMAIL_USER / EMAIL_PASS), e.g. for
//   local development without a Brevo key.
//
// The sender address is MAIL_FROM if set, else EMAIL_USER. With Brevo it must
// be a sender you've added and verified in your Brevo account.
const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const SENDER_NAME = "ChillPick";

const senderEmail = () => process.env.MAIL_FROM || process.env.EMAIL_USER;

async function sendViaBrevo({ to, subject, html }) {
  try {
    await axios.post(
      BREVO_URL,
      {
        sender: { name: SENDER_NAME, email: senderEmail() },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      },
      {
        headers: {
          "api-key": process.env.BREVO_API_KEY,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        timeout: 10000,
      }
    );
  } catch (err) {
    // Surface Brevo's own explanation (e.g. "sender not valid", "Key not found")
    const detail = err.response?.data?.message || err.message;
    throw new Error(`Brevo send failed: ${detail}`);
  }
}

async function sendViaGmail({ to, subject, html }) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  await transporter.sendMail({
    from: `"${SENDER_NAME}" <${senderEmail()}>`,
    to,
    subject,
    html,
  });
}

// Throws if the email couldn't be sent, so callers can decide what to do.
async function sendMail({ to, subject, html }) {
  if (process.env.BREVO_API_KEY) {
    return sendViaBrevo({ to, subject, html });
  }
  return sendViaGmail({ to, subject, html });
}

module.exports = { sendMail };
