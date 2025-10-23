// loginRoutes.js
import express from "express";
import { loginUser, logoutUser } from "../controller/loginController.js";
import { redirectIfLoggedIn } from "../middleware/authMiddleware.js";
import { loginVerify } from "../controller/loginVerifyController.js";
import passport from "../config/passport.js";
import db from "../database/db.js"; // <-- add this import
import { insertAudit } from "../utils/audit.js";

const router = express.Router();

// Step 1: Show loginVerify page (GET)
// loginRoutes.js
router.get("/login-verify", redirectIfLoggedIn, (req, res) => {
  const { suspended, email } = req.query;
  const error = suspended
    ? "This account has been suspended. Please check your email for details."
    : null;

  res.render("auth/loginVerify", { error, email: email || "" });
});

// Step 2: Handle email submission (POST)
router.post("/login-verify", redirectIfLoggedIn, loginVerify);

// Google OAuth entry point
router.get(
  "/auth/google",
  (req, res, next) => {
    console.log("Google OAuth route hit!");
    next();
  },
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// Google OAuth callback
// Custom callback so we can audit success/fail with req.ip
router.get("/auth/google/callback", (req, res, next) => {
  passport.authenticate("google", async (err, user, info) => {
    const ip = req.headers["x-forwarded-for"] || req.ip;
    try {
      if (err) {
        console.error("Google passport error:", err);
        // Audit unexpected passport error
        try {
          await insertAudit({
            actor_type: "user",
            actor_id: null,
            actor_name: req.session?.pendingEmail || null,
            action: "login_error",
            resource: "auth",
            details: { provider: "google", error: err.message || String(err) },
            ip,
            status: "failed",
          });
        } catch (auditErr) {
          console.error("Audit insert error (google passport err):", auditErr);
        }
        return res.redirect("/login-verify");
      }

      if (!user) {
        // Authentication failed (no user) — audit and redirect to verify
        try {
          await insertAudit({
            actor_type: "user",
            actor_id: null,
            actor_name: req.session?.pendingEmail || null,
            action: "login_failed",
            resource: "auth",
            details: { provider: "google", info: info || null },
            ip,
            status: "failed",
          });
        } catch (auditErr) {
          console.error("Audit insert error (google no user):", auditErr);
        }
        return res.redirect("/login-verify");
      }

      // At this point passport authenticated the user object successfully.
      // Re-check suspension from DB (defensive), then create app session.
      try {
        const result = await db.query(
          "SELECT id, name, email, is_suspended FROM users WHERE id = $1",
          [user.id]
        );
        const found = result.rows[0];
        if (!found) {
          // Extremely unlikely — audit and redirect
          try {
            await insertAudit({
              actor_type: "user",
              actor_id: null,
              actor_name: null,
              action: "login_error",
              resource: "auth",
              details: { provider: "google", reason: "user_not_found_after_auth" },
              ip,
              status: "failed",
            });
          } catch (auditErr) {
            console.error("Audit insert error (user not found):", auditErr);
          }
          req.logout?.(() => {});
          return res.redirect("/login-verify");
        }

        if (found.is_suspended) {
          // Suspended -> block, audit, and show verify page
          try {
            await insertAudit({
              actor_type: "user",
              actor_id: found.id,
              actor_name: found.name || found.email,
              action: "login_blocked",
              resource: "auth",
              details: { provider: "google", reason: "suspended" },
              ip,
              status: "failed",
            });
          } catch (auditErr) {
            console.error("Audit insert error (suspended google user):", auditErr);
          }

          req.logout?.(() => {});
          return res.render("auth/loginVerify", {
            error: "This account has been suspended. Please check your email for details."
          });
        }

        // All good — create app session and audit success
        req.session.user = {
          id: found.id,
          name: found.name,
          email: found.email,
        };

        try {
          await insertAudit({
            actor_type: "user",
            actor_id: found.id,
            actor_name: found.name || found.email,
            action: "login",
            resource: "auth",
            details: { method: "google" },
            ip,
            status: "success",
          });
        } catch (auditErr) {
          console.error("Audit insert error (google login success):", auditErr);
        }

        return res.redirect("/");
      } catch (dbErr) {
        console.error("Google callback DB error:", dbErr);
        try {
          await insertAudit({
            actor_type: "user",
            actor_id: user?.id || null,
            actor_name: user?.name || null,
            action: "login_error",
            resource: "auth",
            details: { provider: "google", error: dbErr.message || String(dbErr) },
            ip,
            status: "failed",
          });
        } catch (auditErr) {
          console.error("Audit insert error (google dbErr):", auditErr);
        }
        req.logout?.(() => {});
        return res.redirect("/login-verify");
      }
    } catch (outerErr) {
      console.error("Unhandled google callback error:", outerErr);
      try {
        await insertAudit({
          actor_type: "user",
          actor_id: null,
          actor_name: null,
          action: "login_error",
          resource: "auth",
          details: { provider: "google", error: outerErr.message || String(outerErr) },
          ip,
          status: "failed",
        });
      } catch (auditErr) {
        console.error("Audit insert error (google outerErr):", auditErr);
      }
      req.logout?.(() => {});
      return res.redirect("/login-verify");
    }
  })(req, res, next);
});


// Login Page
router.get("/login", redirectIfLoggedIn, (req, res) => {
  const email = req.session.pendingEmail || "";
  res.render("auth/login", { email });
});

// Login Post
router.post("/login", loginUser);

// Logout
router.get("/logout", logoutUser);

export default router;
