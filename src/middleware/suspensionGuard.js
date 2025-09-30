// src/middleware/suspensionGuard.js
import db from "../database/db.js";

// Adjust these if your paths differ
const PUBLIC_PREFIXES = [
  "/login",
  "/login-verify",
  "/auth/google",
  "/signup",
  "/verify",
  "/css",
  "/js",
  "/img",
  "/favicon",
];
const ALWAYS_ALLOW = ["/health"];
const ADMIN_PREFIX = "/admin";

function isPublicPath(path) {
  return (
    PUBLIC_PREFIXES.some((p) => path.startsWith(p)) ||
    ALWAYS_ALLOW.includes(path) ||
    path.startsWith(ADMIN_PREFIX)
  );
}

export async function suspensionGuard(req, res, next) {
  try {
    // Allow CORS preflight or similar
    if (req.method === "OPTIONS") return next();

    const path = req.path || req.originalUrl || "/";
    if (isPublicPath(path)) return next();

    const sessUser = req.session?.user;
    if (!sessUser?.id) return next(); // not logged in → nothing to guard

    // Fetch current suspension state.
    // NOTE: expects columns: is_suspended (boolean), suspension_lifted_at (timestamp/null)
    const { rows } = await db.query(
      `
      SELECT id, email, is_suspended, suspension_lifted_at
      FROM users
      WHERE id = $1
      `,
      [sessUser.id]
    );

    if (rows.length === 0) {
      // Session user not found anymore → clean up and send to login-verify
      req.session.destroy?.(() => {});
      return res.redirect("/login-verify");
    }

    const u = rows[0];

    // If a lift time exists and is in the past, auto-lift
    if (u.is_suspended && u.suspension_lifted_at) {
      const now = new Date();
      const liftAt = new Date(u.suspension_lifted_at);
      if (!Number.isNaN(liftAt.getTime()) && liftAt <= now) {
        await db.query(
          `
          UPDATE users
             SET is_suspended = FALSE,
                 suspension_lifted_at = NULL,
                 updated_at = NOW()
           WHERE id = $1
          `,
          [u.id]
        );
        return next();
      }
    }

    // Still suspended? End session and block.
    if (u.is_suspended) {
      // Capture email before destroying session (to prefill on login-verify)
      const email = u.email || req.session?.user?.email || "";
      req.session.destroy?.(() => {});

      const wantsJSON =
        req.xhr ||
        (req.headers.accept && req.headers.accept.includes("application/json")) ||
        (req.headers["content-type"] && req.headers["content-type"].includes("application/json"));

      if (wantsJSON) {
        return res.status(401).json({
          success: false,
          suspended: true,
          message:
            "Your account is suspended. Please check your email for details or contact support.",
        });
      }

      const params = new URLSearchParams({ suspended: "1" });
      if (email) params.set("email", email);
      return res.redirect(`/login-verify?${params.toString()}`);
    }

    // Not suspended → proceed
    return next();
  } catch (err) {
    console.error("suspensionGuard error:", err);
    // Fail open so regular traffic isn't blocked on errors
    return next();
  }
}
