// controllers/loginController.js
import bcrypt from "bcrypt";
import db from "../database/db.js"; // your db connection
import { insertAudit } from "../utils/audit.js"; // audit helper

// Login Handler
export const loginUser = async (req, res) => {
  const email = req.session.pendingEmail || req.body.email;
  const { password } = req.body;

  console.log("[login] loginUser called, email=", email); // <-- debug entry

  try {
    const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);

    if (result.rows.length === 0) {
      console.log("[login] user not found for email:", email); // debug
      // Audit: login attempt where user not found
      try {
        console.log("[login] about to insert audit: login_failed (not_found)", { email });
        await insertAudit({
          actor_type: "user",
          actor_id: null,
          actor_name: email,
          action: "login_failed",
          resource: "auth",
          details: { reason: "not_found", email_attempted: email },
          ip: req.headers["x-forwarded-for"] || req.ip,
          status: "failed",
        });
      } catch (auditErr) {
        console.error("Audit insert error (login not found):", auditErr);
      }

      return res.render("auth/login", { error: "Invalid email or password.", email });
    }

    const user = result.rows[0];

    // HARD BLOCK: suspended users cannot log in (any provider)
    if (user.is_suspended) {
      console.log("[login] blocked suspended user:", user.id);
      // Audit: suspended login blocked
      try {
        console.log("[login] about to insert audit: login_blocked (suspended) for userId=", user.id);
        await insertAudit({
          actor_type: "user",
          actor_id: user.id,
          actor_name: user.name || user.email,
          action: "login_blocked",
          resource: "auth",
          details: { reason: "suspended" },
          ip: req.headers["x-forwarded-for"] || req.ip,
          status: "failed",
        });
      } catch (auditErr) {
        console.error("Audit insert error (suspended):", auditErr);
      }

      return res.render("auth/login", {
        error: "Your account is suspended. Please check your email for details.",
        email
      });
    }

    // Only local accounts use this password form
    if (user.auth_provider !== "local") {
      console.log("[login] attempted local login on non-local account:", user.auth_provider);
      // Audit: attempted local login on non-local account
      try {
        console.log("[login] about to insert audit: login_failed (wrong_provider) userId=", user.id);
        await insertAudit({
          actor_type: "user",
          actor_id: user.id,
          actor_name: user.name || user.email,
          action: "login_failed",
          resource: "auth",
          details: { reason: "wrong_provider", expected: "local", actual: user.auth_provider },
          ip: req.headers["x-forwarded-for"] || req.ip,
          status: "failed",
        });
      } catch (auditErr) {
        console.error("Audit insert error (wrong provider):", auditErr);
      }

      return res.render("auth/login", { error: "This account uses Google Sign-In.", email });
    }

    if (!user.is_verified) {
      console.log("[login] user not verified:", user.id);
      // Audit: attempted login but email not verified
      try {
        console.log("[login] about to insert audit: login_blocked (not_verified) userId=", user.id);
        await insertAudit({
          actor_type: "user",
          actor_id: user.id,
          actor_name: user.name || user.email,
          action: "login_blocked",
          resource: "auth",
          details: { reason: "not_verified" },
          ip: req.headers["x-forwarded-for"] || req.ip,
          status: "failed",
        });
      } catch (auditErr) {
        console.error("Audit insert error (not verified):", auditErr);
      }

      return res.render("auth/login", { error: "Please verify your email before logging in.", email });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      console.log("[login] bad password for userId=", user.id);
      // Audit: bad password attempt
      try {
        console.log("[login] about to insert audit: login_failed (bad_password) userId=", user.id);
        await insertAudit({
          actor_type: "user",
          actor_id: user.id,
          actor_name: user.name || user.email,
          action: "login_failed",
          resource: "auth",
          details: { reason: "bad_password", email_attempted: email },
          ip: req.headers["x-forwarded-for"] || req.ip,
          status: "failed",
        });
      } catch (auditErr) {
        console.error("Audit insert error (bad password):", auditErr);
      }

      return res.render("auth/login", { error: "Invalid email or password.", email });
    }

    // Successful login -> create session
    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      auth_provider: user.auth_provider
    };

    // Audit: successful login
    try {
      console.log("[login] about to insert audit: login success userId=", user.id);
      await insertAudit({
        actor_type: "user",
        actor_id: user.id,
        actor_name: user.name || user.email,
        action: "login",
        resource: "auth",
        details: { method: "local" },
        ip: req.headers["x-forwarded-for"] || req.ip,
        status: "success",
      });
      console.log("[login] audit inserted for login success userId=", user.id);
    } catch (auditErr) {
      // do NOT block login if audit fails
      console.error("Audit insert error (login success):", auditErr);
    }

    delete req.session.pendingEmail; // cleanup
    return res.redirect("/");
  } catch (err) {
    console.error(err);

    // Audit: unexpected error during login flow
    try {
      console.log("[login] about to insert audit: login_error", { email, err: err.message });
      await insertAudit({
        actor_type: "user",
        actor_id: null,
        actor_name: email || null,
        action: "login_error",
        resource: "auth",
        details: { error: err.message || String(err) },
        ip: req.headers["x-forwarded-for"] || req.ip,
        status: "failed",
      });
    } catch (auditErr) {
      console.error("Audit insert error (login catch):", auditErr);
    }

    return res.render("auth/login", { error: "Something went wrong. Please try again.", email });
  }
};

// Logout Handler
export const logoutUser = async (req, res) => {
  const actor = req.session?.user || null;
  const ip = req.headers["x-forwarded-for"] || req.ip;

  console.log("[logout] logoutUser called for actor=", actor);

  // await audit to ensure it reaches DB before session destroyed (safer)
  try {
    console.log("[logout] about to insert audit: logout for actor=", actor);
    await insertAudit({
      actor_type: actor ? "user" : "guest",
      actor_id: actor ? actor.id : null,
      actor_name: actor ? (actor.name || actor.email) : null,
      action: "logout",
      resource: "auth",
      details: null,
      ip,
      status: "success",
    });
    console.log("[logout] audit inserted for logout");
  } catch (auditErr) {
    console.error("Audit insert error (logout):", auditErr);
  }

  req.session.destroy((err) => {
    if (err) console.error(err);
    res.redirect("/");
  });
};
