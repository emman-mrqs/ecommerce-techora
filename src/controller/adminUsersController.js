// adminUsersController.js
import db from "../database/db.js";
import nodemailer from "nodemailer";

/* ===========================
   Nodemailer (same setup as signup)
   =========================== */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendMail(to, subject, html) {
  try {
    await transporter.sendMail({
      from: `"TECHORA" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error("✉️ Email send error:", err);
  }
}

/* ===========================
   Render Users (auto-lift expired)
   =========================== */
export const renderUsers = async (req, res) => {
  try {
    // Auto-lift any suspension that reached its end date
    await db.query(`
      UPDATE users
         SET is_suspended = false,
             suspension_title = NULL,
             suspension_reason = NULL,
             suspended_until = NULL,
             suspension_lifted_at = NOW(),
             updated_at = NOW()
       WHERE is_suspended = true
         AND suspended_until IS NOT NULL
         AND suspended_until <= NOW();
    `);

    const result = await db.query(`
      SELECT id, name, email, is_verified,
             is_suspended, suspension_title, suspension_reason,
             suspended_until, suspended_at
        FROM users
       ORDER BY created_at DESC
    `);

    // Keep the "Active/Suspended" labeling your EJS expects,
    // but now it comes from is_suspended (not is_verified).
    const users = result.rows.map(user => ({
      ...user,
      status: user.is_suspended ? "Suspended" : "Active",
    }));

    const toast = req.session.toast || null;
    req.session.toast = null;

    res.render("admin/adminUsers", {
      activePage: "users",
      pageTitle: "Users Management",
      users,
      toast,
    });
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).send("Error fetching users");
  }
};

/* ===========================
   Suspend / Update Suspension
   - POST /admin/users/:id/suspend
   - body: { title, reason, mode: 'permanent'|'until', endDate?: 'YYYY-MM-DD' }
   =========================== */
export const suspendUser = async (req, res) => {
  const { id } = req.params;
  const { title, reason, mode, endDate } = req.body;

  if (!title || !reason || !mode) {
    req.session.toast = { type: "danger", message: "Missing suspension details." };
    return res.redirect("/admin/users");
  }

  try {
    const ures = await db.query(`SELECT id, email, name FROM users WHERE id = $1`, [id]);
    if (!ures.rowCount) {
      req.session.toast = { type: "danger", message: "User not found." };
      return res.redirect("/admin/users");
    }
    const user = ures.rows[0];

    let until = null;
    if (mode === "until") {
      if (!endDate) {
        req.session.toast = { type: "danger", message: "Please provide a suspension end date." };
        return res.redirect("/admin/users");
      }
      const dt = new Date(endDate);
      if (isNaN(dt.getTime())) {
        req.session.toast = { type: "danger", message: "Invalid date." };
        return res.redirect("/admin/users");
      }
      // set time to 23:59:59 for that day, common admin UX
      dt.setHours(23, 59, 59, 999);
      until = dt;
    }

    // Create or update suspension
    await db.query(
      `
      UPDATE users
         SET is_suspended = true,
             suspension_title = $1,
             suspension_reason = $2,
             suspended_until = $3,                 -- null => permanent
             suspended_at = COALESCE(suspended_at, NOW()),
             suspension_lifted_at = NULL,
             updated_at = NOW()
       WHERE id = $4
      `,
      [title, reason, until, id]
    );

    // Email user
    const untilText = until
      ? `Suspension end date: <b>${until.toDateString()}</b>`
      : `<b>Permanent suspension</b>`;

    await sendMail(
      user.email,
      `Account Suspension - ${title}`,
      `
        <div style="font-family:Arial,sans-serif;line-height:1.6">
          <h2>Account Suspension</h2>
          <p>Hi ${user.name || ""},</p>
          <p>Your account has been suspended.</p>
          <p><b>Title:</b> ${title}</p>
          <p><b>Reason:</b><br>${reason.replace(/\n/g, "<br>")}</p>
          <p>${untilText}</p>
          <p>If you believe this is a mistake, please contact support.</p>
          <p>— TECHORA</p>
        </div>
      `
    );

    req.session.toast = { type: "warning", message: "User suspended/updated successfully." };
    res.redirect("/admin/users");
  } catch (err) {
    console.error("Error suspending user:", err);
    req.session.toast = { type: "danger", message: "Error suspending user." };
    res.redirect("/admin/users");
  }
};

/* ===========================
   Manually Lift Suspension (NOW)
   - POST /admin/users/:id/lift-suspension
   =========================== */
export const liftSuspension = async (req, res) => {
  const { id } = req.params;
  try {
    const ures = await db.query(`SELECT id, email, name FROM users WHERE id = $1`, [id]);
    if (!ures.rowCount) {
      req.session.toast = { type: "danger", message: "User not found." };
      return res.redirect("/admin/users");
    }
    const user = ures.rows[0];

    await db.query(
      `
      UPDATE users
         SET is_suspended = false,
             suspension_title = NULL,
             suspension_reason = NULL,
             suspended_until = NULL,
             suspension_lifted_at = NOW(),
             updated_at = NOW()
       WHERE id = $1
      `,
      [id]
    );

    await sendMail(
      user.email,
      "Suspension Lifted",
      `
        <div style="font-family:Arial,sans-serif;line-height:1.6">
          <h2>Suspension Lifted</h2>
          <p>Hi ${user.name || ""},</p>
          <p>Your account suspension has been lifted. You can now access your account again.</p>
          <p>— TECHORA</p>
        </div>
      `
    );

    req.session.toast = { type: "success", message: "Suspension lifted." };
    res.redirect("/admin/users");
  } catch (err) {
    console.error("Error lifting suspension:", err);
    req.session.toast = { type: "danger", message: "Error lifting suspension." };
    res.redirect("/admin/users");
  }
};

/* ===========================
   Keep your other functions (unchanged behavior)
   =========================== */

// Activate user (kept same behavior: toggles is_verified only)
export const activateUser = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query("UPDATE users SET is_verified = true, updated_at = NOW() WHERE id = $1", [id]);
    req.session.toast = { type: "success", message: "User activated successfully." };
    res.redirect("/admin/users");
  } catch (err) {
    console.error("Error activating user:", err);
    req.session.toast = { type: "danger", message: "Error activating user." };
    res.redirect("/admin/users");
  }
};

// Delete user (unchanged)
export const deleteUser = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query("DELETE FROM users WHERE id = $1", [id]);
    req.session.toast = { type: "danger", message: "User deleted successfully." };
    res.redirect("/admin/users");
  } catch (err) {
    console.error("Error deleting user:", err);
    req.session.toast = { type: "danger", message: "Error deleting user." };
    res.redirect("/admin/users");
  }
};

// Edit user name (unchanged)
export const editUser = async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  try {
    await db.query("UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2", [name, id]);
    req.session.toast = { type: "success", message: "User name updated successfully." };
    res.redirect("/admin/users");
  } catch (err) {
    console.error("Error updating user:", err);
    req.session.toast = { type: "danger", message: "Error updating user name." };
    res.redirect("/admin/users");
  }
};
