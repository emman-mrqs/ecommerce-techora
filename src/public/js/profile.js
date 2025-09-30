/* =========================
   Tiny state & helpers
==========================*/
const store = {
  get k(){ return {
    profile:'techora_profile',
  }},
  read(key, fallback){
    try{ return JSON.parse(localStorage.getItem(key)) ?? fallback }catch{ return fallback }
  },
  write(key, value){ localStorage.setItem(key, JSON.stringify(value)) },
};
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const toast = (msg, type='')=>{
  const t = $('#toast');
  if (!t) return alert(msg);
  t.textContent = msg; t.className = 'toast ' + (type||'');
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 1800);
};
const money = n => '₱' + (Number(n||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2}));

/* =========================
   Routing (Sidebar Tabs)
==========================*/
function showRoute(name){
  $$('.nav button').forEach(b=>b.classList.toggle('active', b.dataset.view===name));
  $$('.route').forEach(r=>r.hidden = (r.dataset.route!==name));
  history.replaceState(null,'','#'+name);
}
$$('.nav button[data-view]').forEach(btn=>btn.addEventListener('click', ()=> showRoute(btn.dataset.view)));

/* =========================
   Init
==========================*/
function init(){
  renderMe();
  initOrdersUI();
  const route = location.hash.replace('#','') || 'profile';
  showRoute(route);
}
init();

/* =========================
   Boostrap Modal helper
==========================*/
function openConfirmModal(title, message, onYes) {
  const modalTitle = document.getElementById("confirmModalLabel");
  const modalBody = document.getElementById("confirmModalBody");
  const yesBtn = document.getElementById("confirmModalYes");

  modalTitle.textContent = title;
  modalBody.textContent = message;

  // Remove old listeners
  const newYesBtn = yesBtn.cloneNode(true);
  yesBtn.parentNode.replaceChild(newYesBtn, yesBtn);

  newYesBtn.addEventListener("click", () => {
    const modal = bootstrap.Modal.getInstance(document.getElementById("confirmModal"));
    modal.hide();
    if (typeof onYes === "function") onYes();
  });

  const modal = new bootstrap.Modal(document.getElementById("confirmModal"));
  modal.show();
}

/* =========================
   Profile
==========================*/
function renderMe() {
  const nameEl = $('#meName');
  const emailEl = $('#meEmail');
  if (nameEl && emailEl && nameEl.textContent && emailEl.textContent) return;

  const p = store.read(store.k.profile, {});
  $('#meAvatar') && ($('#meAvatar').textContent = (p.avatar || "TU").slice(0, 2).toUpperCase());
  $('#meName') && ($('#meName').textContent = p.name || "Techora User");
  $('#meEmail') && ($('#meEmail').textContent = p.email || "user@example.com");

  $('#pfName') && ($('#pfName').value = p.name || "");
}

// Name Edit
function toggleNameEdit(on) {
  const nameInput = $('#pfName');
  if (!nameInput) return;

  if (on) {
    nameInput.dataset.original = nameInput.value;
  } else {
    if (nameInput.dataset.original) {
      nameInput.value = nameInput.dataset.original;
    }
  }

  nameInput.disabled = !on;
  $('#btnEditName').style.display = on ? 'none' : 'inline-flex';
  $('#btnSaveName').style.display = on ? 'inline-flex' : 'none';
  $('#btnCancelName').style.display = on ? 'inline-flex' : 'none';
}
$('#btnEditName')?.addEventListener('click', () => toggleNameEdit(true));
$('#btnSaveName')?.addEventListener('click', async () => {
  const nameInput = $('#pfName');
  const newName = nameInput?.value.trim();
  if (!newName) return toast('Name cannot be empty','error');

  try {
    const r = await fetch('/profile/update-name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName })
    });
    const j = await r.json();
    if (!j.success) return toast(j.message || 'Update failed','error');

    toast('Name updated');
    $('#meName').textContent = j.user.name;
    nameInput.dataset.original = j.user.name;
    toggleNameEdit(false);
  } catch { toast('Network error','error'); }
});
$('#btnCancelName')?.addEventListener('click', () => toggleNameEdit(false));

// Password Change
$('#btnChangePassword')?.addEventListener('click', async () => {
  const currentPassword = $('#pfPasswordNow')?.value.trim();
  const newPassword = $('#pfPasswordNew')?.value.trim();
  if (!currentPassword || !newPassword) return toast('Enter both fields','error');
  if (newPassword.length < 6) return toast('Password too short','error');

  try {
    const r = await fetch('/profile/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const j = await r.json();
    if (!j.success) return toast(j.message || 'Failed to update','error');

    toast('Password updated successfully');
    $('#pfPasswordNow').value = '';
    $('#pfPasswordNew').value = '';
  } catch { toast('Network error','error'); }
});

/* =========================
   Orders (Tabs Only)
==========================*/
function initOrdersUI(){
  const tabs = [...document.querySelectorAll('#orderTabs .tab')];
  const listEl = document.getElementById('orderList');
  const cards = [...document.querySelectorAll('#orderList .order')];
  const empty = document.getElementById('ordersEmpty');
  if (!tabs.length || !listEl) return;

  function applyFilters(){
    const active = document.querySelector('#orderTabs .tab.active')?.dataset.status || 'All';
    let visible = 0;
    cards.forEach(c=>{
      const show = (active === 'All') || (c.dataset.status === active);
      c.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    if (empty) empty.hidden = visible > 0;
  }

  tabs.forEach(btn => btn.addEventListener('click', ()=>{
    tabs.forEach(b=>b.classList.toggle('active', b===btn));
    applyFilters();
  }));
  tabs[0]?.classList.add('active');
  applyFilters();
}


/* =========================
   Orders Status Change
==========================*/

// ✅ Bootstrap confirm modal helper
function openConfirmModal(title, message, onYes, yesLabel = "Yes", yesClass = "btn-primary") {
  const modalEl = document.getElementById("confirmModal");
  const modalTitle = document.getElementById("confirmModalLabel");
  const modalBody = document.getElementById("confirmModalBody");
  const yesBtn = document.getElementById("confirmModalYes");

  modalTitle.textContent = title;
  modalBody.textContent = message;
  yesBtn.textContent = yesLabel;
  yesBtn.className = "btn " + yesClass;

  // Remove old listener and add a new one
  const newYesBtn = yesBtn.cloneNode(true);
  yesBtn.parentNode.replaceChild(newYesBtn, yesBtn);

  newYesBtn.addEventListener("click", () => {
    const modal = bootstrap.Modal.getInstance(modalEl);
    modal.hide();
    if (typeof onYes === "function") onYes();
  });

  const modal = new bootstrap.Modal(modalEl);
  modal.show();
}

// ✅ Orders UI init
function initOrdersUI(){
  const tabs = [...document.querySelectorAll('#orderTabs .tab')];
  const listEl = document.getElementById('orderList');
  const cards = [...document.querySelectorAll('#orderList .order')];
  const empty = document.getElementById('ordersEmpty');
  if (!tabs.length || !listEl) return;

  function applyFilters(){
    const active = document.querySelector('#orderTabs .tab.active')?.dataset.status || 'All';
    let visible = 0;
    cards.forEach(c=>{
      const show = (active === 'All') || (c.dataset.status === active);
      c.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    if (empty) empty.hidden = visible > 0;
  }

  tabs.forEach(btn => btn.addEventListener('click', ()=>{
    tabs.forEach(b=>b.classList.toggle('active', b===btn));
    applyFilters();
  }));
  tabs[0]?.classList.add('active');
  applyFilters();

  // ✅ Cancel order
  listEl.addEventListener('click', (e)=>{
    const btn = e.target.closest('.btn-cancel-order');
    if (!btn) return;
    const orderId = btn.dataset.orderId;

    openConfirmModal("Cancel Order", "Are you sure you want to cancel this order?", async () => {
      try {
        const r = await fetch("/profile/cancel-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId })
        });
        const j = await r.json();
        if (!j.success) return toast(j.message || "Cancel failed", "error");
        toast("Order cancelled successfully");
        location.reload();
      } catch { toast("Network error","error"); }
    }, "Confirm Cancel", "btn-danger");
  });

  // ✅ Mark as received
  listEl.addEventListener('click', (e)=>{
    const btn = e.target.closest('.btn-receive-order');
    if (!btn) return;
    const orderId = btn.dataset.orderId;

    openConfirmModal("Mark as Received", "Confirm: Have you received this order?", async () => {
      try {
        const r = await fetch("/profile/mark-received", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId })
        });
        const j = await r.json();
        if (!j.success) return toast(j.message || "Failed to update", "error");
        toast("Order marked as received");
        location.reload();
      } catch { toast("Network error","error"); }
    }, "Yes, I Received", "btn-success");
  });

  // ✅ Refund order
  listEl.addEventListener('click', (e)=>{
    const btn = e.target.closest('.btn-refund-order');
    if (!btn) return;
    const orderId = btn.dataset.orderId;

    openConfirmModal("Request Refund", "Do you want to request a refund for this order?", async () => {
      try {
        const r = await fetch("/profile/refund-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId })
        });
        const j = await r.json();
        if (!j.success) return toast(j.message || "Refund request failed", "error");
        toast("Refund requested successfully");
        location.reload();
      } catch { toast("Network error","error"); }
    }, "Confirm Refund", "btn-warning");
  });
}


/* =========================
   Addresses
==========================*/
function initAddressesUI() {
  const addressList = document.getElementById("addressList");
  const btnAddAddress = document.getElementById("btnAddAddress");
  const addressForm = document.getElementById("addressForm");
  if (!addressList || !btnAddAddress) return;

  const addressModal = new bootstrap.Modal(document.getElementById("addressModal"));

  // Load addresses
  async function loadAddresses() {
    try {
      const r = await fetch("/profile/addresses");
      const j = await r.json();
      if (!j.success) return toast("Failed to load addresses", "error");

      addressList.innerHTML = "";
      if (j.addresses.length === 0) {
        addressList.innerHTML = `<div class="muted">No addresses yet</div>`;
        return;
      }

    j.addresses.forEach(addr => {
      const card = document.createElement("div");
      card.className = "card p-3 mb-2 position-relative";

    card.innerHTML = `
      <!-- VIEW MODE -->
      <div class="address-view position-relative">
        <div class="position-absolute top-0 end-0 m-2 d-flex gap-1">
          <button class="btn btn-sm btn-outline-secondary edit-address" data-id="${addr.id}" data-json='${JSON.stringify(addr)}'>
            <i class="fa fa-pencil-alt"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger delete-address" data-id="${addr.id}">
            <i class="fa fa-trash"></i>
          </button>
        </div>
        <strong>${addr.first_name} ${addr.last_name}</strong>
        ${addr.is_default ? '<span class="badge bg-primary ms-2">Default</span>' : ""}
        <br>
        ${addr.street}, ${addr.city}, ${addr.province}, ${addr.zip}<br>
        📞 ${addr.phone} • ✉ ${addr.email}
        ${!addr.is_default ? `<div class="mt-2"><button class="btn btn-sm btn-outline-primary set-default" data-id="${addr.id}">Make Default</button></div>` : ""}
      </div>

      <!-- EDIT MODE (hidden by default) -->
      <form class="address-edit" data-id="${addr.id}" style="display:none">
        <div class="row g-2">
          <div class="col-md-6"><input type="text" name="first_name" class="form-control" value="${addr.first_name}"></div>
          <div class="col-md-6"><input type="text" name="last_name" class="form-control" value="${addr.last_name}"></div>
          <div class="col-12"><input type="text" name="street" class="form-control" value="${addr.street}"></div>
          <div class="col-md-6"><input type="text" name="city" class="form-control" value="${addr.city}"></div>
          <div class="col-md-6">
          <select name="province" class="form-select" required>
            <option value="">Select Province</option>
            <option value="Cebu" ${addr.province === "Cebu" ? "selected" : ""}>Cebu</option>
            <option value="Manila" ${addr.province === "Manila" ? "selected" : ""}>Manila</option>
            <option value="Davao" ${addr.province === "Davao" ? "selected" : ""}>Davao</option>
          </select>
          </div>
          <div class="col-md-6"><input type="text" name="zip" class="form-control" value="${addr.zip}"></div>
          <div class="col-md-6"><input type="text" name="phone" class="form-control" value="${addr.phone}"></div>
          <div class="col-12"><input type="email" name="email" class="form-control" value="${addr.email}"></div>
        </div>
        <div class="mt-2 d-flex gap-2">
          <button type="submit" class="btn btn-sm btn-primary">Save</button>
          <button type="button" class="btn btn-sm btn-secondary cancel-edit">Cancel</button>
        </div>
      </form>
    `;

  addressList.appendChild(card);
});

    } catch (err) {
      console.error("Error loading addresses", err);
      toast("Network error", "error");
    }
  }
  // Show modal
  btnAddAddress.addEventListener("click", () => {
    addressForm.reset();
    addressModal.show();
  });

  // Submit new address
addressForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(addressForm).entries());

  try {
    const r = await fetch("/profile/addresses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const j = await r.json();
    if (!j.success) {
      toast(j.message || "Failed to save", "error"); // 🔴 show duplicate message
      return;
    }

    toast("Address saved");
    addressModal.hide();
    loadAddresses();
  } catch (err) {
    console.error("Error saving address", err);
    toast("Network error", "error");
  }
});

  // Init
  loadAddresses();

  // Toggle edit mode
addressList.addEventListener("click", (e) => {
  const btn = e.target.closest(".edit-address");
  if (!btn) return;

  const card = btn.closest(".card");
  const viewEl = card.querySelector(".address-view");
  const editEl = card.querySelector(".address-edit");

  viewEl.style.display = "none";
  editEl.style.display = "block";
});

  // Cancel edit
  addressList.addEventListener("click", (e) => {
    if (!e.target.closest(".cancel-edit")) return;
    const card = e.target.closest(".card");
    card.querySelector(".address-view").style.display = "block";
    card.querySelector(".address-edit").style.display = "none";
  });

  // Save edit
  addressList.addEventListener("submit", async (e) => {
    if (!e.target.classList.contains("address-edit")) return;
    e.preventDefault();

    const form = e.target;
    const id = form.dataset.id;
    const body = Object.fromEntries(new FormData(form).entries());
    body.id = id;

    try {
      const r = await fetch("/profile/addresses/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const j = await r.json();
      if (!j.success) return toast(j.message || "Update failed", "error");

      toast("Address updated");
      loadAddresses(); // re-render list
    } catch (err) {
      console.error("Error updating address", err);
      toast("Network error", "error");
    }
  });

  // Delete address
  addressList.addEventListener("click", (e) => {
    const btn = e.target.closest(".delete-address");
    if (!btn) return;

    const id = btn.dataset.id;

    // Confirm before deleting
    openConfirmModal("Delete Address", "Are you sure you want to delete this address?", async () => {
      try {
        const r = await fetch("/profile/addresses/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id })
        });
        const j = await r.json();
        if (!j.success) return toast(j.message || "Delete failed", "error");

        toast("Address deleted");
        loadAddresses();
      } catch (err) {
        console.error("Error deleting address", err);
        toast("Network error", "error");
      }
    }, "Delete", "btn-danger");
  });

  // Set default address
  addressList.addEventListener("click", (e) => {
    const btn = e.target.closest(".set-default");
    if (!btn) return;

    const id = btn.dataset.id;

    fetch("/profile/addresses/set-default", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    })
    .then(res => res.json())
    .then(j => {
      if (!j.success) return toast(j.message || "Failed to set default", "error");
      toast("Default address updated");
      loadAddresses(); // refresh list
    })
    .catch(err => {
      console.error("Error setting default", err);
      toast("Network error", "error");
    });
  });
}

// Initialize after DOM ready
document.addEventListener("DOMContentLoaded", () => {
  initAddressesUI();
});
