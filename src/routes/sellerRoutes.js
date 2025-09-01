import express from "express";
const router = express.Router();

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

router.get("/seller/add", (req, res)=>{
  res.render("seller/sellerAddProducts", {
    activePage: "addProduct",
    pageTitle: "Seller Add Products"
  });

});

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