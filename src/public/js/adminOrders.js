// /public/js/adminOrders.js
(() => {
  // ===== Invoice Modal wiring =====
  const invoiceModalEl = document.getElementById('invoiceModal');
  const invoiceModal = invoiceModalEl ? new bootstrap.Modal(invoiceModalEl) : null;

  async function openInvoice(orderId, sellerId) {
    try {
      const res = await fetch(`/admin/orders/${orderId}/seller/${sellerId}`);
      if (!res.ok) throw new Error('Fetch failed');
      const data = await res.json();
      if (!data.ok) throw new Error('Invoice not found');

      const inv = data.invoice;

      setText('invTitle', `Invoice #${inv.order_id}`);
      setText('invCreatedAt', new Date(inv.created_at).toLocaleString());

      const s = (inv.order_status || 'Pending').toLowerCase();
      const statusEl = document.getElementById('invStatus');
      if (statusEl) {
        statusEl.textContent = inv.order_status || 'Pending';
        statusEl.className = 'badge ' + (
          s === 'delivered' ? 'bg-success' :
          s === 'shipped'   ? 'bg-primary' :
          s === 'cancelled' ? 'bg-danger'  :
                              'bg-warning text-dark'
        );
      }

      setText('invCustomer', inv.customer_name + (inv.customer_email ? ` (${inv.customer_email})` : ''));
      setText('invPayMethod',  inv.payment?.payment_method || '—');
      setText('invPayStatus',  inv.payment?.payment_status || '—');
      setText('invTxn',        inv.payment?.transaction_id || '—');
      setText('invPayDate',    inv.payment?.payment_date ? new Date(inv.payment.payment_date).toLocaleString() : '—');
      setText('invAmountPaid', inv.payment?.amount_paid != null ? '₱' + Number(inv.payment.amount_paid).toLocaleString() : '—');

      setText('invOrderTotal', '₱' + Number(inv.seller_total).toLocaleString());
      setText('invShip',       inv.shipping_address || '—');
      setText('invSoldBy',     'Sold by: ' + (inv.store_name || ''));

      const itemsTbody = document.getElementById('invItems');
      if (itemsTbody) {
        itemsTbody.innerHTML = '';
        inv.items.forEach(it => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${it.product_name}<div class="item-specs">${it.specs || ''}</div></td>
            <td>${it.quantity}</td>
            <td class="text-end">₱${Number(it.line_total).toLocaleString()}</td>
          `;
          itemsTbody.appendChild(tr);
        });
      }

      invoiceModal?.show();
    } catch (err) {
      console.error(err);
      alert('Failed to load invoice');
    }
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // Delegate: open invoice
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.js-view-invoice');
    if (!btn) return;
    openInvoice(btn.dataset.order, btn.dataset.seller);
  });

  // ====== Confirm Delete Modal wiring ======
  const cdmEl = document.getElementById('confirmDeleteModal');
  const cdm = cdmEl ? new bootstrap.Modal(cdmEl) : null;
  let pendingDelete = null; // { orderId, sellerId, rowEl, itemsSel, cardEl }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.js-delete-seller-order');
    if (!btn) return;

    const orderId = btn.dataset.order;
    const sellerId = btn.dataset.seller;
    const rowEl = btn.closest('tr.order-row');
    const itemsSel = btn.dataset.itemsTarget || '';
    const cardEl = btn.closest('[data-seller-card]');
    const sellerName = cardEl?.querySelector('.seller-name')?.textContent?.trim() || 'this seller';

    const idEl = document.getElementById('cdmOrderId');
    const nameEl = document.getElementById('cdmSellerName');
    if (idEl) idEl.textContent = orderId;
    if (nameEl) nameEl.textContent = sellerName;

    pendingDelete = { orderId, sellerId, rowEl, itemsSel, cardEl };
    cdm?.show();
  });

  const cdmConfirmBtn = document.getElementById('cdmConfirmBtn');
  cdmConfirmBtn?.addEventListener('click', async () => {
    if (!pendingDelete) return;

    const { orderId, sellerId, rowEl, itemsSel, cardEl } = pendingDelete;
    cdm?.hide();

    try {
      const res = await fetch(`/admin/orders/${orderId}/seller/${sellerId}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Delete failed');

      // Remove the rows for this seller-order
      rowEl?.remove();
      if (itemsSel) {
        const itemsRow = document.querySelector(itemsSel);
        itemsRow?.remove();
      }

      // If seller card now has no order rows, hide it
      const stillHasOrders = cardEl?.querySelector('tr.order-row');
      if (!stillHasOrders) cardEl?.remove();

      showMiniToast(data.order_empty
        ? `Seller items deleted. Order #${orderId} had no remaining items, so it was removed.`
        : `Seller items deleted from Order #${orderId}.`);

    } catch (err) {
      console.error(err);
      alert('Failed to delete. Please try again.');
    } finally {
      pendingDelete = null;
    }
  });

  function showMiniToast(msg) {
    if (window.bootstrap) {
      const div = document.createElement('div');
      div.className = 'toast align-items-center text-bg-dark border-0 position-fixed bottom-0 end-0 m-3';
      div.role = 'alert';
      div.ariaLive = 'assertive';
      div.ariaAtomic = 'true';
      div.innerHTML = `
        <div class="d-flex">
          <div class="toast-body">${msg}</div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>`;
      document.body.appendChild(div);
      const t = new bootstrap.Toast(div, { autohide: true, delay: 3000 });
      t.show();
      div.addEventListener('hidden.bs.toast', () => div.remove());
    } else {
      alert(msg);
    }
  }

  // ===== Filters (search/status/date) =====
  (function setupOrderFilters() {
    const $q    = document.getElementById('orderSearch');
    const $st   = document.getElementById('orderStatus');
    const $from = document.getElementById('dateFrom');
    const $to   = document.getElementById('dateTo');
    if (!$q || !$st || !$from || !$to) return;

    function withinDate(d, from, to) {
      if (!d) return true;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    }

    function filter() {
      const term   = ($q.value || '').toLowerCase().trim();
      const status = ($st.value || '').toLowerCase().trim();
      const from   = $from.value ? $from.value : null;
      const to     = $to.value   ? $to.value   : null;

      document.querySelectorAll('.orders-card .order-row').forEach(tr => {
        const hay = tr.getAttribute('data-search') || '';
        const st  = (tr.getAttribute('data-status') || '').toLowerCase();
        const d   = tr.getAttribute('data-date');

        const matchesText = !term || hay.includes(term);
        const matchesStat = !status || st === status;
        const matchesDate = withinDate(d, from, to);

        tr.style.display = (matchesText && matchesStat && matchesDate) ? '' : 'none';
      });

      document.querySelectorAll('#ordersAccordion > .orders-card').forEach(card => {
        const anyVisible = !!card.querySelector('tr.order-row:not([style*="display: none"])');
        card.style.display = anyVisible ? '' : 'none';
      });
    }

    let t;
    function debounceFilter() {
      clearTimeout(t);
      t = setTimeout(filter, 150);
    }

    $q.addEventListener('input', debounceFilter);
    $st.addEventListener('change', filter);
    $from.addEventListener('change', filter);
    $to.addEventListener('change', filter);
    filter();
  })();

  // ===== Auto-hide toasts from partial =====
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.toast').forEach(el => {
      el.classList.remove('show');
      const t = bootstrap.Toast.getOrCreateInstance(el, { autohide: true, delay: 3000 });
      t.show();
    });
  });

  // ============================================================
  // ========== NEW: Edit Status (admin) wiring below ===========
  // ============================================================
  const statusModalEl = document.getElementById('statusModal');
  const statusModal = statusModalEl ? new bootstrap.Modal(statusModalEl) : null;
  const statusForm = document.getElementById('statusForm');
  const statusOrderIdInput = document.getElementById('statusOrderId'); // hidden input in your modal
const statusSelect = document.getElementById('statusSelect');         // select in your modal

  // temporary holder while editing
  let pendingStatusEdit = null; // { orderId, sellerId, rowEl }

  // Click pencil: open modal & pre-fill
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.js-edit-status');
    if (!btn) return;

    const orderId = btn.dataset.order;
    const sellerId = btn.dataset.seller;
    const currentStatus = (btn.dataset.status || '').toLowerCase();
    const rowEl = btn.closest('tr.order-row');

    pendingStatusEdit = { orderId, sellerId, rowEl };

    // set form fields
    if (statusOrderIdInput) statusOrderIdInput.value = orderId;
    if (statusSelect) {
      statusSelect.value = currentStatus || 'pending';
    }

    statusModal?.show();
  });

  // Helper: title & class mapping for badges
  function statusMeta(key) {
    const k = (key || '').toLowerCase();
    switch (k) {
      case 'completed': return { text: 'Completed',  cls: 'status-badge status-completed'  };
      case 'delivered': return { text: 'Delivered',  cls: 'status-badge status-delivered'  };
      case 'confirmed': return { text: 'Confirmed',  cls: 'status-badge status-shipped'    }; // your CSS uses shipped style for confirmed
      case 'shipped':   return { text: 'Shipped',    cls: 'status-badge status-shipped'     };
      case 'cancelled': return { text: 'Cancelled',  cls: 'status-badge status-cancelled'   };
      case 'return':    return { text: 'Return',     cls: 'status-badge status-return'      };
      default:          return { text: 'Pending',    cls: 'status-badge status-pending'     };
    }
  }

  // Update the badge inside a row (UI only)
  function applyRowStatus(rowEl, newStatus) {
    if (!rowEl) return;

    // 1) update data-status (so filters keep working)
    rowEl.setAttribute('data-status', (newStatus || '').toLowerCase());

    // 2) update the visible badge
    const badgeCell = rowEl.querySelector('td:nth-child(5) .status-badge')  // 5th col is Status in your table
                      || rowEl.querySelector('.status-badge');
    if (badgeCell) {
      const meta = statusMeta(newStatus);
      badgeCell.className = meta.cls;
      badgeCell.textContent = meta.text;
    }

    // 3) also update the pencil button's data-status for next edit
    const editBtn = rowEl.querySelector('.js-edit-status');
    if (editBtn) editBtn.dataset.status = (newStatus || '').toLowerCase();
  }

  // Submit modal: POST to server, then reflect in UI
  statusForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!pendingStatusEdit) return;
    const { orderId, sellerId, rowEl } = pendingStatusEdit;

    const newStatus = (statusSelect?.value || 'pending').toLowerCase();

    try {
      const res = await fetch(`/admin/orders/${orderId}/seller/${sellerId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_status: newStatus })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || data.message || 'Update failed');
      }
      const applied = (data.newStatus || newStatus).toLowerCase();


      // Update UI
      applyRowStatus(rowEl, applied);
      statusModal?.hide();
      showMiniToast(`Order #${orderId} status updated to ${applied}.`);
    } catch (err) {
      console.error(err);
      alert('Failed to update status. Please try again.');
    } finally {
      pendingStatusEdit = null;
    }
  });
})();

// ===== Print only the invoice modal =====
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.js-print-invoice');
  if (!btn) return;
  window.print();
});

// ===== Download PDF using html2pdf =====
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.js-download-invoice');
  if (!btn) return;

  const el = document.getElementById('invoiceContent');
  if (!el) return;

  const titleEl = document.getElementById('invTitle');
  const fileName = (titleEl?.textContent || 'Invoice').replace(/\s+/g, '_') + '.pdf';

  const opt = {
    margin:       10,
    filename:     fileName,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  if (window.html2pdf) {
    window.html2pdf().from(el).set(opt).save();
  } else {
    alert('PDF library not loaded.');
  }
});
