// src/controller/adminSellersController.js
import db from "../database/db.js";
import nodemailer from "nodemailer";

// reuse your signup transporter style
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

/* =========== helpers =========== */
async function autoLiftExpiredSellerSuspensions() {
  await db.query(
    `UPDATE sellers
        SET status='approved',
            suspension_title=NULL,
            suspension_reason=NULL,
            suspension_at=NULL,
            suspension_lifted_at=NULL,
            updated_at=NOW()
      WHERE status='suspended'
        AND suspension_lifted_at IS NOT NULL
        AND suspension_lifted_at <= NOW()`
  );
}

async function emailSeller(to, subject, html) {
  if (!to) return;
  try {
    await transporter.sendMail({ to, subject, html });
  } catch (e) {
    // don't block admin UI on email errors
    console.error("Seller email send error:", e);
  }
}

/* =========== pages =========== */
export const renderSellers = async (req, res) => {
  try {
    await autoLiftExpiredSellerSuspensions();

    const pending = await db.query(`
      SELECT s.*, u.email AS user_email, u.name AS owner_name
        FROM sellers s
        JOIN users u ON s.user_id = u.id
       WHERE s.status = 'pending'
       ORDER BY s.created_at DESC
    `);
    const active = await db.query(`
      SELECT s.*, u.email AS user_email, u.name AS owner_name
        FROM sellers s
        JOIN users u ON s.user_id = u.id
       WHERE s.status = 'approved'
       ORDER BY s.created_at DESC
    `);
    const suspended = await db.query(`
      SELECT s.*, u.email AS user_email, u.name AS owner_name
        FROM sellers s
        JOIN users u ON s.user_id = u.id
       WHERE s.status = 'suspended'
       ORDER BY s.created_at DESC
    `);

    res.render("admin/adminSellers", {
      activePage: "sellers",
      pageTitle: "Sellers Management",
      pendingSellers: pending.rows,
      activeSellers: active.rows,
      suspendedSellers: suspended.rows,
      toast: req.session.toast || null,
    });
    delete req.session.toast;
  } catch (err) {
    console.error("Error fetching sellers:", err);
    res.status(500).send("Error fetching sellers");
  }
};

/* =========== approve / reject =========== */
export const approveSeller = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query(
      "UPDATE sellers SET status='approved', updated_at=NOW() WHERE id=$1",
      [id]
    );
    req.session.toast = { type: "success", message: "Seller approved successfully." };
    res.redirect("/admin/sellers");
  } catch (err) {
    console.error("Error approving seller:", err);
    req.session.toast = { type: "danger", message: "Error approving seller." };
    res.redirect("/admin/sellers");
  }
};

// NEW: Reject + (optional) email owner
export const rejectSeller = async (req, res) => {
  const { id } = req.params;
  const { send_email, email_subject, email_body } = req.body;

  try {
    // Update status to rejected
    const { rows } = await db.query(
      `UPDATE sellers
          SET status='rejected', updated_at=NOW()
        WHERE id=$1
      RETURNING store_name, user_id`,
      [id]
    );

    if (!rows.length) {
      req.session.toast = { type: "danger", message: "Seller not found." };
      return res.redirect("/admin/sellers");
    }

    const { store_name, user_id } = rows[0];

    // Optionally email the owner
    if (send_email === "on" || (email_subject && email_body)) {
      const u = await db.query(
        "SELECT name, email FROM users WHERE id=$1 LIMIT 1",
        [user_id]
      );
      const owner = u.rows[0];

      const subject =
        email_subject?.trim() || `Your seller application was rejected — ${store_name}`;
      const body = (email_body || "")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br>");

      await emailSeller(
        owner?.email,
        subject,
        `
        <div style="font-family:Arial,sans-serif;line-height:1.6">
          <h2>Seller Application Rejected</h2>
          <p>Hi ${owner?.name || "Seller"},</p>
          <p>We’re sorry, but your application for <strong>${store_name}</strong> was rejected.</p>
          ${body ? `<p>${body}</p>` : ""}
          <p>You may revise and re-apply anytime.</p>
          <p>— TECHORA Team</p>
        </div>`
      );
    }

    req.session.toast = { type: "danger", message: "Seller application rejected." };
    res.redirect("/admin/sellers");
  } catch (err) {
    console.error("Error rejecting seller:", err);
    req.session.toast = { type: "danger", message: "Error rejecting seller." };
    res.redirect("/admin/sellers");
  }
};

/* =========== suspend / lift / edit =========== */
export const suspendSeller = async (req, res) => {
  const { id } = req.params;
  const { suspension_title, suspension_reason, end_date, permanent } = req.body;

  try {
    const { rows } = await db.query(
      `SELECT s.store_name, u.email AS user_email, u.name AS owner_name
         FROM sellers s
         JOIN users u ON u.id = s.user_id
        WHERE s.id = $1`,
      [id]
    );
    if (!rows.length) {
      req.session.toast = { type: "danger", message: "Seller not found." };
      return res.redirect("/admin/sellers");
    }
    const { store_name, user_email, owner_name } = rows[0];

    const liftedAt =
      permanent === "on" || permanent === true || permanent === "true"
        ? null
        : end_date
        ? new Date(end_date)
        : null;

    await db.query(
      `UPDATE sellers
          SET status='suspended',
              suspension_title=$1,
              suspension_reason=$2,
              suspension_at=NOW(),
              suspension_lifted_at=$3,
              updated_at=NOW()
        WHERE id=$4`,
      [suspension_title || "Account Suspended", suspension_reason || null, liftedAt, id]
    );

    await emailSeller(
      user_email,
      `Store Suspension — ${store_name}`,
      `
      <div style="font-family:Arial,sans-serif;line-height:1.6">
        <h2>Store Suspension Notice</h2>
        <p>Hi ${owner_name || "Seller"},</p>
        <p>Your store <strong>${store_name}</strong> has been suspended.</p>
        <p><strong>Title:</strong> ${suspension_title || "Account Suspended"}</p>
        ${
          suspension_reason
            ? `<p><strong>Reason:</strong><br>${String(suspension_reason)
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/\n/g, "<br>")}</p>`
            : ""
        }
        ${
          liftedAt
            ? `<p><strong>Suspension ends:</strong> ${new Date(liftedAt).toLocaleString()}</p>`
            : `<p><strong>Type:</strong> Permanent until lifted by an administrator.</p>`
        }
        <p>If you have questions, please reply to this email.</p>
        <p>— TECHORA Team</p>
      </div>`
    );

    req.session.toast = { type: "warning", message: "Seller suspended." };
    res.redirect("/admin/sellers");
  } catch (err) {
    console.error("Error suspending seller:", err);
    req.session.toast = { type: "danger", message: "Error suspending seller." };
    res.redirect("/admin/sellers");
  }
};

export const unsuspendSeller = async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await db.query(
      `UPDATE sellers
          SET status='approved',
              suspension_title=NULL,
              suspension_reason=NULL,
              suspension_at=NULL,
              suspension_lifted_at=NULL,
              updated_at=NOW()
        WHERE id=$1
      RETURNING (SELECT u.email FROM users u WHERE u.id = sellers.user_id) AS user_email,
                (SELECT u.name  FROM users u WHERE u.id = sellers.user_id) AS owner_name,
                store_name`,
      [id]
    );

    const r = rows?.[0];
    await emailSeller(
      r?.user_email,
      `Store Unsuspended — ${r?.store_name || ""}`,
      `
      <div style="font-family:Arial,sans-serif;line-height:1.6">
        <h2>Store Unsuspended</h2>
        <p>Hello ${r?.owner_name || "Seller"}, your store <strong>${r?.store_name || ""}</strong> has been reactivated and can operate normally again.</p>
        <p>— TECHORA Team</p>
      </div>`
    );

    req.session.toast = { type: "success", message: "Seller unsuspended." };
    res.redirect("/admin/sellers");
  } catch (err) {
    console.error("Error unsuspending seller:", err);
    req.session.toast = { type: "danger", message: "Error unsuspending seller." };
    res.redirect("/admin/sellers");
  }
};

export const updateSeller = async (req, res) => {
  const { id } = req.params;
  const {
    store_name,
    business_address,
    category,
    store_email,
    contact_number,
    description,
  } = req.body;

  try {
    await db.query(
      `UPDATE sellers
          SET store_name=$1,
              business_address=$2,
              category=$3,
              store_email=$4,
              contact_number=$5,
              description=$6,
              updated_at=NOW()
        WHERE id=$7`,
      [
        store_name?.trim() || null,
        business_address?.trim() || null,
        category?.trim() || null,
        store_email?.trim() || null,
        contact_number?.trim() || null,
        description?.trim() || null,
        id,
      ]
    );
    req.session.toast = { type: "success", message: "Seller details updated." };
    res.redirect("/admin/sellers");
  } catch (err) {
    console.error("Error updating seller:", err);
    req.session.toast = { type: "danger", message: "Error updating seller." };
    res.redirect("/admin/sellers");
  }
};
