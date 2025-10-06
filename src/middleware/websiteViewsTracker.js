// src/middleware/websiteViewsTracker.js
/*import crypto from "crypto";
import db from "../database/db.js";

const BOT_RX   = /(bot|crawl|spider|slurp|bingpreview|monitoring|pingdom)/i;
const ASSET_RX = /\.(css|js|png|jpe?g|gif|svg|ico|webp|woff2?|map)$/i;

export default function websiteViewsTracker(opts = {}) {
  const cookieName   = opts.cookieName   || "vID";
  const cookieMaxAge = opts.cookieMaxAge || 365 * 24 * 60 * 60 * 1000; // 1y
  const debounceMs   = Number(opts.debounceMs ?? 10_000);               // 10s
  const trustBots    = !!opts.trustBots;

  // per-process debounce to avoid hammering DB on rapid refreshes
  const lastHit = new Map(); // `${visitorId}:${yyyy-mm-dd}` -> ts

  return async (req, res, next) => {
    // ---- fast filters (DO NOT put inside try/finally) ----
    if (req.method !== "GET") return next();
    if (req.path.startsWith("/api/")) return next();
    if (ASSET_RX.test(req.path)) return next();
    if (!trustBots && BOT_RX.test(req.get("user-agent") || "")) return next();

    try {
      // resolve signed cookie
      let visitorId = req.signedCookies?.[cookieName];
      if (!visitorId) {
        visitorId = crypto.randomUUID();
        res.cookie(cookieName, visitorId, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          signed: true,
          maxAge: cookieMaxAge,
          path: "/",
        });
      }

      // debounce multiple hits within a few seconds
      const today = new Date().toISOString().slice(0, 10);
      const k = `${visitorId}:${today}`;
      const now = Date.now();
      const prev = lastHit.get(k) || 0;
      if (now - prev < debounceMs) return next();
      lastHit.set(k, now);

      const userId = req.user?.id ?? null;
      const ip     = req.ip;
      const ua     = req.get("user-agent") || "";

      // ✅ FIX 1: correct parameter order (visitor_id, user_id, last_ip, ua)
      await db.query(
        `
        INSERT INTO site_visitors (visitor_id, user_id, last_ip, ua)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (visitor_id)
        DO UPDATE SET
          user_id  = COALESCE(site_visitors.user_id, EXCLUDED.user_id),
          last_ip  = EXCLUDED.last_ip,
          ua       = EXCLUDED.ua,
          last_seen = now()
        `,
        [visitorId, userId, ip, ua]
      );

      // first hit of the day -> count 1 view + 1 unique; subsequent hits = 0
      await db.query(
        `
        WITH ins_dedupe AS (
          INSERT INTO site_daily_visitors (view_date, visitor_id)
          VALUES (CURRENT_DATE, $1)
          ON CONFLICT DO NOTHING
          RETURNING 1
        ),
        upsert_rollup AS (
          INSERT INTO site_daily_views (view_date, views, uniques)
          VALUES (CURRENT_DATE,
                  (SELECT COUNT(*) FROM ins_dedupe),
                  (SELECT COUNT(*) FROM ins_dedupe))
          ON CONFLICT (view_date)
          DO UPDATE SET
            views   = site_daily_views.views   + (SELECT COUNT(*) FROM ins_dedupe),
            uniques = site_daily_views.uniques + (SELECT COUNT(*) FROM ins_dedupe)
        )
        SELECT 1;
        `,
        [visitorId]
      );

      return next();
    } catch (e) {
      console.warn("websiteViewsTracker non-fatal:", e.message);
      return next(); // ✅ FIX 2: call next() only once
    }
  };
}
