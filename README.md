# E-commerce Microservices Backend

## Target Architecture

```
                        ┌────────────────────┐
                        │    API GATEWAY      │  
                        │  Auth check, LB,     │   
                        │  Rate limit          │
                        └─────────┬───────────┘
        ┌───────────┬─────────────┼─────────────┬───────────────┐
        ▼           ▼             ▼             ▼               ▼
   ┌────────┐  ┌───────────┐ ┌─────────┐  ┌──────────┐   ┌──────────────┐
   │  Auth  │  │  Catalog  │ │  Order  │  │ Payment  │   │  Inventory   │
   │Service │  │ +Cart     │ │ Service │  │ Service  │   │  Service     │
   └────────┘  └───────────┘ └────┬────┘  └────┬─────┘   └──────┬───────┘
                                   │            │                │
                              ┌────▼────────────▼────────────────▼────┐
                              │        KAFKA EVENT BUS (choreography)  │
                              └────────────────┬────────────────────┘
                                                ▼
                                    ┌───────────────────────┐
                                    │  Notification Service  │
                                    └───────────────────────┘
```

## Event Contract

| Event | Producer | Consumer(s) |
|---|---|---|
| `order.created` | Order | Inventory |
| `inventory.reserved` | Inventory | Payment, Order |
| `inventory.failed` | Inventory | Order |
| `inventory.released` | Inventory | Order |
| `payment.completed` | Payment | Order |
| `payment.failed` | Payment | Inventory, Order |
| `order.confirmed` | Order | Notification |
| `order.cancelled` | Order | Notification |
