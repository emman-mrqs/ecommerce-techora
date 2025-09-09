import { Router } from 'express';
import { renderCart, apiAddToCart, apiUpdateCartItem, apiRemoveCartItem } from '../controller/cartController.js';


const router = Router();
router.get('/cart', renderCart);
router.post('/api/cart', apiAddToCart);
router.patch('/api/cart/:variantId', apiUpdateCartItem);
router.delete('/api/cart/:variantId', apiRemoveCartItem);
export default router;