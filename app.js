import 'dotenv/config';
import express from "express";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import axios from "axios";
import { dirname, join } from "path";
import { fileURLToPath } from "url";


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


// This will make the current path available in all EJS views
app.use((req, res, next) => {
    res.locals.currentPath = req.path;
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

