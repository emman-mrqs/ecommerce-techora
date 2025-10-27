import db from "../database/db.js";

let cache = null;
let cacheAt = 0;
const TTL_MS = 10_000;

async function fetchSettings() {
  const { rows } = await db.query(`SELECT * FROM site_settings WHERE id=1`);
  const s = rows[0] || {};
  return {
    site_name:        s.site_name || "TECHORA",
    logo_url:         s.logo_url  || "",
    footer_desc:      s.footer_desc || "Premium technology products for the modern lifestyle. Quality you can trust.",
    contact_email:    s.contact_email || "support@techora.com",
    social_facebook:  s.social_facebook || "",
    social_instagram: s.social_instagram || "",
    social_twitter:   s.social_twitter || "",
    updated_at:       s.updated_at || null,

    // Shipping
    ship_free:        Boolean(s.ship_free),
    ship_flat:        Boolean(s.ship_flat),
    flat_rate_amount: Number(s.flat_rate_amount || 0),

    // 🔽 NEW: Payment options (from admin settings)
    pay_cod:          s.pay_cod !== undefined ? Boolean(s.pay_cod) : true,
    pay_paypal:       s.pay_paypal !== undefined ? Boolean(s.pay_paypal) : true,
  };
}



export default function siteSettings() {
  return async (_req, res, next) => {
    try {
      const now = Date.now();
      if (!cache || now - cacheAt > TTL_MS) {
        cache = await fetchSettings();
        cacheAt = now;
      }
      res.locals.settings = cache;       // existing
      res.locals.siteSettings = cache;   // <-- add this so partials see it
    } catch (e) {
      const fallback = {
        site_name: "TECHORA",
        logo_url: "",
        footer_desc: "Premium technology products for the modern lifestyle. Quality you can trust.",
        contact_email: "support@techora.com",
        social_facebook: "",
        social_instagram: "",
        social_twitter: "",
        updated_at: null,
      };
      res.locals.settings = fallback;
      res.locals.siteSettings = fallback; // <-- keep both in error path too
    }
    next();
  };
}

export function invalidateSiteSettingsCache() {
  cache = null; cacheAt = 0;
}


