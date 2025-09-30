// src/controller/contactController.js
export const submitContact = async (req, res) => {
  try {
    const { name, email, subject, message } = req.body || {};
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ ok: false, error: "Missing fields" });
    }

    // === Optional Nodemailer (enable when ready) ===
    // import nodemailer from "nodemailer";
    // const transporter = nodemailer.createTransport({
    //   host: process.env.SMTP_HOST,
    //   port: Number(process.env.SMTP_PORT || 587),
    //   secure: false,
    //   auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    // });
    // await transporter.sendMail({
    //   from: `"Techora Contact" <${process.env.SMTP_FROM || "no-reply@techora"}>`,
    //   to: "techora.team@gmail.com",
    //   subject: `[Contact] ${subject}`,
    //   text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
    // });

    console.log("[Contact] ", { name, email, subject, message });
    return res.json({ ok: true });
  } catch (err) {
    console.error("Contact error:", err);
    return res.status(500).json({ ok: false });
  }
};
