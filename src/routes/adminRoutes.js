import express from "express";
const router = express.Router();

import {  //User management
  renderUsers, suspendUser, activateUser, deleteUser, editUser, liftSuspension
 } from "../controller/adminUsersController.js"; 

import {  // Sellers Controller
  renderSellers, approveSeller, rejectSeller, suspendSeller, unsuspendSeller, updateSeller
} from "../controller/adminSellersController.js";

import { // Products Controller 
  renderAdminProducts, adminGetProduct, adminUpdateProduct, adminDeleteProduct
} from "../controller/adminProductsController.js";

import { // Oders Controller
  renderAdminOrders, adminGetInvoice, adminDeleteSellerOrder, adminUpdateOrderStatus
} from "../controller/adminOrdersController.js";

// Earnings Controller
import { renderAdminEarnings } from "../controller/adminEarningsController.js";

import { // Promotion Controller
  renderAdminPromotions, adminGetPromotion, adminUpdatePromotion, adminEnablePromotion, adminDisablePromotion, adminDeletePromotion
} from "../controller/adminPromotionsController.js";

// Analytics Controller
import { renderAdminAnalytics } from "../controller/adminAnalyticsController.js";


/*=================
Routes
===================*/

// Admin Dashboard
router.get("/admin", (req, res) => {
  res.render("admin/adminDashboard");
});

// User Management
router.get("/admin/users", renderUsers);
router.post("/admin/users/:id/suspend", suspendUser);
router.post("/admin/users/:id/activate", activateUser);
router.post("/admin/users/:id/delete", deleteUser);
router.post("/admin/users/:id/edit", editUser); 

router.post("/admin/users/:id/suspend", suspendUser);          // create or update suspension
router.post("/admin/users/:id/lift", liftSuspension);    

// Seller management
router.get("/admin/sellers", renderSellers);
router.post("/admin/sellers/:id/approve", approveSeller);
router.post("/admin/sellers/:id/reject", rejectSeller);
router.post("/admin/sellers/:id/suspend", suspendSeller);
router.post("/admin/sellers/:id/unsuspend", unsuspendSeller);
router.post("/admin/sellers/:id/update", updateSeller);

// Products management
router.get("/admin/products", renderAdminProducts);
router.get("/admin/products/:id", adminGetProduct);           
router.post("/admin/products/:id/update", adminUpdateProduct); 
router.post("/admin/products/:id/delete", adminDeleteProduct); 

// Orders management
router.get("/admin/orders", renderAdminOrders);
router.get("/admin/orders/:orderId/seller/:sellerId", adminGetInvoice);
router.post("/admin/orders/:orderId/seller/:sellerId/delete", adminDeleteSellerOrder);
router.post("/admin/orders/:orderId/seller/:sellerId/status", adminUpdateOrderStatus);

//Earnings management
router.get("/admin/earnings", renderAdminEarnings);

// Promotion management
router.get("/admin/promotions", renderAdminPromotions);
router.get("/admin/promotions/:id", adminGetPromotion);            // JSON for modal
router.post("/admin/promotions/:id/update", adminUpdatePromotion);
router.post("/admin/promotions/:id/enable", adminEnablePromotion);
router.post("/admin/promotions/:id/disable", adminDisablePromotion);
router.post("/admin/promotions/:id/delete", adminDeletePromotion);

// Analytics Management
router.get("/admin/analytics", renderAdminAnalytics);

// Reports management
router.get("/admin/reports", (req, res) => {
  res.render("admin/adminReports");
});

// CMS management
router.get("/admin/cms", (req, res) => {
  res.render("admin/adminCms");
});

// Settings management
router.get("/admin/settings", (req, res) => {
  res.render("admin/adminSettings");
});

// Audit logs
router.get("/admin/audit", (req, res) => {
  res.render("admin/adminAudit");
});

export default router;
