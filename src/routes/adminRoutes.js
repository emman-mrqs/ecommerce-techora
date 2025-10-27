  import express from "express";
  const router = express.Router();

  //Dashboard Controller
  import { renderAdminDashboard, getSalesOverviewJson } from "../controller/adminDashboardController.js";

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

  // Notification Controller
  import { getUnreadNotifications, markNotificationRead, markAllNotificationsRead } from "../controller/adminNotificationController.js";

  // CMS controller
  import { renderAdminCms, updateAboutContent, getAboutContentJson, getContactContentJson, updateContactContent,  
    listBanners, setActiveBanner, deleteBanner, uploadBannerRecord } from "../controller/adminCmsController.js";
  import { bannerUpload } from "../middleware/upload.js";

  // admin Settings
  import { logoUpload } from "../middleware/upload.js";
  import {
  renderAdminSettings,
  getSettingsJson,
  updateSettings,
  deleteLogo
} from "../controller/adminSettingsController.js";

import { listAudits } from "../controller/adminAuditController.js";


  /*=================
  Routes
  ===================*/

  // Admin Dashboard
  router.get("/admin", renderAdminDashboard);
  router.get("/admin/dashboard/sales", getSalesOverviewJson);

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

 /*============
 Start CMS management
 ===============*/
  router.get("/admin/cms", renderAdminCms);

  //About CMS
  router.get("/admin/cms/about/data", getAboutContentJson);   
  router.post("/admin/cms/about/update", updateAboutContent);

  //Contact CMS
  router.get("/admin/cms/contact/data", getContactContentJson);
  router.post("/admin/cms/contact/update", updateContactContent);

  // CMS banners 
  router.get("/admin/cms/banners", listBanners);
  router.post("/admin/cms/banners/upload", bannerUpload.single("banner"), uploadBannerRecord);
  router.post("/admin/cms/banners/:id/activate", setActiveBanner);
  router.delete("/admin/cms/banners/:id", deleteBanner);

/*==============
 EndCMS management
 ===============*/

  // Settings 
  router.get("/admin/settings", renderAdminSettings);
  router.get("/admin/settings/data", getSettingsJson);
  router.post("/admin/settings/update", logoUpload.single("logo_file"), updateSettings);
  router.delete("/admin/settings/logo", deleteLogo);

  // Audit logs
  router.get("/admin/audit", listAudits);


  // Notification
  router.get("/admin/notifications/unread", getUnreadNotifications);
  router.post("/admin/notifications/read/:id", markNotificationRead);
  router.post("/admin/notifications/read-all", markAllNotificationsRead);
  
 

 


  export default router;
