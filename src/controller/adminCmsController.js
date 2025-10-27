// src/controller/adminCmsController.js
import db from "../database/db.js";
import fs from "fs/promises";   // ⬅️ add this
import path from "path";


async function detectSellerTitleColumn() {
  const { rows } = await db.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'about_content'
      AND column_name IN ('seller_title','seller_titl')
  `);
  const cols = rows.map(r => r.column_name);
  return cols.includes("seller_title") ? "seller_title" : (cols.includes("seller_titl") ? "seller_titl" : "seller_title");
}

async function readAboutRow() {
  const { rows } = await db.query(`SELECT * FROM about_content WHERE id=1`);
  return rows[0] || null;
}

/* DB -> EJS */
// REPLACE your toView(row) with this:
function toView(row) {
  if (!row) {
    return {
      updated_at: null,

      hero_title: "",
      hero_description: "",
      cta_primary_text: "Become a Seller",
      cta_primary_href: "#become-seller",

      story_title: "",
      story_p1: "",
      story_p2: "",

      // Values – editable fallbacks
      values_1_title: "Quality First",
      values_1_text:  "Curated gadgets with verified performance and warranty-ready partners.",
      values_2_title: "Fast & Reliable",
      values_2_text:  "Quick fulfillment, careful packaging, and transparent tracking.",
      values_3_title: "Human Support",
      values_3_text:  "Real people ready to help—before and after checkout.",
      values_4_title: "Responsible Choices",
      values_4_text:  "Promoting durable gear, repairs, and mindful upgrades.",

      why_title: "",
      why_1_title: "Top-tier Curation",
      why_1_text:  "Only standout gadgets make the cut—fewer choices, better choices.",
      why_2_title: "Honest Pricing",
      why_2_text:  "Transparent deals with zero dark patterns or surprise fees.",
      why_3_title: "Secure & Private",
      why_3_text:  "Encrypted checkout and privacy-respecting analytics by design.",

      seller_title: "Sell with Techora",
      seller_p: "",

      step1: "Create your seller profile",
      step2: "List products & set inventory",
      step3: "Start selling—get paid fast",
      cta_secondary_text: "Learn More",
      cta_secondary_href: "/seller-application",

      faq_title: "FAQ",
      faq_1_q: "How do I become a Techora seller?",
      faq_1_a: "Click <strong>Apply as Seller</strong> above or go to <code>/seller-application</code>, fill the form, and our team will review your application.",
      faq_2_q: "What products can I sell?",
      faq_2_a: "We focus on gadgets & accessories—phones, audio, peripherals, wearables, and related gear. All listings must pass quality checks.",
      faq_3_q: "How quickly are orders fulfilled?",
      faq_3_a: "Most orders ship within 24–48 hours. Tracking is provided in your account as soon as the courier scans the parcel.",
    };
  }

  const sellerTitle = row.seller_title ?? row.seller_titl ?? "";
  const why = Array.isArray(row.why_points) ? row.why_points : [];
  const vals = Array.isArray(row.values_points) ? row.values_points : [];
  const faq = Array.isArray(row.faq) ? row.faq : [];

  const [w1 = {}, w2 = {}, w3 = {}] = why;
  const [v1 = {}, v2 = {}, v3 = {}, v4 = {}] = vals;
  const [f1 = {}, f2 = {}, f3 = {}] = faq;

  return {
    updated_at: row.updated_at ?? null,

    hero_title: row.hero_title ?? "",
    hero_description: row.hero_description ?? "",
    cta_primary_text: row.cta_primary_text || "Become a Seller",
    cta_primary_href: row.cta_primary_href || "#become-seller",

    story_title: row.story_title ?? "",
    story_p1: row.story_paragraph1 ?? "",
    story_p2: row.story_paragraph2 ?? "",

    values_1_title: v1.title ?? "Quality First",
    values_1_text:  v1.text  ?? "Curated gadgets with verified performance and warranty-ready partners.",
    values_2_title: v2.title ?? "Fast & Reliable",
    values_2_text:  v2.text  ?? "Quick fulfillment, careful packaging, and transparent tracking.",
    values_3_title: v3.title ?? "Human Support",
    values_3_text:  v3.text  ?? "Real people ready to help—before and after checkout.",
    values_4_title: v4.title ?? "Responsible Choices",
    values_4_text:  v4.text  ?? "Promoting durable gear, repairs, and mindful upgrades.",

    why_title: row.why_title ?? "",
    why_1_title: w1.title ?? "Top-tier Curation",
    why_1_text:  w1.text  ?? "Only standout gadgets make the cut—fewer choices, better choices.",
    why_2_title: w2.title ?? "Honest Pricing",
    why_2_text:  w2.text  ?? "Transparent deals with zero dark patterns or surprise fees.",
    why_3_title: w3.title ?? "Secure & Private",
    why_3_text:  w3.text  ?? "Encrypted checkout and privacy-respecting analytics by design.",

    seller_title: sellerTitle || "Sell with Techora",
    seller_p: row.seller_paragraph ?? "",

    step1: row.step1 || "Create your seller profile",
    step2: row.step2 || "List products & set inventory",
    step3: row.step3 || "Start selling—get paid fast",
    cta_secondary_text: row.cta_secondary_text || "Learn More",
    cta_secondary_href: row.cta_secondary_href || "/seller-application",

    faq_title: row.faq_title || "FAQ",
    faq_1_q: f1.q ?? "How do I become a Techora seller?",
    faq_1_a: f1.a ?? "Click <strong>Apply as Seller</strong> above or go to <code>/seller-application</code>, fill the form, and our team will review your application.",
    faq_2_q: f2.q ?? "What products can I sell?",
    faq_2_a: f2.a ?? "We focus on gadgets & accessories—phones, audio, peripherals, wearables, and related gear. All listings must pass quality checks.",
    faq_3_q: f3.q ?? "How quickly are orders fulfilled?",
    faq_3_a: f3.a ?? "Most orders ship within 24–48 hours. Tracking is provided in your account as soon as the courier scans the parcel.",
  };
}


/* EJS -> JSONB payloads */
// REPLACE your buildJsonFromBody with:
function buildJsonFromBody(body) {
  const why_points = [
    { title: body.why_1_title ?? "", text: body.why_1_text ?? "" },
    { title: body.why_2_title ?? "", text: body.why_2_text ?? "" },
    { title: body.why_3_title ?? "", text: body.why_3_text ?? "" },
  ].filter(x => x.title || x.text);

  const faq = [
    { q: body.faq_1_q ?? "", a: body.faq_1_a ?? "" },
    { q: body.faq_2_q ?? "", a: body.faq_2_a ?? "" },
    { q: body.faq_3_q ?? "", a: body.faq_3_a ?? "" },
  ].filter(x => x.q || x.a);

  const values_points = [
    { title: body.values_1_title ?? "", text: body.values_1_text ?? "" },
    { title: body.values_2_title ?? "", text: body.values_2_text ?? "" },
    { title: body.values_3_title ?? "", text: body.values_3_text ?? "" },
    { title: body.values_4_title ?? "", text: body.values_4_text ?? "" },
  ].filter(x => x.title || x.text);

  return { why_points, faq, values_points };
}



/* GET page */
export async function renderAdminCms(req, res) {
  try {
    const row = await readAboutRow();
    res.render("admin/adminCms", { about: toView(row) });
  } catch (e) {
    console.error("CMS render error:", e);
    res.render("admin/adminCms", { about: toView(null) });
  }
}

/* GET fresh JSON (your pencil click uses this) */
export async function getAboutContentJson(req, res) {
  try {
    const row = await readAboutRow();
    res.json({ success: true, about: toView(row) });
  } catch (e) {
    console.error("CMS json error:", e);
    res.status(500).json({ success: false, message: "Failed to get content" });
  }
}

/* SAVE */
// REPLACE your updateAboutContent with:
export async function updateAboutContent(req, res) {
  try {
    const {
      hero_title,
      hero_description,
      story_title,
      story_p1,
      story_p2,
      why_title,

      cta_primary_text,
      cta_primary_href,

      values_1_title, values_1_text,
      values_2_title, values_2_text,
      values_3_title, values_3_text,
      values_4_title, values_4_text,

      seller_title,
      seller_p,

      step1, step2, step3,
      cta_secondary_text,
      cta_secondary_href,
      faq_title,
    } = req.body;

    const { why_points, faq, values_points } = buildJsonFromBody(req.body);
    const sellerCol = await detectSellerTitleColumn();

    const sql = `
      INSERT INTO about_content
        (
          id,
          hero_title, hero_description,
          story_title, story_paragraph1, story_paragraph2,
          cta_primary_text, cta_primary_href,
          why_title, why_points,
          values_points,
          ${sellerCol}, seller_paragraph,
          step1, step2, step3,
          cta_secondary_text, cta_secondary_href,
          faq_title,
          faq,
          updated_at
        )
      VALUES
        (
          1,
          $1, $2,
          $3, $4, $5,
          $6, $7,
          $8, $9::jsonb,
          $10::jsonb,
          $11, $12,
          $13, $14, $15,
          $16, $17,
          $18, $19::jsonb,
          NOW()
        )
      ON CONFLICT (id) DO UPDATE SET
        hero_title         = EXCLUDED.hero_title,
        hero_description   = EXCLUDED.hero_description,
        story_title        = EXCLUDED.story_title,
        story_paragraph1   = EXCLUDED.story_paragraph1,
        story_paragraph2   = EXCLUDED.story_paragraph2,
        cta_primary_text   = EXCLUDED.cta_primary_text,
        cta_primary_href   = EXCLUDED.cta_primary_href,
        why_title          = EXCLUDED.why_title,
        why_points         = EXCLUDED.why_points,
        values_points      = EXCLUDED.values_points,
        ${sellerCol}       = EXCLUDED.${sellerCol},
        seller_paragraph   = EXCLUDED.seller_paragraph,
        step1              = EXCLUDED.step1,
        step2              = EXCLUDED.step2,
        step3              = EXCLUDED.step3,
        cta_secondary_text = EXCLUDED.cta_secondary_text,
        cta_secondary_href = EXCLUDED.cta_secondary_href,
        faq_title          = EXCLUDED.faq_title,
        faq                = EXCLUDED.faq,
        updated_at         = NOW()
      RETURNING *;
    `;

    const values = [
      hero_title ?? "",
      hero_description ?? "",
      story_title ?? "",
      story_p1 ?? "",
      story_p2 ?? "",

      cta_primary_text ?? "Become a Seller",
      cta_primary_href ?? "#become-seller",

      why_title ?? "",
      JSON.stringify(why_points),

      JSON.stringify(values_points),

      seller_title ?? "",
      seller_p ?? "",

      step1 ?? "Create your seller profile",
      step2 ?? "List products & set inventory",
      step3 ?? "Start selling—get paid fast",

      cta_secondary_text ?? "Learn More",
      cta_secondary_href ?? "/seller-application",

      faq_title ?? "FAQ",
      JSON.stringify(faq),
    ];

    const { rows } = await db.query(sql, values);

    res.json({ success: true, message: "About page updated successfully!", about: toView(rows[0]) });
  } catch (e) {
    console.error("CMS update error:", e);
    res.status(500).json({ success: false, message: "Failed to update content" });
  }
}



/*============
Contact page 
 =============*/
 // ---- CONTACT HELPERS ----
async function readContactRow() {
  const { rows } = await db.query(`SELECT * FROM contact_content WHERE id=1`);
  return rows[0] || null;
}

function toContactView(row) {
  if (!row) {
    return {
      updated_at: null,
      hero_title: "Contact Techora",
      hero_subtitle: "Questions, feedback, or partnership ideas? We’d love to hear from you.",
      email: "techora.team@gmail.com",
      website_label: "ecommerce-techora.onrender.com",
      website_url: "https://ecommerce-techora.onrender.com/",
      support_hours: "Mon–Sat, 9:00–18:00 (PH)",
      seller_cta_title: "Become a Seller",
      seller_cta_text: "Have great gadgets or accessories? Join Techora and sell to thousands of shoppers.",
      map_iframe_src: "https://maps.google.com/maps?q=Philippines&t=k&z=5&output=embed",
      checklist: ["Secure & private", "Fast payouts", "Seller analytics"],
    };
  }
  return {
    updated_at: row.updated_at ?? null,
    hero_title: row.hero_title ?? "",
    hero_subtitle: row.hero_subtitle ?? "",
    email: row.email ?? "",
    website_label: row.website_label ?? "",
    website_url: row.website_url ?? "",
    support_hours: row.support_hours ?? "",
    seller_cta_title: row.seller_cta_title ?? "",
    seller_cta_text: row.seller_cta_text ?? "",
    map_iframe_src: row.map_iframe_src ?? "",
    checklist: Array.isArray(row.checklist) ? row.checklist : [],
  };
}

// GET (admin) JSON for editor
export async function getContactContentJson(req, res) {
  try {
    const row = await readContactRow();
    res.json({ success: true, contact: toContactView(row) });
  } catch (e) {
    console.error("CMS contact json error:", e);
    res.status(500).json({ success: false, message: "Failed to get contact content" });
  }
}

// UPSERT from admin editor
export async function updateContactContent(req, res) {
  try {
    const {
      hero_title,
      hero_subtitle,
      email,
      website_label,
      website_url,
      support_hours,
      seller_cta_title,
      seller_cta_text,
      map_iframe_src,
      checklist, // comma-separated string from the form
    } = req.body;

    // normalize checklist to array
    const checklistArr = typeof checklist === "string"
      ? checklist.split(",").map(s => s.trim()).filter(Boolean)
      : Array.isArray(checklist) ? checklist : [];

    const { rows } = await db.query(
      `
      INSERT INTO contact_content
        (id, hero_title, hero_subtitle, email, website_label, website_url,
         support_hours, seller_cta_title, seller_cta_text, map_iframe_src,
         checklist, updated_at)
      VALUES
        (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW())
      ON CONFLICT (id) DO UPDATE SET
        hero_title       = EXCLUDED.hero_title,
        hero_subtitle    = EXCLUDED.hero_subtitle,
        email            = EXCLUDED.email,
        website_label    = EXCLUDED.website_label,
        website_url      = EXCLUDED.website_url,
        support_hours    = EXCLUDED.support_hours,
        seller_cta_title = EXCLUDED.seller_cta_title,
        seller_cta_text  = EXCLUDED.seller_cta_text,
        map_iframe_src   = EXCLUDED.map_iframe_src,
        checklist        = EXCLUDED.checklist,
        updated_at       = NOW()
      RETURNING *;
      `,
      [
        hero_title ?? "",
        hero_subtitle ?? "",
        email ?? "",
        website_label ?? "",
        website_url ?? "",
        support_hours ?? "",
        seller_cta_title ?? "",
        seller_cta_text ?? "",
        map_iframe_src ?? "",
        JSON.stringify(checklistArr),
      ]
    );

    res.json({
      success: true,
      message: "Contact page updated successfully!",
      contact: toContactView(rows[0]),
    });
  } catch (e) {
    console.error("CMS contact update error:", e);
    res.status(500).json({ success: false, message: "Failed to update contact content" });
  }
}

// Public page render (optional helper if you render /contact from DB)
export async function renderContactPage(req, res) {
  try {
    const row = await readContactRow();
    res.render("pages/contact", { contact: toContactView(row) });
  } catch (e) {
    console.error("Contact render error:", e);
    res.render("pages/contact", { contact: toContactView(null) });
  }
}


/*===============
Homepage banner
=================*/
// --- banner helpers ---
export async function listBanners(req, res) {
  try {
    const { rows } = await db.query(`
      SELECT id, image_url, label, is_active, created_at, updated_at
      FROM homepage_banners
      ORDER BY is_active DESC, created_at DESC
    `);
    res.json({ success: true, banners: rows });
  } catch (e) {
    console.error("listBanners error:", e);
    res.status(500).json({ success: false, message: "Failed to list banners" });
  }
}

export async function setActiveBanner(req, res) {
  const { id } = req.params;
  try {
    await db.query("BEGIN");
    await db.query(`UPDATE homepage_banners SET is_active=false`);
    const { rows } = await db.query(
      `UPDATE homepage_banners
       SET is_active=true, updated_at=NOW()
       WHERE id=$1
       RETURNING *`,
      [id]
    );
    await db.query("COMMIT");
    res.json({ success: true, active: rows[0] });
  } catch (e) {
    await db.query("ROLLBACK");
    console.error("setActiveBanner error:", e);
    res.status(500).json({ success: false, message: "Failed to set active banner" });
  }
}
function imageUrlToDiskPath(imageUrl) {
  if (!imageUrl) return null;
  let p = String(imageUrl).replace(/\\/g, "/");

  // /uploads/banners/xxx.png  ->  <cwd>/src/public/uploads/banners/xxx.png
  const upIdx = p.toLowerCase().indexOf("/uploads/");
  if (upIdx !== -1) {
    const rel = p.slice(upIdx + 1); // "uploads/banners/xxx.png"
    return path.join(process.cwd(), "src", "public", rel);
  }

  // Absolute path that already contains /src/public/
  const pubIdx = p.toLowerCase().indexOf("/src/public/");
  if (pubIdx !== -1) {
    const rel = p.slice(pubIdx + "/src/public/".length);
    return path.join(process.cwd(), "src", "public", rel);
  }
  return null;
}

export async function deleteBanner(req, res) {
  const { id } = req.params;
  try {
    const { rows } = await db.query(
      `SELECT image_url FROM homepage_banners WHERE id = $1`,
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Banner not found" });
    }
    const imageUrl = rows[0].image_url;

    await db.query(`DELETE FROM homepage_banners WHERE id = $1`, [id]);

    const diskPath = imageUrlToDiskPath(imageUrl);
    if (diskPath) {
      try {
        // Debug: see the path we’re trying to remove
        // console.log("[banner unlink]", diskPath);
        await fs.unlink(diskPath);
      } catch (e) {
        // File might already be gone or locked; don't fail the request
        // console.warn("[banner unlink failed]", diskPath, e.message);
      }
    }

    res.json({ success: true });
  } catch (e) {
    console.error("deleteBanner error:", e);
    res.status(500).json({ success: false, message: "Failed to delete banner" });
  }
}


export async function uploadBannerRecord(req, res) {
  try {
    // multer put file at: req.file.path; serve via /uploads/banners/<filename>
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, message: "No file" });

    const publicUrl = `/uploads/banners/${file.filename}`;
    const label = req.body?.label || null;

    const { rows } = await db.query(
      `INSERT INTO homepage_banners (image_url, label, is_active, updated_at)
       VALUES ($1, $2, false, NOW()) RETURNING *`,
      [publicUrl, label]
    );
    res.json({ success: true, banner: rows[0] });
  } catch (e) {
    console.error("uploadBannerRecord error:", e);
    res.status(500).json({ success: false, message: "Failed to upload banner" });
  }
}

