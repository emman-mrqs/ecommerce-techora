// controllers/loginController.js
import bcrypt from "bcrypt";
import db from "../database/db.js"; // your db connection (pg or sequelize etc.)

// Login Handler
export const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    // 1. Find user by email
    const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);

    if (result.rows.length === 0) {
      return res.render("auth/login", { error: "Invalid email or password." });
    }

    const user = result.rows[0];

    // 2. Check if verified
    if (!user.is_verified) {
      return res.render("auth/login", { error: "Please verify your email before logging in." });
    }

    // 3. Compare password
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.render("auth/login", { error: "Invalid email or password." });
    }

    // 4. Save session
    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
    };

    // 5. Redirect to dashboard or home
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.render("auth/login", { error: "Something went wrong. Please try again." });
  }
};

// Logout Handler
export const logoutUser = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error(err);
    }
    res.redirect("/");
  });
};

