document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("forgotForm");
  const userEmailDisplay = document.getElementById("userEmailDisplay");
  const emailModal = new bootstrap.Modal(document.getElementById("emailModal"));
  const resendBtn = document.getElementById("resendBtn");

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    const email = document.getElementById("forgotEmail").value.trim();

    if (email) {
      try {
        const response = await fetch("/account/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });

        const result = await response.text();

        if (response.ok) {
          userEmailDisplay.textContent = email;
          emailModal.show();
        } else {
          alert(`❌ ${result}`);
        }
      } catch (err) {
        console.error("Forgot password error:", err);
        alert("❌ Failed to send reset email.");
      }
    }
  });

  resendBtn.addEventListener("click", function () {
    const email = document.getElementById("forgotEmail").value;
    alert("Simulated resend to: " + email);
    emailModal.hide();
  });
});
