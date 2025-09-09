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
