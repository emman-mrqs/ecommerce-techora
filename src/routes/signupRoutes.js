import express from "express";
const router = express.Router();
import { signupUser, resendCode } from "../controller/signupController.js";

//sign up
router.get("/signup", (req, res) => {
    res.render("auth/signup");
});

router.post("/signup", signupUser);
router.post("/resend-code", resendCode);


//Es module export
export default router;