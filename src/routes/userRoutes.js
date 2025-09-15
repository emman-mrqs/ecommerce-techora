import express from "express";
const router = express.Router();
import { listProducts, searchSuggestions } from "../controller/productsController.js";
import { renderBuyPage } from "../controller/buyController.js";
import { renderCart } from '../controller/cartController.js'; // ✅
import { renderCheckout } from "../controller/checkoutController.js";
import { placeOrder } from "../controller/checkoutController.js";
import { createPayPalOrder, capturePayPalOrder } from "../controller/paypalController.js";



router.get("/", (req, res) => {
  res.render("user/index.ejs"); 
});

//cart and checkout
router.get('/cart', renderCart); // ✅ dynamic cart
router.get('/checkout', renderCheckout); // ✅ now using controller

// Orders
router.post("/api/orders/place", placeOrder);

// PayPal
router.post("/api/paypal/create-order", createPayPalOrder);
router.post("/api/paypal/capture-order", capturePayPalOrder);

//Products
router.get("/products", listProducts);
router.get("/search-suggestions", searchSuggestions);
router.get("/buy/:id", renderBuyPage);

//profile
router.get("/profile", (req, res) => {
  res.render("user/profile.ejs"); 
});

//Es module export
export default router;