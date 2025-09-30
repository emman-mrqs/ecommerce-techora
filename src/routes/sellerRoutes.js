import express from "express";
const router = express.Router();
import multer from "multer";
import { renderSellerApplication, submitSellerApplication } from "../controller/sellerApplicationController.js";
import { renderAddProductPage, addProduct } from "../controller/sellerAddProductsController.js";
import { renderSellerProducts, deleteProduct, getProductDetails, updateProduct, getProductRatings } from "../controller/sellerProductsController.js";
import { ensureAuth } from "../middleware/authMiddleware.js";
// import { deleteProduct } from "../controller/sellerProductsController.js";
import { renderSellerOrders, updateOrderStatus, filterSellerOrders, deleteSellerOrderItems } from "../controller/sellerOrdersController.js";
import { renderSellerPromotions, createPromotion, updatePromotion, deletePromotion } from "../controller/sellerPromotionsController.js";
import { renderSellerSettings, updateSellerSettings } from "../controller/sellerSettingsController.js";
import { listSellers } from "../controller/sellersController.js";
import { viewStore } from "../controller/storeController.js";
import { renderSellerEarnings } from "../controller/sellerEarningsController.js";
import { renderSellerAnalytics } from "../controller/sellerAnalyticsController.js";
import { renderSellerDashboard } from "../controller/sellerDashboardController.js";



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
router.get("/seller", ensureAuth, renderSellerDashboard);


// Seller Products
// Seller Products
router.get("/seller/products", ensureAuth, renderSellerProducts);
router.get("/seller/products/:id", ensureAuth, getProductDetails);   // 🔹 fetch details for edit
router.put("/seller/products/:id", ensureAuth, updateProduct);       // 🔹 save updates
router.delete("/seller/products/:id", ensureAuth, deleteProduct);
router.get("/seller/products/:id/ratings", getProductRatings);


// Seller add Products
router.get("/seller/add", ensureAuth, renderAddProductPage);
router.post("/seller/add", ensureAuth, upload.array("product_images[]", 10), addProduct);


// Seller orders
router.post("/seller/orders/filter", ensureAuth, filterSellerOrders);
router.get("/seller/orders", ensureAuth, renderSellerOrders);
router.post("/seller/orders/update-status", ensureAuth, updateOrderStatus); // Update order status (AJAX)
// Add these in src/routes/sellerRoutes.js
router.post("/seller/orders/delete", ensureAuth, deleteSellerOrderItems);     // POST fallback (recommended)
router.delete("/seller/orders/delete", ensureAuth, deleteSellerOrderItems);   // if you keep DELETE with body
router.delete("/seller/orders/:orderId", ensureAuth, deleteSellerOrderItems); // DELETE without body

// Earnings
router.get("/seller/earnings", ensureAuth, renderSellerEarnings);

// Analytics
router.get("/seller/analytics", ensureAuth, renderSellerAnalytics);


// Seller Promotions
router.get("/seller/promotions", ensureAuth, renderSellerPromotions);
router.post("/seller/promotions/create", ensureAuth, createPromotion);
router.post("/seller/promotions/update", ensureAuth, updatePromotion);
router.post("/seller/promotions/delete", ensureAuth, deletePromotion);


// Seller Settings
router.get("/seller/settings", ensureAuth, renderSellerSettings);
router.post( 
  "/seller/settings/update",
  ensureAuth,
  upload.single("store_icon"), // ✅ handle single file
  updateSellerSettings
);

// Show all Sellers 
router.get("/sellers", listSellers);

//Show store page
router.get("/store/:id", viewStore);


export default router;
