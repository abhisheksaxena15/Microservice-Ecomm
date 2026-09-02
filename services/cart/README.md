# Cart Service (Day 5)

## Overview
The Cart Service manages transient user shopping carts. Because shopping carts require extremely fast read/write operations and are inherently temporary, this service uses **Redis** as its primary data store rather than a relational database.

## Key Technical Implementations (For Interviews)

### 1. Redis Hash Storage
Unlike PostgreSQL which writes to disk, Redis stores data in RAM.
- Carts are stored using a **Redis Hash** data structure.
- The key is the user's ID (e.g., `cart:123`).
- The hash fields are the `productId` and the values are the `quantity`.
- This allows `O(1)` time complexity for adding, updating, and removing items, making the cart experience lightning-fast.
- A 30-day Time-To-Live (TTL) is applied to carts to automatically clean up abandoned carts without running expensive cron jobs.

### 2. Inter-Service Communication
The Cart service only stores `productId` and `quantity`. It does *not* store the price or name, because those can change in the Catalog service.
- When `GET /api/cart` is called, the Cart service iterates over the `productId`s and makes internal HTTP requests to the **Catalog Service** to "hydrate" the response with the real-time product name and price.

### 3. Circuit Breaker Pattern (Opossum)
Because the Cart service relies on the Catalog service, what happens if the Catalog service goes offline? A naive implementation would crash the Cart service (Cascading Failure).
- I wrapped the HTTP call to the Catalog service in an `opossum` Circuit Breaker.
- If the Catalog service times out or returns 500 errors, the Circuit Breaker "opens".
- Instead of failing the user's cart request, the Cart service instantly returns a **Fallback Response** (e.g. `price: 0`, `name: "Product details temporarily unavailable"`). This ensures the user can still view their cart even during partial system outages!
