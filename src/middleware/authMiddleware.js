// src/middleware/authMiddleware.js


//Prevent user to go back to login or sign up when user are logged in
export const redirectIfLoggedIn = (req, res, next) => {
  if (req.session.user) {
    return res.redirect("/"); // or "/dashboard" if you have one
  }
  next();
};

// Require an authenticated session to access a route
// Require an authenticated session to access a route
export const ensureAuth = (req, res, next) => {
  if (req.session?.user?.id) return next();
  return res.redirect("/login-verify"); // ✅ redirect to login-verify
};
