// controllers/loginVerifyController.js
import db from "../database/db.js";

export const loginVerify = async (req, res) => {
  const { email } = req.body;

  try {
    // 1. Find the user
    const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);

    if (result.rows.length === 0) {
      return res.render("auth/loginVerify", {
        error: "No account found with that email."
      });
    }

    const user = result.rows[0];

    // 2. Check provider
    if (user.auth_provider === "local") {
      // Save email in session so /login knows who
      req.session.pendingEmail = email;

      // Redirect to /login where password will be asked
      return res.redirect("/login");
    }

    if (user.auth_provider === "google") {
      // Redirect to Google OAuth
      return res.redirect("/auth/google");
    }

    // Fallback if something unexpected
    return res.render("auth/loginVerify", {
      error: "Unsupported login provider. Please try again."
    });
  } catch (err) {
    console.error("Login verify error:", err);
    res.render("auth/loginVerify", {
      error: "Something went wrong. Please try again."
    });
  }
};
