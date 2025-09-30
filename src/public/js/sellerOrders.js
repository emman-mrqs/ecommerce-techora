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
        const order = JSON.parse(btn.getAttribute("data-order"));

        // Clean shipping
        let cleanShipping = order.shipping_address || "N/A";
        if (cleanShipping.includes(",")) {
        const parts = cleanShipping.split(",");
        if (parts.length > 1) {
            cleanShipping = parts.slice(1).join(",").trim();
        }
        }

        invoiceContent.innerHTML = `
        <div class="invoice-header">
            <h5>Invoice #${order.order_id}</h5>
            <p class="date">${new Date(order.order_date).toLocaleString()}</p>
        </div>

        <div class="invoice-section">
            <div><h6>Customer</h6><p>${order.customer_name}</p></div>
            <div><h6>Product</h6><p>${order.product_name} (x${order.quantity})</p></div>
        </div>

        <div class="invoice-section">
            <div><h6>Total</h6><p>₱${order.total_price}</p></div>
            <div><h6>Status</h6><span class="status-badge status-${order.order_status.toLowerCase()}">${order.order_status}</span></div>
        </div>

        <div class="invoice-section">
            <div><h6>Payment Method</h6><p>${order.payment_method || "N/A"}</p></div>
            <div><h6>Payment Status</h6><p>${order.payment_status || "N/A"}</p></div>
        </div>

        <div class="invoice-section">
            <div><h6>Transaction ID</h6><p>${order.transaction_id || "N/A"}</p></div>
            <div><h6>Payment Date</h6><p>${order.payment_date ? new Date(order.payment_date).toLocaleString() : "N/A"}</p></div>
        </div>

        <div class="invoice-section">
            <div><h6>Amount Paid</h6><p>₱${order.amount_paid || order.total_price}</p></div>
            <div><h6>Order Total</h6><p>₱${order.total_price}</p></div>
        </div>

        <div class="invoice-section shipping">
            <h6>Shipping Address</h6>
            <p>${cleanShipping}</p>
        </div>
        `;

        soldBy.innerHTML = `Sold by: ${order.store_name || "Techora Store"}`;
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
