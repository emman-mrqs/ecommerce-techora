import express from "express";
const router = express.Router();
import { signupUser, resendCode } from "../controller/signupController.js";
import { redirectIfLoggedIn } from "../middleware/authMiddleware.js"; // ✅ Import the middleware

// Signup Page
router.get("/signup", redirectIfLoggedIn, (req, res) => {
  res.render("auth/signup");
});

// Signup Form Submission
router.post("/signup", redirectIfLoggedIn, signupUser);

// Resend Code (optional — still protected)
router.post("/resend-code", redirectIfLoggedIn, resendCode);

export default router;
