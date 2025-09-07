import db from "../database/db.js";

// verifyUser
export const verifyUser = async (req, res) => {
  const { code } = req.body;
  const email = req.cookies.verifyEmail;

  if (!email) {
    return res.status(400).json({ success: false, message: "Verification session expired or email missing." });
  }

  try {
    const result = await db.query(
      `SELECT * FROM users 
        WHERE email = $1 
        AND verification_code = $2 
        AND verification_expires > NOW()`,
      [email, code]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, message: "Invalid or expired verification code." });
    }

    await db.query(
      "UPDATE users SET is_verified = true, verification_code = null, verification_expires = null WHERE email = $1",
      [email]
    );

    // Clear the verification email cookie after successful verification  
    res.clearCookie('verifyEmail');

    res.json({
      success: true,
      message: "Email verified successfully, You can Now Login!",
      redirect: "/login"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};
