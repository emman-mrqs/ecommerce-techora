// /public/js/reviews.js
(() => {
  // ---- get product id from JSON blob injected in EJS ----
  const productBlob = document.getElementById('product-data');
  if (!productBlob) return; // nothing to do on pages without product
  let productId = null;
  try {
    const product = JSON.parse(productBlob.textContent || '{}');
    productId = Number(product.id);
  } catch {
    // invalid blob; stop silently
    return;
  }
  if (!productId) return;

  // ---- DOM targets ----
  const listAll      = document.getElementById('reviewsList');            // All reviews container
  const listVerified = document.getElementById('reviewsListVerified');    // Verified reviews container
  const countEl      = document.getElementById('reviews-count');          // small text near title
  const badgeEl      = document.getElementById('badge-count');            // badge in tab
  const form         = document.getElementById('reviewForm');             // write form (may be hidden)

  const esc = s => String(s || '').replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'
  }[m]));
  const starLine = n => '★'.repeat(Number(n) || 0) + '☆'.repeat(5 - (Number(n) || 0));
  const fmtDate = iso => new Date(iso).toLocaleDateString();

  const renderCards = items => items.map(r => `
    <div class="review-card">
      <div class="d-flex align-items-center justify-content-between">
        <div class="d-flex align-items-center gap-2">
          <strong>${esc(r.user_name ?? ('User #' + r.user_id))}</strong>
          ${r.verified_buyer ? '<span class="badge bg-dark">Verified Buyer</span>' : ''}
          <span class="text-muted small">${fmtDate(r.created_at)}</span>
        </div>
        <div class="fw-bold">${starLine(r.rating)}</div>
      </div>
      <p class="m-0 mt-2">${esc(r.body)}</p>
      ${r.reply ? `<div class="seller-reply mt-2">
          <div class="small text-muted">Seller reply</div>
          <div>${esc(r.reply)}</div>
        </div>` : ''}
    </div>
  `).join('');

  async function loadReviews() {
    if (listAll) listAll.innerHTML = '<div class="text-muted">Loading…</div>';
    try {
      const res = await fetch(`/api/reviews?product_id=${productId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const items    = data.items || [];
      const verified = data.verified_items || [];

      if (countEl) countEl.textContent = `${items.length} review${items.length !== 1 ? 's' : ''}`;
      if (badgeEl) badgeEl.textContent = items.length;

      if (listAll)      listAll.innerHTML      = items.length
        ? renderCards(items)
        : '<div class="text-muted">No reviews yet.</div>';

      if (listVerified) listVerified.innerHTML = verified.length
        ? renderCards(verified)
        : '<div class="text-muted">No reviews from verified buyers yet.</div>';
    } catch (err) {
      console.error('Failed to load reviews:', err);
      if (listAll)      listAll.innerHTML      = '<div class="text-danger">Unable to load reviews.</div>';
      if (listVerified) listVerified.innerHTML = '';
    }
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const payload = {
        product_id: productId,
        rating: Number(fd.get('rating')),
        body: (fd.get('body') || '').trim()
      };
      if (!payload.rating || !payload.body) return;

      try {
        const r = await fetch('/api/reviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          alert('Review not saved: ' + (j.reason || r.status));
          return;
        }
        form.reset();
        const tabBtn = document.querySelector('#tab-all');
        if (tabBtn && window.bootstrap) new bootstrap.Tab(tabBtn).show();
        loadReviews();
      } catch (e2) {
        console.error(e2);
        alert('Network error while saving your review.');
      }
    });
  }

  loadReviews();
})();
