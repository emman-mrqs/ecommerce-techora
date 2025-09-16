import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import db from "../database/db.js";

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,       // from Google Cloud
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.BASE_URL}/auth/google/callback`
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Extract Google profile info
      const googleId = profile.id;
      const email = profile.emails[0].value;
      const name = profile.displayName;

      // 1. Check if user already exists with Google provider_id
      let result = await db.query(
        "SELECT * FROM users WHERE provider_id = $1 AND auth_provider = 'google'",
        [googleId]
      );

      if (result.rows.length > 0) {
        return done(null, result.rows[0]); // ✅ existing Google user
      }

      // 2. Check if email already exists (local or google)
      const emailCheck = await db.query(
        "SELECT * FROM users WHERE email = $1",
        [email]
      );

      if (emailCheck.rows.length > 0) {
        const existingUser = emailCheck.rows[0];
        // ✅ Allow login using local account (don’t override provider)
        return done(null, existingUser);
      }

      // 3. Otherwise, create new Google account
      const insert = await db.query(
        `INSERT INTO users (name, email, is_verified, auth_provider, provider_id)
         VALUES ($1, $2, true, 'google', $3)
         RETURNING *`,
        [name, email, googleId]
      );

      return done(null, insert.rows[0]);

    } catch (err) {
      return done(err, null);
    }
  }
));

// Serialize user into session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const result = await db.query("SELECT * FROM users WHERE id = $1", [id]);
    done(null, result.rows[0]);
  } catch (err) {
    done(err, null);
  }
});

// ✅ Fix: ensure proper default export for ESM
export { passport as default };
