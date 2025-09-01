import pg from "pg";

const db = new pg.Client ({
  user: "postgres",
  host: "localhost",
  database: "Techora",
  password: "admin123",
  port:5432,
});

db.connect();

export default db;