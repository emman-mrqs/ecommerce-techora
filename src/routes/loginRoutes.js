import express from "express";
import { loginUser, logoutUser } from "../controller/loginController.js";
import { redirectIfLoggedIn } from "../middleware/authMiddleware.js"; // <-- import it
import { loginVerify } from "../controller/loginVerifyController.js";
import passport from "../config/passport.js";


const router = express.Router();

//LoginVerify
// Step 1: Show loginVerify page (GET)
router.get("/login-verify", redirectIfLoggedIn, (req, res) => {
  res.render("auth/loginVerify");
});

// Step 2: Handle email submission (POST)
router.post("/login-verify", redirectIfLoggedIn, loginVerify);

// Google OAuth entry point
router.get("/auth/google", (req, res, next) => {
  console.log("Google OAuth route hit!");
  next();
}, passport.authenticate("google", { scope: ["profile", "email"] }));


// Google OAuth callback
router.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login-verify" }),
  (req, res) => {
    // ✅ Save session like local login
    req.session.user = {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
    };
    res.redirect("/"); // Redirect to home (or profile/dashboard)
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
