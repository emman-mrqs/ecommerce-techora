import 'dotenv/config';
import express from 'express';
import cookieSession from 'cookie-session';        // ✅ use cookie-session (no MemoryStore)
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import axios from 'axios';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import { cartCountMiddleware } from './src/middleware/cartMiddleware.js';
import { wishlistCountMiddleware } from './src/middleware/wishlistMiddleware.js';

import passport from './src/config/passport.js';
import { attachSeller } from './src/middleware/attachSeller.js';
import { suspensionGuard } from './src/middleware/suspensionGuard.js';
import websiteViewsTracker from './src/middleware/websiteViewsTracker.js';

// ---- Routes ----
import loginRoutes from './src/routes/loginRoutes.js';
import signupRoutes from './src/routes/signupRoutes.js';
import verifyRoutes from './src/routes/verifyRoutes.js';
import sellerRoute from './src/routes/sellerRoutes.js';
import userRoute from './src/routes/userRoutes.js';
import cartRoutes from './src/routes/cartRoutes.js';
import adminRoutes from './src/routes/adminRoutes.js';
import adminAuthRoutes from './src/routes/adminAuthRoutes.js';
import { requireAdmin } from './src/middleware/adminJwt.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// Detect prod (Render) to set secure cookies & trust proxy correctly
const IS_PROD = !!process.env.RENDER || process.env.NODE_ENV === 'production';

// ---- Core / static ----
app.set('trust proxy', IS_PROD ? 1 : 0); // required for secure cookies on Render
app.use(express.static(join(__dirname, 'src', 'public')));

// Ensure uploads directory exists
const uploadDir = join(__dirname, 'src', 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Views
app.set('views', join(__dirname, 'src', 'views'));
app.set('view engine', 'ejs');

// Parsers
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser(process.env.COOKIE_SECRET));

// ---- Sessions (cookie-session; no server store) ----
app.use(
  cookieSession({
    name: 'sid',
    keys: [process.env.SESSION_SECRET || 'change-me'], // set SESSION_SECRET in Render
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,                  // HTTPS on Render; stays false locally
    maxAge: 24 * 60 * 60 * 1000,      // 1 day
  })
);

// Passport & custom middleware
app.use(passport.initialize());
app.use(passport.session());          // works with cookie-session
app.use(cartCountMiddleware);
app.use(wishlistCountMiddleware);
app.use(attachSeller);
app.use(suspensionGuard);
app.use(websiteViewsTracker());

// Locals for EJS
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.user = req.session?.user || null;
  next();
});

// ---- Routes ----
// Auth
app.use('/', loginRoutes);
app.use('/', signupRoutes);
app.use('/', verifyRoutes);

// Seller
app.use('/', sellerRoute);

// User
app.use('/', userRoute);

// Cart
app.use('/', cartRoutes);

// Admin auth (tokenized login/logout, unprotected)
app.use('/', adminAuthRoutes);

// Protect everything under /admin via JWT
app.use('/admin', requireAdmin);

// Admin features
app.use('/', adminRoutes);

// Health check for Render
app.get('/healthz', (_req, res) => res.status(200).send('ok'));

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// ---- Start server (Render needs 0.0.0.0 + process.env.PORT) ----
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on ${PORT}`);
});
