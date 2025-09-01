import express from "express";
const router = express.Router();
import { signupUser, verifyUser, resendCode } from "../controller/authController.js";

//login
router.get("/login", (req, res) => {
    res.render("auth/login");
});

//sign up
router.get("/signup", (req, res) => {
    res.render("auth/signup");
});

//Verify
router.get("/verify", (req, res) => {
  const email = req.cookies.verifyEmail;
  if (!email) {
    return res.redirect("/signup"); // or show error page
  }
  res.render("auth/verify");
});

router.post("/signup", signupUser);
router.post("/verify", verifyUser);
router.post("/resend-code", resendCode);


//Es module export
export default router;