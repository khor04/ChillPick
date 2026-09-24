// Sitewide inactivity warning: after 15 minutes of no activity, shows a
// "still there?" modal with a 60s countdown before force-logging the user
// out. Relies on window.chillPickAuthCheck (set in partials/header.ejs) to
// know whether there's a session worth protecting, and on the
// #sessionExpiringModal / #sessionExpiredModal markup also living in
// partials/header.ejs, so this runs on every page that includes the header.
(function () {
  const INACTIVITY_MS = 15 * 60 * 1000; // warn after 15 minutes idle
  const COUNTDOWN_SECONDS = 60;

  document.addEventListener("DOMContentLoaded", async function () {
    if (!window.chillPickAuthCheck) return; // header partial not on this page

    const currentUser = await window.chillPickAuthCheck;
    if (!currentUser || !currentUser.username) return; // not logged in

    const sessionExpiringModalEl = document.getElementById("sessionExpiringModal");
    const sessionExpiredModalEl = document.getElementById("sessionExpiredModal");
    const countdownElement = document.getElementById("countdown");
    const stayLoggedInBtn = document.getElementById("stayLoggedInBtn");
    const logoutNowBtn = document.getElementById("logoutNowBtn");
    const loginAgainBtn = document.getElementById("loginAgainBtn");

    if (!sessionExpiringModalEl || !sessionExpiredModalEl) return; // modals missing on this page

    let inactivityTimer;
    let countdownInterval;
    let isWarningActive = false;

    function hideExpiringModal() {
      bootstrap.Modal.getInstance(sessionExpiringModalEl)?.hide();
    }

    function resetInactivityTimer() {
      if (isWarningActive) return;

      clearTimeout(inactivityTimer);
      clearInterval(countdownInterval);
      hideExpiringModal();

      inactivityTimer = setTimeout(startSessionWarningTimer, INACTIVITY_MS);
    }

    function startSessionWarningTimer() {
      isWarningActive = true;
      const sessionExpiringModal = bootstrap.Modal.getOrCreateInstance(sessionExpiringModalEl);
      let countdown = COUNTDOWN_SECONDS;

      sessionExpiringModal.show();
      countdownElement.textContent = "1:00";

      countdownInterval = setInterval(() => {
        countdown -= 1;
        const minutes = Math.floor(countdown / 60);
        const seconds = countdown % 60;
        countdownElement.textContent = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;

        if (countdown <= 0) {
          clearInterval(countdownInterval);
          isWarningActive = false;
          sessionExpiringModal.hide();
          expireSession();
        }
      }, 1000);
    }

    function expireSession() {
      fetch("/account/force-logout", { method: "POST", credentials: "include" })
        .catch(() => {})
        .finally(() => {
          bootstrap.Modal.getOrCreateInstance(sessionExpiredModalEl).show();
        });
    }

    stayLoggedInBtn.addEventListener("click", () => {
      clearInterval(countdownInterval);
      hideExpiringModal();
      isWarningActive = false;

      fetch("/account/extend-session", { method: "POST", credentials: "include" })
        .then((res) => {
          if (res.ok) {
            resetInactivityTimer();
          } else {
            alert("Failed to extend session.");
            window.location.href = "/account/login";
          }
        })
        .catch(() => {
          window.location.href = "/account/login";
        });
    });

    logoutNowBtn.addEventListener("click", () => {
      isWarningActive = false;
      clearInterval(countdownInterval);
      hideExpiringModal();

      fetch("/account/logout-now", { method: "POST", credentials: "include" })
        .then((res) => {
          if (res.ok) {
            window.location.href = "/";
          } else {
            return res.json().then((data) => {
              alert(`❌ Logout failed: ${data.message || "Unknown error"}`);
            });
          }
        })
        .catch(() => {
          alert("❌ Network error during logout.");
        });
    });

    loginAgainBtn?.addEventListener("click", () => {
      window.location.href = "/account/login";
    });

    ["click", "mousemove", "keydown", "scroll", "touchstart"].forEach((eventName) => {
      window.addEventListener(eventName, resetInactivityTimer);
    });

    resetInactivityTimer();
  });
})();
