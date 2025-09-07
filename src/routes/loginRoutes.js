import express from "express";
import { loginUser, logoutUser } from "../controller/loginController.js";

const router = express.Router();

// Login Page
router.get("/login", (req, res) => {
  res.render("auth/login");
});

// Login Post
router.post("/login", loginUser);

// Logout
router.get("/logout", logoutUser);

//Es module export
export default router;