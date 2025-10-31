// Handle window resize
window.addEventListener('resize', function() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    if (window.innerWidth > 768) {
        sidebar.classList.remove('show');
        overlay.classList.remove('show');
    }
});

        
 document.addEventListener("DOMContentLoaded", () => {
  const invoiceModal = new bootstrap.Modal(document.getElementById("invoiceModal"));
  const invoiceContent = document.getElementById("invoiceContent");
  const soldBy = document.getElementById("soldBy");

  const statusModal = new bootstrap.Modal(document.getElementById("statusModal"));
  const statusForm = document.getElementById("statusForm");
  const statusOrderId = document.getElementById("statusOrderId");
  const orderStatus = document.getElementById("orderStatus");

  const statusFilter = document.getElementById("filterStatus");
  const dateFilter = document.getElementById("filterDate");
  const searchInput = document.getElementById("filterSearch");

  // 🔹 Rebindable function for invoice + edit buttons
  function bindOrderActions() {
    // Edit button
    document.querySelectorAll(".action-btn.edit").forEach(btn => {
      btn.addEventListener("click", () => {
        const orderRow = btn.closest(".order-row");
        const orderId = orderRow.querySelector(".order-id").textContent.trim();
        const currentStatus = orderRow.querySelector(".status-badge").textContent.trim().toLowerCase();

        statusOrderId.value = orderId;
        orderStatus.value = currentStatus;

        statusModal.show();
      });
    });

    /*===========================
    Download PDF from invoice modal
    ================================== */
    document.getElementById("downloadLabel").addEventListener("click", async () => {
      const { jsPDF } = window.jspdf;

      const invoice = document.getElementById("invoiceContent");
      if (!invoice) return;

      // Use html2canvas to capture the invoice content
      const canvas = await html2canvas(invoice, { scale: 2 });
      const imgData = canvas.toDataURL("image/png");

      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      // Scale image to fit PDF
      const imgWidth = pageWidth - 20; // margins
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, "PNG", 10, 10, imgWidth, imgHeight);

      // Save file with invoice number if available
      const invoiceTitle = document.querySelector("#invoiceContent h5")?.innerText || "Invoice";
      pdf.save(`${invoiceTitle.replace(/\s+/g, "_")}.pdf`);
    });

    /*=========================
      Print Invoice (reuse modal table)
    ========================*/
    document.getElementById("printInvoice").addEventListener("click", () => {
      const invoiceContent = document.getElementById("invoiceContent").innerHTML;

      const printWindow = window.open("", "_blank");
      printWindow.document.write(`
        <html>
          <head>
            <title>Invoice</title>
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
            <style>
              body { padding: 20px; font-family: Arial, sans-serif; }
              .invoice-card { border: 1px solid #dee2e6; border-radius: 6px; padding: 20px; }
              .invoice-header { margin-bottom: 20px; }
              .invoice-header h5 { margin: 0; font-size: 20px; }
              .table th { background: #f8f9fa; }
              .status-badge { padding: 4px 8px; border-radius: 12px; font-size: 11px; }
              .status-confirmed { background: #dbeafe; color: #1d4ed8; }
              .status-completed { background: #dcfce7; color: #166534; }
              .status-cancelled { background: #fee2e2; color: #991b1b; }
            </style>
          </head>
          <body>
            <div class="invoice-card">
              ${invoiceContent}
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();

      // Print and close automatically
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    });


    /*=========================
     View invoice button
     ========================*/
    document.querySelectorAll(".view-invoice-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      // parse order data stored on the button
      const order = JSON.parse(btn.getAttribute("data-order") || "{}");

      // small helpers (kept local so you don't depend on a global function)
      function escapeHtml(str) {
        if (str == null) return "";
        return String(str)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }
      const num = (v) => Number(v || 0);
      const formatPHP = (v) => num(v).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      // Clean shipping address (keep everything after first comma for brevity)
      let cleanShipping = order.shipping_address || "N/A";
      if (typeof cleanShipping === "string" && cleanShipping.includes(",")) {
        const parts = cleanShipping.split(",");
        if (parts.length > 1) cleanShipping = parts.slice(1).join(",").trim();
      }

      // Build items array:
      // prefer order.seller_items (server can populate) otherwise fall back to single-row fields
      const items = Array.isArray(order.seller_items) && order.seller_items.length
        ? order.seller_items.map(it => ({
            product_name: it.product_name || "Item",
            product_image: it.product_image || null,
            variant_id: it.variant_id || it.product_variant_id || "—",
            quantity: num(it.quantity || 1),
            unit_price: num(it.unit_price || it.price || 0),
            line_total: num(it.line_total ?? (num(it.unit_price || it.price || 0) * num(it.quantity || 1)))
          }))
        : [{
            product_name: order.product_name || "Item",
            product_image: order.product_image || null,
            variant_id: order.variant_id || order.product_variant_id || "—",
            quantity: num(order.quantity || 1),
            unit_price: num(order.unit_price || order.unit_price || (order.total_price ? (num(order.total_price) / Math.max(1, num(order.quantity || 1))) : 0)),
            line_total: num(order.line_total ?? order.total_price ?? (num(order.unit_price || 0) * num(order.quantity || 1)))
          }];

      // Build table rows
      const rowsHtml = items.map(it => {
        const imgHtml = it.product_image
          ? `<img src="${escapeHtml(it.product_image)}" alt="${escapeHtml(it.product_name)}" style="width:64px;height:64px;object-fit:cover;border-radius:6px;">`
          : `<div style="width:64px;height:64px;background:#f5f5f5;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#9aa0a6;"><i class="fas fa-box"></i></div>`;

        return `
          <tr>
            <td style="width:72px;vertical-align:middle">${imgHtml}</td>
            <td style="vertical-align:middle">
              <div class="fw-semibold">${escapeHtml(it.product_name)}</div>
              <div class="small text-muted">Variant: ${escapeHtml(String(it.variant_id || "—"))}</div>
            </td>
            <td class="text-end align-middle">${escapeHtml(String(it.quantity))}</td>
            <td class="text-end align-middle">₱${formatPHP(it.unit_price)}</td>
            <td class="text-end align-middle">₱${formatPHP(it.line_total)}</td>
          </tr>
        `;
      }).join("");

      // Summaries (use provided values if present, otherwise compute)
      const subtotal = num(items.reduce((s, i) => s + num(i.line_total), 0));
      const tax = (order.tax != null) ? num(order.tax) : Math.round(subtotal * 0.03 * 100) / 100; // fallback 3%
      const shipping = (order.shipping != null) ? num(order.shipping) : (order.shipping_cost != null ? num(order.shipping_cost) : 0);
      const discount = (order.discount != null) ? num(order.discount) : 0;
      const total = (order.total_price != null) ? num(order.total_price) : Math.max(0, subtotal - discount) + tax + shipping;

      // Inline styles for the modal content (keeps the modal self-contained)
      const extraStyle = `
        <style>
          .invoice-card { font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial; color: #111827; }
          .invoice-header h5 { margin: 0; font-size: 1.1rem; }
          .meta-label { color: #6b7280; font-size: 0.85rem; }
          .line-table th, .line-table td { border-top: 1px solid #e9ecef; padding: .75rem; vertical-align: middle; }
          .small-muted { color: #6b7280; font-size: .85rem; }
          .summary-row { font-size: .95rem; }
          .status-badge { padding: 4px 8px; border-radius: 8px; font-size: .85rem; display:inline-block; }
          .status-pending { background:#fff7ed; color:#92400e; }
          .status-confirmed { background:#e0f2fe; color:#0369a1; }
          .status-shipped { background:#fff1f2; color:#9f1239; }
          .status-completed { background:#ecfdf5; color:#065f46; }
          .status-cancelled { background:#fee2e2; color:#7f1d1d; }
        </style>
      `;

      invoiceContent.innerHTML = `
        ${extraStyle}
        <div class="invoice-card p-3">
          <div class="d-flex justify-content-between align-items-start mb-3">
            <div>
              <h5 class="mb-1">Invoice <small class="text-muted">#${escapeHtml(String(order.order_id || "—"))}</small></h5>
              <div class="small-muted">${new Date(order.order_date || Date.now()).toLocaleString()}</div>
            </div>
            <div class="text-end">
              <div class="fw-semibold">${escapeHtml(order.store_name || "Techora Store")}</div>
              <div class="small-muted">${escapeHtml(order.store_email || "")}</div>
            </div>
          </div>

          <div class="row mb-3">
            <div class="col-md-6">
              <div class="mb-2 meta-label">BILL TO</div>
              <div class="fw-semibold">${escapeHtml(order.customer_name || order.user_name || "—")}</div>
              <div class="small-muted">${escapeHtml(order.user_email || order.customer_email || "")}</div>
              <div class="small-muted">${escapeHtml(order.user_phone || order.customer_phone || "")}</div>
            </div>
            <div class="col-md-6 text-md-end">
              <div class="mb-2 meta-label">SHIP TO</div>
              <div>${escapeHtml(cleanShipping)}</div>
            </div>
          </div>

          <div class="table-responsive">
            <table class="table table-borderless line-table">
              <thead>
                <tr class="text-muted">
                  <th></th>
                  <th>Product</th>
                  <th class="text-end">Qty</th>
                  <th class="text-end">Unit</th>
                  <th class="text-end">Line Total</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>

          <div class="row mt-2">
            <div class="col-md-6">
              <div class="small-muted mb-2">Payment</div>
              <div><strong>${escapeHtml(order.payment_method || "N/A")}</strong></div>
              <div class="small-muted">Status: <span class="status-badge status-${escapeHtml(String((order.order_status || "").toLowerCase()))}">${escapeHtml(order.payment_status || order.order_status || "N/A")}</span></div>
              <div class="small-muted mt-2">Transaction ID: ${escapeHtml(order.transaction_id || "N/A")}</div>
              <div class="small-muted">Payment Date: ${order.payment_date ? new Date(order.payment_date).toLocaleString() : "N/A"}</div>
            </div>

            <div class="col-md-6">
              <div class="float-md-end" style="min-width:260px;">
                <div class="d-flex justify-content-between summary-row"><div class="small-muted">Subtotal</div><div>₱${formatPHP(subtotal)}</div></div>
                <div class="d-flex justify-content-between summary-row"><div class="small-muted">Discount</div><div>- ₱${formatPHP(discount)}</div></div>
                <div class="d-flex justify-content-between summary-row"><div class="small-muted">Tax</div><div>₱${formatPHP(tax)}</div></div>
                <div class="d-flex justify-content-between summary-row"><div class="small-muted">Shipping</div><div>₱${formatPHP(shipping)}</div></div>
                <hr/>
                <div class="d-flex justify-content-between fw-bold fs-5"><div>Total</div><div>₱${formatPHP(total)}</div></div>
              </div>
            </div>
          </div>

          <div class="mt-3 small-muted">
            <div>Order notes: ${escapeHtml(order.note || "—")}</div>
            <div class="mt-2">Created: ${new Date(order.order_date || Date.now()).toLocaleString()}</div>
          </div>
        </div>
      `;

      soldBy.innerHTML = `Sold by: ${escapeHtml(order.store_name || "Techora Store")}`;
      invoiceModal.show();
    });
  });

  }

  // 🔹 Handle form submit (update order status via AJAX)
  statusForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData(statusForm);
    const data = Object.fromEntries(formData.entries());

    const res = await fetch("/seller/orders/update-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await res.json();
    const toastEl = document.getElementById("statusToast");
    const toast = new bootstrap.Toast(toastEl, { delay: 3000 });

    if (result.success) {
      toastEl.classList.remove("text-bg-danger");
      toastEl.classList.add("text-bg-success");
      toastEl.querySelector(".toast-body").textContent = "Order status updated!";

      statusModal.hide();
      toast.show();

      // ✅ Update badge in table instantly
      const row = [...document.querySelectorAll(".order-row")]
        .find(r => r.querySelector(".order-id").textContent.trim() === data.order_id);

      if (row) {
        const badge = row.querySelector(".status-badge");
        badge.textContent = result.newStatus;
        badge.className = `status-badge status-${result.newStatus.toLowerCase()}`;

        // ✅ Update the hidden JSON for invoice modal
        const viewBtn = row.querySelector(".view-invoice-btn");
        if (viewBtn) {
          const orderData = JSON.parse(viewBtn.getAttribute("data-order"));
          orderData.order_status = result.newStatus; // update field
          viewBtn.setAttribute("data-order", JSON.stringify(orderData));
        }
      }
    } else {
      toastEl.classList.remove("text-bg-success");
      toastEl.classList.add("text-bg-danger");
      toastEl.querySelector(".toast-body").textContent = "❌ Failed to update status.";
      statusModal.hide();
      toast.show();
    }
  });

  // 🔹 Fetch filtered orders
  async function fetchOrders() {
    const status = statusFilter.value;
    const date = dateFilter.value;
    const search = searchInput.value.trim();

    const res = await fetch(`/seller/orders/filter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, date, search })
    });

    const result = await res.json();
    if (result.success) {
      const table = document.querySelector(".orders-table");
      const rows = result.orders.map(order => `
        <div class="order-row">
          <div class="product-img">
            ${order.product_image 
              ? `<img src="${order.product_image}" style="width:50px;height:50px;object-fit:cover;border-radius:6px;">`
              : `<div style="width:50px;height:50px;background:#E0E0E0;display:flex;align-items:center;justify-content:center;border-radius:6px;">
                   <i class="fas fa-box text-muted"></i>
                 </div>`}
          </div>
          <div class="order-id">${order.order_id}</div>
          <div class="customer-name">${order.customer_name}</div>
          <div class="product-name">${order.product_name}</div>
          <div class="quantity">${order.quantity}</div>
          <div class="total-price">₱${order.total_price}</div>
          <div><span class="status-badge status-${order.order_status.toLowerCase()}">${order.order_status}</span></div>
          <div class="order-date">${new Date(order.order_date).toLocaleDateString()}</div>
          <div>
            <button class="action-btn edit"><i class="fas fa-edit"></i></button>
            <button class="action-btn view-invoice-btn" data-order='${JSON.stringify(order)}'>
              <i class="fas fa-eye"></i>
            </button>
          </div>
        </div>
      `).join("");

      table.innerHTML = `
        <div class="table-header">
          <div>Product</div>
          <div>Order ID</div>
          <div>Customer Name</div>
          <div>Product Name</div>
          <div>Quantity</div>
          <div>Total Price</div>
          <div>Status</div>
          <div>Date</div>
          <div>Action</div>
        </div>
        ${rows || `<div class="text-center p-4"><p>No orders found.</p></div>`}
      `;

      // ✅ Rebind events for new buttons
      bindOrderActions();
    }
  }

  // 🔹 Filter events
  statusFilter.addEventListener("change", fetchOrders);
  dateFilter.addEventListener("change", fetchOrders);
  searchInput.addEventListener("input", () => {
    clearTimeout(window.searchDebounce);
    window.searchDebounce = setTimeout(fetchOrders, 400);
  });

  // Initial bind
  bindOrderActions();
});


// ===== Delete seller items from order =====
(function () {
  const deleteModalEl = document.getElementById("deleteOrderModal");
  const deleteOrderIdInput = document.getElementById("deleteOrderId");
  const confirmDeleteBtn = document.getElementById("confirmDeleteOrder");
  const deleteToastEl = document.getElementById("deleteToast");

  if (!deleteModalEl || !confirmDeleteBtn) return;

  const deleteModal = new bootstrap.Modal(deleteModalEl);
  const deleteToast = deleteToastEl ? new bootstrap.Toast(deleteToastEl) : null;

  // open modal
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".delete-order-btn");
    if (!btn) return;
    const orderId = btn.getAttribute("data-order-id");
    deleteOrderIdInput.value = orderId;
    deleteModal.show();
  });

  // confirm delete
  confirmDeleteBtn.addEventListener("click", async () => {
    const orderId = deleteOrderIdInput.value;
    if (!orderId) return;

    try {
      const res = await fetch("/seller/orders/delete", {
        method: "POST", // ← use POST to avoid DELETE+body issues
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId })
      });

      // Robust parse: prefer JSON; fallback to text
      let payload;
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        payload = await res.json();
      } else {
        const text = await res.text();
        payload = { success: res.ok, message: text };
      }

      if (!res.ok || !payload?.success) {
        alert(payload?.message || `Failed to delete (HTTP ${res.status}).`);
        return;
      }

      // Remove the row using the button's data attribute
      const btn = document.querySelector(`.delete-order-btn[data-order-id="${orderId}"]`);
      const rowEl = btn ? btn.closest(".order-row") : null;
      if (rowEl) rowEl.remove();

      deleteModal.hide();
      if (deleteToast) {
        deleteToastEl.querySelector(".toast-body").textContent =
          payload.message || "Deleted successfully.";
        deleteToast.show();
      } else {
        alert(payload.message || "Deleted successfully.");
      }

      // If the page is empty now, go back a page (if possible) or reload
      if (!document.querySelector(".orders-table .order-row")) {
        const url = new URL(window.location.href);
        const page = parseInt(url.searchParams.get("page") || "1", 10);
        if (page > 1) {
          url.searchParams.set("page", String(page - 1));
          window.location.href = url.toString();
        } else {
          window.location.reload();
        }
      }
    } catch (err) {
      console.error("Delete error:", err);
      alert("Network or parsing error. Check DevTools → Network for details.");
    }
  });
})();
