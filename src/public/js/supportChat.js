(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- Bootstrap (robust parse) ---------- */
  let bootstrapData = {};
  try {
    const el = document.getElementById("support-bootstrap");
    bootstrapData = el ? JSON.parse(el.textContent.trim()) : {};
  } catch (e) {
    console.error("[chat] invalid bootstrap JSON:", e);
    bootstrapData = { me: { role: "user", id: null, displayName: "User" }, config: { imgMaxMb: 4 } };
  }

  let me = bootstrapData.me || { role: "user", id: null, displayName: "User" };
  const cfg = bootstrapData.config || {};
  const IMG_MAX_MB = Number(cfg.imgMaxMb || 4);

  /* ---------- UI refs ---------- */
  const threadsList = $("#threadsList");
  const chatScroll  = $("#chatScroll");
  const compose     = $("#composeInput");
  const btnSend     = $("#btnSend");
  const btnAttach   = $("#btnAttach");
  const tplMe       = $("#tpl-bubble-me");
  const tplThem     = $("#tpl-bubble-them");
  const tplImgMe    = $("#tpl-image-me");
  const tplImgThem  = $("#tpl-image-them");

  // Directory search (single input + dropdown)
  const searchInput  = document.getElementById("chatSearchInput");
  const searchHolder = document.getElementById("chatSearchResults");

  /* ---------- State ---------- */
  let socket;
  let currentThreadId = null;
  let currentPeer = null; // {name, kind:'admin'|'user'|'seller'}

  /* ---------- Helpers ---------- */
  function banner(msg) {
    const id = "chat-warn";
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("div");
      el.id = id;
      el.className = "text-danger small px-2 py-1";
      // DEFENSIVE CHECK: Ensure chatScroll exists before prepending
      chatScroll?.prepend(el);
    }
    el.textContent = msg;
  }
  function clearBanner(){ document.getElementById("chat-warn")?.remove(); }
  function timeStr(d){ const dt = new Date(d); return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }

  // Map a thread kind to "the other side" for THIS viewer (me.role)
  function peerKindFor(meRole, threadKind){
    switch (threadKind) {
      case "support_user":   return meRole === "admin" ? "user"   : "admin";
      case "support_seller": return meRole === "admin" ? "seller" : "admin";
      case "user_user":      return "user";
      case "user_seller":
        if (meRole === "seller") return "user";
        if (meRole === "user")   return "seller";
        // admin viewing a user<->seller convo: show the user in header
        return "user";
      default:
        return "user";
    }
  }

  function appendBubble(_kind, payload){
    // DEFENSIVE CHECK: Ensure chatScroll exists before appending
    if (!chatScroll) return;
    const isMe = payload.senderRole === me.role;
    const t = (payload.type === "image") ? (isMe ? tplImgMe : tplImgThem) : (isMe ? tplMe : tplThem);
    if (!t) return;
    const node = t.content.cloneNode(true);
    if (payload.type === "image") node.querySelector(".msg-img").src = payload.imageUrl;
    else node.querySelector(".msg").textContent = payload.text || "";
    node.querySelector(".time").textContent = timeStr(payload.created_at || Date.now());
    chatScroll.appendChild(node);
    chatScroll.scrollTo({ top: 1e9, behavior: "smooth" });
  }

  // --- Who am I chatting with? (fills the header) ---
  function setPeer(peer) {
    currentPeer = peer || null;
    const nameEl   = document.querySelector("#chatTitle .peer-name");
    const roleEl   = document.querySelector("#chatTitle .peer-role");
    const avatarEl = document.querySelector("#chatTitle .chat-avatar");
    if (!nameEl || !roleEl || !avatarEl) return;

    if (!peer) {
      nameEl.textContent = (me.role !== "admin") ? "Admin Support" : "Select a conversation";
      roleEl.textContent = (me.role !== "admin") ? "ADMIN" : "";
      avatarEl.textContent = "AS";
      return;
    }

    nameEl.textContent = peer.name || (peer.kind === "seller" ? "Seller" : peer.kind === "admin" ? "Admin Support" : "User");
    roleEl.textContent = (peer.kind || "").toUpperCase();
    const initials = (peer.name || nameEl.textContent || "")
      .split(" ").map(s => s[0]).join("").slice(0,2).toUpperCase() || "??";
    avatarEl.textContent = initials;
  }

  // Build one <div class="thread"> row for the left list
  function renderThreadItem({ threadId, name, kind, partyId, lastText, lastAt }) {
    const div = document.createElement("div");
    div.className = "thread";
    if (threadId) div.dataset.threadId = threadId;
    if (partyId)  div.dataset.partyId  = partyId;
    if (kind)     div.dataset.kind     = kind;

    const initials = (name || "")
      .split(" ").map(s => s[0]).join("").slice(0, 2).toUpperCase() || "??";

    div.innerHTML = `
      <div class="thread-avatar soft">${initials}</div>
      <div class="thread-body">
        <div class="top">
          <span class="name">${name || "Conversation"}</span>
          <span class="ago">${lastAt || ""}</span>
        </div>
        <div class="preview">${lastText || "Tap to open thread"}</div>
        <span class="dot"></span>
      </div>
    `;
    return div;
  }

  /* ---------- Admin list ---------- */
  async function loadAdminThreads() {
    // DEFENSIVE CHECK
    if (!threadsList) return;
    try {
      const r = await fetch("/api/support/admin/threads");
      if (!r.ok) throw new Error("list failed");
      const rows = await r.json();
      threadsList.innerHTML = rows.length ? "" : `<div class="p-3 text-muted">No conversations yet.</div>`;
      rows.forEach(t => {
        const el = renderThreadItem({
          threadId: t.thread_id,
          name: t.name,
          kind: t.kind,
          partyId: t.party_id,
          lastText: t.last_text,
          lastAt: t.last_at
        });
        threadsList.appendChild(el);
      });
    } catch (e) {
      console.warn("[admin threads]", e);
    }
  }

  /* ---------- Directory search ---------- */
  async function queryDirectory(q) {
    const r = await fetch(`/api/support/search?q=${encodeURIComponent(q)}`);
    if (!r.ok) return [];
    return r.json();  // [{type:'user'|'seller', id, name}]
  }
  function clearSearchResults(){
    if (searchHolder) { searchHolder.style.display = "none"; searchHolder.innerHTML = ""; }
  }
  function showSearchResults(items){
    if (!searchHolder) return;
    searchHolder.innerHTML = "";
    if (!items.length) { clearSearchResults(); return; }
    items.forEach(it => {
      const a = document.createElement("a");
      a.href = "javascript:void(0)";
      a.className = "list-group-item list-group-item-action d-flex justify-content-between align-items-center";
      a.dataset.type = it.type;
      a.dataset.id   = String(it.id);
      a.dataset.name = it.name;
      a.innerHTML = `<span>${it.name}</span><span class="badge bg-light text-dark">${it.type}</span>`;
      searchHolder.appendChild(a);
    });
    searchHolder.style.display = "block";
  }

  let searchT;
  searchInput?.addEventListener("input", (e) => {
    const v = e.target.value.trim();
    clearTimeout(searchT);
    if (!v) { clearSearchResults(); return; }
    searchT = setTimeout(async () => {
      const items = await queryDirectory(v);
      showSearchResults(items);
    }, 250);
  });

  // Click a search result → ensure thread → add to left list → join + set header
  searchHolder?.addEventListener("click", async (e) => {
    const a = e.target.closest("a.list-group-item");
    if (!a) return;

    const type = a.dataset.type;      // "user" | "seller"
    const id   = Number(a.dataset.id);
    const name = a.querySelector("span")?.textContent || "";

    clearSearchResults();
    if (searchInput) searchInput.value = "";

    if (!(await window.TechoraChat.ready())) return;

    if (me.role === "admin") {
      const r  = await fetch("/api/support/admin/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id })
      });
      const th = r.ok ? await r.json() : null;
      if (th?.threadId) {
        await joinThreadId(th.threadId);
        setPeer({ name, kind: type }); // type is 'user'|'seller'
        document.querySelector('[data-bs-target="#sellerChat"]')?.click();
      }
      return;
    }

    // USER → SELLER
    if (me.role === "user" && type === "seller") {
      const r  = await fetch("/api/chat/start/user-seller", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sellerId: id })
      });
      const th = r.ok ? await r.json() : null;
      if (th?.threadId) {
        await joinThreadId(th.threadId);
        setPeer({ name, kind: "seller" });
        upsertMyThread({
          threadId: th.threadId,
          kind: "user_seller",
          name,
          last_text: "",
          last_at: ""
        });
        document.querySelector('[data-bs-target="#sellerChat"]')?.click();
      }
      return;
    }

    // SELLER → USER
    if (me.role === "seller" && type === "user") {
      const r  = await fetch("/api/chat/start/seller-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id })
      });
      const th = r.ok ? await r.json() : null;
      if (th?.threadId) {
        await joinThreadId(th.threadId);
        setPeer({ name, kind: "user" });
        upsertMyThread({
          threadId: th.threadId,
          kind: "user_seller",
          name,
          last_text: "",
          last_at: ""
        });
        document.querySelector('[data-bs-target="#sellerChat"]')?.click();
      }
      return;
    }

    // USER → USER
    if (me.role === "user" && type === "user") {
      const r  = await fetch("/api/chat/start/user-user-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id })
      });
      const th = r.ok ? await r.json() : null;
      if (th?.threadId) {
        await joinThreadId(th.threadId);
        setPeer({ name, kind: "user" });
        upsertMyThread({
          threadId: th.threadId,
          kind: "user_user",
          name,
          last_text: "",
          last_at: ""
        });
        document.querySelector('[data-bs-target="#sellerChat"]')?.click();
      }
    }
  });

  /* ---------- REST helpers ---------- */
  async function getToken() {
    try {
      const r = await fetch("/api/support/chat-token");
      if (!r.ok) throw new Error(`token ${r.status}`);
      return r.json();
    } catch (e) {
      console.warn("[chat] token error:", e);
      banner("Unable to connect to chat. Please refresh.");
      return null;
    }
  }
  async function ensureSupportThreadIfNeeded() {
    try {
      if (me.role === "admin") return null;
      const r = await fetch("/api/support/my-support-thread");
      if (!r.ok) throw new Error(`ensure ${r.status}`);
      return r.json();
    } catch (e) {
      console.warn("[chat] ensure thread error:", e);
      banner("Couldn’t open your support thread.");
      return null;
    }
  }

  /* ---------- Socket ---------- */
  async function connectSocket() {
    if (socket && socket.connected) return socket;

    const tok = await getToken();
    if (!tok) return null;

    me = tok.me || me;

    const IO =
      (typeof window.io === "function") ? window.io :
      (window.io && typeof window.io.connect === "function") ? window.io.connect :
      null;
    if (!IO) {
      console.error("[chat] Socket.IO client not loaded on page.");
      banner("Chat client unavailable. Please refresh.");
      return null;
    }
    socket = IO("/support", { auth: { token: tok.token } });

    socket.on("threadInfo", (info) => {
      const kind = peerKindFor(me.role, info.peerRole);
      setPeer({ name: info.title, kind });
      if (me.role !== "admin") {
        upsertMyThread({
          threadId: info.threadId,
          kind: info.peerRole,
          name: info.title,
          last_text: "",
          last_at: ""
        });
      }
    });

    socket.on("threadActivity", (row) => {
      if (!row) return;
      if (me.role === "admin") {
        upsertAdminThread(row);
      } else {
        upsertMyThread({
          threadId: row.thread_id,
          kind: row.kind,
          name: row.name,
          last_text: row.last_text || "",
          last_at: row.last_at || ""
        });
      }
    });

    socket.on("history", rows => {
      document.getElementById("emptyHint")?.remove();
      (rows || []).forEach(msg => appendBubble("hist", msg));
    });

    socket.on("message", (msg) => {
      appendBubble("live", msg);
      const preview = (msg.type === "text") ? (msg.text || "") : "[image]";
      const nowStr  = timeStr(Date.now());
      if (me.role === "admin") {
        loadAdminThreads();
      } else if (currentThreadId) {
        upsertMyThread({
          threadId: currentThreadId,
          kind: (currentPeer?.kind === "seller") ? "user_seller"
              : (currentPeer?.kind === "user")   ? "user_user"
              : "support_user",
          name: currentPeer?.name || (me.role !== "admin" ? "Admin Support" : "Conversation"),
          last_text: preview,
          last_at: nowStr
        });
      }
    });

    socket.on("errorMsg", m => { console.warn("[chat error]", m); banner(String(m)); });
    socket.on("connect_error", err => { console.warn("[chat connect_error]", err?.message || err); banner("Chat connection error."); });

    if (me.role !== "admin") {
      const ensured = await ensureSupportThreadIfNeeded();
      if (ensured?.threadId) {
        const guessKind = peerKindFor(me.role, ensured.kind || "support_user");
        const guessName = guessKind === "admin" ? "Admin Support" : "Conversation";
        setPeer({ name: guessName, kind: guessKind });
        await joinThreadId(ensured.threadId);
      }
    } else {
      loadAdminThreads();
    }

    return socket;
  }

  async function joinThreadId(id) {
    if (!socket) await connectSocket();
    if (!socket) return;

    currentThreadId = id;
    // ROBUSTNESS FIX: Check if chatScroll exists before changing it.
    if (chatScroll) {
        chatScroll.innerHTML = "";
    } else {
        console.error("joinThreadId failed: chatScroll element not found.");
        return; // Stop execution if the critical element is missing
    }
    socket.emit("joinById", { threadId: id });
    clearBanner();
  }

  /* ---------- Left list clicks ---------- */
  threadsList?.addEventListener("click", async (e) => {
    const item = e.target.closest(".thread");
    if (!item) return;

    $$(".thread", threadsList).forEach(t => t.classList.remove("active"));
    item.classList.add("active");

    const threadKind = item.dataset.kind || "";
    const clickedName = item.querySelector(".name")?.textContent?.trim() || "";
    const pk = peerKindFor(me.role, threadKind);
    setPeer({ name: clickedName, kind: pk });

    if (item.dataset.threadId) return joinThreadId(Number(item.dataset.threadId));
    if (me.role !== "admin") {
      const ensured = await ensureSupportThreadIfNeeded();
      if (ensured?.threadId) await joinThreadId(ensured.threadId);
    }
  });

  /* ---------- Attach ---------- */
  btnAttach?.addEventListener("click", async () => {
    if (!socket || !socket.connected) await connectSocket();
    if (!currentThreadId) {
      if (me.role !== "admin") {
        const ensured = await ensureSupportThreadIfNeeded();
        if (ensured?.threadId) await joinThreadId(ensured.threadId);
      }
    }
    if (!currentThreadId) { banner("Select a conversation first."); return; }

    const pick = document.createElement("input");
    pick.type = "file"; pick.accept = "image/*";
    pick.onchange = async () => {
      const f = pick.files?.[0]; if (!f) return;
      const max = IMG_MAX_MB * 1024 * 1024;
      if (f.size > max) { alert(`Max ${IMG_MAX_MB} MB`); return; }
      const fd = new FormData(); fd.append("file", f);
      try {
        const up = await fetch("/api/support/upload", { method: "POST", body: fd });
        if (up.ok) { const { url } = await up.json(); socket.emit("sendImage", { url, threadId: currentThreadId }); }
        else { banner("Upload failed."); }
      } catch (e) { console.warn("[upload error]", e); banner("Upload error."); }
    };
    pick.click();
  });

  /* ---------- Send ---------- */
  btnSend?.addEventListener("click", async () => {
    if (!compose) return;
    const v = (compose.value || "").trim();
    if (!v) return;
    if (!socket || !socket.connected) await connectSocket();
    if (!currentThreadId && me.role !== "admin") {
      const ensured = await ensureSupportThreadIfNeeded();
      if (ensured?.threadId) await joinThreadId(ensured.threadId);
    }
    if (!currentThreadId) { banner("Select a conversation first."); return; }
    socket.emit("sendText", { text: v, threadId: currentThreadId });
    compose.value = "";
  });

  compose?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); btnSend?.click(); }
  });

  /* ---------- Public API (kept minimal) ---------- */
  window.TechoraChat = {
    ready: async () => !!(await connectSocket()),
    openSupport: async () => {
      if (!(await window.TechoraChat.ready())) return;
      if (me.role !== "admin") {
        const ensured = await ensureSupportThreadIfNeeded();
        if (ensured?.threadId) {
          setPeer({ name: "Admin Support", kind: "admin" });
          await joinThreadId(ensured.threadId);
        }
      }
      document.querySelector('[data-bs-target="#sellerChat"]')?.click();
    }
  };

  // --- Admin left list upsert helper ---
  function upsertAdminThread(row) {
    if (!threadsList || !row || me.role !== "admin") return;
    let el = threadsList.querySelector(`.thread[data-thread-id="${row.thread_id}"]`);
    if (!el) {
      const div = document.createElement("div");
      div.className = "thread";
      div.dataset.threadId = row.thread_id;
      div.dataset.kind = row.kind;
      div.dataset.partyId = row.party_id || "";
      const initials = (row.name || "")
        .split(" ").map(s => s[0]).join("").slice(0,2).toUpperCase() || "??";
      div.innerHTML = `
        <div class="thread-avatar soft">${initials}</div>
        <div class="thread-body">
          <div class="top">
            <span class="name">${row.name || (row.kind==='seller'?'Seller':'User')}</span>
            <span class="ago">${row.last_at || ""}</span>
          </div>
          <div class="preview">${row.last_text || "Tap to open thread"}</div>
          <span class="dot"></span>
        </div>`;
      el = div;
    } else {
      el.querySelector(".preview").textContent = row.last_text || "Tap to open thread";
      const ago = el.querySelector(".ago");
      if (ago) ago.textContent = row.last_at || "";
      el.remove();
    }
    threadsList.prepend(el);
  }

  // For non-admins: keep left list sticky like Messenger
  function upsertMyThread({ threadId, kind, name, last_text, last_at }) {
    if (!threadsList || me.role === "admin") return;
    let el = threadsList.querySelector(`.thread[data-thread-id="${threadId}"]`);
    const initials = (name || "").split(" ").map(s => s[0]).join("").slice(0,2).toUpperCase() || "??";
    if (!el) {
      el = document.createElement("div");
      el.className = "thread";
      el.dataset.threadId = threadId;
      el.dataset.kind = kind;
      el.innerHTML = `
        <div class="thread-avatar soft">${initials}</div>
        <div class="thread-body">
          <div class="top">
            <span class="name">${name || (kind==='support_user' ? 'Admin Support' : 'Conversation')}</span>
            <span class="ago">${last_at || ""}</span>
          </div>
          <div class="preview">${last_text || "Tap to open thread"}</div>
          <span class="dot online"></span>
        </div>
      `;
    } else {
      el.querySelector(".preview").textContent = last_text || "Tap to open thread";
      const ago = el.querySelector(".ago");
      if (ago) ago.textContent = last_at || "";
      el.remove();
    }
    threadsList.prepend(el);
  }

  /* ---------- Auto-connect ---------- */
  (async () => { await connectSocket(); })();

  /* ---------- Ensure joined when drawer opens (non-admin) ---------- */
  document.getElementById("sellerChat")?.addEventListener("shown.bs.offcanvas", async () => {
    if (!socket || !socket.connected) await connectSocket();
    if (me.role !== "admin" && !currentThreadId) {
      const ensured = await ensureSupportThreadIfNeeded();
      if (ensured?.threadId) {
        setPeer({ name: "Admin Support", kind: "admin" });
        await joinThreadId(ensured.threadId);
      }
    }
  });
})();
