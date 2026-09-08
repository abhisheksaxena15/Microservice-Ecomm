const { Kafka, Partitioners } = require('kafkajs');

class EventProducer {
  constructor(clientId, brokers) {
    this.kafka = new Kafka({
      clientId: clientId,
      brokers: brokers || ['localhost:9092'],
    });

    // We use DefaultPartitioner to distribute messages across partitions
    // We configure idempotency to prevent duplicate messages if a network failure happens during an ack
    this.producer = this.kafka.producer({
      createPartitioner: Partitioners.DefaultPartitioner,
      idempotent: true,
      maxInFlightRequests: 5, // Required for idempotency
    });
    
    this.isConnected = false;
  }

  async connect() {
    if (this.isConnected) return;
    try {
      await this.producer.connect();
      this.isConnected = true;
      console.log(`[Kafka Producer] ${this.kafka.clientId} connected successfully`);
    } catch (error) {
      console.error(`[Kafka Producer] Failed to connect:`, error);
      throw error;
    }
  }

  async disconnect() {
    if (!this.isConnected) return;
    await this.producer.disconnect();
    this.isConnected = false;
    console.log(`[Kafka Producer] ${this.kafka.clientId} disconnected`);
  }

  /**
   * Publishes an event to a specific topic
   * @param {string} topic - The Kafka topic name
   * @param {string} key - Optional routing key (events with same key go to same partition)
   * @param {object} payload - The event data
   */
  async publish(topic, key, payload) {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      const message = {
        value: JSON.stringify(payload),
      };
      
      // If a key is provided, it guarantees all events for that specific key (e.g. orderId) 
      // are processed in exact order by sending them to the same partition.
      if (key) {
        message.key = key;
      }

      await this.producer.send({
        topic: topic,
        messages: [message],
        // acks: -1 (all) is automatically enforced because idempotent is true
      });

      console.log(`[Kafka Producer] Published event to topic '${topic}'`, { key });
      return true;
    } catch (error) {
      console.error(`[Kafka Producer] Error publishing to topic '${topic}':`, error);
      throw error;
    }
  }
}

module.exports = EventProducer;
