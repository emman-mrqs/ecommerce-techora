import express from "express";
import { loginUser, logoutUser } from "../controller/loginController.js";
import { redirectIfLoggedIn } from "../middleware/authMiddleware.js"; // <-- import it

const router = express.Router();

// Login Page
router.get("/login", redirectIfLoggedIn, (req, res) => {
  res.render("auth/login");
});

// Login Post
router.post("/login", loginUser);

// Logout
router.get("/logout", logoutUser);

export default router;
