// const passwordInput = document.getElementById("password");
// const usernameInput = document.getElementById("username");
// const togglePassword = document.getElementById("togglePassword");
// const passwordIcon = document.getElementById("passwordIcon");
// const usernameError = document.getElementById("usernameError");
// const passwordError = document.getElementById("passwordError");

// // Toggle password visibility
// togglePassword.addEventListener("click", () => {
//   passwordInput.type = passwordInput.type === "password" ? "text" : "password";
//   passwordIcon.classList.toggle("bi-eye");
//   passwordIcon.classList.toggle("bi-eye-slash");
// });

// // Form submission
// document
//   .getElementById("loginForm")
//   .addEventListener("submit", async function (e) {
//     e.preventDefault();

//     usernameError.textContent = "";
//     passwordError.textContent = "";

//     const username = usernameInput.value.trim();
//     const password = passwordInput.value;

//     try {
//       const response = await fetch("/account/login", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ username, password }),
//         credentials: "include",
//       });

//       const result = await response.json();

//       // If another session is detected
//       if (response.status === 409 && result.activeSessionDetected) {
//         const modal = new bootstrap.Modal(
//           document.getElementById("activeSessionModal")
//         );
//         modal.show();

//         document.getElementById("continueBtn").onclick = async () => {
//           modal.hide();

//           const loginRes = await fetch("/account/login", {
//             method: "POST",
//             headers: { "Content-Type": "application/json" },
//             body: JSON.stringify({ username, password, force: true }),
//             credentials: "include",
//           });

//           const loginResult = await loginRes.json();
//           if (loginRes.ok) {
//             window.location.href = "/account/profile";
//           } else {
//             alert(
//               loginResult.message || "❌ Failed to login after force logout."
//             );
//           }
//         };

//         return;
//       }

//       // Error handling
//       if (!response.ok) {
//         if (result.type === "username") {
//           usernameError.textContent = result.message;
//         } else if (result.type === "password") {
//           passwordError.textContent = result.message;
//         } else {
//           alert(result.message || "Login failed");
//         }
//         return;
//       }

//       // Success
//       window.location.href = "/account/profile";
//     } catch (error) {
//       console.error("Login error:", error);
//       alert("Something went wrong. Please try again.");
//     }
//   });

const passwordInput = document.getElementById("password");
const usernameInput = document.getElementById("username");
const togglePassword = document.getElementById("togglePassword");
const passwordIcon = document.getElementById("passwordIcon");
const usernameError = document.getElementById("usernameError");
const passwordError = document.getElementById("passwordError");
const verificationError = document.getElementById("verificationError"); // Ensure this exists in HTML
const resendVerificationWrap = document.getElementById("resendVerificationWrap");
const resendVerificationStatus = document.getElementById("resendVerificationStatus");

// "Resend verification email" link - shown when login says the account isn't
// verified (email never arrived, got lost, or the 24h link expired).
document
  .getElementById("resendVerificationLink")
  .addEventListener("click", async (e) => {
    e.preventDefault();
    const username = usernameInput.value.trim();
    resendVerificationStatus.className = "small mt-1 text-muted";
    resendVerificationStatus.textContent = "Sending...";

    try {
      const res = await fetch("/account/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const result = await res.json();
      resendVerificationStatus.className = res.ok
        ? "small mt-1 text-success"
        : "small mt-1 text-danger";
      resendVerificationStatus.textContent = res.ok
        ? "Verification email sent! Please check your inbox."
        : result.message || "Could not send the email. Please try again later.";
    } catch (err) {
      console.error("Resend verification error:", err);
      resendVerificationStatus.className = "small mt-1 text-danger";
      resendVerificationStatus.textContent =
        "Could not send the email. Please try again later.";
    }
  });

// Toggle password visibility
togglePassword.addEventListener("click", () => {
  passwordInput.type = passwordInput.type === "password" ? "text" : "password";
  passwordIcon.classList.toggle("bi-eye");
  passwordIcon.classList.toggle("bi-eye-slash");
});

// Form submission
document.getElementById("loginForm").addEventListener("submit", async function (e) {
  e.preventDefault();

  // Clear previous errors
  usernameError.textContent = "";
  passwordError.textContent = "";
  verificationError.textContent = "";
  resendVerificationWrap.classList.add("d-none");
  resendVerificationStatus.textContent = "";

  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  try {
    const response = await fetch("/account/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      credentials: "include",
    });

    const result = await response.json();

    // If another session is detected
    if (response.status === 409 && result.activeSessionDetected) {
      const modal = new bootstrap.Modal(
        document.getElementById("activeSessionModal")
      );
      modal.show();

      document.getElementById("continueBtn").onclick = async () => {
        modal.hide();

        const loginRes = await fetch("/account/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password, force: true }),
          credentials: "include",
        });

        const loginResult = await loginRes.json();
        if (loginRes.ok) {
          window.location.href = loginResult.onboardingCompleted
            ? "/account/profile"
            : "/account/onboarding";
        } else {
          alert(loginResult.message || "❌ Failed to login after force logout.");
        }
      };

      return;
    }

    // Error handling
   if (!response.ok) {
  if (response.status === 403 && result.type === "verification") {
    verificationError.textContent = "❌ Your account is not verified. Please check your email.";
    resendVerificationWrap.classList.remove("d-none");
     } else if (result.type === "username") {
    usernameError.textContent = result.message;
  } else if (result.type === "password") {
    passwordError.textContent = result.message;
  } else {
    alert(result.message || "Login failed");
  }
  return;
}

    // Success
    window.location.href = result.onboardingCompleted
      ? "/account/profile"
      : "/account/onboarding";
  } catch (error) {
    console.error("Login error:", error);
    alert("Something went wrong. Please try again.");
  }
});
