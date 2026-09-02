const express = require('express');
const { z } = require('zod');
const redisClient = require('../db/redis');
const { getProduct } = require('../services/catalogClient');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const cartItemSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().positive(),
});

const quantitySchema = z.object({
  quantity: z.number().int().positive(),
});

// Helper function to get cart key
const getCartKey = (userId) => `cart:${userId}`;

// GET /cart - Get user's cart, hydrating product details from Catalog service
router.get('/', authenticate, async (req, res) => {
  const userId = req.user.userId;
  const cartKey = getCartKey(userId);

  try {
    // 1. Fetch raw cart data from Redis Hash
    const rawCart = await redisClient.hGetAll(cartKey);
    
    if (!rawCart || Object.keys(rawCart).length === 0) {
      return res.json({ items: [], total: 0 });
    }

    // 2. Hydrate each item with details from the Catalog Service
    const hydratedItems = [];
    let cartTotal = 0;

    for (const [productId, quantityStr] of Object.entries(rawCart)) {
      const quantity = parseInt(quantityStr);
      
      // Fetch product via Circuit Breaker
      const productDetails = await getProduct(productId);
      
      const itemTotal = productDetails.price * quantity;
      cartTotal += itemTotal;

      hydratedItems.push({
        productId: parseInt(productId),
        quantity,
        product: productDetails,
        itemTotal
      });
    }

    res.json({
      items: hydratedItems,
      total: cartTotal
    });

  } catch (error) {
    console.error('Error fetching cart:', error);
    res.status(500).json({ error: 'Failed to fetch cart' });
  }
});

// POST /cart/items - Add an item to the cart
router.post('/items', authenticate, async (req, res) => {
  try {
    const validated = cartItemSchema.parse(req.body);
    const userId = req.user.userId;
    const cartKey = getCartKey(userId);

    // Ensure the product exists in the catalog before adding
    // If the catalog is down, the circuit breaker returns a fallback object (unavailable: true)
    const product = await getProduct(validated.productId);
    if (product.unavailable || product.id === undefined) {
      return res.status(404).json({ error: 'Product not found or currently unavailable' });
    }

    // Check if item already exists in cart to increment quantity
    const existingQty = await redisClient.hGet(cartKey, validated.productId.toString());
    const newQty = existingQty ? parseInt(existingQty) + validated.quantity : validated.quantity;

    // Save back to Redis
    await redisClient.hSet(cartKey, validated.productId.toString(), newQty.toString());
    
    // Set an expiration of 30 days for the cart
    await redisClient.expire(cartKey, 60 * 60 * 24 * 30);

    res.status(201).json({ message: 'Item added to cart', productId: validated.productId, quantity: newQty });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Error adding to cart:', error);
    res.status(500).json({ error: 'Failed to add item to cart' });
  }
});

// PUT /cart/items/:productId - Update item quantity
router.put('/items/:productId', authenticate, async (req, res) => {
  try {
    const validated = quantitySchema.parse(req.body);
    const productId = req.params.productId;
    const userId = req.user.userId;
    const cartKey = getCartKey(userId);

    const existingQty = await redisClient.hGet(cartKey, productId);
    if (!existingQty) {
      return res.status(404).json({ error: 'Item not in cart' });
    }

    await redisClient.hSet(cartKey, productId, validated.quantity.toString());
    
    res.json({ message: 'Quantity updated', productId, quantity: validated.quantity });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Failed to update quantity' });
  }
});

// DELETE /cart/items/:productId - Remove item from cart
router.delete('/items/:productId', authenticate, async (req, res) => {
  try {
    const productId = req.params.productId;
    const userId = req.user.userId;
    const cartKey = getCartKey(userId);

    await redisClient.hDel(cartKey, productId);
    
    res.json({ message: 'Item removed from cart', productId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove item' });
  }
});

// DELETE /cart - Clear the entire cart
router.delete('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const cartKey = getCartKey(userId);

    await redisClient.del(cartKey);
    
    res.json({ message: 'Cart cleared completely' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear cart' });
  }
});

module.exports = router;
