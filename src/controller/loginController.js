// controllers/loginController.js
import bcrypt from "bcrypt";
import db from "../database/db.js"; // your db connection (pg or sequelize etc.)

// Login Handler
export const loginUser = async (req, res) => {
  const email = req.session.pendingEmail || req.body.email;
  const { password } = req.body;

  try {
    const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);

    if (result.rows.length === 0) {
      return res.render("auth/login", { error: "Invalid email or password.", email });
    }

    const user = result.rows[0];

    if (user.auth_provider !== "local") {
      return res.render("auth/login", { error: "This account uses Google Sign-In.", email });
    }

    if (!user.is_verified) {
      return res.render("auth/login", { error: "Please verify your email before logging in.", email });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.render("auth/login", { error: "Invalid email or password.", email });
    }

    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
    };

    delete req.session.pendingEmail; // cleanup
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.render("auth/login", { error: "Something went wrong. Please try again.", email });
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

