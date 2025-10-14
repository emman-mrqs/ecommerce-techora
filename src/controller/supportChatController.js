import jwt from "jsonwebtoken";
import cookie from "cookie";
import multer from "multer";
import path from "path";
import fs from "fs";
import db from "../database/db.js";

/* ===== Config ===== */
const WS_JWT_SECRET      = process.env.WS_JWT_SECRET || "dev-ws-secret";
const CHAT_IMG_DIR       = process.env.CHAT_IMG_DIR  || "public/uploads/chat";
const CHAT_IMG_MAX_MB    = Number(process.env.CHAT_IMG_MAX_MB || 4);
const CHAT_IMG_MAX_BYTES = CHAT_IMG_MAX_MB * 1024 * 1024;

fs.mkdirSync(CHAT_IMG_DIR, { recursive: true });

/* ===== Helpers ===== */
function safePublicUrl(localPath) {
  return "/" + localPath.replace(/^public[\\/]/, "").replace(/\\/g, "/");
}

async function findSellerIdByUserId(userId) {
  const r = await db.query(
    "SELECT id FROM sellers WHERE user_id=$1 AND status='approved' LIMIT 1",
    [userId]
  );
  return r.rows[0]?.id || null;
}

/**
 * Identity from HTTP
 * - Prioritizes admin identity based on the admin_token cookie.
 * - Falls back to normal site session for users/sellers.
 */
async function httpIdentity(req) {
  // If an admin_token cookie is present, this request MUST be treated as an admin.
  if (req.cookies?.admin_token) {
    try {
      const tok = req.cookies.admin_token;
      const p = jwt.verify(tok, process.env.ADMIN_JWT_SECRET);
      if (p?.role === "admin") {
        return { role: "admin", id: "admin", displayName: "Admin Support" };
      }
      // If the token is present but invalid (not admin role), fail authentication.
      return null;
    } catch {
      // If token verification fails (expired/malformed), fail authentication.
      return null;
    }
  }

  // Only if no admin token is present, check for a normal site user (user/seller).
  const u = req.session?.user;
  if (u?.id) {
    const sellerId = await findSellerIdByUserId(u.id);
    if (sellerId) {
      return {
        role: "seller",
        id: sellerId,
        userId: u.id,
        displayName: u.name || "Seller",
      };
    }
    return { role: "user", id: u.id, displayName: u.name || "User" };
  }

  // No identity found.
  return null;
}



/** Build/ensure a thread; returns { id } */
async function ensureThread(kind, { userId = null, sellerId = null, userBId = null }) {
  const up = await db.query(
    `
      INSERT INTO support_threads (kind, user_id, seller_id, user_b_id, last_text, last_at)
      VALUES ($1,$2,$3,$4,NULL,NULL)
      ON CONFLICT DO NOTHING
      RETURNING id
    `,
    [kind, userId, sellerId, userBId]
  );
  if (up.rows[0]) return up.rows[0];

  const selWhere =
    kind === "support_user"   ? `kind='support_user' AND user_id=$1`
  : kind === "support_seller" ? `kind='support_seller' AND seller_id=$1`
  : kind === "user_seller"    ? `kind='user_seller' AND user_id=$1 AND seller_id=$2`
  :                            `kind='user_user' AND (user_id=$1 AND user_b_id=$2)`;

  const args =
    kind === "support_user"   ? [userId]
  : kind === "support_seller" ? [sellerId]
  : kind === "user_seller"    ? [userId, sellerId]
  :                            [userId, userBId];

  const ex = await db.query(`SELECT id FROM support_threads WHERE ${selWhere} LIMIT 1`, args);
  return ex.rows[0]; // {id}
}

/** Append message + bump preview */
async function appendMessage({ threadId, senderRole, senderUserId, senderSellerId, type, text, imageUrl }) {
  const ins = await db.query(
    `INSERT INTO support_messages
      (thread_id, sender_role, sender_user_id, sender_seller_id, type, body, image_url)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    RETURNING id, created_at`,
    [threadId, senderRole, senderUserId || null, senderSellerId || null, type, text || null, imageUrl || null]
  );
  const lastText = type === "text" ? text : "[image]";
  await db.query(`UPDATE support_threads SET last_text=$1, last_at=NOW(), updated_at=NOW() WHERE id=$2`, [lastText, threadId]);
  return ins.rows[0]; // {id, created_at}
}

/** Viewer-specific title for header (used by threadInfo) */
async function getTitleForViewer(th, viewer) {
  // For Admin: show the name of the user/seller they are talking to.
  if (viewer.role === "admin") {
    if (th.kind === "support_user" || th.kind === "user_user") {
      const r = await db.query(`SELECT name FROM users WHERE id=$1`, [th.user_id]);
      return r.rows[0]?.name || "User";
    } else if (th.kind === "support_seller") {
      const r = await db.query(`SELECT store_name FROM sellers WHERE id=$1`, [th.seller_id]);
      return r.rows[0]?.store_name || "Seller";
    } else if (th.kind === "user_seller") {
      // In a user-seller chat, admin sees the user's name in the header
      const r = await db.query(`SELECT name FROM users WHERE id=$1`, [th.user_id]);
      return r.rows[0]?.name || "User";
    }
    return "Conversation";
  }

  // For Users/Sellers: show "Admin Support" or the peer's name.
  if (th.kind === "support_user" || th.kind === "support_seller") return "Admin Support";

  if (viewer.role === "user" && th.kind === "user_seller") {
    const r = await db.query(`SELECT store_name FROM sellers WHERE id=$1`, [th.seller_id]);
    return r.rows[0]?.store_name || "Seller";
  }
  if (viewer.role === "seller" && th.kind === "user_seller") {
    const r = await db.query(`SELECT name FROM users WHERE id=$1`, [th.user_id]);
    return r.rows[0]?.name || "User";
  }
  if (viewer.role === "user" && th.kind === "user_user") {
    const otherId = Number(viewer.id) === Number(th.user_id) ? th.user_b_id : th.user_id;
    const r = await db.query(`SELECT name FROM users WHERE id=$1`, [otherId]);
    return r.rows[0]?.name || "User";
  }
  return "Conversation";
}

/**
 * Build a thread-activity summary label that is correct for a specific audience
 * (admin, user[viewerId], or seller[viewerId]).
 * Returns: { thread_id, kind, name, last_text, last_at }
 */
async function getThreadSummaryForAudience(threadId, audience) {
  const thq = await db.query(
    `SELECT id, kind, user_id, seller_id, user_b_id, last_text, last_at
      FROM support_threads
      WHERE id=$1`,
    [threadId]
  );
  if (thq.rowCount === 0) return null;

  const th = thq.rows[0];
  const last_at = th.last_at
    ? new Date(th.last_at).toISOString().slice(0,16).replace("T"," ")
    : "";
  const base = {
    thread_id: th.id,
    kind: th.kind,
    last_text: th.last_text || "",
    last_at
  };

  // For Admin: show the customer/seller name, with a role label for clarity.
  if (audience.role === "admin") {
    if (th.kind === "support_user") {
      const r = await db.query(`SELECT name FROM users WHERE id=$1`, [th.user_id]);
      const name = r.rows[0]?.name || "User";
      return { ...base, name: `${name} (User)` };
    } else if (th.kind === "support_seller") {
      const r = await db.query(`SELECT store_name FROM sellers WHERE id=$1`, [th.seller_id]);
      const name = r.rows[0]?.store_name || "Seller";
      return { ...base, name: `${name} (Seller)` };
    } else if (th.kind === "user_seller") {
      const r = await db.query(`SELECT name FROM users WHERE id=$1`, [th.user_id]);
      const name = r.rows[0]?.name || "User";
      return { ...base, name: `${name} (User)` };
    } else if (th.kind === "user_user") {
      const r = await db.query(`SELECT name FROM users WHERE id=$1`, [th.user_id]);
      const name = r.rows[0]?.name || "User";
       return { ...base, name: `${name} (User)` };
    }
    return { ...base, name: "Conversation" };
  }

  // Seller audience
  if (audience.role === "seller") {
    if (th.kind === "support_seller") {
      return { ...base, name: "Admin Support" };
    }
    if (th.kind === "user_seller") {
      const r = await db.query(`SELECT name FROM users WHERE id=$1`, [th.user_id]);
      return { ...base, name: r.rows[0]?.name || "User" };
    }
    return { ...base, name: "Conversation" };
  }

  // User audience
  if (audience.role === "user") {
    if (th.kind === "support_user") {
      return { ...base, name: "Admin Support" };
    }
    if (th.kind === "user_seller") {
      const r = await db.query(`SELECT store_name FROM sellers WHERE id=$1`, [th.seller_id]);
      return { ...base, name: r.rows[0]?.store_name || "Seller" };
    }
    if (th.kind === "user_user") {
      const otherId = (Number(audience.viewerId) === Number(th.user_id)) ? th.user_b_id : th.user_id;
      const r = await db.query(`SELECT name FROM users WHERE id=$1`, [otherId]);
      return { ...base, name: r.rows[0]?.name || "User" };
    }
    return { ...base, name: "Conversation" };
  }

  return { ...base, name: "Conversation" };
}

/* ===== HTTP: admin list / directory search / admin start / user->user by id ===== */
export async function listAdminThreads(req, res) {
  const ident = await httpIdentity(req);
  if (!ident || ident.role !== "admin") return res.status(403).json([]);

  const q = await db.query(`
    SELECT
      t.id AS thread_id,
      t.kind,
      COALESCE(t.user_id, t.seller_id, t.user_b_id) AS party_id,
      CASE
        WHEN t.kind='support_user'   THEN (SELECT name || ' (User)' FROM users  WHERE id=t.user_id)
        WHEN t.kind='support_seller' THEN (SELECT store_name || ' (Seller)' FROM sellers WHERE id=t.seller_id)
        WHEN t.kind='user_seller'    THEN (SELECT name || ' (User)' FROM users WHERE id=t.user_id)
        WHEN t.kind='user_user'      THEN (SELECT name || ' (User)' FROM users WHERE id=t.user_id)
        ELSE 'Unknown'
      END AS name,
      t.last_text,
      to_char(t.last_at, 'YYYY-MM-DD HH24:MI') AS last_at
    FROM support_threads t
    ORDER BY t.updated_at DESC NULLS LAST
    LIMIT 50
  `);
  res.json(q.rows);
}

export async function searchDirectory(req, res) {
  const q = String(req.query.q || "").trim().toLowerCase();
  if (!q) return res.json([]);
  const users = await db.query(
    `SELECT id, name FROM users WHERE LOWER(name) LIKE $1 ORDER BY name LIMIT 8`, [`%${q}%`]
  );
  const sellers = await db.query(
    `SELECT id, store_name FROM sellers WHERE LOWER(store_name) LIKE $1 ORDER BY store_name LIMIT 8`, [`%${q}%`]
  );
  const out = [
    ...users.rows.map(u => ({ type: "user", id: Number(u.id), name: u.name })),
    ...sellers.rows.map(s => ({ type: "seller", id: Number(s.id), name: s.store_name }))
  ];
  res.json(out);
}

export async function adminStart(req, res) {
  const ident = await httpIdentity(req);
  if (!ident || ident.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  const { type, id } = req.body || {};
  if (!type || !id) return res.status(400).json({ error: "type/id required" });

  if (type === "user") {
    const th = await ensureThread("support_user", { userId: Number(id) });
    return res.json({ threadId: th.id });
  }
  if (type === "seller") {
    const th = await ensureThread("support_seller", { sellerId: Number(id) });
    return res.json({ threadId: th.id });
  }
  return res.status(400).json({ error: "invalid type" });
}

export async function startUserUserById(req, res) {
  const ident = await httpIdentity(req);
  if (!ident || ident.role !== "user") return res.status(403).json({ error: "Only users can start this chat" });
  const otherId = Number(req.body.userId);
  if (!otherId) return res.status(400).json({ error: "userId required" });
  if (otherId === ident.id) return res.status(400).json({ error: "Cannot DM yourself" });

  const a = Math.min(ident.id, otherId);
  const b = Math.max(ident.id, otherId);
  const th = await ensureThread("user_user", { userId: a, userBId: b });
  res.json({ threadId: th.id, kind: "user_user" });
}

/* ===== HTTP: token + starts + ensure support ===== */
export async function issueChatToken(req, res) {
  const ident = await httpIdentity(req);
  if (!ident) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const payload = {
    sub: `${ident.role}:${ident.id}`,
    role: ident.role,
    id: ident.id,
    userId: ident.userId || null,
  };

  const token = jwt.sign(payload, WS_JWT_SECRET, { expiresIn: "10m" });
  res.json({ token, me: { role: ident.role, id: ident.id, displayName: ident.displayName } });
}


/** User → Seller (from store page) */
export async function startUserSeller(req, res) {
  const ident = await httpIdentity(req);
  if (!ident || ident.role !== "user") return res.status(403).json({ error: "Only users can start this chat" });

  const sellerId = Number(req.body.sellerId);
  if (!sellerId) return res.status(400).json({ error: "sellerId required" });

  const th = await ensureThread("user_seller", { userId: ident.id, sellerId });
  res.json({ threadId: th.id, kind: "user_seller" });
}

/** Seller → User (only if transaction exists) */
export async function startSellerUser(req, res) {
  const ident = await httpIdentity(req);
  if (!ident || ident.role !== "seller") return res.status(403).json({ error: "Only sellers can start this chat" });

  const userId = Number(req.body.userId);
  if (!userId) return res.status(400).json({ error: "userId required" });

  const ok = await hasSellerUserTransaction(userId, ident.id);
  if (!ok) return res.status(403).json({ error: "No transaction with this user" });

  const th = await ensureThread("user_seller", { userId, sellerId: ident.id });
  res.json({ threadId: th.id, kind: "user_seller" });
}

/** User → User by email */
export async function startUserUser(req, res) {
  const ident = await httpIdentity(req);
  if (!ident || ident.role !== "user") return res.status(403).json({ error: "Only users can start this chat" });

  const email = String(req.body.email || "").trim().toLowerCase();
  if (!email) return res.status(400).json({ error: "email required" });

  const u = await db.query(`SELECT id, name FROM users WHERE LOWER(email)=$1 LIMIT 1`, [email]);
  if (u.rowCount === 0) return res.status(404).json({ error: "No user with that email" });

  const otherId = Number(u.rows[0].id);
  if (otherId === ident.id) return res.status(400).json({ error: "Cannot DM yourself" });

  const a = Math.min(ident.id, otherId);
  const b = Math.max(ident.id, otherId);

  const th = await ensureThread("user_user", { userId: a, userBId: b });
  res.json({ threadId: th.id, kind: "user_user" });
}

/** Support chats (auto) */
export async function ensureMySupportThread(req, res) {
  const ident = await httpIdentity(req);
  if (!ident) return res.status(401).json({ error: "Not authenticated" });

  if (ident.role === "user") {
    const th = await ensureThread("support_user", { userId: ident.id });
    return res.json({ threadId: th.id, kind: "support_user" });
  }
  if (ident.role === "seller") {
    const th = await ensureThread("support_seller", { sellerId: ident.id });
    return res.json({ threadId: th.id, kind: "support_seller" });
  }
  // Admin has many; no default thread
  return res.json({ ok: true });
}

/* ===== Upload (images) ===== */
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, CHAT_IMG_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase();
      cb(null, `chat_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
    }
  }),
  limits: { fileSize: CHAT_IMG_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(png|jpe?g|gif|webp|bmp|svg\+xml)$/.test(file.mimetype))
      return cb(new Error("Only image files are allowed"));
    cb(null, true);
  }
});

export const uploadChatImage = [
  async (req, res, next) => {
    const ident = await httpIdentity(req);
    if (!ident) return res.status(401).json({ error: "Unauthorized" });
    req.chatIdentity = ident;
    next();
  },
  upload.single("file"),
  (req, res) => res.json({ url: safePublicUrl(req.file.path), bytes: req.file.size })
];

/* ===== Socket.IO ===== */
export function registerSupportSocket(io) {
  const nsp = io.of("/support");

  // Authenticate socket by short-lived token
  nsp.use((socket, next) => {
    try {
      let token = socket.handshake.auth?.token;
      if (!token) {
        const h = socket.handshake.headers?.authorization;
        if (h?.startsWith("Bearer ")) token = h.slice(7);
      }
      if (!token) {
        const cookies = cookie.parse(socket.handshake.headers?.cookie || "");
        if (cookies.ws_token) token = cookies.ws_token;
      }
      if (!token) throw new Error("Missing token");
      const p = jwt.verify(token, WS_JWT_SECRET);
      socket.data.identity = { role: p.role, id: p.id, userId: p.userId || null };
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  nsp.on("connection", (socket) => {
    const ident = socket.data.identity;

    // Join identity rooms for push updates
    if (ident.role === "admin") socket.join("admins");
    if (ident.role === "user")  socket.join(`party:user:${ident.id}`);
    if (ident.role === "seller") socket.join(`party:seller:${ident.id}`);

    // join a thread by id after server-side permission check
    socket.on("joinById", async ({ threadId }) => {
      if (!threadId) return socket.emit("errorMsg", "threadId required");

      const thq = await db.query(
        `SELECT id, kind, user_id, seller_id, user_b_id FROM support_threads WHERE id=$1`,
        [threadId]
      );
      if (thq.rowCount === 0) return socket.emit("errorMsg", "Thread not found");
      const th = thq.rows[0];

      const can =
        ident.role === "admin" ||
        (th.kind === "support_user"   && ident.role === "user"   && Number(ident.id) === Number(th.user_id)) ||
        (th.kind === "support_seller" && ident.role === "seller" && Number(ident.id) === Number(th.seller_id)) ||
        (th.kind === "user_seller"    &&
          ((ident.role === "user"   && Number(ident.id) === Number(th.user_id)) ||
           (ident.role === "seller" && Number(ident.id) === Number(th.seller_id)))) ||
        (th.kind === "user_user"      &&
          (ident.role === "user" && (
             Number(ident.id) === Number(th.user_id) || Number(ident.id) === Number(th.user_b_id)
          )));

      if (!can) return socket.emit("errorMsg", "Forbidden");

      const room = `thread:${th.id}`;
      socket.join(room);
      socket.data.threadId = th.id;

      // header info for this viewer
      const title = await getTitleForViewer(th, ident);
      socket.emit("threadInfo", { threadId: th.id, title, peerRole: th.kind });

      // history
      const hist = await db.query(
        `SELECT id, sender_role, type, body AS text, image_url AS "imageUrl", created_at
          FROM support_messages WHERE thread_id=$1 ORDER BY id DESC LIMIT 50`,
        [th.id]
      );
      socket.emit("history", hist.rows.reverse());
    });

    // Helper for broadcasting thread activity updates to all relevant parties
    async function broadcastThreadActivity(threadId) {
        const thMeta = await db.query(
            `SELECT kind, user_id, seller_id, user_b_id FROM support_threads WHERE id=$1`,
            [threadId]
        );
        if (!thMeta.rowCount) return;
        const th = thMeta.rows[0];

        // Admin(s)
        const adminSum = await getThreadSummaryForAudience(threadId, { role: "admin" });
        if (adminSum) nsp.to("admins").emit("threadActivity", adminSum);

        // Involved Parties
        if (th.kind === "support_user") {
            const userSum = await getThreadSummaryForAudience(threadId, { role: "user", viewerId: th.user_id });
            if (userSum) nsp.to(`party:user:${th.user_id}`).emit("threadActivity", userSum);
        } else if (th.kind === "support_seller") {
            const sellerSum = await getThreadSummaryForAudience(threadId, { role: "seller", viewerId: th.seller_id });
            if (sellerSum) nsp.to(`party:seller:${th.seller_id}`).emit("threadActivity", sellerSum);
        } else if (th.kind === "user_seller") {
            const userSum   = await getThreadSummaryForAudience(threadId, { role: "user",   viewerId: th.user_id });
            const sellerSum = await getThreadSummaryForAudience(threadId, { role: "seller", viewerId: th.seller_id });
            if (userSum)   nsp.to(`party:user:${th.user_id}`).emit("threadActivity", userSum);
            if (sellerSum) nsp.to(`party:seller:${th.seller_id}`).emit("threadActivity", sellerSum);
        } else if (th.kind === "user_user") {
            const aSum = await getThreadSummaryForAudience(threadId, { role: "user", viewerId: th.user_id });
            const bSum = await getThreadSummaryForAudience(threadId, { role: "user", viewerId: th.user_b_id });
            if (aSum) nsp.to(`party:user:${th.user_id}`).emit("threadActivity", aSum);
            if (bSum) nsp.to(`party:user:${th.user_b_id}`).emit("threadActivity", bSum);
        }
    }


    socket.on("sendText", async ({ text, threadId }) => {
      const t = (text || "").trim();
      const tid = Number(threadId || socket.data.threadId);
      if (!tid || !t) return;

      const msg = await appendMessage({
        threadId: tid,
        senderRole: ident.role,
        senderUserId: (ident.role === "user" || ident.role === "seller") ? ident.userId || ident.id : null,
        senderSellerId: ident.role === "seller" ? ident.id : null,
        type: "text",
        text: t
      });

      const payload = { threadId: tid, id: msg.id, senderRole: ident.role, type: "text", text: t, created_at: msg.created_at };
      nsp.to(`thread:${tid}`).emit("message", payload);
      await broadcastThreadActivity(tid);
    });

    socket.on("sendImage", async ({ url, threadId }) => {
      const tid = Number(threadId || socket.data.threadId);
      if (!tid || !url) return;

      const msg = await appendMessage({
        threadId: tid,
        senderRole: ident.role,
        senderUserId: (ident.role === "user" || ident.role === "seller") ? ident.userId || ident.id : null,
        senderSellerId: ident.role === "seller" ? ident.id : null,
        type: "image",
        imageUrl: url
      });

      const payload = { threadId: tid, id: msg.id, senderRole: ident.role, type: "image", imageUrl: url, created_at: msg.created_at };
      nsp.to(`thread:${tid}`).emit("message", payload);
      await broadcastThreadActivity(tid);
    });
  });
}

/** Tiny, caller-specific card for keeping the left list sticky */
export async function threadMini(req, res) {
  const ident = await httpIdentity(req);
  if (!ident) return res.status(401).json({});

  const id = Number(req.query.threadId || 0);
  if (!id) return res.json({});

  const thq = await db.query(
    `SELECT id, kind, user_id, seller_id, user_b_id, last_text, last_at
      FROM support_threads WHERE id=$1`,
    [id]
  );
  if (thq.rowCount === 0) return res.json({});

  const th = thq.rows[0];
  const can =
    ident.role === "admin" ||
    (th.kind === "support_user"   && ident.role === "user"   && Number(ident.id) === Number(th.user_id)) ||
    (th.kind === "support_seller" && ident.role === "seller" && Number(ident.id) === Number(th.seller_id)) ||
    (th.kind === "user_seller"    &&
      ((ident.role === "user"   && Number(ident.id) === Number(th.user_id)) ||
       (ident.role === "seller" && Number(ident.id) === Number(th.seller_id)))) ||
    (th.kind === "user_user"      &&
      (ident.role === "user" && (
        Number(ident.id) === Number(th.user_id) || Number(ident.id) === Number(th.user_b_id)
      )));

  if (!can) return res.json({});

  let name = "Conversation";
  if (th.kind === "support_user") {
    name = "Admin Support";
  } else if (th.kind === "support_seller") {
    const s = await db.query(`SELECT store_name FROM sellers WHERE id=$1`, [th.seller_id]);
    name = s.rows[0]?.store_name || "Seller";
  } else if (th.kind === "user_seller") {
    if (ident.role === "user") {
      const s = await db.query(`SELECT store_name FROM sellers WHERE id=$1`, [th.seller_id]);
      name = s.rows[0]?.store_name || "Seller";
    } else {
      const u = await db.query(`SELECT name FROM users WHERE id=$1`, [th.user_id]);
      name = u.rows[0]?.name || "User";
    }
  } else if (th.kind === "user_user") {
    const otherId = (Number(ident.id) === Number(th.user_id)) ? th.user_b_id : th.user_id;
    const u = await db.query(`SELECT name FROM users WHERE id=$1`, [otherId]);
    name = u.rows[0]?.name || "User";
  }

  res.json({
    threadId: th.id,
    kind: th.kind,
    name,
    last_text: th.last_text || "",
    last_at: th.last_at ? new Date(th.last_at).toISOString().slice(0,16).replace("T"," ") : ""
  });
}

/* ===== Misc helpers already present ===== */
async function hasSellerUserTransaction(userId, sellerId) {
  const q = await db.query(
    `
    SELECT 1
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN product_variant pv ON pv.id = oi.product_variant_id
      JOIN products p ON p.id = pv.product_id
      WHERE o.user_id = $1 AND p.seller_id = $2
      LIMIT 1
    `,
    [userId, sellerId]
  );
  return q.rowCount > 0;
}


export async function issueAdminChatToken(req, res) {
  try {
    const tok = req.cookies?.admin_token;
    if (!tok) return res.status(401).json({ error: "Not authenticated" });
    const p = jwt.verify(tok, process.env.ADMIN_JWT_SECRET);
    if (p?.role !== "admin") return res.status(403).json({ error: "Forbidden" });

    const token = jwt.sign(
      { sub: "admin:admin", role: "admin", id: "admin" },
      WS_JWT_SECRET,
      { expiresIn: "10m" }
    );
    res.json({ token, me: { role: "admin", id: "admin", displayName: "Admin Support" } });
  } catch {
    return res.status(401).json({ error: "Not authenticated" });
  }
}

