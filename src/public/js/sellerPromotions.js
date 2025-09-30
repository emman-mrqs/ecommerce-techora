// ==============================
// Helper Functions
// ==============================

// Show toast notification
function showToast(message, type = "dark") {
  const toastEl = document.getElementById("toastMessage");
  toastEl.className = `toast align-items-center text-white bg-${type} border-0`;
  toastEl.querySelector(".toast-body").textContent = message;
  new bootstrap.Toast(toastEl).show();
}

// Close modal by ID
function closeModal(modalId) {
  const modalEl = document.getElementById(modalId);
  const modal = bootstrap.Modal.getInstance(modalEl);
  if (modal) modal.hide();
}

// ==============================
// Create Voucher
// ==============================
document.getElementById("createVoucherForm").addEventListener("submit", async e => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());

  const res = await fetch("/seller/promotions/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  const result = await res.json();

  closeModal("createVoucherModal"); // auto-close
  showToast(result.msg, result.success ? "success" : "danger");
  if (result.success) setTimeout(() => location.reload(), 1200);
});

// ==============================
// Edit Voucher
// ==============================
document.querySelectorAll(".edit-btn").forEach(btn => {
  btn.addEventListener("click", e => {
    const row = e.target.closest(".promotion-row");
    const form = document.getElementById("editVoucherForm");

    // fill form fields
    form.id.value = row.dataset.id;
    form.voucher_code.value = row.querySelector(".voucher-code").textContent.trim();
    form.discount_type.value = row.dataset.discountType;
    form.discount_value.value = row.dataset.discountValue;
    form.usage_limit.value = row.dataset.usageLimit;
    form.expiry_date.value = row.dataset.expiryDate;
    form.status.value = row.dataset.status;

    new bootstrap.Modal(document.getElementById("editVoucherModal")).show();
  });
});

document.getElementById("editVoucherForm").addEventListener("submit", async e => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());

  const res = await fetch("/seller/promotions/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  const result = await res.json();

  closeModal("editVoucherModal"); // auto-close
  showToast(result.msg, result.success ? "success" : "danger");
  if (result.success) setTimeout(() => location.reload(), 1200);
});

// ==============================
// Delete Voucher
// ==============================
document.querySelectorAll(".delete-btn").forEach(btn => {
  btn.addEventListener("click", e => {
    const row = e.target.closest(".promotion-row");
    const form = document.getElementById("deleteVoucherForm");
    form.id.value = row.dataset.id;

    new bootstrap.Modal(document.getElementById("deleteVoucherModal")).show();
  });
});

document.getElementById("deleteVoucherForm").addEventListener("submit", async e => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());

  const res = await fetch("/seller/promotions/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  const result = await res.json();

  closeModal("deleteVoucherModal"); // auto-close
  showToast(result.msg, result.success ? "success" : "danger");
  if (result.success) setTimeout(() => location.reload(), 1200);
});

// ==============================
// Usage Fill Progress Bars
// ==============================
document.querySelectorAll(".usage-fill").forEach(el => {
  el.style.width = el.dataset.width + "%";
});
