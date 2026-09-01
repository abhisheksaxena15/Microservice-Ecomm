# API Gateway (Day 3)

## Overview
The API Gateway acts as the single point of entry ("Front Door") for all client requests, shielding the internal microservice mesh from the public internet.

## Key Technical Implementations (For Interviews)

### 1. Circuit Breaker Pattern (Opossum)
In distributed systems, downstream service failures can cause cascading timeouts that crash the Gateway. 
- I wrapped every proxy route in an `opossum` Circuit Breaker.
- If an internal service (e.g., Auth) fails repeatedly (>50% error rate), the Circuit Breaker "Opens".
- It immediately returns `503 Service Unavailable` for subsequent requests, protecting the Gateway's thread pool and giving the downstream service time to recover before "Half-Opening" to test health again.

### 2. Distributed Tracing (Correlation IDs)
Because requests jump across multiple microservices, debugging logs is nearly impossible without context.
- The Gateway generates a unique `UUID` (e.g., `req-1a2b3c`) for every incoming HTTP request.
- It injects this into the `x-request-id` header before proxying.
- Every downstream service logs this ID, allowing developers to trace the exact journey of a single user action across the entire distributed architecture.

### 3. Distributed Rate Limiting (Redis)
To protect against DDoS attacks and brute-forcing:
- I implemented `express-rate-limit` using a **Redis Store**.
- Because Redis is centralized, the rate limits are enforced perfectly across multiple instances of the Gateway, ensuring horizontal scalability doesn't compromise security rules.

### 4. Dynamic Path Forwarding
Utilizes `http-proxy-middleware` to dynamically inspect incoming URLs and forward them to the correct microservice container, preserving the original URI path to ensure downstream routers (like Express) can handle endpoints natively.
