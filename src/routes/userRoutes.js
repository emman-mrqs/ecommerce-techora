import express from "express";
const router = express.Router();
import { listProducts, searchSuggestions } from "../controller/productsController.js";
import { renderBuyPage } from "../controller/buyController.js";
import { addToCart } from '../controller/cartController.js';


router.get("/", (req, res) => {
  res.render("user/index.ejs"); 
});

router.post('/cart', addToCart);


router.get("/checkout", (req, res)=>{
  res.render("user/checkout");
});

router.get("/products", listProducts);
router.get("/search-suggestions", searchSuggestions);
router.get("/buy/:id", renderBuyPage);


//Es module export
export default router;