// src/controller/contactController.js
import db from "../database/db.js";
import transporter from "../utils/mailer.js";
import { insertAudit } from "../utils/audit.js";
import fetch from "node-fetch"; // to verify reCAPTCHA server-side

// ---------- tiny sanitizer (no external deps) ----------
function sanitize(input, max = 5000) {
  const s = String(input ?? "");
  const noTags = s.replace(/<[^>]*>/g, ""); // strip HTML tags
  const noCtrl = noTags.replace(/[\u0000-\u001F\u007F]/g, ""); // strip control chars
  return noCtrl.trim().slice(0, max);
}

// ---------- read CMS row + map to view ----------
async function readContactRow() {
  const { rows } = await db.query("SELECT * FROM contact_content WHERE id = 1");
  return rows[0] || null;
}
function toContactView(row) {
  return {
    hero_title:       row?.hero_title       || "Contact Techora",
    hero_subtitle:    row?.hero_subtitle    || "Questions, feedback, or partnership ideas? We’d love to hear from you.",
    email:            row?.email            || "techora.team@gmail.com",
    website_label:    row?.website_label    || "ecommerce-techora.onrender.com",
    website_url:      row?.website_url      || "https://ecommerce-techora.onrender.com/",
    support_hours:    row?.support_hours    || "Mon–Sat, 9:00–18:00 (PH)",
    seller_cta_title: row?.seller_cta_title || "Become a Seller",
    seller_cta_text:  row?.seller_cta_text  || "Have great gadgets or accessories? Join Techora and sell to thousands of shoppers.",
    map_iframe_src:   row?.map_iframe_src   || "https://maps.google.com/maps?q=Philippines&t=k&z=5&output=embed",
    checklist: Array.isArray(row?.checklist)
      ? row.checklist
      : ["Secure & private", "Fast payouts", "Seller analytics"],
  };
}

// ---------- small in-memory IP rate-limit (configurable) ----------
// Adjust cooldown as you like; set to 0 to effectively disable.
const COOLDOWN_MS = 5_000;

// Persist across hot-reloads so we don't re-declare a new Map each time
const bucket = (globalThis.__contactLastHit ||= new Map());

function parseClientIp(req) {
  const xff = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return xff || req.ip || req.connection?.remoteAddress || "unknown";
}

function isRateLimited(ip) {
  if (COOLDOWN_MS <= 0) return false;
  const now = Date.now();
  const last = bucket.get(ip) || 0;
  if (now - last < COOLDOWN_MS) return true;
  bucket.set(ip, now);
  // auto-clean to avoid unbounded Map growth
  setTimeout(() => bucket.delete(ip), COOLDOWN_MS * 2).unref?.();
  return false;
}

/* ================== PUBLIC PAGE RENDER ================== */
export async function renderContactPage(req, res) {
  try {
    const row = await readContactRow();
    res.render("user/contact", {
      contact: toContactView(row),
      siteKey: process.env.RECAPTCHA_SITE_KEY,
    });
  } catch (e) {
    console.error("Contact page render error:", e);
    res.render("user/contact", {
      contact: toContactView(null),
      siteKey: process.env.RECAPTCHA_SITE_KEY,
    });
  }
}

/* ========== FORM SUBMIT: send emails via Nodemailer + reCAPTCHA ========== */
export const submitContact = async (req, res) => {
  const ip = parseClientIp(req);

  try {
    if (isRateLimited(ip)) {
      return res.status(429).json({ ok: false, error: "Please wait a moment before sending again." });
    }

    const { name, email, subject, message, token } = req.body || {};

    // Basic validation
    if (!name || !email || !subject || !message || !token) {
      return res.status(400).json({ ok: false, error: "Missing fields or captcha token." });
    }

    // --- Verify Google reCAPTCHA ---
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    const verifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${token}&remoteip=${encodeURIComponent(ip)}`;

    const googleRes = await fetch(verifyUrl, { method: "POST" });
    const data = await googleRes.json();

    if (!data.success) {
      console.warn("reCAPTCHA failed:", data["error-codes"]);
      return res.status(403).json({ ok: false, error: "Captcha verification failed." });
    }

    // Email format validation
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      return res.status(400).json({ ok: false, error: "Invalid email address" });
    }

    // Sanitize inputs
    const clean = {
      name:    sanitize(name, 120),
      email:   sanitize(email, 180),
      subject: sanitize(subject, 180),
      message: sanitize(message, 5000),
    };

    // Resolve destination for internal notification
    let CONTACT_TO = process.env.CONTACT_TO;
    if (!CONTACT_TO) {
      const row = await readContactRow();
      CONTACT_TO = row?.email || process.env.EMAIL_USER || "techora.team@gmail.com";
    }

    if (!process.env.EMAIL_USER) {
      return res.status(500).json({ ok: false, error: "Email sender not configured" });
    }

    // Email contents
    const htmlToTeam = `
      <div style="font-family:Arial,sans-serif;line-height:1.55">
        <h2 style="margin:0 0 12px">New Contact Message</h2>
        <p style="margin:0 0 6px"><strong>Name:</strong> ${clean.name}</p>
        <p style="margin:0 0 6px"><strong>Email:</strong> ${clean.email}</p>
        <p style="margin:12px 0 6px"><strong>Message:</strong></p>
        <div style="white-space:pre-wrap;border-left:4px solid #eee;padding:10px">${clean.message}</div>
        <hr style="margin:16px 0"/>
        <p style="color:#666;font-size:12px;margin:0">IP: ${ip}</p>
      </div>
    `;
    const textToTeam =
      `New Contact Message\n` +
      `Name: ${clean.name}\n` +
      `Email: ${clean.email}\n\n` +
      `Message:\n${clean.message}\n\n` +
      `IP: ${ip}\n`;

    const htmlAutoReply = `
      <div style="font-family:Arial,sans-serif;line-height:1.5">
        <h2>Thanks for contacting Techora!</h2>
        <p>Hi ${clean.name},</p>
        <p>We received your message with the subject: <strong>${clean.subject}</strong>.</p>
        <p>Our support hours are <strong>Mon–Sat, 9:00–18:00 (PH)</strong>. We’ll get back to you soon.</p>
        <hr/>
        <p style="color:#666;font-size:12px">If you didn’t send this, you can ignore this email.</p>
        <p>— Techora Support</p>
      </div>
    `;
    const textAutoReply =
      `Thanks for contacting Techora!\n\n` +
      `Hi ${clean.name},\n` +
      `We received your message with the subject: "${clean.subject}".\n` +
      `Our support hours are Mon–Sat, 9:00–18:00 (PH). We’ll get back to you soon.\n\n— Techora Support`;

    // Send both emails
    await Promise.all([
      transporter.sendMail({
        to: CONTACT_TO,
        from: process.env.EMAIL_USER,
        replyTo: clean.email,
        subject: `TECHORA CONTACT: ${clean.subject}`,
        html: htmlToTeam,
        text: textToTeam,
      }),
      transporter.sendMail({
        to: clean.email,
        from: process.env.EMAIL_USER,
        subject: "We received your message — Techora",
        html: htmlAutoReply,
        text: textAutoReply,
      }),
    ]);

    // Optional: audit
    try {
      await insertAudit({
        actor_type: "public",
        actor_id: null,
        actor_name: clean.email,
        action: "contact_submit",
        resource: "contact",
        details: { subject: clean.subject },
        ip,
        status: "success",
      });
    } catch (auditErr) {
      console.error("Audit insert error (contact):", auditErr);
    }

    return res.json({ ok: true, message: "Message sent successfully." });
  } catch (err) {
    console.error("Contact error:", err);
    try {
      await insertAudit({
        actor_type: "public",
        actor_id: null,
        actor_name: null,
        action: "contact_error",
        resource: "contact",
        details: { error: err.message || String(err) },
        ip,
        status: "failed",
      });
    } catch {}
    return res.status(500).json({ ok: false, error: "Server error" });
  }
};
