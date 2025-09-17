// src/middleware/attachSeller.js
import db from "../database/db.js";

export const attachSeller = async (req, res, next) => {
  res.locals.seller = null; // default

  if (req.session?.user?.id) {
    try {
      const result = await db.query(
        "SELECT * FROM sellers WHERE user_id = $1 LIMIT 1",
        [req.session.user.id]
      );

      if (result.rows.length > 0) {
        res.locals.seller = result.rows[0]; // pass seller record to EJS
      }
    } catch (err) {
      console.error("Error fetching seller:", err);
    }
  }

  next();
};
