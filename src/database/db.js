// src/database/db.js
import pkg from "pg";
const { Pool } = pkg;

const db = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT) || 5432,
  // If you're on a managed DB that requires SSL, uncomment:
  // ssl: { rejectUnauthorized: false },
});

// Optional: quick sanity check at boot (remove if you prefer)
db.query("SELECT 1").catch(err => {
  console.error("DB connection failed:", err);
  process.exit(1);
});

export default db;
