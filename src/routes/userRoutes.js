import express from "express";
const router = express.Router();

router.get("/", (req, res) => {
  res.render("user/index.ejs"); 
});

router.get("/cart", (req, res) =>{
    res.render("user/cart");
});

router.get("/checkout", (req, res)=>{
  res.render("user/checkout");
});

router.get("/products", (req, res)=>{
  res.render("user/products");
});

//Es module export
export default router;