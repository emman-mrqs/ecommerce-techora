// loginRoutes.js
import express from "express";
import { loginUser, logoutUser } from "../controller/loginController.js";
import { redirectIfLoggedIn } from "../middleware/authMiddleware.js";
import { loginVerify } from "../controller/loginVerifyController.js";
import passport from "../config/passport.js";
import db from "../database/db.js"; // <-- add this import

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
router.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login-verify" }),
  async (req, res) => {
    try {
      // req.user is set by passport strategy
      const { id } = req.user;

      // Re-check suspension from DB (DO NOT rely purely on profile payload)
      const result = await db.query(
        "SELECT id, name, email, is_suspended FROM users WHERE id = $1",
        [id]
      );

      const user = result.rows[0];
      if (!user) {
        // Very unlikely, but be defensive.
        // Force back to login-verify with a generic error.
        req.logout?.(() => {});
        return res.redirect("/login-verify");
      }

      if (user.is_suspended) {
        // Hard block OAuth logins for suspended users
        // Clear passport session user, show message
        req.logout?.(() => {});
        return res.render("auth/loginVerify", {
          error: "This account has been suspended. Please check your email for details."
        });
      }

      // Not suspended → create your app session (same as your current code)
      req.session.user = {
        id: user.id,
        name: user.name,
        email: user.email
      };

      return res.redirect("/");
    } catch (err) {
      console.error("Google callback post-auth error:", err);
      req.logout?.(() => {});
      return res.redirect("/login-verify");
    }
  }
);

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
