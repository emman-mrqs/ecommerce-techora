// src/controller/adminSettingsController.js
import db from "../database/db.js";
import fs from "fs/promises";
import path from "path";
import { invalidateSiteSettingsCache } from "../middleware/siteSettings.js";

/* ---------- utils ---------- */
function asBool(v) {
  if (typeof v === "boolean") return v;
  if (v == null) return false;
  const s = String(v).toLowerCase();
  return s === "on" || s === "true" || s === "1" || s === "yes";
}

/* ---------- helpers ---------- */
async function readSettings() {
  const { rows } = await db.query(`
    SELECT
      id, site_name, logo_url, footer_desc, contact_email,
      social_facebook, social_instagram, social_twitter,
      -- NEW:
      ship_free, ship_flat, flat_rate_amount, pay_cod, pay_paypal,
      updated_at
    FROM site_settings
    WHERE id = 1
  `);
  return rows[0] || null;
}

function toView(row) {
  return {
    site_name:        row?.site_name        || "TECHORA",
    logo_url:         row?.logo_url         || "", // public path like /uploads/branding/xxx.png
    footer_desc:      row?.footer_desc      || "Premium technology products for the modern lifestyle. Quality you can trust.",
    contact_email:    row?.contact_email    || "support@techora.com",
    social_facebook:  row?.social_facebook  || "",
    social_instagram: row?.social_instagram || "",
    social_twitter:   row?.social_twitter   || "",
    // NEW:
    ship_free:        !!row?.ship_free,
    ship_flat:        !!row?.ship_flat,
    flat_rate_amount: row?.flat_rate_amount ?? 0,
    pay_cod:          row?.pay_cod ?? true,
    pay_paypal:       row?.pay_paypal ?? true,

    updated_at:       row?.updated_at       || null,
  };
}

/** Convert a public /uploads/... URL into an absolute disk path under src/public */
function publicToDisk(p) {
  if (!p) return null;
  let s = String(p).replace(/\\/g, "/");
  const idx = s.toLowerCase().indexOf("/uploads/");
  if (idx === -1) return null;
  const rel = s.slice(idx + 1); // "uploads/branding/xxx.png"
  return path.join(process.cwd(), "src", "public", rel);
}

/* ---------- page ---------- */
export async function renderAdminSettings(_req, res) {
  try {
    const row = await readSettings();
    res.render("admin/adminSettings", { settings: toView(row) });
  } catch (e) {
    console.error("renderAdminSettings error:", e);
    res.render("admin/adminSettings", { settings: toView(null) });
  }
}

/* ---------- ajax load ---------- */
export async function getSettingsJson(_req, res) {
  try {
    const row = await readSettings();
    res.json({ success: true, settings: toView(row) });
  } catch (e) {
    console.error("getSettingsJson error:", e);
    res.status(500).json({ success: false, message: "Failed to load settings" });
  }
}

/* ---------- save (multipart: optional logo) ---------- */
/**
 * Expects (from your route):
 *   logoUpload.single("logo_file")
 * Body fields:
 *   site_name, footer_desc, contact_email, social_facebook, social_instagram, social_twitter
 *   ship_free, ship_flat, flat_rate_amount, pay_cod, pay_paypal
 */
export async function updateSettings(req, res) {
  try {
    const {
      site_name,
      footer_desc,
      contact_email,
      social_facebook,
      social_instagram,
      social_twitter,
      // NEW:
      ship_free,
      ship_flat,
      flat_rate_amount,
      pay_cod,
      pay_paypal,
    } = req.body;

    const v_ship_free  = asBool(ship_free);
    const v_ship_flat  = asBool(ship_flat);
    const v_pay_cod    = asBool(pay_cod);
    const v_pay_paypal = asBool(pay_paypal);
    const v_flat_rate  = Number.isFinite(Number(flat_rate_amount)) ? Number(flat_rate_amount) : 0;

    // Prepare potential new logo path
    let newLogoPublicUrl = null;
    if (req.file) {
      newLogoPublicUrl = `/uploads/branding/${req.file.filename}`;
    }

    // If replacing logo, delete the old file on disk (best-effort)
    if (newLogoPublicUrl) {
      try {
        const { rows: oldRows } = await db.query(
          `SELECT logo_url FROM site_settings WHERE id = 1`
        );
        const oldUrl = oldRows?.[0]?.logo_url || null;
        if (oldUrl && oldUrl !== newLogoPublicUrl) {
          const oldDisk = publicToDisk(oldUrl);
          if (oldDisk) {
            await fs.unlink(oldDisk).catch(() => {});
          }
        }
      } catch {
        // ignore
      }
    }

    const { rows } = await db.query(
      `
      INSERT INTO site_settings
        (id, site_name, logo_url, footer_desc, contact_email,
         social_facebook, social_instagram, social_twitter,
         ship_free, ship_flat, flat_rate_amount, pay_cod, pay_paypal,
         updated_at)
      VALUES
        (1, $1, $2, $3, $4,
            $5, $6, $7,
            $8, $9, $10, $11, $12,
            NOW())
      ON CONFLICT (id) DO UPDATE SET
        site_name        = EXCLUDED.site_name,
        logo_url         = COALESCE(EXCLUDED.logo_url, site_settings.logo_url),
        footer_desc      = EXCLUDED.footer_desc,
        contact_email    = EXCLUDED.contact_email,
        social_facebook  = EXCLUDED.social_facebook,
        social_instagram = EXCLUDED.social_instagram,
        social_twitter   = EXCLUDED.social_twitter,
        ship_free        = EXCLUDED.ship_free,
        ship_flat        = EXCLUDED.ship_flat,
        flat_rate_amount = EXCLUDED.flat_rate_amount,
        pay_cod          = EXCLUDED.pay_cod,
        pay_paypal       = EXCLUDED.pay_paypal,
        updated_at       = NOW()
      RETURNING *;
      `,
      [
        site_name ?? "",
        newLogoPublicUrl,              // may be null → keep old via COALESCE in DO UPDATE
        footer_desc ?? "",
        contact_email ?? "",
        social_facebook ?? "",
        social_instagram ?? "",
        social_twitter ?? "",
        v_ship_free,
        v_ship_flat,
        v_flat_rate,
        v_pay_cod,
        v_pay_paypal,
      ]
    );

    // Make sure header/footer pick up the fresh values on next request
    invalidateSiteSettingsCache();

    res.json({ success: true, message: "Settings saved.", settings: toView(rows[0]) });
  } catch (e) {
    console.error("updateSettings error:", e);
    res.status(500).json({ success: false, message: "Failed to save settings" });
  }
}

/* ================
delete logo 
================ */
export async function deleteLogo(req, res) {
  try {
    const { rows } = await db.query(`SELECT logo_url FROM site_settings WHERE id = 1`);
    const oldUrl = rows?.[0]?.logo_url || null;

    if (!oldUrl) {
      return res.json({ success: false, message: "No logo to delete." });
    }

    // Delete the physical file
    const diskPath = publicToDisk(oldUrl);
    if (diskPath) {
      await fs.unlink(diskPath).catch(() => {});
    }

    // Clear from DB
    await db.query(
      `UPDATE site_settings SET logo_url = NULL, updated_at = NOW() WHERE id = 1`
    );

    invalidateSiteSettingsCache();

    res.json({ success: true, message: "Logo deleted successfully." });
  } catch (e) {
    console.error("deleteLogo error:", e);
    res.status(500).json({ success: false, message: "Failed to delete logo." });
  }
}
