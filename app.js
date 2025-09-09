import 'dotenv/config';
import express from "express";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import axios from "axios";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import session from "express-session";


const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const port = 3000;

// Tell Express where the View folder 
app.set("views", join(__dirname, "src", "views")); // Views Folder
app.set("view engine", "ejs");

//Public Folder
app.use(express.static(join(__dirname, "src", "public")));

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

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


// This will make the current path available in all EJS views
app.use((req, res, next) => {
    res.locals.currentPath = req.path;
    res.locals.user = req.session.user || null; // ✅ this line
    next();
}); 


//Import Routes
import loginRoutes from "./src/routes/loginRoutes.js"
import signupRoutes from "./src/routes/signupRoutes.js"
import verifyRoutes from "./src/routes/verifyRoutes.js"
import sellerRoute from "./src/routes/sellerRoutes.js";
import userRoute from "./src/routes/userRoutes.js";
import { verify } from 'crypto';

//auth Routes
app.use("/", loginRoutes);
app.use("/", signupRoutes);
app.use("/", verifyRoutes);

//seller routes
app.use("/", sellerRoute);

//User Routes
app.use("/", userRoute);


app.listen(port, () => {
  console.log(`Backend server is running on http://localhost:${port}`);
});

