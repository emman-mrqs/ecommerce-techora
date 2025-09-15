// public/js/checkout.js

let currentStep = 1;
const totalSteps = 4;

// chosen payment + order meta for confirmation
let selectedPaymentType = 'paypal'; // default matches your HTML (PayPal checked)
let cachedPayPalOrderMeta = null;   // { orderId, total }
let orderMeta = { orderId: null, total: null, paymentMethod: null };

// Initialize steps
updateProgress();

function updateProgress() {
  // Update progress bar
  const progressPercent = ((currentStep - 1) / (totalSteps - 1)) * 100;
  document.getElementById('progress-fill').style.width = progressPercent + '%';

  // Update step circles and titles
  for (let i = 1; i <= totalSteps; i++) {
    const circle = document.getElementById(`step-${i}-circle`);
    const title  = document.getElementById(`step-${i}-title`);

    circle.classList.remove('active', 'completed');
    title.classList.remove('active');

    if (i < currentStep) {
      circle.classList.add('completed');
      circle.innerHTML = '<i class="fas fa-check"></i>';
    } else if (i === currentStep) {
      circle.classList.add('active');
      title.classList.add('active');
      circle.textContent = i;
    } else {
      circle.textContent = i;
    }
  }

  // Show/hide step content
  document.querySelectorAll('.step-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(`step-${currentStep}`).classList.add('active');
}

function nextStep() {
  if (currentStep < totalSteps && validateCurrentStep()) {
    currentStep++;
    updateProgress();

    // Update review info on step 3
    if (currentStep === 3) {
      updateReviewSection();
      setupPaymentUI(); // ensure correct buttons show (PayPal vs COD)
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
  // Basic validation for step 1
  if (currentStep === 1) {
    const firstName = document.getElementById('firstName').value;
    const lastName  = document.getElementById('lastName').value;
    const address   = document.getElementById('address').value;

    if (!firstName || !lastName || !address) {
      alert('Please fill in all required fields');
      return false;
    }
  }
  return true;
}

// PAYMENT SELECTION (Step 2)
// (single definition; used by your onclick handlers in the HTML)
function selectPayment(e, type) {
  // Remove previous selections
  document.querySelectorAll('.payment-option').forEach(option => {
    option.classList.remove('selected');
    option.querySelector('input[type="radio"]').checked = false; // uncheck
  });

  // Add selected to clicked
  const selectedOption = e.currentTarget;
  selectedOption.classList.add('selected');
  selectedOption.querySelector('input[type="radio"]').checked = true; // check

  // Remember choice for Step 3
  selectedPaymentType = type;

  // Show/hide card form (kept for future)
  const cardForm = document.getElementById('card-form');
  cardForm.style.display = (type === 'card') ? 'block' : 'none';
}

function updateReviewSection() {
  // Update shipping info in review
  const firstName = document.getElementById('firstName').value || 'John';
  const lastName  = document.getElementById('lastName').value || 'Doe';
  const address   = document.getElementById('address').value || '123 Main Street';
  const city      = document.getElementById('city').value || 'Cebu City';
  const province  = document.getElementById('province').value || 'Cebu';
  const zipCode   = document.getElementById('zipCode').value || '6000';
  const phone     = document.getElementById('phone').value || '+63 912 345 6789';
  const email     = document.getElementById('email').value || 'john.doe@email.com';

  document.getElementById('review-shipping').innerHTML = `
    <div>${firstName} ${lastName}</div>
    <div>${address}</div>
    <div>${city}, ${province} ${zipCode}</div>
    <div>${phone}</div>
    <div>${email}</div>
  `;
}

// Dummy functions for step 4 buttons
function continueShopping() {
  window.location.href = '/products'; // redirect to products page
}

function trackOrder() {
  alert('Tracking feature coming soon!');
}

// ---------- COD FLOW ----------
async function handleCODOrder() {
  const shippingAddress = collectShippingInfo();

  const res = await fetch('/api/orders/place', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paymentMethod: 'cod',
      shippingAddress
    })
  });

  const data = await res.json();
  if (data.success) {
    orderMeta = { orderId: data.orderId, total: data.total, paymentMethod: 'cod' };
    updateConfirmation(orderMeta); // fill Step 4 details
    alert("Order placed with COD!");
    nextStep();
  } else {
    alert(data.error || "Error placing order");
  }
}

// Collect shipping info into a string
function collectShippingInfo() {
  const firstName = document.getElementById('firstName').value;
  const lastName  = document.getElementById('lastName').value;
  const address   = document.getElementById('address').value;
  const city      = document.getElementById('city').value;
  const province  = document.getElementById('province').value;
  const zip       = document.getElementById('zipCode').value;

  return `${firstName} ${lastName}, ${address}, ${city}, ${province}, ${zip}`;
}

// ---------- PAYPAL FLOW ----------

// Called when Step 3 loads (and whenever payment choice changes earlier)
function setupPaymentUI() {
  const paypalContainer = document.getElementById('paypal-button-container');
  const codBtn          = document.getElementById('codPlaceOrderBtn');

  if (!paypalContainer || !codBtn) return;

  if (selectedPaymentType === 'paypal') {
    codBtn.style.display = 'none';
    paypalContainer.style.display = 'block';

    // render PayPal button once
    if (!paypalContainer.dataset.rendered) {
      renderPayPalButton();
      paypalContainer.dataset.rendered = '1';
    }
  } else {
    // COD
    paypalContainer.style.display = 'none';
    codBtn.style.display = 'inline-block';
  }
}

// Create an order in your DB for PayPal (only once) and reuse it
async function ensureOrderForPayPal() {
  if (cachedPayPalOrderMeta) return cachedPayPalOrderMeta;

  const shippingAddress = collectShippingInfo();
  const res = await fetch('/api/orders/place', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentMethod: 'paypal', shippingAddress })
  });
  const data = await res.json();

  if (!data.success) {
    throw new Error(data.error || 'Failed to create order for PayPal');
  }

  cachedPayPalOrderMeta = { orderId: data.orderId, total: data.total };
  return cachedPayPalOrderMeta;
}

// Render PayPal Button
function renderPayPalButton() {
  if (typeof paypal === 'undefined' || !paypal.Buttons) {
    console.error('PayPal SDK not loaded.');
    return;
  }

  paypal.Buttons({
    // 1) Create DB order (if needed), then create PayPal order on server
    createOrder: async function () {
      const { orderId, total } = await ensureOrderForPayPal();

      const res = await fetch('/api/paypal/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, total })
      });

      const json = await res.json();
      if (!json || !json.id) {
        throw new Error('Failed to create PayPal order.');
      }
      return json.id; // PayPal order ID
    },

    // 2) Capture on server with both PayPal order id and our internal order id
    onApprove: async function (data) {
      try {
        const { orderId } = await ensureOrderForPayPal();

        const res = await fetch('/api/paypal/capture-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paypalOrderId: data.orderID, orderId })
        });

        const result = await res.json();

        if (result && result.success) {
          orderMeta = { ...cachedPayPalOrderMeta, paymentMethod: 'paypal' };
          updateConfirmation(orderMeta); // fill Step 4 details
          alert("✅ PayPal payment successful!");
          nextStep(); // go to confirmation
        } else {
          alert((result && result.error) || "⚠️ PayPal payment failed.");
        }
      } catch (err) {
        console.error(err);
        alert('An error occurred while capturing the payment.');
      }
    },

    onCancel: function () {
      alert('Payment was cancelled.');
    },

    onError: function (err) {
      console.error(err);
      alert('An error occurred with PayPal. Please try again.');
    }
  }).render('#paypal-button-container');
}

// ---------- CONFIRMATION (Step 4) ----------
function updateConfirmation(meta) {
  // Your HTML doesn’t have IDs on the value spans, so target by row order:
  // [0] Order Number, [1] Estimated Delivery, [2] Tracking Email
  const rows = document.querySelectorAll('#step-4 .order-details .detail-row');
  if (rows[0]?.children?.[1]) rows[0].children[1].textContent = `#${formatOrderNumber(meta.orderId || 0)}`;
  if (rows[1]?.children?.[1]) rows[1].children[1].textContent = computeDeliveryWindow();
  if (rows[2]?.children?.[1]) rows[2].children[1].textContent = (document.getElementById('email')?.value || '—');
}

// Format TE2025-000123 style
function formatOrderNumber(id) {
  const y = new Date().getFullYear();
  const padded = String(id).padStart(6, '0');
  return `TE${y}-${padded}`;
}

// Compute a 3–5 business day window (skips Sat/Sun)
function computeDeliveryWindow() {
  const start = addBusinessDays(new Date(), 3);
  const end   = addBusinessDays(new Date(), 5);
  return `${formatDatePH(start)} – ${formatDatePH(end)}`;
}

function addBusinessDays(date, days) {
  const d = new Date(date);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay(); // 0 Sun, 6 Sat
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}

function formatDatePH(d) {
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' });
}
