import express from "express";
const router = express.Router();
import {verifyUser } from "../controller/verifyController.js";


//Verify
router.get("/verify", (req, res) => {
  const email = req.cookies.verifyEmail;
  if (!email) {
    return res.redirect("/signup"); // or show error page
  }
  res.render("auth/verify");
});

router.post("/verify", verifyUser);

//Es module export
export default router;