import express from "express";
import bodyParser from "body-parser";
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

// This will make the current path available in all EJS views
app.use((req, res, next) => {
    res.locals.currentPath = req.path;
    next();
});


//Routes
app.get("/", (req, res) => {
  res.render("user/index.ejs"); 
});

app.get("/login", (req, res) => {
    res.render("login");
})

app.get("/signup", (req, res) => {
    res.render("signup");
})

app.get("/cart", (req, res) =>{
    res.render("user/cart");
});

app.get("/checkout", (req, res)=>{
  res.render("user/checkout");
});

app.get("/products", (req, res)=>{
  res.render("user/products");
});

//seller routes
app.get("/seller", (req, res)=>{
  res.render("seller/sellerDashboard");
});

app.get("/seller/products", (req, res)=>{
  res.render("seller/sellerProducts");
});



app.listen(port, () => {
  console.log(`Backend server is running on http://localhost:${port}`);
});
