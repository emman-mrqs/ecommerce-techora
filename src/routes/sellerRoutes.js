import express from "express";
const router = express.Router();
import multer from "multer";
import { renderSellerApplication, submitSellerApplication } from "../controller/sellerApplicationController.js";
import { renderAddProductPage, addProduct } from "../controller/sellerAddProductsController.js";
import { renderSellerProducts } from "../controller/sellerProductsController.js"; // ✅ import
import { ensureAuth } from "../middleware/authMiddleware.js";
import { deleteProduct } from "../controller/sellerProductsController.js";
import { renderSellerOrders, updateOrderStatus, filterSellerOrders } from "../controller/sellerOrdersController.js";


// multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "src/public/uploads"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

// Seller application
router.get("/seller-application", ensureAuth, renderSellerApplication);
router.post("/seller-application", ensureAuth, submitSellerApplication);

// Seller dashboard routes
router.get("/seller/store", ensureAuth, (req, res) => {
  res.render("seller/sellerStore", {
    activePage: "promotions",
    pageTitle: "Seller Promotions"
  });
});

router.get("/seller", ensureAuth, (req, res) => {
  res.render("seller/sellerDashboard", { 
    activePage: "overview",
    pageTitle: "Seller Dashboard"
  });
});

// Seller Products
router.get("/seller/products", ensureAuth, renderSellerProducts);
router.delete("/seller/products/:id", ensureAuth, deleteProduct);

// Seller add Products
router.get("/seller/add", ensureAuth, renderAddProductPage);
router.post("/seller/add", ensureAuth, upload.array("product_images[]", 10), addProduct);

// Seller orders
router.post("/seller/orders/filter", ensureAuth, filterSellerOrders);
router.get("/seller/orders", ensureAuth, renderSellerOrders);
router.post("/seller/orders/update-status", ensureAuth, updateOrderStatus); // Update order status (AJAX)



router.get("/seller/earnings", ensureAuth, (req, res) => {
  res.render("seller/sellerEarnings", {
    activePage: "earnings",
    pageTitle: "Seller Earnings"
  });
});

router.get("/seller/promotions", ensureAuth, (req, res) => {
  res.render("seller/sellerPromotions", {
    activePage: "promotions",
    pageTitle: "Seller Promotions"
  });
});

export default router;
