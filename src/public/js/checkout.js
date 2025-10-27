// public/js/checkout.js

/********************
 * Wizard state
 ********************/
let currentStep = 1;
const totalSteps = 4;
let selectedPaymentType =
  document.querySelector('input[name="payment"]:checked')?.value ||
  (document.querySelector('input[name="payment"][value="cod"]') ? "cod" : "paypal");   // matches default radio
let cachedPayPalOrderMeta = null;       // { orderId, total }
let orderMeta = { orderId: null, total: null, paymentMethod: null };

/********************
 * Voucher state
 ********************/
let appliedVoucher = null;              // { id, code, type, value, discount }

const $ = (sel) => document.querySelector(sel);
const asPHP = (n) =>
  Number(n || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/* Read current summary numbers from DOM */
function currentSummaryNumbers() {
  const num = (node) => Number((node?.textContent || "0").replace(/[^\d.]/g, ""));
  return {
    subtotal: num($("#sum-subtotal")),
    tax: num($("#sum-tax")),
    shipping: num(document.querySelector("#sum-shipping")), // NEW

    // #sum-discount shows "- ₱1,000.00" → convert to positive internal number
    discount: Math.abs(num($("#sum-discount"))),
  };
}

/* Recompute summary total line based on applied voucher */
function refreshTotalLine() {
  const { subtotal, tax, shipping } = currentSummaryNumbers();
  const discount = appliedVoucher ? Number(appliedVoucher.discount || 0) : 0;
  if ($("#sum-discount")) $("#sum-discount").textContent = `- ₱${asPHP(discount)}`;
  const total = Math.max(0, subtotal - discount) + tax + shipping;
  if ($("#sum-total")) $("#sum-total").textContent = `₱${asPHP(total)}`;
}

/* When voucher changes we must recreate the pending PayPal order */
function invalidateCachedOrder() {
  cachedPayPalOrderMeta = null;
}

/* Apply voucher */
async function applyVoucher() {
  const code = $("#voucher-code")?.value.trim();
  if (!code) return;

  $("#voucher-msg").textContent = "Checking voucher…";
  $("#voucher-msg").className = "small text-muted";
  $("#voucher-apply").disabled = true;

  try {
    const resp = await fetch("/api/voucher/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }).then((r) => r.json());

    if (!resp?.ok) {
      $("#voucher-msg").textContent = resp?.message || "Invalid voucher.";
      $("#voucher-msg").className = "small text-danger";
      $("#voucher-apply").disabled = false;
      return;
    }

    appliedVoucher = { ...resp.promo, discount: resp.discount };
    $("#voucher-msg").textContent =
      `Applied ${appliedVoucher.code} (${appliedVoucher.type === "percent" ? appliedVoucher.value + "% off" : "₱" + appliedVoucher.value + " off"})`;
    $("#voucher-msg").className = "small text-success";
    $("#voucher-code").readOnly = true;
    $("#voucher-apply").classList.add("d-none");
    $("#voucher-clear").classList.remove("d-none");

    refreshTotalLine();
    invalidateCachedOrder();
  } catch (e) {
    $("#voucher-msg").textContent = "Network error.";
    $("#voucher-msg").className = "small text-danger";
    $("#voucher-apply").disabled = false;
  }
}

/* Clear voucher */
function clearVoucher() {
  appliedVoucher = null;
  $("#voucher-code").readOnly = false;
  $("#voucher-apply").classList.remove("d-none");
  $("#voucher-clear").classList.add("d-none");
  $("#voucher-msg").textContent = "";
  $("#voucher-msg").className = "small text-muted";

  refreshTotalLine();
  invalidateCachedOrder();
}

/********************
 * Stepper
 ********************/
function updateProgress() {
  const progressPercent = ((currentStep - 1) / (totalSteps - 1)) * 100;
  $("#progress-fill").style.width = progressPercent + "%";

  for (let i = 1; i <= totalSteps; i++) {
    const circle = document.getElementById(`step-${i}-circle`);
    const title = document.getElementById(`step-${i}-title`);
    circle.classList.remove("active", "completed");
    title.classList.remove("active");

    if (i < currentStep) {
      circle.classList.add("completed");
      circle.innerHTML = '<i class="fas fa-check"></i>';
    } else if (i === currentStep) {
      circle.classList.add("active");
      title.classList.add("active");
      circle.textContent = i;
    } else {
      circle.textContent = i;
    }
  }

  document.querySelectorAll(".step-content").forEach((c) => c.classList.remove("active"));
  document.getElementById(`step-${currentStep}`).classList.add("active");
}

function nextStep() {
  if (currentStep < totalSteps && validateCurrentStep()) {
    currentStep++;
    updateProgress();
    if (currentStep === 3) {
      updateReviewSection();
        updateReviewPayment();  // <- add this
  updatePaymentCta();     // <- ensure buttons match the selection
      setupPaymentUI();
    }
  }
}

function prevStep() {
  if (currentStep > 1) {
    currentStep--;
    updateProgress();
  }
}

function validateCurrentStep() {
  if (currentStep === 1) {
    const required = ["firstName", "lastName", "address", "city", "province", "zipCode", "phone", "email"];
    for (const id of required) {
      const node = document.getElementById(id);
      if (!node || !node.value.trim()) {
        alert(`Please fill out the ${id} field.`);
        node?.focus();
        return false;
      }
    }
  }
  return true;
}

/********************
 * Payment choice
 ********************/
function selectPayment(e, type) {
  document.querySelectorAll(".payment-option").forEach((opt) => {
    opt.classList.remove("selected");
    const r = opt.querySelector('input[type="radio"]');
    if (r) r.checked = false;
  });

  const selected = e.currentTarget;
  selected.classList.add("selected");
  selected.querySelector('input[type="radio"]').checked = true;

  selectedPaymentType = type;

  const cardForm = $("#card-form");
  if (cardForm) cardForm.style.display = type === "card" ? "block" : "none";

  updatePaymentCta();
  updateReviewPayment();
  // If we're already on Step 3, ensure the right button is visible
  if (currentStep === 3) setupPaymentUI();
}


// === Payment CTA toggle ===
function updatePaymentCta() {
  const selected = document.querySelector('input[name="payment"]:checked')?.value;
  const codBtn = document.getElementById('codPlaceOrderBtn');
  const ppWrap = document.getElementById('paypal-button-container');

  if (codBtn) codBtn.style.display = selected === 'cod' ? '' : 'none';
  if (ppWrap) ppWrap.style.display = selected === 'paypal' ? '' : 'none';
}

// Watch payment radio buttons
document.querySelectorAll('.payment-option input[name="payment"]').forEach(r => {
  r.addEventListener('change', updatePaymentCta);
});

// Initialize on load
updatePaymentCta();


/********************
 * Shipping review
 ********************/
function updateReviewSection() {
  const v = (id, d = "") => document.getElementById(id)?.value || d;

  $("#review-shipping").innerHTML = `
    <div>${v("firstName", "John")} ${v("lastName", "Doe")}</div>
    <div>${v("address", "123 Main Street")}</div>
    <div>${v("city", "Cebu City")}, ${v("province", "Cebu")} ${v("zipCode", "6000")}</div>
    <div>${v("phone", "+63 912 345 6789")}</div>
    <div>${v("email", "john.doe@email.com")}</div>
  `;
}

/********************
 * Helpers
 ********************/
function continueShopping() { window.location.href = "/"; }
function trackOrder() { window.location.href = "/profile#orders"; }

function collectShippingData() {
  const val = (id) => document.getElementById(id)?.value.trim();
  return {
    firstName: val("firstName"),
    lastName: val("lastName"),
    address: val("address"),
    city: val("city"),
    province: val("province"),
    zipCode: val("zipCode"),
    phone: val("phone"),
    email: val("email"),
  };
}

/********************
 * COD flow (now also redeems voucher usage)
 ********************/
async function handleCODOrder() {
  const body = { paymentMethod: "cod", ...collectShippingData() };
  if (appliedVoucher?.id) body.voucherId = appliedVoucher.id; // still send to server for total calc

  try {
    const res = await fetch("/api/orders/place", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!data.success) {
      alert(data.error || "Error placing order");
      return;
    }

    // ✅ Decrement voucher usage on COD (client-side call)
    if (appliedVoucher?.id) {
      try {
        const redeemRes = await fetch("/api/voucher/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voucherId: appliedVoucher.id }),
        });
        const redeemJson = await redeemRes.json().catch(() => ({}));
        if (!redeemRes.ok || !redeemJson?.ok) {
          console.warn("Voucher redeem failed (COD):", redeemJson);
          // optional: alert("Voucher could not be redeemed; it may have expired or hit its limit.");
        }
      } catch (e) {
        console.warn("Voucher redeem network error (COD):", e);
      }
    }

    // proceed to confirmation
    orderMeta = { orderId: data.orderId, total: data.total, paymentMethod: "cod" };
    updateConfirmation(orderMeta);
    nextStep();
  } catch (err) {
    console.error(err);
    alert("Network error while placing COD order.");
  }
}

/********************
 * PayPal flow
 ********************/
function setupPaymentUI() {
  const paypalContainer = $("#paypal-button-container");
  const codBtn = $("#codPlaceOrderBtn");
  if (!paypalContainer || !codBtn) return;

  // Read current selection from radios (not from a stale variable)
  const selected = document.querySelector('input[name="payment"]:checked')?.value || selectedPaymentType;

  if (selected === "paypal") {
    codBtn.style.display = "none";
    paypalContainer.style.display = "block";
    if (!paypalContainer.dataset.rendered) {
      renderPayPalButton();
      paypalContainer.dataset.rendered = "1";
    }
  } else {
    paypalContainer.style.display = "none";
    codBtn.style.display = "inline-block";
  }
}

/********************
 * Update Review payment
 ********************/
function updateReviewPayment() {
  const method = document.querySelector('input[name="payment"]:checked')?.value || selectedPaymentType;
  const box = $("#review-payment");
  if (!box) return;
  if (method === "cod") {
    box.innerHTML = `<div>Cash on Delivery (COD)</div><div>Pay when you receive your order</div>`;
  } else {
    box.innerHTML = `<div>PayPal</div><div>Pay securely with your PayPal account</div>`;
  }
}


/* Create the DB order (once per configuration) */
async function ensureOrderForPayPal() {
  if (cachedPayPalOrderMeta) return cachedPayPalOrderMeta;

  const body = { paymentMethod: "paypal", ...collectShippingData() };
  if (appliedVoucher?.id) body.voucherId = appliedVoucher.id;

  const res = await fetch("/api/orders/place", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();

  if (!data.success) throw new Error(data.error || "Failed to create order for PayPal");

  cachedPayPalOrderMeta = { orderId: data.orderId, total: data.total };
  return cachedPayPalOrderMeta;
}

function renderPayPalButton() {
  if (typeof paypal === "undefined" || !paypal.Buttons) {
    console.error("PayPal SDK not loaded.");
    return;
  }

  paypal.Buttons({
    // Create PayPal order using server-side DB total ONLY
    createOrder: async () => {
      const { orderId } = await ensureOrderForPayPal();
      const res = await fetch("/api/paypal/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }) // DO NOT SEND total here
      });
      const json = await res.json();
      if (!json?.id) throw new Error("Failed to create PayPal order.");
      return json.id;
    },

    // Capture and finalize
    onApprove: async (data) => {
      try {
        const { orderId } = await ensureOrderForPayPal();
        const res = await fetch("/api/paypal/capture-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paypalOrderId: data.orderID, orderId })
        });
        const result = await res.json();

        if (result?.success) {
          // OPTIONAL: redeem/consume voucher on client only if your server requires a separate call
          if (appliedVoucher?.id) {
            await fetch("/api/voucher/redeem", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ voucherId: appliedVoucher.id })
            });
          }

          orderMeta = { ...cachedPayPalOrderMeta, paymentMethod: "paypal" };
          updateConfirmation(orderMeta);
          alert("✅ PayPal payment successful!");
          nextStep();
        } else {
          alert(result?.error || "⚠️ PayPal payment failed.");
        }
      } catch (err) {
        console.error(err);
        alert("An error occurred while capturing the payment.");
      }
    },

    onCancel: () => alert("Payment was cancelled."),
    onError: (err) => { console.error(err); alert("An error occurred with PayPal. Please try again."); }
  }).render("#paypal-button-container");
}

/********************
 * Confirmation page (Step 4)
 ********************/
function updateConfirmation(meta) {
  const rows = document.querySelectorAll("#step-4 .order-details .detail-row");
  if (rows[0]?.children?.[1]) rows[0].children[1].textContent = `#${formatOrderNumber(meta.orderId || 0)}`;
  if (rows[1]?.children?.[1]) rows[1].children[1].textContent = computeDeliveryWindow();
  if (rows[2]?.children?.[1]) rows[2].children[1].textContent = ($("#email")?.value || "—");
}

function formatOrderNumber(id) {
  const y = new Date().getFullYear();
  return `TE${y}-${String(id).padStart(6, "0")}`;
}

function computeDeliveryWindow() {
  const start = addBusinessDays(new Date(), 3);
  const end = addBusinessDays(new Date(), 5);
  return `${formatDatePH(start)} – ${formatDatePH(end)}`;
}

function addBusinessDays(date, days) {
  const d = new Date(date);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}

function formatDatePH(d) {
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" });
}

/********************
 * Saved addresses
 ********************/
function initSavedAddresses() {
  const select = document.getElementById("savedAddressSelect");
  if (!select) return;

  select.addEventListener("change", function () {
    const o = this.options[this.selectedIndex];
    if (!o || !o.dataset.firstname) return;
    $("#firstName").value = o.dataset.firstname;
    $("#lastName").value = o.dataset.lastname;
    $("#address").value = o.dataset.street;
    $("#city").value = o.dataset.city;
    $("#province").value = o.dataset.province;
    $("#zipCode").value = o.dataset.zip;
    $("#phone").value = o.dataset.phone;
    $("#email").value = o.dataset.email;
    invalidateCachedOrder(); // address change → likely shipping/tax context change → rebuild order
  });

  if (select.value) select.dispatchEvent(new Event("change"));
}

/********************
 * Boot
 ********************/
updateProgress();
initSavedAddresses();
refreshTotalLine();

$("#voucher-apply")?.addEventListener("click", applyVoucher);
$("#voucher-clear")?.addEventListener("click", clearVoucher);

// Expose required handlers to HTML (if you use inline onclick)
window.selectPayment = selectPayment;
window.nextStep = nextStep;
window.prevStep = prevStep;
window.handleCODOrder = handleCODOrder;
window.continueShopping = continueShopping;
window.trackOrder = trackOrder;
