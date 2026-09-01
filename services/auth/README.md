# Auth Service (Day 2)

## Overview
The Authentication Service is an isolated microservice handling user identity, secure login/signup, and JWT token issuing.

## Key Technical Implementations (For Interviews)

### 1. Dual-Token Architecture
To balance stateless performance with security, I implemented a dual-token system:
- **Access Tokens:** Short-lived (15 minutes), stateless JWTs used for rapid API authorization without hitting a database.
- **Refresh Tokens:** Long-lived (7 days), stateful tokens stored securely as bcrypt hashes in PostgreSQL. When an Access Token expires, the client uses the Refresh Token to get a new pair.

### 2. Secure Logout via Redis Blacklisting
Stateless JWTs cannot be revoked natively before they expire. To solve the "Logout Problem":
- When a user logs out, their current Access Token ID is pushed into a **Redis Blacklist** with a TTL matching the token's remaining lifespan.
- The API Gateway checks this in-memory list on every request, allowing instant token revocation while keeping the 99% "happy path" extremely fast.

### 3. CPU / I/O Isolation
By separating Auth into its own service, the heavily CPU-intensive task of hashing passwords (using `bcrypt` with cost=12) is isolated from the I/O-intensive API Gateway. This prevents authentication spikes from blocking the Node.js event loop of the entire application.

### 4. OAuth2 Integration
Implemented `passport-google-oauth20` to support modern Social Logins, handling profile extraction and automatic JWT provisioning for third-party users.
