document.addEventListener("DOMContentLoaded", () => {
  const newPassword = document.getElementById("newPassword");
  const confirmPassword = document.getElementById("confirmPassword");
  const resetForm = document.getElementById("resetPasswordForm");
  const errorMessage = document.getElementById("errorMessage");
  const token = document.getElementById("token").value;

  // Toggle password visibility
  document
    .getElementById("toggleNewPassword")
    .addEventListener("click", function () {
      const input = document.getElementById("newPassword");
      const icon = this.querySelector("i");
      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      icon.classList.toggle("bi-eye-slash", !isPassword);
      icon.classList.toggle("bi-eye", isPassword);
    });

  document
    .getElementById("toggleConfirmPassword")
    .addEventListener("click", function () {
      const input = document.getElementById("confirmPassword");
      const icon = this.querySelector("i");
      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      icon.classList.toggle("bi-eye-slash", !isPassword);
      icon.classList.toggle("bi-eye", isPassword);
    });

  // Password strength check
  newPassword.addEventListener("input", () => {
    const val = newPassword.value;
    document.getElementById("minChar").className =
      val.length >= 8 ? "text-success" : "text-muted";
    document.getElementById("upperCase").className = /[A-Z]/.test(val)
      ? "text-success"
      : "text-muted";
    document.getElementById("lowerCase").className = /[a-z]/.test(val)
      ? "text-success"
      : "text-muted";
    document.getElementById("number").className = /\d/.test(val)
      ? "text-success"
      : "text-muted";
  });

  // Submit form handler
  resetForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorMessage.textContent = "";

    const password = newPassword.value.trim();
    const confirm = confirmPassword.value.trim();

    if (password !== confirm) {
      errorMessage.textContent = "Passwords do not match.";
      return;
    }

    if (
      password.length < 8 ||
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/\d/.test(password)
    ) {
      errorMessage.textContent = "Password does not meet the requirements.";
      return;
    }

    try {
      const res = await fetch("/account/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const result = await res.json();

      if (res.ok) {
        alert("Password reset successful. You can now log in.");
        window.location.href = "/account/login";
      } else {
        errorMessage.textContent =
          result.message || "Reset link expired or invalid.";
      }
    } catch (err) {
      console.error(err);
      errorMessage.textContent = "Something went wrong. Please try again.";
    }
  });
});
