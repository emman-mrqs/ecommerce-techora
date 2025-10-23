// src/middleware/adminJwt.js
import jwt from "jsonwebtoken";

export function requireAdmin(req, res, next) {
  try {
    const token = req.cookies?.admin_token;
    if (!token) {
      console.log("[requireAdmin] no admin_token cookie");
      return res.redirect("/");
    }

    const payload = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    if (payload?.role !== "admin") {
      console.log("[requireAdmin] token role not admin:", payload?.role);
      return res.redirect("/");
    }

    // make admin info available in views and for other middleware
    res.locals.admin = {
      id: payload.id ?? "admin",
      email: payload.email ?? null,
      role: payload.role,
      displayName: payload.name ?? payload.email ?? "Admin"
    };

    next();
  } catch (err) {
    console.log("[requireAdmin] token verify failed:", err?.message || err);
    return res.redirect("/");
  }
}
