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

## What We Have Built So Far (Day 6 - Part 2)

### The Resilient Consumer
The `EventConsumer` wrapper (`src/consumer.js`) is designed to prevent data loss when consuming events from Kafka.

#### 1. Manual Offset Committing
By default, Kafka automatically commits an offset (marks a message as "read") the moment it is handed to a consumer. 
**The Problem:** If our microservice crashes *while* processing the message (e.g. while saving to the database), the message is lost forever because Kafka thinks we already processed it!
**The Solution:** We set `autoCommit: false`. Our consumer processes the message entirely, and *only* when the database save is successful do we run `commitOffsets()`. If the service crashes, Kafka will re-deliver the message when the service restarts.

#### 2. Dead-Letter Queues (DLQ)
What happens if a message is fundamentally broken (a "poison pill") and causes our code to throw an error every single time? With manual offsets, the service would get stuck in an infinite loop, constantly crashing and retrying the same bad message forever.
**The Solution:** Our wrapper catches errors and implements a retry loop with exponential backoff (e.g. retrying 3 times). If it fails on the final attempt, our Consumer takes the broken payload and publishes it to a special `<topic>.dlq` topic (Dead Letter Queue). It then commits the offset to unblock the system. Engineers can monitor the DLQ topic and fix the broken messages manually!

---

## Upcoming (Day 6 - Part 3)
We will perform the "Ping-Pong" test! We will wire this new library into the **Catalog** and **Cart** services, and broadcast a dummy event across our local Kafka broker to see the DLQ and Consumer in action.
