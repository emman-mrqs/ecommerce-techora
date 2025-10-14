import { Router } from "express";
import {
  issueChatToken,
  uploadChatImage,
  ensureMySupportThread,
  startUserSeller,
  startSellerUser,
  startUserUser,
  // NEW:
  listAdminThreads,
  searchDirectory,
  adminStart,
  startUserUserById, threadMini,
  issueAdminChatToken, // ← add this
} from "../controller/supportChatController.js";
import { requireAdmin } from "../middleware/adminJwt.js"; // ← add this


const r = Router();

/* Token + uploads */
r.get("/api/support/chat-token", issueChatToken);
r.get("/api/support/chat-token/admin", requireAdmin, issueAdminChatToken); // ← add this
r.post("/api/support/upload", ...uploadChatImage);

/* Create / ensure threads */
r.get("/api/support/my-support-thread", ensureMySupportThread);
r.post("/api/chat/start/user-seller", startUserSeller);
r.post("/api/chat/start/seller-user", startSellerUser);
r.post("/api/chat/start/user-user", startUserUser);

/* NEW: admin list + directory search + admin start + user→user by id */
r.get("/api/support/admin/threads", listAdminThreads);
r.get("/api/support/search", searchDirectory);
r.post("/api/support/admin/start", adminStart);
r.post("/api/chat/start/user-user-id", startUserUserById);

r.get("/api/support/thread-mini", threadMini);


export default r;
