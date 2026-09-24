document.addEventListener("DOMContentLoaded", async function () {
  // --- Fetch Profile Data ---
  const welcomeMessageElement = document.getElementById("welcomeMessage");
  if (!welcomeMessageElement) {
    console.error("Element with id 'welcomeMessage' not found.");
    return;
  }

  try {
    const response = await fetch("/account/profile-data", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });

    if (!response.ok) throw new Error("Failed to load profile");

    const currentUser = await response.json();
    welcomeMessageElement.textContent = `Welcome back, ${
      currentUser.username || "User"
    }`;
    document.getElementById("profileName").textContent = currentUser.username;
    document.getElementById("profileEmail").textContent = currentUser.email;
    document.getElementById("usernameField").value = currentUser.username;
    document.getElementById("emailField").value = currentUser.email;
    document.getElementById("phoneField").value = currentUser.phone || "";
    document.getElementById("genderField").value = currentUser.gender || "";
    document.getElementById("bioText").textContent =
      currentUser.bio || "Add your bio...";
    document
      .getElementById("bioText")
      .classList.toggle("bio-placeholder", !currentUser.bio);
    if (currentUser.profilePicture) {
      document.getElementById("profilePicture").src =
        currentUser.profilePicture;
    }
  } catch (error) {
    console.error("Error:", error);
    alert("Failed to load profile. Please log in again.");
    window.location.href = "/account/login";
  }

  // Session inactivity warning now runs sitewide via js/session-inactivity.js
  // (loaded from partials/header.ejs), not per-page here.

  // --- Profile Picture Upload ---
  const uploadPicModal = new bootstrap.Modal(
    document.getElementById("uploadPicModal")
  );
  const profileImageInput = document.getElementById("profileImageInput");
  const imagePreview = document.getElementById("imagePreview");
  const profilePicture = document.getElementById("profilePicture");
  const saveBtn = document.getElementById("saveProfilePicBtn");

  document
    .getElementById("uploadPicBtn")
    .addEventListener("click", function () {
      profileImageInput.value = "";
      imagePreview.src = profilePicture.src;
      uploadPicModal.show();
    });

  profileImageInput.addEventListener("change", function () {
    const file = this.files[0];
    if (file && file.size <= 2 * 1024 * 1024) {
      const reader = new FileReader();
      reader.onload = function (e) {
        imagePreview.src = e.target.result;
      };
      reader.readAsDataURL(file);
    } else {
      alert("File must be under 2MB.");
      this.value = "";
    }
  });

  saveBtn.addEventListener("click", async function () {
    const file = profileImageInput.files[0];
    if (!file) return alert("Please select an image first");

    const formData = new FormData();
    formData.append("profileImage", file);

    try {
      const res = await fetch("/account/upload-profile-picture", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        profilePicture.src = data.imagePath;
        imagePreview.src = data.imagePath;
        uploadPicModal.hide();
        alert("Profile picture updated successfully!");
      } else {
        const errorText = await res.text();
        alert("Upload failed: " + errorText);
      }
    } catch (err) {
      console.error("Upload error:", err);
      alert("Error uploading file.");
    }
  });

  // --- Success Modal ---
  function showSuccessModal() {
    const modal = document.getElementById("successModal");
    if (!modal) {
      console.error("Success modal not found.");
      return;
    }

    modal.style.display = "flex";

    const closeBtn = document.getElementById("closeModalBtn");
    const hide = () => {
      modal.style.display = "none";
      closeBtn.removeEventListener("click", hide);
    };

    closeBtn.addEventListener("click", hide);
    setTimeout(hide, 2000);
  }

  // --- Edit Bio ---
  const editBioBtn = document.getElementById("editBioBtn");
  const bioDisplay = document.getElementById("bioDisplay");
  const bioEdit = document.getElementById("bioEdit");
  const bioText = document.getElementById("bioText");
  const bioInput = document.getElementById("bioInput");
  const cancelBioBtn = document.getElementById("cancelBioBtn");
  const saveBioBtn = document.getElementById("saveBioBtn");

  editBioBtn.addEventListener("click", () => {
    bioInput.value =
      bioText.textContent.trim() === "Add your bio..."
        ? ""
        : bioText.textContent.trim();
    bioDisplay.classList.add("d-none");
    bioEdit.classList.remove("d-none");
  });

  cancelBioBtn.addEventListener("click", () => {
    bioDisplay.classList.remove("d-none");
    bioEdit.classList.add("d-none");
  });

  saveBioBtn.addEventListener("click", async () => {
    const newBio = bioInput.value.trim();
    if (!newBio) return alert("Bio cannot be empty!");

    try {
      const response = await fetch("/account/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio: newBio }),
      });

      if (response.ok) {
        bioText.textContent = newBio || "Add your bio...";
        bioText.classList.toggle("bio-placeholder", !newBio);
        bioDisplay.classList.remove("d-none");
        bioEdit.classList.add("d-none");
        showSuccessModal();
      } else {
        const errorData = await response.json();
        console.error("Error:", errorData.message);
      }
    } catch (error) {
      console.error("Error:", error);
    }
  });

  // --- Edit Profile (Phone & Gender) ---
  const editBtn = document.getElementById("editBtn");
  const phoneInput = document.getElementById("phoneField");
  const genderInput = document.getElementById("genderField");

  editBtn.addEventListener("click", async function () {
    const isEditMode = this.textContent === "Edit";

    if (isEditMode) {
      phoneInput.readOnly = false;
      genderInput.disabled = false;
      this.textContent = "Save";
      this.classList.remove("btn-outline-warning");
      this.classList.add("btn-warning");
    } else {
      const updatedData = {
        phone: phoneInput.value.trim(),
        gender: genderInput.value,
      };

      try {
        const res = await fetch("/account/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatedData),
        });

        if (res.ok) {
          showSuccessModal();
        } else {
          const errText = await res.text();
          alert("Failed to update profile: " + errText);
        }
      } catch (err) {
        console.error("Error updating profile:", err);
        alert("An error occurred while updating your profile.");
      }

      phoneInput.readOnly = true;
      genderInput.disabled = true;
      this.textContent = "Edit";
      this.classList.add("btn-outline-warning");
      this.classList.remove("btn-warning");
    }
  });

  // --- Change Password ---
  const changePasswordModal = new bootstrap.Modal(
    document.getElementById("changePasswordModal")
  );
  const changePasswordForm = document.getElementById("changePasswordForm");
  const currentPasswordInput = document.getElementById("currentPassword");
  const newPasswordInput = document.getElementById("newPassword");
  const confirmPasswordInput = document.getElementById("confirmPassword");

  // Toggle password visibility
  document.querySelectorAll(".toggle-password").forEach((button) => {
    button.addEventListener("click", function () {
      const targetId = this.getAttribute("data-target");
      const input = document.getElementById(targetId);
      const icon = this.querySelector("i");

      if (input.type === "password") {
        input.type = "text";
        icon.classList.remove("bi-eye-slash");
        icon.classList.add("bi-eye");
      } else {
        input.type = "password";
        icon.classList.remove("bi-eye");
        icon.classList.add("bi-eye-slash");
      }
    });
  });

  // Real-time current password validation (server-side with debounce)
  let currentPasswordTimeout;
  currentPasswordInput.addEventListener("input", () => {
    const feedbackEl = document.getElementById("currentPasswordFeedback");
    currentPasswordInput.classList.remove("is-invalid");
    feedbackEl.textContent = "";
    feedbackEl.style.display = "none";

    clearTimeout(currentPasswordTimeout);
    const password = currentPasswordInput.value.trim();
    if (!password) return;

    currentPasswordTimeout = setTimeout(async () => {
      try {
        const res = await fetch("/account/check-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currentPassword: password }),
        });

        const result = await res.json();
        if (!res.ok) {
          currentPasswordInput.classList.add("is-invalid");
          feedbackEl.textContent =
            result.message || "Current password is incorrect.";
          feedbackEl.style.display = "block";
        }
      } catch (err) {
        console.error("Error checking password:", err);
      }
    }, 600);
  });

  // Real-time validation for new password (client-side)
  newPasswordInput.addEventListener("input", () => {
    const password = newPasswordInput.value;
    const current = currentPasswordInput.value;
    const feedback = [];

    if (password.length < 8) feedback.push("At least 8 characters");
    if (!/[A-Z]/.test(password)) feedback.push("1 uppercase letter");
    if (!/[a-z]/.test(password)) feedback.push("1 lowercase letter");
    if (!/[0-9]/.test(password)) feedback.push("1 digit");
    if (password === current && password !== "")
      feedback.push("Must differ from current password");

    const feedbackEl = document.getElementById("newPasswordFeedback");
    if (feedback.length) {
      feedbackEl.innerHTML = feedback.join(", ");
      feedbackEl.style.display = "block";
      newPasswordInput.classList.add("is-invalid");
    } else {
      feedbackEl.innerHTML = "";
      feedbackEl.style.display = "none";
      newPasswordInput.classList.remove("is-invalid");
    }
  });

  // Confirm password validation
  confirmPasswordInput.addEventListener("input", () => {
    const confirm = confirmPasswordInput.value;
    const newPass = newPasswordInput.value;
    const feedbackEl = document.getElementById("confirmPasswordFeedback");

    if (confirm !== newPass) {
      feedbackEl.textContent = "Passwords do not match.";
      feedbackEl.style.display = "block";
      confirmPasswordInput.classList.add("is-invalid");
    } else {
      feedbackEl.textContent = "";
      feedbackEl.style.display = "none";
      confirmPasswordInput.classList.remove("is-invalid");
    }
  });

  // Save Changes button handler
  document
    .getElementById("savePasswordBtn")
    .addEventListener("click", async () => {
      const currentPassword = currentPasswordInput.value.trim();
      const newPassword = newPasswordInput.value.trim();
      const confirmPassword = confirmPasswordInput.value.trim();

      // Clear previous validation
      document
        .querySelectorAll(".invalid-feedback")
        .forEach((el) => (el.textContent = ""));
      document
        .querySelectorAll(".is-invalid")
        .forEach((el) => el.classList.remove("is-invalid"));

      if (newPassword !== confirmPassword) {
        const feedbackEl = document.getElementById("confirmPasswordFeedback");
        feedbackEl.textContent = "Passwords do not match.";
        feedbackEl.style.display = "block";
        confirmPasswordInput.classList.add("is-invalid");
        return;
      }

      try {
        const response = await fetch("/account/change-password", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currentPassword, newPassword }),
        });

        const result = await response.json();

        if (!response.ok) {
          if (result.message.includes("Current")) {
            currentPasswordInput.classList.add("is-invalid");
            const feedbackEl = document.getElementById(
              "currentPasswordFeedback"
            );
            feedbackEl.textContent = result.message;
            feedbackEl.style.display = "block";
          } else {
            newPasswordInput.classList.add("is-invalid");
            const feedbackEl = document.getElementById("newPasswordFeedback");
            feedbackEl.textContent = result.message;
            feedbackEl.style.display = "block";
          }
          return;
        }

        alert(result.message); // Success
        changePasswordForm.reset();
        const modal = bootstrap.Modal.getInstance(
          document.getElementById("changePasswordModal")
        );
        modal.hide();
      } catch (err) {
        console.error(err);
        alert("Something went wrong. Please try again.");
      }
    });

  // DELETE ACCOUNT LOGIC

  const verifyPasswordModal = new bootstrap.Modal(
    document.getElementById("verifyPasswordModal")
  );
  const deleteModalInstance = new bootstrap.Modal(
    document.getElementById("deleteAccountModal")
  );

  // Elements
  const verifyPasswordError = document.getElementById("verifyPasswordError");
  const verifyPasswordBtn = document.getElementById("verifyPasswordBtn");
  const deleteAccountModalBtn = document.getElementById(
    "deleteAccountModalBtn"
  );
  const noDeleteAccountModalBtn = document.getElementById(
    "noDeleteAccountModalBtn"
  );
  const confirmDeleteCheckbox = document.getElementById(
    "confirmDeleteCheckbox"
  );

  // Show verify password modal on "Delete Account" button click
  document
    .getElementById("deleteAccountBtn")
    .addEventListener("click", function () {
      document.getElementById("verifyPassword").value = "";
      document.getElementById("verifyPassword").classList.remove("is-invalid");
      document.getElementById("verifyPasswordFeedback").textContent = "";
      verifyPasswordError.style.display = "none";

      verifyPasswordModal.show();
    });

  // Verify Password Button Click
  verifyPasswordBtn.addEventListener("click", async function () {
    const passwordInput = document.getElementById("verifyPassword");
    const password = passwordInput.value.trim();
    const feedback = document.getElementById("verifyPasswordFeedback");

    // Reset validation state
    passwordInput.classList.remove("is-invalid");
    feedback.textContent = "";
    verifyPasswordError.style.display = "none";

    if (!password) {
      passwordInput.classList.add("is-invalid");
      feedback.textContent = "Password is required";
      verifyPasswordError.textContent = "Password is required.";
      verifyPasswordError.style.display = "block";
      passwordInput.focus();
      return;
    }

    try {
      // Verify the password with the backend
      const response = await fetch("/account/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const result = await response.json();

      if (!response.ok) {
        // Show error if password is incorrect
        passwordInput.classList.add("is-invalid");
        feedback.textContent = result.error || "Incorrect password.";
        verifyPasswordError.textContent = result.error || "Incorrect password.";
        verifyPasswordError.style.display = "block";
        return;
      }

      // If password is correct, show the delete confirmation modal
      verifyPasswordModal.hide();
      confirmDeleteCheckbox.checked = false;
      deleteAccountModalBtn.disabled = true;
      deleteModalInstance.show();

      // Store the password temporarily for the final deletion step
      sessionStorage.setItem("tempDeletePassword", password);
    } catch (err) {
      console.error("Error verifying password:", err);
      alert(
        "An error occurred while verifying your password. Please try again."
      );
    }
  });

  // Enable/disable confirm button based on checkbox
  confirmDeleteCheckbox.addEventListener("change", function () {
    deleteAccountModalBtn.disabled = !this.checked;
  });

  // Cancel deletion ("No" button)
  noDeleteAccountModalBtn.addEventListener("click", () => {
    deleteModalInstance.hide();
  });

  // Final Delete Account Button Click
  deleteAccountModalBtn.addEventListener("click", async function () {
    const password = sessionStorage.getItem("tempDeletePassword");
    if (!password) return;

    try {
      const response = await fetch("/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const result = await response.json();
      if (!response.ok) {
        alert(result.error || "Error deleting account");
        return;
      }

      alert(result.message);
      window.location.href = "/account/register"; 
    } catch (err) {
      console.error("Delete error:", err);
      alert("Something went wrong while deleting your account.");
    }
  });
});
