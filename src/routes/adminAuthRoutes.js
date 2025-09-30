// src/routes/adminAuthRoutes.js
import express from "express";
import { renderAdminLogin, adminLogin, adminLogout } from "../controller/adminAuthController.js";

const router = express.Router();

// Secret, tokenized login URL (e.g. /admin/login/dfhasf)
router.get("/admin/login/:token", renderAdminLogin);
router.post("/admin/login/:token", adminLogin);

// Logout clears the admin_token cookie
router.get("/admin/logout", adminLogout);

export default router;
