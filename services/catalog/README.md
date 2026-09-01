# Catalog Service (Day 4)

## Overview
The Catalog Service is a dedicated microservice responsible for managing the e-commerce product catalog and categories. 

## Key Technical Implementations (For Interviews)

### 1. The Cache-Aside Pattern (Redis)
Database queries are slow, especially for high-traffic endpoints like fetching product details. To solve this, I implemented the **Cache-Aside Pattern**:
1. When `GET /api/catalog/products/:id` is hit, the service first queries Redis (`product:123`).
2. If it's a **Cache Hit**, it returns instantly (sub-millisecond response).
3. If it's a **Cache Miss**, it queries PostgreSQL, stores the result in Redis with a 1-hour Time-To-Live (TTL), and then returns it.
4. **Cache Invalidation:** When an admin updates a product (e.g. uploading an image), the service explicitly calls `redis.del()` to invalidate the stale cache.

### 2. Database Indexing (PostgreSQL)
To ensure the `GET /products` API scales gracefully with millions of records:
- I created standard B-Tree indexes on `category_id` and `price` to instantly filter products.
- I created a **GIN (Generalized Inverted Index)** using PostgreSQL's `to_tsvector` for Full-Text Search. This allows blazing-fast keyword searching on product names without using slow `LIKE '%word%'` queries.

### 3. Image Uploads & Static Serving
I implemented multipart/form-data upload handling using `multer`. 
- Images are saved to a local disk mock (`/uploads`).
- The Database stores the static URL path.
- *Note: In a true cloud environment, this module would stream the upload directly to an AWS S3 bucket and save the CloudFront CDN URL to the database instead of local disk.*

### 4. Zero-Trust Internal Security
Although the API Gateway routes traffic here, we do not blindly trust internal network traffic. The Catalog service shares the `JWT_SECRET` and has its own `auth.js` middleware. 
- Public endpoints (`GET`) bypass authentication.
- Write endpoints (`POST`) require a valid JWT with an `admin` role, enforcing **Role-Based Access Control (RBAC)** at the service boundary.
