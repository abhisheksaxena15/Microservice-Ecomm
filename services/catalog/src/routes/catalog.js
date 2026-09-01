const express = require('express');
const { z } = require('zod');
const multer = require('multer');
const path = require('path');
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { getCached, setCached, invalidateCache } = require('../cache/redis');

const router = express.Router();

// Mock S3 Uploads (Local disk)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../../uploads/')); // Save to catalog/uploads
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, req.params.id + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

const productSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().positive(),
  stock: z.number().int().nonnegative().optional(),
  category_id: z.number().int().optional(),
});

// GET /products - List all products with pagination and filtering
router.get('/products', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    let query = 'SELECT * FROM products WHERE 1=1';
    const params = [];
    let paramIndex = 1;
    
    // Filtering by category
    if (req.query.category_id) {
      query += ` AND category_id = $${paramIndex}`;
      params.push(parseInt(req.query.category_id));
      paramIndex++;
    }
    
    // Full-Text Search on name
    if (req.query.search) {
      // Uses the GIN index we created!
      query += ` AND to_tsvector('english', name) @@ plainto_tsquery('english', $${paramIndex})`;
      params.push(req.query.search);
      paramIndex++;
    }
    
    // Count total rows for pagination metadata
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*)');
    const countResult = await db.query(countQuery, params);
    const totalItems = parseInt(countResult.rows[0].count);
    
    // Add pagination
    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await db.query(query, params);
    
    res.json({
      data: result.rows,
      meta: {
        total: totalItems,
        page,
        limit,
        totalPages: Math.ceil(totalItems / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET /products/:id - Get single product (Uses Cache-Aside Pattern)
router.get('/products/:id', async (req, res) => {
  const productId = req.params.id;
  const cacheKey = `product:${productId}`;
  
  try {
    // 1. Check Redis Cache
    const cachedProduct = await getCached(cacheKey);
    if (cachedProduct) {
      // Cache Hit!
      return res.json({ data: cachedProduct, source: 'cache' });
    }
    
    // 2. Cache Miss - Query Postgres
    const result = await db.query('SELECT * FROM products WHERE id = $1', [productId]);
    const product = result.rows[0];
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // 3. Save to Redis for next time (1 hour TTL)
    await setCached(cacheKey, product, 3600);
    
    res.json({ data: product, source: 'database' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// POST /products - Create product (Admin Only)
router.post('/products', authenticate, requireAdmin, async (req, res) => {
  try {
    const validated = productSchema.parse(req.body);
    
    const result = await db.query(
      'INSERT INTO products (name, description, price, stock, category_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [validated.name, validated.description, validated.price, validated.stock || 0, validated.category_id || null]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// POST /products/:id/image - Upload Image (Admin Only)
router.post('/products/:id/image', authenticate, requireAdmin, upload.single('image'), async (req, res) => {
  const productId = req.params.id;
  
  if (!req.file) {
    return res.status(400).json({ error: 'No image provided' });
  }
  
  try {
    // In a real app, this would be a CloudFront/S3 URL. We mock it with our local static route.
    // The Gateway maps /api/catalog/uploads to this service's static files.
    const imageUrl = `/api/catalog/uploads/${req.file.filename}`;
    
    const result = await db.query(
      'UPDATE products SET image_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [imageUrl, productId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Invalidate the cache since the product was updated!
    await invalidateCache(`product:${productId}`);
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

module.exports = router;
