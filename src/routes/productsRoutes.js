import express from "express";
import {
  addProduct,
  getProductsPage,        // <- renamed
  getProduct,
  updateProductController,
  deleteProductController,
  searchProductsApi       // <- new
} from "../controller/productsController.js";

const router = express.Router();

// REST API
router.post("/products", addProduct);
router.get("/products/:id", getProduct);
router.put("/products/:id", updateProductController);
router.delete("/products/:id", deleteProductController);

// JSON endpoint for search suggestions: /api/products/search?q=...
router.get("/products/search", searchProductsApi);

// Page route (renders EJS): /products?search=...
router.get("/products", getProductsPage);

export default router;
