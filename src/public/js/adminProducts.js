 // ========= Helpers =========
    const productModal = new bootstrap.Modal('#productModal');
    const confirmModal = new bootstrap.Modal('#confirmActionModal');

    function setViewMode(isEdit) {
      const fields = ['pName','pDesc'];
      fields.forEach(id => {
        const el = document.getElementById(id);
        if (isEdit) {
          el.removeAttribute('readonly');
        } else {
          el.setAttribute('readonly', 'readonly');
        }
      });

      // Toggle inputs in variants table
      document.querySelectorAll('#variantsBody input').forEach(inp => {
        if (inp.dataset.role === 'ro') return; // keep read-only fields
        if (isEdit) inp.removeAttribute('readonly'); else inp.setAttribute('readonly','readonly');
      });

      // Badge + save button
      document.getElementById('pmodeBadge').textContent = isEdit ? 'EDIT' : 'VIEW';
      document.getElementById('pmodeBadge').className = 'badge ' + (isEdit ? 'bg-primary' : 'bg-secondary');
      document.getElementById('saveBtn').classList.toggle('d-none', !isEdit);
    }

    async function loadProductIntoModal(productId, edit=false) {
      // reset
      document.getElementById('productForm').setAttribute('action', '/admin/products/' + productId + '/update');
      document.getElementById('variantsBody').innerHTML = '';
      document.getElementById('imagesRow').innerHTML = '';

      const res = await fetch('/admin/products/' + productId);
      if (!res.ok) {
        alert('Failed to fetch product.');
        return;
      }
      const data = await res.json();
      if (!data.ok) {
        alert('Product not found.');
        return;
      }

      // Fill basics
      const p = data.product;
      document.getElementById('pTitle').textContent = p.name || 'Product';
      document.getElementById('pName').value = p.name || '';
      document.getElementById('pDesc').value = p.description || '';
      document.getElementById('pStore').value = p.store_name || '';

      // Fill variants
      const vb = document.getElementById('variantsBody');
      if (data.variants && data.variants.length) {
        data.variants.forEach((v, i) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${i+1}<input type="hidden" name="variant_id" value="${v.id}"></td>
            <td><input class="form-control form-control-sm" value="${v.storage ?? ''}" data-role="ro" readonly></td>
            <td><input class="form-control form-control-sm" value="${v.ram ?? ''}" data-role="ro" readonly></td>
            <td><input class="form-control form-control-sm" value="${v.color ?? ''}" data-role="ro" readonly></td>
            <td><input class="form-control form-control-sm" name="price" value="${v.price ?? ''}" ${edit ? '' : 'readonly'}></td>
            <td><input class="form-control form-control-sm" name="stock" value="${v.stock_quantity ?? ''}" ${edit ? '' : 'readonly'}></td>
          `;
          vb.appendChild(tr);
        });
      } else {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="6" class="text-muted">No variants</td>`;
        vb.appendChild(tr);
      }

      // Fill images
      const ir = document.getElementById('imagesRow');
      if (data.images && data.images.length) {
        data.images.forEach(img => {
          const wrap = document.createElement('div');
          wrap.innerHTML = `
            <img class="img-thumb" src="${img.img_url}" alt="">
          `;
          ir.appendChild(wrap);
        });
      } else {
        ir.innerHTML = `<div class="text-muted">No images</div>`;
      }

      setViewMode(!!edit);
      productModal.show();
    }

    // ========= Event wiring =========

    // View
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.js-view');
      if (!btn) return;
      const id = btn.dataset.id;
      loadProductIntoModal(id, false);
    });

    // Edit
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.js-edit');
      if (!btn) return;
      const id = btn.dataset.id;
      loadProductIntoModal(id, true);
    });

    // Delete (confirm modal)
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.js-delete');
      if (!btn) return;
      const id = btn.dataset.id;
      const name = btn.dataset.name || '';
      const form = document.getElementById('confirmActionForm');
      form.setAttribute('action', '/admin/products/' + id + '/delete');
      document.getElementById('confirmTitle').textContent = 'Delete Product';
      document.getElementById('confirmMsg').textContent = 'Delete';
      document.getElementById('confirmName').textContent = name + '?';
      document.getElementById('confirmSubmit').className = 'btn btn-danger';
      document.getElementById('confirmSubmit').textContent = 'Delete';
      confirmModal.show();
    });

    // Simple client-side filter (optional)
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const term = searchInput.value.trim().toLowerCase();
        document.querySelectorAll('tbody tr[data-product-name]').forEach(tr => {
          const n = tr.getAttribute('data-product-name') || '';
          tr.style.display = n.includes(term) ? '' : 'none';
        });
      });
    }

    // Auto-hide any Bootstrap toasts on this page (uses your partial)
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('.toast').forEach(el => {
        el.classList.remove('show');
        const t = bootstrap.Toast.getOrCreateInstance(el, { autohide: true, delay: 3000 });
        t.show();
      });
    });


/*================
Search and filter
=================== */
(function () {
  const $search = document.getElementById('prodSearch');
  const $status = document.getElementById('prodStatus');

  if (!$search || !$status) return;

  // Debounce helper for smooth typing
  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms);
    };
  }

  function filterProducts() {
    const term = ($search.value || '').trim().toLowerCase();
    const status = ($status.value || '').trim(); // '', 'active', 'low_stock', 'out_of_stock'

    // Each seller card contains one table. We'll hide the whole card if no rows match.
    document.querySelectorAll('.products-card').forEach(card => {
      const tbody = card.querySelector('tbody');
      if (!tbody) return;

      let anyVisible = false;

      tbody.querySelectorAll('tr.product-row').forEach(tr => {
        const hay = tr.getAttribute('data-search') || '';
        const st  = tr.getAttribute('data-status') || '';

        const matchesText = !term || hay.includes(term);
        const matchesStatus = !status || st === status;

        const show = matchesText && matchesStatus;
        tr.style.display = show ? '' : 'none';
        if (show) anyVisible = true;
      });

      // Hide the whole seller section if no products are visible in its table body
      const collapseWrapper = card.querySelector('.collapse, .accordion-collapse') || card; // fallback to card
      const tableWrapper = collapseWrapper.closest('.products-card') || card;
      const headerOnly = !tbody.querySelector('tr.product-row'); // empty seller

      tableWrapper.style.display = (anyVisible || headerOnly) ? '' : 'none';

      // Optional: show a "No products" row when seller is visible but has zero matches
      let noRow = tbody.querySelector('.no-results-row');
      if (!anyVisible) {
        if (!noRow) {
          noRow = document.createElement('tr');
          noRow.className = 'no-results-row';
          noRow.innerHTML = `<td colspan="6" class="text-center text-muted">No matching products</td>`;
          tbody.appendChild(noRow);
        }
      } else if (noRow) {
        noRow.remove();
      }
    });
  }

  const runFilter = debounce(filterProducts, 150);
  $search.addEventListener('input', runFilter);
  $status.addEventListener('change', filterProducts);

  // Initial run (e.g., when landing with pre-filled filters)
  filterProducts();
})();
