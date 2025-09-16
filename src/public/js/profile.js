/* =========================
   Tiny state & helpers
==========================*/
const store = {
  get k(){ return {
    profile:'techora_profile',
    orders:'techora_orders',       // kept for compatibility (not used now)
    addresses:'techora_addresses',
    password:'techora_password',
    session:'techora_session'
  }},
  read(key, fallback){
    try{ return JSON.parse(localStorage.getItem(key)) ?? fallback }catch{ return fallback }
  },
  write(key, value){ localStorage.setItem(key, JSON.stringify(value)) },
  del(key){ localStorage.removeItem(key) }
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
   Session (logout / login)
==========================*/
function setSession(on){
  store.write(store.k.session, {loggedIn:!!on});
  $('#logoutLayer')?.classList.toggle('show', !on);
}
function initSession(){
  const s = store.read(store.k.session,{loggedIn:true});
  setSession(s.loggedIn);
}
$('#btnLoginAgain')?.addEventListener('click', ()=> setSession(true));
$('#btnClearAll')?.addEventListener('click', ()=>{
  Object.values(store.k).forEach(k=>localStorage.removeItem(k));
  location.reload();
});

/* =========================
   Seed default data
==========================*/
function ensureDefaults(){
  if(!store.read(store.k.profile)){
    store.write(store.k.profile,{
      name:'Techora User',
      email:'user@example.com',
      phone:'',
      username:'techora',
      bio:'Welcome to TECHORA.',
      avatar:'TU'
    });
  }
  if(!store.read(store.k.password)) store.write(store.k.password,{value:'techora123'});
  if(!store.read(store.k.addresses)) store.write(store.k.addresses,[]);
}

/* =========================
   Routing
==========================*/
function showRoute(name){
  $$('.nav button').forEach(b=>b.classList.toggle('active', b.dataset.view===name));
  $$('.route').forEach(r=>r.hidden = (r.dataset.route!==name));
  history.replaceState(null,'','#'+name);
}
$$('.nav button[data-view]').forEach(btn=>btn.addEventListener('click', ()=> showRoute(btn.dataset.view)));

/* =========================
   Profile
==========================*/
// profile.js

function renderMe() {
  // check if server already rendered a real user
  const nameEl = document.getElementById("meName");
  const emailEl = document.getElementById("meEmail");

  // ✅ If server session user is already injected, do not overwrite
  if (
    nameEl &&
    emailEl &&
    nameEl.textContent &&
    nameEl.textContent !== "Techora User" &&
    emailEl.textContent !== "user@example.com"
  ) {
    return;
  }

  // otherwise fallback to local demo data (for logged-out or demo mode)
  const p = store.read(store.k.profile, {});
  $('#meAvatar') &&
    ($('#meAvatar').textContent = (p.avatar || "TU")
      .slice(0, 2)
      .toUpperCase());
  $('#meName') && ($('#meName').textContent = p.name || "Techora User");
  $('#meEmail') &&
    ($('#meEmail').textContent = p.email || "user@example.com");

  $('#pfName') && ($('#pfName').value = p.name || "");
  $('#pfEmail') && ($('#pfEmail').value = p.email || "");
  $('#pfPhone') && ($('#pfPhone').value = p.phone || "");
  $('#pfUsername') && ($('#pfUsername').value = p.username || "");
  $('#pfBio') && ($('#pfBio').value = p.bio || "");
  $('#pfAvatar') &&
    ($('#pfAvatar').value = (p.avatar || "").slice(0, 2));
}

function toggleProfileEdit(on){
  ['pfName','pfEmail','pfPhone','pfUsername','pfBio','pfAvatar'].forEach(id=>{
    const el = $('#'+id); if (el){ el.disabled = !on; if(on) el.focus(); }
  });
  const btnEdit = $('#btnEditProfile'), btnSave = $('#btnSaveProfile');
  if (btnEdit && btnSave){ btnEdit.style.display = on?'none':'inline-flex'; btnSave.style.display = on?'inline-flex':'none'; }
}
$('#btnEditProfile')?.addEventListener('click', ()=> toggleProfileEdit(true));
$('#btnSaveProfile')?.addEventListener('click', ()=>{
  const p = {
    name:$('#pfName')?.value.trim(),
    email:$('#pfEmail')?.value.trim(),
    phone:$('#pfPhone')?.value.trim(),
    username:$('#pfUsername')?.value.trim(),
    bio:$('#pfBio')?.value.trim(),
    avatar:(($('#pfAvatar')?.value)||'TU').slice(0,2).toUpperCase()
  };
  store.write(store.k.profile,p); renderMe(); toggleProfileEdit(false); toast('Profile saved');
});
$('#btnChangePassword')?.addEventListener('click', ()=>{
  const now = $('#pfPasswordNow')?.value || '';
  const next = $('#pfPasswordNew')?.value || '';
  const pass = store.read(store.k.password,{value:'techora123'}).value;
  if(!now || !next){ toast('Enter both passwords','error'); return }
  if(now !== pass){ toast('Current password is incorrect','error'); return }
  if(next.length < 6){ toast('New password too short','error'); return }
  store.write(store.k.password,{value:next});
  if($('#pfPasswordNow')) $('#pfPasswordNow').value='';
  if($('#pfPasswordNew')) $('#pfPasswordNew').value='';
  toast('Password changed');
});

/* =========================
   ORDERS — Tab filter + Cancel modal (server-rendered)
==========================*/
function initOrdersUI(){
  const tabs = [...document.querySelectorAll('#orderTabs .tab')];
  const listEl = document.getElementById('orderList');
  const cards = [...document.querySelectorAll('#orderList .order')];
  const empty = document.getElementById('ordersEmpty');

  if (!tabs.length || !listEl) return; // Not on Orders page

  function hidePayNowInPending(){
    // Hide any "Pay Now" buttons inside orders marked as Pending
    document.querySelectorAll('#orderList .order[data-status="Pending"] .actions .btn').forEach(btn=>{
      if ((btn.textContent || '').trim().toLowerCase() === 'pay now') {
        btn.style.display = 'none';
      }
    });
  }

  function applyFilters(){
    const active = document.querySelector('#orderTabs .tab.active')?.dataset.status || 'All';
    let visible = 0;
    cards.forEach(c=>{
      const show = (active === 'All') || (c.dataset.status === active);
      c.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    if (empty) empty.hidden = visible > 0;
    hidePayNowInPending();
  }

  tabs.forEach(btn => btn.addEventListener('click', ()=>{
    tabs.forEach(b=>b.classList.toggle('active', b===btn));
    applyFilters();
  }));

  // Event delegation for Cancel buttons (works even if DOM changes)
  listEl.addEventListener('click', (e)=>{
    const target = e.target.closest('.btn-cancel-order');
    if (!target) return;
    const orderId = target.dataset.orderId;
    const body = `
      <form id="cancelForm" class="stack">
        <p style="margin:0 0 6px">Why do you want to cancel?</p>
        <label><input type="radio" name="cancelReason" value="Changed my mind" checked> Changed my mind</label>
        <label><input type="radio" name="cancelReason" value="Ordered by mistake"> Ordered by mistake</label>
        <label><input type="radio" name="cancelReason" value="Found a better price"> Found a better price</label>
        <label><input type="radio" name="cancelReason" value="Delivery is too slow"> Delivery is too slow</label>
        <label><input type="radio" name="cancelReason" value="Other"> Other</label>
      </form>
    `;
    openModal('Cancel Order ' + orderId, body, [
      { label:'Back', class:'outline', click: closeModal },
      { label:'Confirm Cancel', class:'danger', click: async ()=>{
          const reason = document.querySelector('input[name="cancelReason"]:checked')?.value || 'Other';
          try{
            const r = await fetch('/api/orders/cancel', {
              method:'POST',
              headers:{ 'Content-Type':'application/json' },
              body: JSON.stringify({ orderId, reason })
            });
            const j = await r.json().catch(()=>({}));
            if(!r.ok){ toast(j.message || 'Unable to cancel','error'); return; }
            closeModal();
            location.reload(); // reflect new status
          }catch(err){ toast('Network error','error'); }
      }}
    ]);
  });

  // default active + first render
  tabs[0]?.classList.add('active');
  applyFilters();
}

/* =========================
   Settings — addresses & account
==========================*/
function renderAddresses(){
  const list = $('#addressList'); if (!list) return;
  list.innerHTML='';
  const arr = store.read(store.k.addresses,[]);
  if(!arr.length){
    const empty = document.createElement('div'); empty.className='empty';
    empty.textContent = 'No saved addresses. Click "Add Address".';
    list.appendChild(empty); return;
  }
  for(const a of arr){
    const el = document.createElement('div'); el.className='address';
    el.innerHTML = `
      <div>
        <strong>${a.fullname}</strong> ${a.default?'<span class="chip">Default</span>':''}<br>
        <small>${a.phone}</small><br>
        <div style="margin-top:4px">${a.line1}, ${a.city}, ${a.province} ${a.postal}</div>
      </div>
      <div class="actions">
        ${!a.default?'<button class="btn outline" data-act="set">Set Default</button>':''}
        <button class="btn outline" data-act="edit">Edit</button>
        <button class="btn danger" data-act="delete">Delete</button>
      </div>
    `;
    el.querySelectorAll('button[data-act]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const arr = store.read(store.k.addresses,[]);
        const idx = arr.findIndex(x=>x.id===a.id);
        if(b.dataset.act==='delete'){ arr.splice(idx,1); }
        if(b.dataset.act==='set'){ arr.forEach(x=>x.default=false); arr[idx].default=true; }
        if(b.dataset.act==='edit'){ showAddressForm(a); return; }
        store.write(store.k.addresses,arr); renderAddresses();
      });
    });
    list.appendChild(el);
  }
}
function showAddressForm(existing){
  openModal((existing?'Edit':'Add')+' Address', `
    <div class="grid-2">
      <div class="stack"><label>Full Name</label><input id="adName" value="${existing?.fullname||''}"></div>
      <div class="stack"><label>Phone</label><input id="adPhone" value="${existing?.phone||''}"></div>
      <div class="stack"><label>Line 1</label><input id="adLine1" value="${existing?.line1||''}"></div>
      <div class="stack"><label>City</label><input id="adCity" value="${existing?.city||''}"></div>
      <div class="stack"><label>Province</label><input id="adProv" value="${existing?.province||''}"></div>
      <div class="stack"><label>Postal</label><input id="adPostal" value="${existing?.postal||''}"></div>
      <div class="stack"><label>Set as default?</label>
        <select id="adDefault"><option value="no"${existing?.default?'':' selected'}>No</option><option value="yes"${existing?.default?' selected':''}>Yes</option></select>
      </div>
    </div>
  `, [
    {label:'Cancel', class:'outline', click:closeModal},
    {label: existing?'Save':'Add', class:'', click:()=>{
      const data = {
        id: existing?.id || ('addr-'+Date.now()),
        fullname: $('#adName').value.trim(),
        phone: $('#adPhone').value.trim(),
        line1: $('#adLine1').value.trim(),
        city: $('#adCity').value.trim(),
        province: $('#adProv').value.trim(),
        postal: $('#adPostal').value.trim(),
        default: $('#adDefault').value==='yes'
      };
      if(!data.fullname || !data.line1){ toast('Name and Address Line are required','error'); return }
      const arr = store.read(store.k.addresses,[]);
      const i = arr.findIndex(x=>x.id===data.id);
      if(data.default) arr.forEach(x=>x.default=false);
      if(i>=0) arr[i]=data; else arr.unshift(data);
      store.write(store.k.addresses,arr); closeModal(); renderAddresses(); toast('Address saved');
    }}
  ]);
}
$('#btnAddAddress')?.addEventListener('click', ()=> showAddressForm());

$('#btnChangeAccount')?.addEventListener('click', ()=>{
  const email = $('#chgEmail')?.value.trim();
  if(!email){ toast('Enter a new email','error'); return }
  const p = store.read(store.k.profile,{}); p.email = email; store.write(store.k.profile,p);
  renderMe(); if($('#chgEmail')) $('#chgEmail').value=''; toast('Email updated');
});
$('#btnDeleteAccount')?.addEventListener('click', ()=>{
  openConfirm('Delete account? This will remove profile, orders, addresses stored on this browser.', ()=>{
    Object.values(store.k).forEach(k=>localStorage.removeItem(k));
    ensureDefaults(); renderMe(); renderAddresses(); toast('Account deleted');
  }, 'Delete', 'danger');
});

/* =========================
   Logout
==========================*/
$$('[data-action="logout"]').forEach(b=>b.addEventListener('click', ()=>{
  openConfirm('Logout from this demo?', ()=>{ setSession(false); toast('Logged out') }, 'Logout');
}));

/* =========================
   Modal helpers
==========================*/
function openModal(title, bodyHTML, buttons){
  const bg = $('#modalBg'); if (!bg) return;
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = bodyHTML;
  const foot = $('#modalFoot'); foot.innerHTML='';
  for(const b of buttons){
    const btn = document.createElement('button'); btn.className='btn ' + (b.class||''); btn.textContent=b.label;
    btn.addEventListener('click', b.click); foot.appendChild(btn);
  }
  bg.classList.add('show'); bg.setAttribute('aria-hidden','false');
}
function closeModal(){
  const bg = $('#modalBg'); if (!bg) return;
  bg.classList.remove('show'); bg.setAttribute('aria-hidden','true');
}
$('#modalClose')?.addEventListener('click', closeModal);
$('#modalBg')?.addEventListener('click', e=>{ if(e.target.id==='modalBg') closeModal() });

function openConfirm(message, onYes, yesLabel='Confirm', yesClass=''){
  openModal('Please Confirm', `<p>${message}</p>`, [
    {label:'Cancel', class:'outline', click:closeModal},
    {label:yesLabel, class:yesClass, click:()=>{ closeModal(); onYes&&onYes(); }}
  ]);
}

/* =========================
   Init
==========================*/
function init(){
  initSession();
  ensureDefaults();
  renderMe();
  renderAddresses();

  // Orders: server-rendered list
  initOrdersUI();

  // restore route from hash
  const route = location.hash.replace('#','') || 'profile';
  showRoute(route);
}
init();
