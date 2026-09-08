# Shared Event-Bus Package (Kafka)

## Overview
This package is a centralized utility for all microservices in the E-commerce platform to interact with Apache Kafka. By centralizing our Kafka logic here, we ensure that every microservice handles events, errors, and retries in the exact same standardized way.

## What We Have Built So Far (Day 6 - Part 1)

### The Idempotent Producer
Currently, we have implemented the `EventProducer` wrapper (`src/producer.js`).

In a distributed system, network glitches are common. If a microservice publishes an event to Kafka, but the network cuts out before Kafka can send an "Acknowledgement" (ACK) back, the microservice might assume the publish failed and retry sending it. This creates **duplicate events**, which can result in users being charged twice or emails being sent twice!

To solve this, our `EventProducer` is built with **Idempotency** enabled (`idempotent: true`).
- Under the hood, the KafkaJS client assigns a unique sequence number to every message it sends.
- If the producer accidentally sends a duplicate message because of a retry, Kafka will see the duplicate sequence number and safely ignore it.
- This guarantees **Exactly-Once** publishing semantics!

### Partition Routing (Keys)
Our `publish(topic, key, payload)` method accepts a `key`. 
If we pass an `orderId` as the key, Kafka guarantees that every event related to that specific `orderId` will be routed to the exact same partition. Since partitions are processed sequentially, this guarantees that an "Order Created" event will always be processed *before* an "Order Shipped" event for the same order.

---

## Upcoming (Day 6 - Part 2)
In the next steps, we will be adding the `EventConsumer` to this package, which will feature:
1. **Manual Offset Committing:** To prevent message loss if a service crashes mid-processing.
2. **Dead-Letter Queues (DLQ):** To catch "poison pill" messages that fail repeatedly, moving them to a safe `.dlq` topic so the system doesn't get infinitely stuck.
