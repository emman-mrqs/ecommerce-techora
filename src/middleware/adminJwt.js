// src/middleware/adminJwt.js
import jwt from "jsonwebtoken";

export function requireAdmin(req, res, next) {
  try {
    const token = req.cookies?.admin_token;
    if (!token) return res.redirect("/"); // ← go home instead of admin login

    const payload = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    if (payload?.role !== "admin") return res.redirect("/"); // ← go home

    // available to views (sidebar avatar, etc.)
    res.locals.admin = { email: payload.email, role: payload.role };
    next();
  } catch {
    return res.redirect("/"); // ← go home on invalid/expired token
  }
}
