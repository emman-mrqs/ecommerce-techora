/* =========================
   Tiny state & helpers
==========================*/
const store = {
  get k(){ return {
    profile:'techora_profile',
    orders:'techora_orders',
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
  $('#logoutLayer').classList.toggle('show', !on);
}
function initSession(){
  const s = store.read(store.k.session,{loggedIn:true});
  setSession(s.loggedIn);
}
$('#btnLoginAgain').onclick = ()=> setSession(true);
$('#btnClearAll').onclick = ()=>{
  Object.values(store.k).forEach(k=>localStorage.removeItem(k));
  location.reload();
}

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
  if(!store.read(store.k.orders)) store.write(store.k.orders,[]);
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
$$('.nav button[data-view]').forEach(btn=>btn.onclick = ()=> showRoute(btn.dataset.view));

/* =========================
   Profile
==========================*/
function renderMe(){
  const p = store.read(store.k.profile,{});
  $('#meAvatar').textContent = (p.avatar||'TU').slice(0,2).toUpperCase();
  $('#meName').textContent = p.name||'Techora User';
  $('#meEmail').textContent = p.email||'user@example.com';

  $('#pfName').value = p.name||'';
  $('#pfEmail').value = p.email||'';
  $('#pfPhone').value = p.phone||'';
  $('#pfUsername').value = p.username||'';
  $('#pfBio').value = p.bio||'';
  $('#pfAvatar').value = (p.avatar||'').slice(0,2);
}
function toggleProfileEdit(on){
  ['pfName','pfEmail','pfPhone','pfUsername','pfBio','pfAvatar'].forEach(id=>{
    const el = $('#'+id); el.disabled = !on; if(on) el.focus();
  });
  $('#btnEditProfile').style.display = on?'none':'inline-flex';
  $('#btnSaveProfile').style.display = on?'inline-flex':'none';
}
$('#btnEditProfile').onclick = ()=> toggleProfileEdit(true);
$('#btnSaveProfile').onclick = ()=>{
  const p = {
    name:$('#pfName').value.trim(),
    email:$('#pfEmail').value.trim(),
    phone:$('#pfPhone').value.trim(),
    username:$('#pfUsername').value.trim(),
    bio:$('#pfBio').value.trim(),
    avatar:($('#pfAvatar').value||'TU').slice(0,2).toUpperCase()
  };
  store.write(store.k.profile,p); renderMe(); toggleProfileEdit(false); toast('Profile saved');
};
$('#btnChangePassword').onclick = ()=>{
  const now = $('#pfPasswordNow').value;
  const next = $('#pfPasswordNew').value;
  const pass = store.read(store.k.password,{value:'techora123'}).value;
  if(!now || !next){ toast('Enter both passwords','error'); return }
  if(now !== pass){ toast('Current password is incorrect','error'); return }
  if(next.length < 6){ toast('New password too short','error'); return }
  store.write(store.k.password,{value:next}); $('#pfPasswordNow').value=''; $('#pfPasswordNew').value='';
  toast('Password changed');
}

/* =========================
   Orders
==========================*/
const ORDER_STATUSES = ['All','To Pay','To Ship','To Receive','Completed','Cancelled','Return/Refund'];

function renderOrderTabs(){
  const tabs = ORDER_STATUSES.map(s=>{
    const btn = document.createElement('button'); btn.className='tab'; btn.textContent=s; btn.setAttribute('role','tab');
    btn.dataset.status=s; btn.onclick=()=>{ $$('.tab').forEach(t=>t.classList.toggle('active', t===btn)); renderOrders(s, $('#orderSearch').value) };
    return btn;
  });
  const cont = $('#orderTabs'); cont.innerHTML=''; tabs.forEach(t=>cont.appendChild(t)); tabs[0].classList.add('active');
}
function orderMatchesSearch(order, term){
  if(!term) return true;
  term = term.toLowerCase();
  const itemNames = order.items.map(i=>i.name.toLowerCase()).join(' ');
  return (order.id.toLowerCase().includes(term) || (order.seller||'').toLowerCase().includes(term) || itemNames.includes(term));
}
function renderOrders(status='All', term=''){
  const list = $('#orderList'); list.innerHTML='';
  const orders = store.read(store.k.orders,[]);
  const filtered = orders.filter(o => (status==='All' ? true : o.status===status)).filter(o=>orderMatchesSearch(o,term));
  $('#ordersEmpty').hidden = filtered.length>0;

  for(const o of filtered){
    const box = document.createElement('div'); box.className='order';
    const top = document.createElement('div'); top.className='row';
    top.innerHTML = `
      <div>
        <strong>${o.seller}</strong> • <span class="badge">${o.status}</span><br>
        <small style="color:var(--muted)">Order ID: ${o.id} · ${new Date(o.date).toLocaleString()}</small>
      </div>
      <div class="actions">
        ${o.status==='To Pay' ? `<button class="btn" data-act="pay">Pay Now</button>`:''}
        ${o.status==='To Ship' ? `<button class="btn outline" data-act="track">Track</button>`:''}
        ${o.status==='To Receive' ? `<button class="btn" data-act="received">Mark Received</button>`:''}
        ${['To Pay','To Ship'].includes(o.status) ? `<button class="btn outline" data-act="cancel">Cancel</button>`:''}
      </div>`;
    const items = document.createElement('div'); items.className='items';
    for(const it of o.items){
      const line = document.createElement('div'); line.className='line';
      line.innerHTML = `<div>${it.name} × ${it.qty}</div><div>${money(it.price*it.qty)}</div>`;
      items.appendChild(line);
    }
    const total = document.createElement('div'); total.className='row';
    total.innerHTML = `<div class="badge">Notes: ${o.note||'—'}</div><div><strong>Total: ${money(o.items.reduce((s,x)=>s+x.price*x.qty,0))}</strong></div>`;

    box.appendChild(top); box.appendChild(items); box.appendChild(total);
    // Actions
    box.querySelectorAll('button[data-act]').forEach(b=>{
      b.onclick = ()=>{
        if(b.dataset.act==='pay'){ o.status='To Ship'; toast('Payment successful'); }
        if(b.dataset.act==='track'){ toast('Tracking... (demo)'); }
        if(b.dataset.act==='received'){ o.status='Completed'; toast('Thanks for confirming'); }
        if(b.dataset.act==='cancel'){ o.status='Cancelled'; toast('Order cancelled'); }
        persistOrders(orders); renderOrders(status, term);
      }
    });

    list.appendChild(box);
  }
}
function persistOrders(arr){ store.write(store.k.orders, arr) }

$('#orderSearch').addEventListener('input', (e)=>{
  const active = $('.tab.active')?.dataset.status || 'All';
  renderOrders(active, e.target.value);
});
$('#btnSeedOrders').onclick = ()=>{
  const sample = [
    {id:'ORD-2025-0001', date: Date.now()-86400000*5, seller:'Techora Official', status:'To Pay',
     items:[{name:'Techora Wireless Mouse', qty:1, price:499},{name:'Mouse Pad', qty:1, price:149}]},
    {id:'ORD-2025-0002', date: Date.now()-86400000*3, seller:'Giga Gadgets', status:'To Ship',
     items:[{name:'USB-C Charger 65W', qty:1, price:1299}]},
    {id:'ORD-2025-0003', date: Date.now()-86400000*2, seller:'Pixel Place', status:'To Receive',
     items:[{name:'4K HDMI Cable', qty:2, price:399}]},
    {id:'ORD-2025-0004', date: Date.now()-86400000*12, seller:'Techora Official', status:'Completed',
     items:[{name:'Mechanical Keyboard', qty:1, price:2899}]},
    {id:'ORD-2025-0005', date: Date.now()-86400000*8, seller:'Case&Co', status:'Cancelled',
     items:[{name:'Phone Case', qty:1, price:299}]}
  ];
  persistOrders(sample); renderOrders($('.tab.active')?.dataset.status || 'All', $('#orderSearch').value);
  toast('Demo orders loaded');
};
$('#btnNewOrder').onclick = ()=>{
  // quick builder modal
  openModal('Create Order', `
    <div class="grid-2">
      <div class="stack"><label>Seller</label><input id="mSeller" placeholder="Seller name" value="Techora Official"></div>
      <div class="stack"><label>Status</label>
        <select id="mStatus">${ORDER_STATUSES.filter(s=>s!=='All').map(s=>`<option>${s}</option>`).join('')}</select>
      </div>
      <div class="stack"><label>Product</label><input id="mProd" placeholder="Item name" value="Custom Item"></div>
      <div class="stack"><label>Price</label><input id="mPrice" type="number" min="1" value="500"></div>
      <div class="stack"><label>Quantity</label><input id="mQty" type="number" min="1" value="1"></div>
      <div class="stack"><label>Note</label><input id="mNote" placeholder="Optional note"></div>
    </div>
  `, [
    {label:'Cancel', class:'outline', click:closeModal},
    {label:'Create', class:'', click:()=>{
      const orders = store.read(store.k.orders,[]);
      const id = 'ORD-' + new Date().getFullYear() + '-' + String(1000 + Math.floor(Math.random()*9000));
      orders.unshift({
        id, date: Date.now(), seller: $('#mSeller').value.trim() || 'Seller',
        status: $('#mStatus').value, note: $('#mNote').value.trim(),
        items:[{name:$('#mProd').value.trim()||'Item', qty:Number($('#mQty').value)||1, price:Number($('#mPrice').value)||0}]
      });
      persistOrders(orders); closeModal(); renderOrders($('.tab.active')?.dataset.status || 'All', $('#orderSearch').value);
      toast('Order created');
    }}
  ]);
};

/* =========================
   Settings — addresses & account
==========================*/
function renderAddresses(){
  const list = $('#addressList'); list.innerHTML='';
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
      b.onclick = ()=>{
        const arr = store.read(store.k.addresses,[]);
        const idx = arr.findIndex(x=>x.id===a.id);
        if(b.dataset.act==='delete'){ arr.splice(idx,1); }
        if(b.dataset.act==='set'){ arr.forEach(x=>x.default=false); arr[idx].default=true; }
        if(b.dataset.act==='edit'){
          showAddressForm(a);
          return;
        }
        store.write(store.k.addresses,arr); renderAddresses();
      }
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
$('#btnAddAddress').onclick = ()=> showAddressForm();

$('#btnChangeAccount').onclick = ()=>{
  const email = $('#chgEmail').value.trim();
  if(!email){ toast('Enter a new email','error'); return }
  const p = store.read(store.k.profile,{}); p.email = email; store.write(store.k.profile,p);
  renderMe(); $('#chgEmail').value=''; toast('Email updated');
};
$('#btnDeleteAccount').onclick = ()=>{
  openConfirm('Delete account? This will remove profile, orders, addresses stored on this browser.', ()=>{
    Object.values(store.k).forEach(k=>localStorage.removeItem(k));
    ensureDefaults(); renderMe(); renderOrderTabs(); renderOrders(); renderAddresses(); toast('Account deleted');
  }, 'Delete', 'danger');
};

/* =========================
   Logout
==========================*/
$$('[data-action="logout"]').forEach(b=>b.onclick = ()=>{
  openConfirm('Logout from this demo?', ()=>{ setSession(false); toast('Logged out') }, 'Logout');
});

/* =========================
   Modal helpers
==========================*/
function openModal(title, bodyHTML, buttons){
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = bodyHTML;
  const foot = $('#modalFoot'); foot.innerHTML='';
  for(const b of buttons){
    const btn = document.createElement('button'); btn.className='btn ' + (b.class||''); btn.textContent=b.label;
    btn.onclick = b.click; foot.appendChild(btn);
  }
  $('#modalBg').classList.add('show'); $('#modalBg').setAttribute('aria-hidden','false');
}
function closeModal(){ $('#modalBg').classList.remove('show'); $('#modalBg').setAttribute('aria-hidden','true') }
$('#modalClose').onclick = closeModal;
$('#modalBg').addEventListener('click',e=>{ if(e.target.id==='modalBg') closeModal() });

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
  renderOrderTabs();
  renderOrders();
  renderAddresses();

  // restore route from hash
  const route = location.hash.replace('#','') || 'profile';
  showRoute(route);
}
init();

