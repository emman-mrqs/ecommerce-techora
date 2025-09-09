// src/middleware/authMiddleware.js


//Prevent user to go back to login or sign up when user are logged in
export const redirectIfLoggedIn = (req, res, next) => {
  if (req.session.user) {
    return res.redirect("/"); // or "/dashboard" if you have one
  }
  next();
};
