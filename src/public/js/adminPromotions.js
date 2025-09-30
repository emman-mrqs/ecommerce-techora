    // -------- Search / Status filter ----------
    (function () {
      const $q  = document.getElementById('promoSearch');
      const $st = document.getElementById('promoStatus');

      function filter() {
        const term = ($q.value || '').toLowerCase().trim();
        const status = ($st.value || '').toLowerCase().trim();

        document.querySelectorAll('.promotions-card .promo-row').forEach(tr => {
          const hay = tr.getAttribute('data-search') || '';
          const st  = (tr.getAttribute('data-status') || '').toLowerCase();
          const matchesText = !term || hay.includes(term);
          const matchesStat = !status || st === status;
          tr.style.display = (matchesText && matchesStat) ? '' : 'none';
        });

        document.querySelectorAll('#promosAccordion > .promotions-card').forEach(card => {
          const anyVisible = !!card.querySelector('tr.promo-row:not([style*="display: none"])');
          card.style.display = anyVisible ? '' : 'none';
        });
      }

      [$q, $st].forEach(el => el && el.addEventListener('input', filter));
      $st && $st.addEventListener('change', filter);
      filter();
    })();

    // -------- Confirm modal wiring ----------
    const confirmEl = document.getElementById('promoConfirmModal');
    const confirmModal = confirmEl ? new bootstrap.Modal(confirmEl) : null;
    const confirmTitle = document.getElementById('promoConfirmTitle');
    const confirmMsg   = document.getElementById('promoConfirmMsg');
    const confirmName  = document.getElementById('promoConfirmName');
    const confirmForm  = document.getElementById('promoConfirmForm');
    const confirmBtn   = document.getElementById('promoConfirmSubmit');

    // DELETE: open modal and submit hidden form on confirm
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.js-promo-delete');
      if (!btn) return;

      const formSel = btn.dataset.form;
      const code    = btn.dataset.code || '';

      confirmTitle.textContent = 'Delete Voucher';
      confirmMsg.textContent   = 'This action cannot be undone. Delete';
      confirmName.textContent  = code ? ` ${code}?` : '?';

      // Style
      confirmBtn.className = 'btn btn-danger';
      // Replace default submission with submitting the specific row form
      confirmForm.onsubmit = (evt) => {
        evt.preventDefault();
        const targetForm = document.querySelector(formSel);
        if (targetForm) targetForm.submit();
      };

      confirmModal && confirmModal.show();
    });

    // EDIT SAVE: intercept forms with .js-confirm-on-submit
    document.addEventListener('submit', (e) => {
      const form = e.target.closest('form.js-confirm-on-submit');
      if (!form) return;

      e.preventDefault();

      const code = form.querySelector('input[name="voucher_code"]')?.value || '';

      confirmTitle.textContent = 'Save Changes';
      confirmMsg.textContent   = 'Apply changes to voucher';
      confirmName.textContent  = code ? ` ${code}?` : '?';
      confirmBtn.className     = 'btn btn-primary';

      confirmForm.onsubmit = (evt) => {
        evt.preventDefault();
        form.submit(); // submit the original edit form (server will set toast)
      };

      confirmModal && confirmModal.show();
    });

    // -------- Auto-hide toasts ----------
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('.toast').forEach(el => {
        el.classList.remove('show');
        const t = bootstrap.Toast.getOrCreateInstance(el, { autohide: true, delay: 3000 });
        t.show();
      });
    });