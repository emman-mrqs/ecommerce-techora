// /public/js/buy.js
(async function bootBuyPage() {
  if (document.readyState === 'loading') {
    await new Promise(res => document.addEventListener('DOMContentLoaded', res, { once: true }));
  }

  // ========= Embedded data =========
  const productEl  = document.getElementById('product-data');
  const variantsEl = document.getElementById('variants-data');
  if (!productEl || !variantsEl) {
    console.error('[buy.js] Missing embedded JSON <script> tags.');
    return;
  }
  const PRODUCT  = JSON.parse(productEl.textContent || '{}');
  const VARIANTS = JSON.parse(variantsEl.textContent || '[]');

  // ========= State =========
  let selectedColor = null;
  let selectedRam = null;
  let selectedStorage = null;
  let selectedVariant = null;
  let quantity = 1;
  let currentIndex = 0;

  // ========= DOM =========
  const colorWrap      = document.getElementById('color-options');
  const ramStorageWrap = document.getElementById('ram-storage-options');
  const qtyInput       = document.getElementById('qty-input');
  const decBtn         = document.querySelector(".qty-btn[aria-label='Decrease quantity']");
  const incBtn         = document.querySelector(".qty-btn[aria-label='Increase quantity']");
  const stockInfo      = document.querySelector('.stock-info');
  const addToCartBtn   = document.getElementById('btn-add');
  const buyNowBtn      = document.getElementById('btn-buy');
  const totalEl        = document.getElementById('total-amount');
  const priceEl        = document.getElementById('price-display');
  const mainImage      = document.getElementById('mainProductImage');
  const thumbnails     = Array.from(document.querySelectorAll('.image-thumbnails img'));
  const wishlistBtn    = document.getElementById('btn-wishlist');

  if (!colorWrap || !ramStorageWrap || !qtyInput || !decBtn || !incBtn || !addToCartBtn || !buyNowBtn || !totalEl || !priceEl || !stockInfo) {
    console.error('[buy.js] Some required elements are missing on this page.');
    return;
  }

  // ========= Helpers =========
  const formatPHP = n => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(n || 0));
  const getMinMax = () => {
    const nums = VARIANTS.map(v => Number(v.price));
    return [Math.min(...nums), Math.max(...nums)];
  };
  const findVariant = (color, ram, storage) =>
    VARIANTS.find(v => v.color === color && Number(v.ram) === Number(ram) && Number(v.storage) === Number(storage)) || null;

  function setSelected(group, btn) {
    group.querySelectorAll('.variant-btn').forEach(b => {
      b.classList.remove('selected');
      b.setAttribute('aria-pressed', 'false');
    });
    if (btn) {
      btn.classList.add('selected');
      btn.setAttribute('aria-pressed', 'true');
    }
  }

  function disableUnavailableOptions() {
    if (!colorWrap || !ramStorageWrap) return;

    const colorButtons = Array.from(colorWrap.querySelectorAll('[data-color]'));
    const ramStorageButtons = Array.from(ramStorageWrap.querySelectorAll('[data-ram][data-storage]'));

    const availableByColor = new Map(); // color -> Set("ram-storage")
    const availableByCombo = new Map(); // "ram-storage" -> Set(color)

    VARIANTS.forEach(v => {
      const combo = `${Number(v.ram)}-${Number(v.storage)}`;
      const co = String(v.color);
      if (!availableByColor.has(co)) availableByColor.set(co, new Set());
      if (!availableByCombo.has(combo)) availableByCombo.set(combo, new Set());
      availableByColor.get(co).add(combo);
      availableByCombo.get(combo).add(co);
    });

    ramStorageButtons.forEach(btn => {
      const combo = `${btn.dataset.ram}-${btn.dataset.storage}`;
      const ok = !selectedColor || (availableByColor.get(selectedColor) || new Set()).has(combo);
      btn.setAttribute('aria-disabled', ok ? 'false' : 'true');
    });

    colorButtons.forEach(btn => {
      const co = String(btn.dataset.color);
      const combo = (selectedRam && selectedStorage) ? `${selectedRam}-${selectedStorage}` : null;
      const ok = !combo || (availableByCombo.get(combo) || new Set()).has(co);
      btn.setAttribute('aria-disabled', ok ? 'false' : 'true');
    });
  }

  function updateStockDisplay() {
    if (selectedVariant) {
      stockInfo.textContent = 'In Stock: ' + Number(selectedVariant.stock_quantity || 0);
    } else {
      const total = VARIANTS.reduce((s, v) => s + Number(v.stock_quantity || 0), 0);
      stockInfo.textContent = 'In Stock: ' + total;
    }
  }

  function updateTotalsUI() {
    const unit = selectedVariant ? Number(selectedVariant.price) : 0;
    const total = unit * quantity;
    totalEl.textContent = `Total: ${formatPHP(total)}`;
    if (selectedVariant) {
      priceEl.textContent = `${formatPHP(total)}`;
    } else {
      const [minP, maxP] = getMinMax();
      priceEl.textContent = `${formatPHP(minP)} – ${formatPHP(maxP)}`;
    }
  }

  function clampQty() {
    const max = selectedVariant ? Number(selectedVariant.stock_quantity || 0) : Infinity;
    if (!Number.isFinite(quantity) || quantity < 1) quantity = 1;
    if (quantity > max) quantity = max;
    qtyInput.value = String(quantity);
    updateTotalsUI();
  }

  function validateSelection() {
    if (!selectedColor || !selectedRam || !selectedStorage) {
      alert('Please select color and RAM + Storage.');
      return false;
    }
    if (!selectedVariant) {
      alert('Selected combination is not available.');
      return false;
    }
    if (Number(selectedVariant.stock_quantity || 0) < 1) {
      alert('This variant is out of stock.');
      return false;
    }
    if (quantity > Number(selectedVariant.stock_quantity || 0)) {
      alert('Quantity exceeds stock!');
      quantity = Number(selectedVariant.stock_quantity || 0);
      clampQty();
      return false;
    }
    return true;
  }

  async function postJSON(url, data) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  function buildPayload() {
    return {
      productId: PRODUCT.id || PRODUCT.product_id || PRODUCT._id,
      variantId: selectedVariant.id || selectedVariant.variant_id || selectedVariant._id,
      color: selectedColor,
      ram: selectedRam,
      storage: selectedStorage,
      unitPrice: Number(selectedVariant.price),
      quantity: Number(quantity)
    };
  }

  // ================== Image gallery ==================
  function firstVisibleThumb() {
    return thumbnails.find(img => img.style.display !== 'none');
  }

  function setActiveThumbnail(index) {
    if (!thumbnails.length || !mainImage) return;
    const t = thumbnails[index] && thumbnails[index].style.display !== 'none'
      ? thumbnails[index]
      : firstVisibleThumb();
    if (!t) return;
    thumbnails.forEach(img => img.classList.remove('active'));
    t.classList.add('active');
    mainImage.src = t.src;
    currentIndex = thumbnails.indexOf(t);
  }

  thumbnails.forEach((thumb, i) => thumb.addEventListener('click', () => setActiveThumbnail(i)));
  document.addEventListener('keydown', (e) => {
    if (!thumbnails.length) return;
    if (e.key === 'ArrowLeft') {
      currentIndex = (currentIndex - 1 + thumbnails.length) % thumbnails.length;
      setActiveThumbnail(currentIndex);
    } else if (e.key === 'ArrowRight') {
      currentIndex = (currentIndex + 1) % thumbnails.length;
      setActiveThumbnail(currentIndex);
    }
  });

  // ---- Filter helpers ----
  // CHANGED: fall back to color mode when this variant has no own thumbnail.
  function showImagesForVariant(variantId) {
    if (!thumbnails.length) return;

    const idStr = String(variantId);
    const hasExactThumb = thumbnails.some(img => img.dataset.variantId === idStr);

    if (!hasExactThumb) {
      const v = VARIANTS.find(x => String(x.id) === idStr);
      if (v) { showImagesForColor(String(v.color)); return; }
    }

    thumbnails.forEach(img => {
      const vId = img.dataset.variantId;
      const visible = !vId || vId === idStr;
      img.style.display = visible ? "inline-block" : "none";
    });

    let first = thumbnails.find(img =>
      img.style.display !== "none" && img.dataset.variantId === idStr
    );
    if (!first) {
      first = thumbnails.find(img =>
        img.style.display !== "none" && !img.dataset.variantId
      );
    }
    if (first) {
      thumbnails.forEach(img => img.classList.remove("active"));
      first.classList.add("active");
      mainImage.src = first.src;
      currentIndex = thumbnails.indexOf(first);
    }
  }

  function showImagesForColor(color) {
    if (!thumbnails.length) return;

    thumbnails.forEach(img => {
      const vId = img.dataset.variantId;
      const v   = VARIANTS.find(x => String(x.id) === String(vId));
      const belongsToColor = v ? v.color === color : false;
      img.style.display = (!vId || belongsToColor) ? "inline-block" : "none";
    });

    let first = thumbnails.find(img => {
      const vId = img.dataset.variantId;
      if (!vId) return false;
      const v = VARIANTS.find(x => String(x.id) === String(vId));
      return img.style.display !== "none" && v && v.color === color;
    });
    if (!first) {
      first = thumbnails.find(img =>
        img.style.display !== "none" && !img.dataset.variantId
      );
    }
    if (first) {
      thumbnails.forEach(img => img.classList.remove("active"));
      first.classList.add("active");
      mainImage.src = first.src;
      currentIndex = thumbnails.indexOf(first);
    }
  }

  // ========= Events =========
  colorWrap.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-color]');
    if (!btn || btn.getAttribute('aria-disabled') === 'true') return;

    selectedColor = btn.dataset.color;
    setSelected(colorWrap, btn);

    selectedVariant = (selectedRam && selectedStorage)
      ? findVariant(selectedColor, selectedRam, selectedStorage)
      : null;

    disableUnavailableOptions();
    updateStockDisplay();
    clampQty();

    if (selectedVariant) {
      showImagesForVariant(selectedVariant.id);
    } else {
      showImagesForColor(selectedColor);
    }
  });

  ramStorageWrap.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ram][data-storage]');
    if (!btn || btn.getAttribute('aria-disabled') === 'true') return;

    selectedRam = Number(btn.dataset.ram);
    selectedStorage = Number(btn.dataset.storage);
    setSelected(ramStorageWrap, btn);

    selectedVariant = selectedColor ? findVariant(selectedColor, selectedRam, selectedStorage) : null;

    disableUnavailableOptions();
    updateStockDisplay();
    clampQty();

    if (selectedVariant) {
      showImagesForVariant(selectedVariant.id);
    }
  });

  decBtn.addEventListener('click', () => { if (quantity > 1) { quantity--; clampQty(); } });
  incBtn.addEventListener('click', () => {
    const cap = selectedVariant ? Number(selectedVariant.stock_quantity || 0) : Infinity;
    if (quantity + 1 > cap) { alert('Cannot exceed stock!'); return; }
    quantity++; clampQty();
  });
  qtyInput.addEventListener('input', () => {
    quantity = parseInt(qtyInput.value, 10) || 1;
    clampQty();
  });

  addToCartBtn.addEventListener('click', async () => {
    if (!validateSelection()) return;
    const res = await postJSON('/api/cart', buildPayload());
    if (res.ok) window.location.href = '/cart'; else alert(res.message || 'Failed to add to cart');
  });

  // ---- Buy Now: add to cart, then POST to /checkout/selected for only this variant ----
  buyNowBtn.addEventListener('click', async () => {
    if (!validateSelection()) return;

    // 1) Add to cart (same endpoint you already use)
    const addResp = await postJSON('/api/cart', buildPayload());
    if (!addResp || !addResp.ok) {
      alert(addResp?.message || 'Failed to add to cart');
      return;
    }

    // 2) Ensure client-side variable exists for checkout.js convenience
    try {
      window.checkoutSelectedVariantIds = [ Number(selectedVariant.id || selectedVariant.variant_id || selectedVariant._id) ];
    } catch (e) { /* ignore */ }

    // 3) Submit form POST to /checkout/selected (server expects selected[] or selectedVariantIds)
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/checkout/selected';
    form.style.display = 'none';

    // selected[] (server accepts selected[] OR selectedVariantIds)
    const inp = document.createElement('input');
    inp.type = 'hidden';
    inp.name = 'selected[]';
    inp.value = String(window.checkoutSelectedVariantIds[0]);
    form.appendChild(inp);

    // Optional: also include selectedVariantIds as JSON string (some handlers check this)
    const jsonInp = document.createElement('input');
    jsonInp.type = 'hidden';
    jsonInp.name = 'selectedVariantIds';
    jsonInp.value = JSON.stringify(window.checkoutSelectedVariantIds);
    form.appendChild(jsonInp);

    // Optional: include quantity (server currently gets quantities from cart_items; include only if your server reads it)
    const q = document.createElement('input');
    q.type = 'hidden';
    q.name = `quantity`;
    q.value = String(quantity || 1);
    form.appendChild(q);

    document.body.appendChild(form);
    form.submit();
  });


  // ======== Wishlist ========
  function pulse(el) {
    if (!el) return;
    el.classList.add('pressed');
    setTimeout(() => el.classList.remove('pressed'), 180);
  }
  function markWishlistSaved(on) {
    if (!wishlistBtn) return;
    wishlistBtn.classList.toggle('saved', !!on);
    const icon = wishlistBtn.querySelector('i');
    const text = wishlistBtn.querySelector('span');
    if (on) {
      icon.classList.remove('fa-regular'); icon.classList.add('fa-solid');
      text.textContent = 'Saved to Wishlist';
      wishlistBtn.setAttribute('aria-pressed','true');
    } else {
      icon.classList.add('fa-regular'); icon.classList.remove('fa-solid');
      text.textContent = 'Add to Wishlist';
      wishlistBtn.setAttribute('aria-pressed','false');
    }
  }
  if (wishlistBtn) {
    wishlistBtn.addEventListener('click', async () => {
      pulse(wishlistBtn);
      if (!validateSelection()) return;
      try {
        const variantId =
          selectedVariant.id ??
          selectedVariant.variant_id ??
          selectedVariant._id;

        const res = await postJSON('/api/wishlist/add', { variantId });
        if (res && res.ok) {
          markWishlistSaved(true);
        } else {
          alert(res?.message || 'Failed to add to wishlist');
        }
      } catch (err) {
        alert('Network/auth error while adding to wishlist');
      }
    });
  }

  // ========= Init =========
  setActiveThumbnail(0);
  const [minP, maxP] = getMinMax();
  priceEl.textContent = `${formatPHP(minP)} – ${formatPHP(maxP)}`;
  updateStockDisplay();
  clampQty();
  disableUnavailableOptions();
})().catch(err => console.error('[buy.js] Boot error:', err));
