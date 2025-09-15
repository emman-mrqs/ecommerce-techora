import express from "express";
const router = express.Router();
import multer from "multer";
import { renderAddProductPage, addProduct } from "../controller/sellerController.js";

//multer
const storage = multer.diskStorage({
destination: (req, file, cb) => cb(null, "src/public/uploads"), 
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

router.get("/seller/store", (req, res)=>{
  res.render("seller/sellerStore", {
    activePage: "promotions",
    pageTitle: "Seller Promotions"
  });
});

router.get("/seller", (req, res) => {
  res.render("seller/sellerDashboard", { 
    activePage: "overview",
    pageTitle: "Seller Dashboard"
  });
});

router.get("/seller/products", (req, res) => {
  res.render("seller/sellerProducts", { 
    activePage: "products",
    pageTitle: "Seller Products"
  });
});


router.get("/seller/add", renderAddProductPage);
// Allow up to 10 images
router.post("/seller/add", upload.array("product_images[]", 10), addProduct);

router.get("/seller/orders", (req, res)=>{
  res.render("seller/sellerOrders", {
    activePage: "orders",
    pageTitle: "Seller Orders"
  });
});

router.get("/seller/earnings", (req, res)=>{
  res.render("seller/sellerEarnings", {
    activePage: "earnings",
    pageTitle: "Seller Earnings"
  });
});


router.get("/seller/promotions", (req, res)=>{
  res.render("seller/sellerPromotions", {
    activePage: "promotions",
    pageTitle: "Seller Promotions"
  });
});

//ES module export
export default router;