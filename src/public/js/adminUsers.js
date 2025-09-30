// ===============================
// Bootstrap Modals for Users
// ===============================

  function initUserModals() {
  const suspendModal = document.getElementById("confirmSuspendModal");
  const activateModal = document.getElementById("confirmActivateModal");
  const deleteModal = document.getElementById("confirmDeleteModal");

  if (suspendModal) {
    suspendModal.addEventListener("show.bs.modal", event => {
      const button = event.relatedTarget;
      const userId = button.getAttribute("data-user-id");
      const userName = button.getAttribute("data-user-name");

      suspendModal.querySelector("#suspendUserName").textContent = userName;
      suspendModal.querySelector("#suspendForm").action = `/admin/users/${userId}/suspend`;
    });
  }

  if (activateModal) {
    activateModal.addEventListener("show.bs.modal", event => {
      const button = event.relatedTarget;
      const userId = button.getAttribute("data-user-id");
      const userName = button.getAttribute("data-user-name");

      activateModal.querySelector("#activateUserName").textContent = userName;
      activateModal.querySelector("#activateForm").action = `/admin/users/${userId}/activate`;
    });
  }

  if (deleteModal) {
    deleteModal.addEventListener("show.bs.modal", event => {
      const button = event.relatedTarget;
      const userId = button.getAttribute("data-user-id");
      const userName = button.getAttribute("data-user-name");

      deleteModal.querySelector("#deleteUserName").textContent = userName;
      deleteModal.querySelector("#deleteForm").action = `/admin/users/${userId}/delete`;
    });
  }
}

// ===============================
// Bootstrap Toast Notifications
// ===============================
  function initUserToasts() {
  const toastEl = document.querySelector(".toast");
  if (toastEl) {
    const bsToast = new bootstrap.Toast(toastEl, { delay: 3000 });
    bsToast.show();
  }
}

// ===============================
// Init Function
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  initUserModals();
  initUserToasts();
});


// ===============================
// Edit Users Profile
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  // Handle edit toggle
  document.querySelectorAll(".edit-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const userId = btn.getAttribute("data-user-id");
      const row = document.getElementById(`user-row-${userId}`);
      row.querySelector(".view-mode").classList.add("d-none");
      row.querySelector(".edit-mode").classList.remove("d-none");
    });
  });

  // Handle cancel button inside edit form
  document.querySelectorAll(".cancel-edit").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      const row = btn.closest("tr");
      row.querySelector(".view-mode").classList.remove("d-none");
      row.querySelector(".edit-mode").classList.add("d-none");
    });
  });
});

// ===============================
// Search + Filter
// ===============================

document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("userSearch");
  const statusFilter = document.getElementById("statusFilter");
  const rows = document.querySelectorAll("#userTableBody tr[data-status]");
  const noUsersRow = document.getElementById("noUsersRow");

  function filterUsers() {
    const searchTerm = searchInput.value.toLowerCase();
    const status = statusFilter.value;
    let visibleCount = 0;

    rows.forEach(row => {
      const name = row.querySelector(".user-name .view-mode")?.textContent.toLowerCase() || "";
      const email = row.querySelector("td:nth-child(2)")?.textContent.toLowerCase() || "";
      const userStatus = row.getAttribute("data-status");

      const matchesSearch = name.includes(searchTerm) || email.includes(searchTerm);
      const matchesStatus = status === "all" || userStatus === status;

      if (matchesSearch && matchesStatus) {
        row.style.display = "";
        visibleCount++;
      } else {
        row.style.display = "none";
      }
    });

    // Toggle "No users found"
    if (noUsersRow) {
      noUsersRow.classList.toggle("d-none", visibleCount > 0);
    }
  }

  searchInput.addEventListener("input", filterUsers);
  statusFilter.addEventListener("change", filterUsers);
});


/*==================
suspend modal
=============*/

document.addEventListener("DOMContentLoaded", () => {
  const suspendModal = document.getElementById("suspendModal");
  const suspendForm  = document.getElementById("suspendForm");
  const titleInput   = document.getElementById("suspendTitle");
  const reasonInput  = document.getElementById("suspendReason");
  const endDateInput = document.getElementById("suspendEndDate");
  const modePerm     = document.getElementById("modePermanent");
  const modeUntil    = document.getElementById("modeUntil");

  // enable/disable date
  function toggleDate() {
    endDateInput.disabled = !modeUntil.checked;
    if (endDateInput.disabled) endDateInput.value = "";
  }
  modePerm.addEventListener("change", toggleDate);
  modeUntil.addEventListener("change", toggleDate);

  if (suspendModal) {
    suspendModal.addEventListener("show.bs.modal", (ev) => {
      const btn = ev.relatedTarget;
      const userId   = btn.getAttribute("data-user-id");
      const userName = btn.getAttribute("data-user-name");

      // pre-fill if present (editing)
      const t = btn.getAttribute("data-title")  || "";
      const r = btn.getAttribute("data-reason") || "";
      const u = btn.getAttribute("data-until")  || "";

      // set form action
      suspendForm.action = `/admin/users/${userId}/suspend`;

      // fill fields
      titleInput.value  = t;
      reasonInput.value = r;

      if (u) {
        modeUntil.checked = true;
        endDateInput.disabled = false;
        endDateInput.value = u; // yyyy-mm-dd
      } else {
        modePerm.checked = true;
        endDateInput.disabled = true;
        endDateInput.value = "";
      }

      toggleDate();
      document.getElementById("suspendModalTitle").textContent =
        t || r || u ? `Edit Suspension — ${userName}` : `Suspend User — ${userName}`;
    });
  }

  // Lift modal
  const liftModal = document.getElementById("liftModal");
  const liftForm  = document.getElementById("liftForm");
  if (liftModal) {
    liftModal.addEventListener("show.bs.modal", (ev) => {
      const btn = ev.relatedTarget;
      const userId   = btn.getAttribute("data-user-id");
      const userName = btn.getAttribute("data-user-name");
      liftForm.action = `/admin/users/${userId}/lift`;
      document.getElementById("liftUserName").textContent = userName;
    });
  }
});

