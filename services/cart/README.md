# Cart Service (Day 5)

## Overview
The Cart Service manages the shopping carts for users in our E-commerce microservices platform. Because shopping carts require extremely fast, high-frequency read/write operations and are inherently transient (they don't need to live forever like user profiles or past orders), this service uses **Redis** as its primary data store rather than a traditional SQL database like PostgreSQL.

This document breaks down every architectural decision and implementation detail for the Cart Service.

---

## 1. Core Architecture: Redis Storage Strategy

### Why Redis?
Traditional SQL databases are disk-bound, meaning every read and write involves the hard drive, which introduces latency. Shopping carts are constantly updated as users browse and add/remove items. Redis is an **In-Memory Data Structure Store**, making it exponentially faster than disk-based databases. It is the industry standard for caching and session/cart management.

### Data Structure: Redis Hashes
We store the cart data using **Redis Hashes** (`HSET`, `HGETALL`).
- The **Key** is the `userId` (e.g., `cart:123`).
- The **Fields** inside the hash are the `productId`s.
- The **Values** are the `quantity` of that product.

This allows us to perform atomic operations. If a user adds an item, we use `HINCRBY` (Hash Increment By) to safely increase the quantity without worrying about race conditions if the user clicks the "Add to Cart" button multiple times simultaneously.

---

## 2. The Hydration Process (Data Normalization)

A critical rule in microservices is avoiding data duplication where possible to prevent synchronization issues. 

**What we DO NOT store in the Cart:**
We do not store the product's `name`, `price`, or `image` in the Redis Cart. If the Catalog service updates a product's price from $10 to $15, our Cart would have stale data if we cached the price directly.

**What we DO store:**
We only store the `productId` and the `quantity`.

**The Hydration Step:**
When a client makes a request to `GET /api/cart`, the Cart Service:
1. Fetches the raw `productId`s and quantities from Redis.
2. Makes synchronous HTTP calls via `axios` to the **Catalog Service**.
3. Merges (hydrates) the real-time prices and names from the Catalog with the quantities from Redis.
4. Calculates the total cart price and returns the fully enriched response to the client.

---

## 3. Resilience: The Circuit Breaker Pattern

Because the Cart Service makes synchronous HTTP calls to the Catalog Service during the Hydration process, we have introduced a tight coupling. 
**The Threat:** If the Catalog Service crashes or experiences a massive traffic spike, its API will start timing out. The Cart Service will wait for the Catalog Service, causing the Cart Service to also time out and crash. This is known as a **Cascading Failure**, which can take down an entire platform.

### Implementation with `opossum`
To prevent this, we implemented the **Circuit Breaker Pattern** using the `opossum` library.
The HTTP call to the Catalog Service is wrapped in a Circuit Breaker. 

1. **Closed State (Normal):** Traffic flows normally to the Catalog Service.
2. **Open State (Failing):** If the Catalog Service starts returning 500 errors or times out beyond our configured threshold, the Circuit Breaker "trips" and opens. It instantly stops sending traffic to the Catalog Service, giving it time to recover.
3. **Half-Open State (Testing):** After a cooldown period, the breaker allows a single test request through. If it succeeds, the breaker closes. If it fails, it remains open.

### Fallback Responses (Failing Open)
When the circuit is Open, instead of throwing a 500 Error to the user, our application **Fails Open**. It triggers a `fallback` function that returns dummy data for the product:
```json
{
  "id": 123,
  "name": "Product details temporarily unavailable",
  "price": 0
}
```
*Why?* This ensures the user can still access their cart and see how many items they have, even during a partial system outage!

---

## 4. API Endpoints

The Cart Service exposes the following endpoints (routed through the API Gateway at `/api/cart`):

- **`GET /api/cart`**
  - Fetches the user's cart from Redis.
  - Hydrates the cart with real-time data from the Catalog Service.
  - Returns the total price.

- **`POST /api/cart/items`**
  - Accepts `productId` and `quantity`.
  - Validates that the `productId` actually exists in the Catalog Service.
  - Adds or increments the item in the Redis Hash.

- **`DELETE /api/cart/items/:productId`**
  - Removes a specific product from the user's Redis Cart.

- **`DELETE /api/cart`**
  - Completely clears the user's cart (used after a successful checkout).

---

## 5. Automated Testing Setup

To ensure reliability, we implemented an automated test suite using **Jest** and **Supertest**.
Because we are building microservices, we do not want our Cart tests to actually hit a real Redis database or the real Catalog service.

### Mocking Dependencies
1. **Mocking Redis:** We mock the `redis` client to simulate database calls (`hGetAll`, `hSet`, `hDel`) without needing a live Redis server running in CI/CD.
2. **Mocking Axios:** We mock `axios` to simulate responses from the Catalog Service. This allows us to test both the "Happy Path" (Catalog responds with 200 OK) and the "Circuit Breaker Path" (Catalog responds with 500 Error, triggering our fallback logic).
