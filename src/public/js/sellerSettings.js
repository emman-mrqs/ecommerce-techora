const editToggleBtn = document.getElementById("editToggleBtn");
const infoDisplay = document.getElementById("infoDisplay");
const editForm = document.getElementById("editForm");
const cancelBtn = document.getElementById("cancelBtn");
const storeIconWrapper = document.getElementById("storeIconWrapper");
const storeIconInput = document.getElementById("storeIconInput");
let storeIconPreview = document.getElementById("storeIconPreview");

// Toggle edit mode
editToggleBtn.addEventListener("click", () => {
  infoDisplay.classList.add("d-none");
  editForm.classList.remove("d-none");
  editToggleBtn.classList.add("d-none");
});

cancelBtn.addEventListener("click", () => {
  editForm.classList.add("d-none");
  infoDisplay.classList.remove("d-none");
  editToggleBtn.classList.remove("d-none");
});

// Store icon click → trigger file input
storeIconWrapper.addEventListener("click", () => {
  storeIconInput.click();
});

// Preview uploaded icon
storeIconInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = () => {
      if (storeIconPreview.tagName === "IMG") {
        storeIconPreview.src = reader.result;
      } else {
        // If placeholder div → turn it into an img
        const img = document.createElement("img");
        img.src = reader.result;
        img.className = "store-icon";
        img.id = "storeIconPreview";
        storeIconPreview.replaceWith(img);
        storeIconPreview = img; // update reference
      }
    };
    reader.readAsDataURL(file);
  }
});

/* ================
   Toast System
================ */
/* ================
   Bootstrap Toast
================ */
function showToast(message, type = "success") {
  const toastEl = document.getElementById("liveToast");
  const toastBody = document.getElementById("toastMessage");

  // Reset bg color
  toastEl.classList.remove("bg-success", "bg-danger", "bg-dark");

  // Apply based on type
  if (type === "success") {
    toastEl.classList.add("bg-success");
  } else if (type === "error") {
    toastEl.classList.add("bg-danger");
  } else {
    toastEl.classList.add("bg-dark");
  }

  toastBody.textContent = message;

  const toast = new bootstrap.Toast(toastEl, { delay: 4000 });
  toast.show();
}


// AJAX Save
editForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const formData = new FormData(editForm);

  const res = await fetch("/seller/settings/update", {
    method: "POST",
    body: formData,
  });

  const result = await res.json();

  if (result.success) {
    const seller = result.seller;

    // Switch back to view mode
    editForm.classList.add("d-none");
    infoDisplay.classList.remove("d-none");
    editToggleBtn.classList.remove("d-none");

    // Update infoDisplay content
    infoDisplay.innerHTML = `
      <p><strong>Category:</strong> ${seller.category || "-"}</p>
      <p><strong>Description:</strong> ${seller.description || "-"}</p>
      <p><strong>Business Address:</strong> ${seller.business_address || "-"}</p>
      <p><strong>Email:</strong> ${seller.store_email || "-"}</p>
      <p><strong>Contact:</strong> ${seller.contact_number || "-"}</p>
    `;

    // ✅ Update store name heading
    const storeNameEl = document.querySelector(".current-store-name");
    if (storeNameEl) {
      storeNameEl.textContent = seller.store_name || "Your Store";
    }

    // ✅ Update store icon (if new one uploaded)
    if (seller.store_icon) {
      if (storeIconPreview.tagName === "IMG") {
        storeIconPreview.src = seller.store_icon;
      } else {
        const img = document.createElement("img");
        img.src = seller.store_icon;
        img.className = "store-icon";
        img.id = "storeIconPreview";
        storeIconPreview.replaceWith(img);
        storeIconPreview = img;
      }
    }

    // Show toast AFTER switching to view mode
    showToast("Store info updated!", "success");
  } else {
    showToast("❌ Failed: " + result.msg, "error");
  }
});


