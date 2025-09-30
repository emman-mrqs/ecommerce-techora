  (function () {
    const modalEl = document.getElementById('confirmSellerActionModal');
    if (!modalEl) return;

    const modal = new bootstrap.Modal(modalEl);
    const form = document.getElementById('sellerActionForm');
    const titleEl = document.getElementById('sellerModalTitle');
    const msgEl = document.getElementById('sellerModalMsg');
    const nameEl = document.getElementById('sellerName');
    const submitBtn = document.getElementById('sellerModalSubmit');

    const ACTIONS = {
      approve:   { path: 'approve',   title: 'Approve Seller',       msg: 'Approve',   btnClass: 'btn-success',  btnText: 'Approve' },
      reject:    { path: 'reject',    title: 'Reject Application',   msg: 'Reject',    btnClass: 'btn-danger',   btnText: 'Reject'  },
      suspend:   { path: 'suspend',   title: 'Suspend Seller',       msg: 'Suspend',   btnClass: 'btn-warning',  btnText: 'Suspend' },
      unsuspend: { path: 'unsuspend', title: 'Unsuspend Seller',     msg: 'Unsuspend', btnClass: 'btn-success',  btnText: 'Unsuspend' }
    };

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.js-seller-action');
      if (!btn) return;

      const action = btn.dataset.action;
      const id = btn.dataset.id;
      const name = btn.dataset.name || '';

      const conf = ACTIONS[action];
      if (!conf) return;

      // Set modal text
      titleEl.textContent = conf.title;
      msgEl.textContent = conf.msg + ' ';
      nameEl.textContent = name;

      // Point the form to the proper route
      form.setAttribute('action', `/admin/sellers/${id}/${conf.path}`);

      // Style submit button
      submitBtn.className = 'btn';
      submitBtn.classList.add(conf.btnClass);
      submitBtn.textContent = conf.btnText;

      modal.show();
    });

    // (optional) enable Bootstrap tooltips for any title= attributes
    const tts = [].slice.call(document.querySelectorAll('[title]'));
    tts.forEach(el => {
      try { new bootstrap.Tooltip(el); } catch (_) {}
    });
  })();

  // Auto-hide any Bootstrap toasts rendered on the page
document.addEventListener('DOMContentLoaded', () => {
  const toasts = document.querySelectorAll('.toast');

  toasts.forEach((el) => {
    // If the partial rendered with class "show", remove it so the timer works
    el.classList.remove('show');

    // Create (or reuse) a Toast instance with autohide + delay
    const toast = bootstrap.Toast.getOrCreateInstance(el, {
      autohide: true,
      delay: 3000,        // ← change to your preferred duration (ms)
    });

    toast.show();
  });
});


// --- Suspension modal wiring ---
(() => {
  const modalEl = document.getElementById("sellerSuspendModal");
  if (!modalEl) return;
  const modal = new bootstrap.Modal(modalEl);
  const form = document.getElementById("sellerSuspendForm");

  const titleInput = document.getElementById("suspension_title");
  const reasonInput = document.getElementById("suspension_reason");
  const endInput = document.getElementById("susp_end");
  const permInput = document.getElementById("susp_perm");
  const modalTitle = document.getElementById("sellerSuspendTitle");

  // toggle end date field if permanent
  const toggleEnd = () => {
    if (permInput.checked) {
      endInput.value = "";
      endInput.setAttribute("disabled", "disabled");
    } else {
      endInput.removeAttribute("disabled");
    }
  };
  permInput.addEventListener("change", toggleEnd);

  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".js-seller-suspend");
    if (!btn) return;

    const id = btn.dataset.id;
    const status = btn.dataset.status;

    // prefill if currently suspended (edit mode)
    titleInput.value = btn.dataset.title || "";
    reasonInput.value = btn.dataset.reason || "";
    if (btn.dataset.end) {
      // convert ISO -> yyyy-MM-ddTHH:mm for datetime-local
      const iso = btn.dataset.end;
      const dt = new Date(iso);
      const pad = (n) => String(n).padStart(2, "0");
      const local = `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
      endInput.value = local;
      permInput.checked = false;
    } else {
      endInput.value = "";
      permInput.checked = false;
    }
    toggleEnd();

    modalTitle.textContent = status === "suspended" ? "Edit Suspension" : "Suspend Seller";
    form.setAttribute("action", `/admin/sellers/${id}/suspend`);
    modal.show();
  });
})();



// --- Reject modal wiring ---
(() => {
  const modalEl = document.getElementById("rejectSellerModal");
  if (!modalEl) return;
  const modal = new bootstrap.Modal(modalEl);
  const form = document.getElementById("rejectSellerForm");

  const subjectInput = document.getElementById("reject_email_subject");
  const bodyInput = document.getElementById("reject_email_body");
  const sendChk = document.getElementById("reject_send_email");

  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".js-seller-reject");
    if (!btn) return;

    const id = btn.dataset.id;
    const name = btn.dataset.name || "this store";

    // Prefill a sensible subject/body
    subjectInput.value = `Seller application rejected — ${name}`;
    bodyInput.value =
`Hello,

We regret to inform you that your seller application for "${name}" was rejected.
If you’d like to re-apply, please update your information and submit again.

Regards,
TECHORA Team`;
    sendChk.checked = true;

    form.setAttribute("action", `/admin/sellers/${id}/reject`);
    modal.show();
  });
})();
