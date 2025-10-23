// controllers/signupController.js
import db from "../database/db.js";
import bcrypt from "bcrypt";
import nodemailer from "nodemailer";
import crypto from "crypto";
import { insertAudit } from "../utils/audit.js"; // audit helper

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// sign up
export const signupUser = async (req, res) => {
  const { name, email, password } = req.body;
  const ip = req.headers["x-forwarded-for"] || req.ip;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    // generate new code + expiry
    const code = crypto.randomInt(100000, 1000000);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // check if user exists
    const existing = await db.query("SELECT * FROM users WHERE email = $1", [email]);

    let actionType = "signup"; // default action for audit
    if (existing.rows.length > 0) {
      actionType = "signup_update";
      if (existing.rows[0].is_verified) {
        // already verified → block duplicate signup
        return res.status(400).render('auth/signup', {
          message: "Email already registered and verified.",
        });
      } else {
        // not verified → update their record with new code, password, etc.
        await db.query(
          `UPDATE users
            SET name = $1,
                password = $2,
                verification_code = $3,
                verification_expires = $4,
                is_verified = false
            WHERE email = $5`,
          [name, hashedPassword, code, expiresAt, email]
        );
      }
    } else {
      // new user → insert fresh record
      await db.query(
        `INSERT INTO users (name, email, password, is_verified, verification_code, verification_expires, auth_provider)
          VALUES ($1, $2, $3, false, $4, $5, 'local')`,
        [name, email, hashedPassword, code, expiresAt]
      );
      actionType = "signup";
    }

    // Send verification email
    await transporter.sendMail({
      to: email,
      subject: "Your Verification Code for Techora",
      html: `
        <div style="font-family: Arial, sans-serif; line-height:1.5;">
          <h2>Verify your email</h2>
          <p>Hello ${name},</p>
          <p>Use the following verification code to complete your signup:</p>
          <h1 style="letter-spacing: 5px; color:#2c3e50;">${code}</h1>
          <p>This code will expire in 5 minutes.</p>
          <p>If you did not request this, you can safely ignore this email.</p>
          <br>
          <p>— Techora Team</p>
        </div>
      `
    });

    // Audit: record signup or updated signup (do not block on error)
    try {
      await insertAudit({
        actor_type: "user",
        actor_id: null,
        actor_name: email,
        action: actionType, // 'signup' or 'signup_update'
        resource: "auth",
        details: { email, method: "local", verification_expires: expiresAt.toISOString() },
        ip,
        status: "success",
      });
    } catch (auditErr) {
      console.error("Audit insert error (signup):", auditErr);
    }

    // set verification cookie
    res.cookie("verifyEmail", email, {
      httpOnly: true,
      secure: true,
      maxAge: 5 * 60 * 1000,
      sameSite: "strict",
    });

    res.redirect("/verify");
  } catch (err) {
    console.error(err);

    // Audit unexpected signup error (best-effort)
    try {
      await insertAudit({
        actor_type: "user",
        actor_id: null,
        actor_name: email || null,
        action: "signup_error",
        resource: "auth",
        details: { error: err.message || String(err) },
        ip,
        status: "failed",
      });
    } catch (auditErr) {
      console.error("Audit insert error (signup catch):", auditErr);
    }

    res.status(500).send("Something went wrong");
  }
};

// resend code
export const resendCode = async (req, res) => {
  const email = req.cookies.verifyEmail; // get from cookie
  const ip = req.headers["x-forwarded-for"] || req.ip;

  if (!email) {
    return res.status(400).json({ success: false, message: "Session expired. Please sign up again." });
  }

  try {
    const code = crypto.randomInt(100000, 1000000);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Update user with new code + expiry
    await db.query(
      "UPDATE users SET verification_code = $1, verification_expires = $2 WHERE email = $3",
      [code, expiresAt, email]
    );

    // Send email again
    await transporter.sendMail({
      to: email,
      subject: "Your New Verification Code for Techora",
      html: `
        <div style="font-family: Arial, sans-serif; line-height:1.5;">
          <h2>New Verification Code</h2>
          <p>Hello,</p>
          <p>Here is your new verification code:</p>
          <h1 style="letter-spacing: 5px; color:#2c3e50;">${code}</h1>
          <p>This code will expire in 5 minutes.</p>
          <p>— Techora Team</p>
        </div>
      `
    });

    // Audit: resend verification code
    try {
      await insertAudit({
        actor_type: "user",
        actor_id: null,
        actor_name: email,
        action: "verification_resend",
        resource: "auth",
        details: { email, verification_expires: expiresAt.toISOString() },
        ip,
        status: "success",
      });
    } catch (auditErr) {
      console.error("Audit insert error (resendCode):", auditErr);
    }

    res.json({ success: true, message: "New code sent to your email." });
  } catch (err) {
    console.error(err);

    // Audit resend error (best-effort)
    try {
      await insertAudit({
        actor_type: "user",
        actor_id: null,
        actor_name: email,
        action: "verification_resend_error",
        resource: "auth",
        details: { error: err.message || String(err) },
        ip,
        status: "failed",
      });
    } catch (auditErr) {
      console.error("Audit insert error (resendCode catch):", auditErr);
    }

    res.status(500).json({ success: false, message: "Error resending code." });
  }
};
