const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    gender: { type: String, default: "" },
    phone: { type: String, required: true, default: "" },
verified: { type: Boolean, default: false },
    bio: { type: String, default: "" },
    profilePicture: { type: String, default: "/images/profile_pic.png" },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    sessionId: { type: String, default: null },
    verificationToken: { type: String },
    verificationTokenExpires: { type: Date },
    preferredGenres: { type: [String], default: [] },
    onboardingCompleted: { type: Boolean, default: false },
    verificationReminderSentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Hash password before saving if it's new or modified
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model("User", userSchema);
module.exports = User;
