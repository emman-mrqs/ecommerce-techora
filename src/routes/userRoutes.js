import express from "express";
const router = express.Router();
import { renderLandingPage } from "../controller/indexController.js";

import { listProducts, searchSuggestions } from "../controller/productsController.js";
import { renderBuyPage } from "../controller/buyController.js";
import { renderCart } from '../controller/cartController.js'; // ✅
import { renderCheckout } from "../controller/checkoutController.js";
import { placeOrder } from "../controller/checkoutController.js";
import { createPayPalOrder, capturePayPalOrder } from "../controller/paypalController.js";
import { ensureAuth} from "../middleware/authMiddleware.js";
import { renderProfile } from "../controller/profileController.js";
import { cancelOrder } from "../controller/ordersController.js";



router.get("/", renderLandingPage);

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
router.get("/profile", ensureAuth, renderProfile);

// cancel action
router.post("/api/orders/cancel", ensureAuth, cancelOrder);
//Es module export
export default router;