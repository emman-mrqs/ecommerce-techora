// src/routes/adminAuditRoutes.js
import express from "express";
import { listAudits } from "../controller/adminAuditController.js";

const router = express.Router();

// GET /admin/audit
router.get("/admin/audit", listAudits);

export default router;
