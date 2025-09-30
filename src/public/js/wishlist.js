// public/js/wishlist.js
(() => {
  const $ = (sel, p=document) => p.querySelector(sel);
  const $$ = (sel, p=document) => Array.from(p.querySelectorAll(sel));

  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, ok: json?.ok === true, ...json };
  }

  function removeRow(el) {
    const row = el.closest('.wishlist-item');
    if (!row) return;
    row.classList.add('removing');
    setTimeout(() => row.remove(), 180);
  }

  function decrementCounters() {
    const countEls = ['#wishlist-count', '#wl-items-count'].map((id)=>$(id));
    countEls.forEach(el => {
      if (!el) return;
      const n = Math.max(0, Number(el.textContent || 0) - 1);
      el.textContent = String(n);
    });
    // If empty state should show:
    const list = $('#wishlist-items');
    if (list && list.children.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-wishlist';
      empty.innerHTML = `
        <i class="fas fa-heart empty-icon"></i>
        <p>Your wishlist is empty</p>
        <a class="wl-empty-link" href="/">Browse products</a>
      `;
      list.replaceWith(empty);
    }
  }

  document.addEventListener('click', async (e) => {
    const moveBtn = e.target.closest('.btn-move');
    const rmvBtn  = e.target.closest('.btn-remove');

    if (moveBtn) {
      const row = moveBtn.closest('.wishlist-item');
      const variantId = Number(row?.dataset?.id);
      if (!variantId) return;
      moveBtn.disabled = true;
      const res = await api('POST', '/api/wishlist/move-to-cart', { variantId, quantity: 1 });
      if (res.ok) {
        removeRow(moveBtn);
        decrementCounters();
      } else {
        alert(res?.message || 'Failed to move item to cart');
        moveBtn.disabled = false;
      }
    }

    if (rmvBtn) {
      const row = rmvBtn.closest('.wishlist-item');
      const variantId = Number(row?.dataset?.id);
      if (!variantId) return;
      rmvBtn.disabled = true;
      const res = await api('DELETE', `/api/wishlist/${variantId}`);
      if (res.ok) {
        removeRow(rmvBtn);
        decrementCounters();
      } else {
        alert(res?.message || 'Failed to remove item');
        rmvBtn.disabled = false;
      }
    }
  });
})();
