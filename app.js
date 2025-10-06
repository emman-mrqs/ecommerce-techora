// NEW
import http from "http";
import "dotenv/config";
import express from "express";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import session from "express-session";
import fs from "fs";

import passport from "./src/config/passport.js";
import { cartCountMiddleware } from "./src/middleware/cartMiddleware.js";
import { wishlistCountMiddleware } from "./src/middleware/wishlistMiddleware.js";
import { attachSeller } from "./src/middleware/attachSeller.js";
import { suspensionGuard } from "./src/middleware/suspensionGuard.js";
import websiteViewsTracker from "./src/middleware/websiteViewsTracker.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// ✅ behind Azure reverse proxy (must be before sessions/redirects)
app.set("trust proxy", 1);

// ✅ use Azure port with local fallback
const port = process.env.PORT || 3000;

// Sessions
app.use(session({
  secret: process.env.SESSION_SECRET || "supersecretkey",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production", // one secure flag only
    maxAge: 1000 * 60 * 60 * 24,
  },
}));

// Static + views
app.use(express.static(join(__dirname, "src", "public")));
const uploadDir = join(__dirname, "src", "public", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.set("views", join(__dirname, "src", "views"));
app.set("view engine", "ejs");

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(cartCountMiddleware);
app.use(wishlistCountMiddleware);
app.use(passport.initialize());
app.use(passport.session());
app.use(attachSeller);
app.use(suspensionGuard);
app.use(websiteViewsTracker());

app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.user = req.session.user || null;
  next();
});

// Routes
import loginRoutes from "./src/routes/loginRoutes.js";
import signupRoutes from "./src/routes/signupRoutes.js";
import verifyRoutes from "./src/routes/verifyRoutes.js";
import sellerRoute from "./src/routes/sellerRoutes.js";
import userRoute from "./src/routes/userRoutes.js";
import cartRoutes from "./src/routes/cartRoutes.js";
import adminRoutes from "./src/routes/adminRoutes.js";
import adminAuthRoutes from "./src/routes/adminAuthRoutes.js";
import { requireAdmin } from "./src/middleware/adminJwt.js";

app.use("/", loginRoutes);
app.use("/", signupRoutes);
app.use("/", verifyRoutes);
app.use("/", sellerRoute);
app.use("/", userRoute);
app.use("/", cartRoutes);
app.use("/", adminAuthRoutes);
app.use("/admin", requireAdmin);
app.use("/", adminRoutes);

// Optional health check
app.get("/healthz", (req, res) =>
  res.json({ ok: true, proto: req.headers["x-forwarded-proto"], secure: req.secure })
);

// ✅ one listener only
const server = http.createServer(app);
server.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on ${port}`);
});
