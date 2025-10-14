import 'dotenv/config';
import express from "express";
import jwt from "jsonwebtoken";                                    // NEW
import supportChatRoutes from "./src/routes/supportChatRoutes.js";  // NEW
import { registerSupportSocket } from "./src/controller/supportChatController.js"; // NEW
import http from "http";
import { Server as SocketIOServer } from "socket.io";

import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import axios from "axios";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import session from "express-session";
import fs from "fs";
import  { cartCountMiddleware } from "./src/middleware/cartMiddleware.js";
import { wishlistCountMiddleware } from "./src/middleware/wishlistMiddleware.js";

// import path from "path";
import passport from "./src/config/passport.js"; // adjust path
import { attachSeller } from "./src/middleware/attachSeller.js";
import { suspensionGuard } from "./src/middleware/suspensionGuard.js";

import websiteViewsTracker from "./src/middleware/websiteViewsTracker.js";


const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const port = 3000;


//Express Session
app.use(session({
  secret: process.env.SESSION_SECRET || "supersecretkey", // Use .env in production!
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true if using HTTPS
    maxAge: 1000 * 60 * 60 * 24, // 1 day
  },
}));

// Only if you're behind nginx/Heroku/etc.
// app.set('trust proxy', 1);

// Serve /src/public as your static root
app.use(express.static(join(__dirname, "src", "public")));


// Ensure uploads directory exists at src/public/uploads
const uploadDir = join(__dirname, "src", "public", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Tell Express where the View folder 
app.set("views", join(__dirname, "src", "views")); // Views Folder
app.set("view engine", "ejs");

//Public Folder
app.use(express.static(join(__dirname, "src", "public")));

// Serve /uploads so chat images load at /uploads/chat/...
app.use("/uploads", express.static(join(__dirname, "src", "public", "uploads"))); // NEW


// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(cartCountMiddleware); // cart count
app.use(wishlistCountMiddleware);  // wishlist count

app.use(passport.initialize());
app.use(passport.session());
app.use(attachSeller);

app.use(suspensionGuard);

app.use(websiteViewsTracker());

// This will make the current path available in all EJS views
// Expose path, user, and chat identity ("me") to all EJS views
// Expose path, user, and chat identity ("me") to all EJS views
// Expose path, user, and chat identity ("me") to all EJS views
// Expose path, user, and chat identity ("me") to all EJS views
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.user = req.session.user || null;

  let me = null;

  // Only derive "me" from the normal user session (user or seller)
  if (req.session?.user) {
    const sellerId =
      res.locals?.seller?.id || req.session?.seller?.id || null;

    me = sellerId
      ? { role: "seller", id: sellerId, displayName: req.session.user.name || "Seller" }
      : { role: "user",   id: req.session.user.id, displayName: req.session.user.name || "User" };
  }

  // Do NOT set me from the admin cookie here.
  // Admin identity is handled by /admin + requireAdmin and exposed as res.locals.admin.

  res.locals.me = me; // may be null for guests
  res.locals.CHAT_IMG_MAX_MB = Number(process.env.CHAT_IMG_MAX_MB || 4);
  next();
});




//Import Routes
import loginRoutes from "./src/routes/loginRoutes.js"
import signupRoutes from "./src/routes/signupRoutes.js"
import verifyRoutes from "./src/routes/verifyRoutes.js"
import sellerRoute from "./src/routes/sellerRoutes.js";
import userRoute from "./src/routes/userRoutes.js";
import { verify } from 'crypto';
import cartRoutes from './src/routes/cartRoutes.js'; // ✅ NEW
import adminRoutes from "./src/routes/adminRoutes.js";


// app.js additions
import adminAuthRoutes from "./src/routes/adminAuthRoutes.js";
import { requireAdmin } from "./src/middleware/adminJwt.js";

//auth Routes
app.use("/", loginRoutes);
app.use("/", signupRoutes);
app.use("/", verifyRoutes);

//seller routes
app.use("/", sellerRoute);

//User Routes
app.use("/", userRoute);

//cart Routes CRUD
app.use('/', cartRoutes); // ✅ Mount cart

//Admin Routes
// 1) Tokenized admin login/logout (UNPROTECTED)
app.use("/", adminAuthRoutes);

// 2) PROTECT everything under /admin with JWT
app.use("/admin", requireAdmin);

// 3) Now mount the actual admin feature routes
app.use("/", adminRoutes);

// Support chat
app.use(supportChatRoutes); // NEW — exposes /api/support/chat-token, /api/support/upload, /api/chat/start/*


const server = http.createServer(app);                               // NEW
const io = new SocketIOServer(server, { cors: { origin: true, credentials: true } }); // NEW
registerSupportSocket(io);                                           // NEW


server.listen(port, () => {
  console.log(`Backend server is running on http://localhost:${port}`);
});

  