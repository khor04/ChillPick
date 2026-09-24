document.addEventListener("DOMContentLoaded", function () {
  const confirmLogoutBtn = document.getElementById("confirmLogoutBtn");

  if (confirmLogoutBtn) {
    confirmLogoutBtn.addEventListener("click", async function () {
      try {
        const res = await fetch("/account/logout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
        });

        if (res.ok) {
          alert("Logout successful!");
          window.location.href = "/";
        } else {
          const data = await res.json();
          alert(data.message || "Logout failed");
        }
      } catch (err) {
        console.error("Fetch error during logout:", err);
        alert("Network error during logout.");
      }
    });
  }
});
