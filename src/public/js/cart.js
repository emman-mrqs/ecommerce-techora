(function () {
  function closestVariantId(el) {
    const itemEl = el.closest('.cart-item');
    return itemEl ? itemEl.getAttribute('data-id') : null; // variantId
  }
  async function patch(url, body) {
    const res = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return res.json();
  }
  async function del(url) { const res = await fetch(url, { method: 'DELETE' }); return res.json(); }

  document.querySelectorAll('.btn-increase').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = closestVariantId(e.currentTarget);
      const qtyEl = e.currentTarget.parentElement.querySelector('.quantity-input');
      const next = Number(qtyEl.value || '1') + 1;
      await patch(`/api/cart/${encodeURIComponent(id)}`, { quantity: next });
      window.location.reload();
    });
  });
  document.querySelectorAll('.btn-decrease').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = closestVariantId(e.currentTarget);
      const qtyEl = e.currentTarget.parentElement.querySelector('.quantity-input');
      const next = Math.max(1, Number(qtyEl.value || '1') - 1);
      await patch(`/api/cart/${encodeURIComponent(id)}`, { quantity: next });
      window.location.reload();
    });
  });
  document.querySelectorAll('.btn-remove').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = closestVariantId(e.currentTarget);
      await del(`/api/cart/${encodeURIComponent(id)}`);
      window.location.reload();
    });
  });
})();



// -------- selection + totals + submit helper for checkout ----------
(function () {
  // Recompute selected-only totals for UI feedback
  function recalcSelectedTotals() {
    const rows = document.querySelectorAll('.cart-item');
    let subtotal = 0;
    let tax = 0;
    rows.forEach(row => {
      const chk = row.querySelector('.select-item');
      if (!chk || !chk.checked) return;
      const price = Number(row.getAttribute('data-price') || 0);
      const qty = Number(row.querySelector('.quantity-input')?.value || 0);
      subtotal += price * qty;
      tax += price * qty * 0.03;
    });
    tax = Math.round(tax * 100) / 100;

    const subtotalEl = document.getElementById('subtotal');
    const taxEl = document.getElementById('tax');
    const totalEl = document.getElementById('total');

    if (subtotalEl) subtotalEl.innerText = '₱' + subtotal.toFixed(2);
    if (taxEl) taxEl.innerText = '₱' + tax.toFixed(2);
    if (totalEl) totalEl.innerText = '₱' + (subtotal + tax).toFixed(2);
  }

  // ensure recalc fires when checkboxes change or quantity buttons clicked
  document.addEventListener('change', function (e) {
    if (e.target && e.target.matches && e.target.matches('.select-item')) {
      recalcSelectedTotals();
    }
  });

  document.querySelectorAll('.quantity-btn').forEach(btn => {
    btn.addEventListener('click', () => setTimeout(recalcSelectedTotals, 120));
  });

  // prepare form on submit: copy selected[] into hidden inputs (works even if items are outside form)
  const form = document.getElementById('cart-selection-form');
  if (form) {
    form.addEventListener('submit', function (ev) {
      // remove old hidden inputs
      form.querySelectorAll('input[name="selected[]"]').forEach(n => n.remove());

      const selected = [];
      document.querySelectorAll('.select-item').forEach(chk => {
        if (chk.checked) selected.push(chk.value);
      });

      if (!selected.length) {
        ev.preventDefault();
        alert('Please select at least one item to checkout.');
        return;
      }

      selected.forEach(val => {
        const h = document.createElement('input');
        h.type = 'hidden';
        h.name = 'selected[]';
        h.value = val;
        form.appendChild(h);
      });
      // allow submit to continue
    });
  }

  // initial calc
  recalcSelectedTotals();
})();

