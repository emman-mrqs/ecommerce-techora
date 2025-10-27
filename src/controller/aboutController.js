// src/controller/aboutController.js
import db from "../database/db.js";

function safeParseJsonField(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {
    // If parsing fails, return empty array so we fall back to defaults
    return [];
  }
}

export async function getAboutPage(req, res) {
  try {
    // ===== Stats (unchanged) =====
    const { rows: p } = await db.query(`
      SELECT COUNT(*)::int AS total_products
      FROM products
      WHERE seller_id IS NOT NULL
    `);

    const { rows: d } = await db.query(`
      SELECT COUNT(*)::int AS total_delivered
      FROM orders
      WHERE LOWER(order_status) = 'completed'
    `);

    const { rows: r } = await db.query(`
      SELECT COALESCE(ROUND(AVG(rating)::numeric, 2), 0)::text AS avg_rating
      FROM product_reviews
    `);

    const { rows: s } = await db.query(`
      SELECT COUNT(*)::int AS total_sellers
      FROM sellers
    `);

    const stats = {
      totalProducts: p[0]?.total_products ?? 0,
      totalDelivered: d[0]?.total_delivered ?? 0,
      avgRating: r[0]?.avg_rating ?? "0",
      totalSellers: s[0]?.total_sellers ?? 0,
    };

    // ===== About Content (normalize to EJS keys) =====
    const { rows: ac } = await db.query(`SELECT * FROM about_content WHERE id=1`);
    const row = ac[0] || {};

    // handle seller_title vs seller_titl typo
    const sellerTitle = row.seller_title ?? row.seller_titl ?? null;

    // Parse JSONB/string fields safely
    const why = safeParseJsonField(row.why_points);
    const faq = safeParseJsonField(row.faq);
    const values = safeParseJsonField(row.values_points);

    // Build aboutContent with DB values where present, fallback to defaults otherwise
    const aboutContent = {
      // Hero
      hero_title: row.hero_title ?? null,
      hero_description: row.hero_description ?? null,
      // Allow CTA to be stored in DB as well
      cta_primary_text: row.cta_primary_text ?? "Become a Seller",
      cta_primary_href: row.cta_primary_href ?? "#become-seller",

      // Story
      story_title: row.story_title ?? null,
      story_p1: row.story_paragraph1 ?? null,
      story_p2: row.story_paragraph2 ?? null,

      // Values (map values_points array if present)
      values_1_title: values[0]?.title ?? (row.values_1_title ?? "Quality First"),
      values_1_text:  values[0]?.text  ?? (row.values_1_text  ?? "Curated gadgets with verified performance and warranty-ready partners."),
      values_2_title: values[1]?.title ?? (row.values_2_title ?? "Fast & Reliable"),
      values_2_text:  values[1]?.text  ?? (row.values_2_text  ?? "Quick fulfillment, careful packaging, and transparent tracking."),
      values_3_title: values[2]?.title ?? (row.values_3_title ?? "Human Support"),
      values_3_text:  values[2]?.text  ?? (row.values_3_text  ?? "Real people ready to help—before and after checkout."),
      values_4_title: values[3]?.title ?? (row.values_4_title ?? "Responsible Choices"),
      values_4_text:  values[3]?.text  ?? (row.values_4_text  ?? "Promoting durable gear, repairs, and mindful upgrades."),

      // Why section
      why_title: row.why_title ?? null,
      why_1_title: why[0]?.title ?? (row.why_1_title ?? "Top-tier Curation"),
      why_1_text:  why[0]?.text  ?? (row.why_1_text  ?? "Only standout gadgets make the cut—fewer choices, better choices."),
      why_2_title: why[1]?.title ?? (row.why_2_title ?? "Honest Pricing"),
      why_2_text:  why[1]?.text  ?? (row.why_2_text  ?? "Transparent deals with zero dark patterns or surprise fees."),
      why_3_title: why[2]?.title ?? (row.why_3_title ?? "Secure & Private"),
      why_3_text:  why[2]?.text  ?? (row.why_3_text  ?? "Encrypted checkout and privacy-respecting analytics by design."),

      // Seller block — read steps & secondary CTA from DB if present
      seller_title: sellerTitle ?? (row.seller_title ?? "Sell with Techora"),
      seller_p: row.seller_paragraph ?? null,
      step1: row.step1 ?? "Create your seller profile",
      step2: row.step2 ?? "List products & set inventory",
      step3: row.step3 ?? "Start selling—get paid fast",
      cta_secondary_text: row.cta_secondary_text ?? "Learn More",
      cta_secondary_href: row.cta_secondary_href ?? "/seller-application",

      // FAQ — map faq array or DB fallback
      faq_title: row.faq_title ?? "FAQ",
      faq_1_q: faq[0]?.q ?? (row.faq_1_q ?? "How do I become a Techora seller?"),
      faq_1_a: faq[0]?.a ?? (row.faq_1_a ?? 'Click <strong>Apply as Seller</strong> above or go to <code>/seller-application</code>, fill the form, and our team will review your application.'),
      faq_2_q: faq[1]?.q ?? (row.faq_2_q ?? "What products can I sell?"),
      faq_2_a: faq[1]?.a ?? (row.faq_2_a ?? "We focus on gadgets & accessories—phones, audio, peripherals, wearables, and related gear. All listings must pass quality checks."),
      faq_3_q: faq[2]?.q ?? (row.faq_3_q ?? "How quickly are orders fulfilled?"),
      faq_3_a: faq[2]?.a ?? (row.faq_3_a ?? "Most orders ship within 24–48 hours. Tracking is provided in your account as soon as the courier scans the parcel."),
    };

    return res.render("user/about", { stats, aboutContent });
  } catch (err) {
    console.error("About page error:", err);
    return res.render("user/about", {
      stats: { totalProducts: 0, totalDelivered: 0, avgRating: "0", totalSellers: 0 },
      aboutContent: {},
    });
  }
}
