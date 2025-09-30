import express from "express";
const router = express.Router();
import { renderLandingPage } from "../controller/indexController.js";

import { submitContact } from "../controller/contactController.js";
import { listProducts, searchSuggestions } from "../controller/productsController.js";
import { renderBuyPage,  } from "../controller/buyController.js";
import { renderCart } from '../controller/cartController.js'; // ✅
import { renderCheckout, placeOrder, validateCheckoutVoucher, redeemVoucherAfterPayment } from "../controller/checkoutController.js";

import { createPayPalOrder, capturePayPalOrder } from "../controller/paypalController.js";
import { ensureAuth} from "../middleware/authMiddleware.js";
import { 
renderProfile, updateName, changePassword, cancelOrder, 
markOrderReceived, requestRefund, getAddresses, addAddress,
updateAddress, deleteAddress, setDefaultAddress
} from "../controller/profileController.js";
import { listReviews, createReview, replyReview } from "../controller/reviewController.js";
import {
  viewWishlist,
  addToWishlist,
  removeFromWishlist,
  moveWishlistToCart
} from "../controller/wishlistController.js";
// import { cancelOrder } from "../controller/ordersController.js";



router.get("/", renderLandingPage);

//cart 
router.get('/cart', renderCart); // ✅ dynamic cart

//checkout and orders
router.get('/checkout', renderCheckout);
router.post('/api/voucher/validate', validateCheckoutVoucher);     // NEW
router.post('/api/voucher/redeem', redeemVoucherAfterPayment);     // NEW
router.post("/api/orders/place", placeOrder);
// Wishlist

router.get("/wishlist", viewWishlist);
router.post("/api/wishlist/add", addToWishlist);            // guests allowed
router.delete("/api/wishlist/:variantId", removeFromWishlist); 
router.post("/api/wishlist/move-to-cart", moveWishlistToCart);

// Orders

// PayPal
router.post("/api/paypal/create-order", createPayPalOrder);
router.post("/api/paypal/capture-order", capturePayPalOrder);


//Products
router.get("/products", listProducts);
router.get("/search-suggestions", searchSuggestions);
router.get("/buy/:id", renderBuyPage);

// API for reviews
router.get("/api/reviews", listReviews);
router.post("/api/reviews", ensureAuth, createReview);
router.post("/api/reviews/:id/reply", ensureAuth, replyReview);

//profile
router.get("/profile", ensureAuth, renderProfile);
router.post("/profile/update-name", ensureAuth, updateName); 
router.post("/profile/change-password", ensureAuth, changePassword); // Security (local accounts only)
router.post("/profile/cancel-order", ensureAuth, cancelOrder);
router.post("/profile/mark-received", ensureAuth, markOrderReceived);
router.post("/profile/refund-order", ensureAuth, requestRefund);
router.get("/profile/addresses", ensureAuth, getAddresses);
router.post("/profile/addresses", ensureAuth, addAddress);
router.post("/profile/addresses/update", ensureAuth, updateAddress);
router.post("/profile/addresses/delete", ensureAuth, deleteAddress);
router.post("/profile/addresses/set-default", ensureAuth, setDefaultAddress);


// About page
router.get("/about", (req, res)=>{
    res.render("user/about");
});

// Contact page
router.get("/contact", (req, res)=>{
    res.render("user/contact");
});
router.post("/contact", submitContact);


// cancel action
// router.post("/api/orders/cancel", ensureAuth, cancelOrder);
//Es module export
export default router;