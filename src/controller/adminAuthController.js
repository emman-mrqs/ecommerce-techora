// src/controller/adminAuthController.js
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export const renderAdminLogin = (req, res) => {
  const pathToken = req.params.token;
  if (!pathToken || pathToken !== process.env.ADMIN_LOGIN_TOKEN) {
    return res.status(404).send("Not Found");
  }

  // If already logged in, skip to /admin
  const tok = req.cookies?.admin_token;
  if (tok) {
    try {
      jwt.verify(tok, process.env.ADMIN_JWT_SECRET);
      return res.redirect("/admin");
    } catch {}
  }

  res.render("auth/adminLogin", {
    error: null,
    email: process.env.ADMIN_EMAIL || "",
    loginToken: process.env.ADMIN_LOGIN_TOKEN
  });
};

export const adminLogin = async (req, res) => {
  const pathToken = req.params.token;
  if (!pathToken || pathToken !== process.env.ADMIN_LOGIN_TOKEN) {
    return res.status(404).send("Not Found");
  }

  const { email, password } = req.body || {};
  const expectedEmail = process.env.ADMIN_EMAIL || "";
  const hash = process.env.ADMIN_PASSWORD_HASH || "";
  const plain = process.env.ADMIN_PASSWORD || "";

  if (!email || !password) {
    return res.status(400).render("auth/adminLogin", {
      error: "Email and password are required.",
      email: expectedEmail,
      loginToken: process.env.ADMIN_LOGIN_TOKEN
    });
  }

  if (email !== expectedEmail) {
    return res.status(401).render("auth/adminLogin", {
      error: "Invalid credentials.",
      email: expectedEmail,
      loginToken: process.env.ADMIN_LOGIN_TOKEN
    });
  }

  let ok = false;
  if (hash) ok = await bcrypt.compare(password, hash);
  else if (plain) ok = password === plain;

  if (!ok) {
    return res.status(401).render("auth/adminLogin", {
      error: "Invalid credentials.",
      email: expectedEmail,
      loginToken: process.env.ADMIN_LOGIN_TOKEN
    });
  }

  const token = jwt.sign(
    { role: "admin", email },
    process.env.ADMIN_JWT_SECRET,
    { expiresIn: process.env.ADMIN_JWT_EXPIRES || "2h", issuer: "techora" }
  );

  // ⬇⬇ IMPORTANT: scope cookie to /admin so it never leaks to public pages
  res.cookie("admin_token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production", // set true on HTTPS
    path: "/admin",                                // <<< key change
    maxAge: 1000 * 60 * 60 * 2
  });

  return res.redirect("/admin");
};

export const adminLogout = (req, res) => {
  // Clear with the SAME path you set it
  res.clearCookie("admin_token", { path: "/admin" });
  return res.redirect(`/admin/login/${process.env.ADMIN_LOGIN_TOKEN}`);
};
