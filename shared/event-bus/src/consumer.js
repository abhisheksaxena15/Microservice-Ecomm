const { Kafka } = require('kafkajs');
const EventProducer = require('./producer');

class EventConsumer {
  /**
   * @param {string} clientId - Unique ID for the Kafka client
   * @param {string} groupId - Consumer group ID
   * @param {Array<string>} brokers - Array of Kafka brokers
   */
  constructor(clientId, groupId, brokers) {
    this.kafka = new Kafka({
      clientId: clientId,
      brokers: brokers || ['localhost:9092'],
    });

    this.consumer = this.kafka.consumer({ groupId: groupId });
    
    // We instantiate a producer specifically to publish messages to the DLQ when they fail repeatedly
    this.dlqProducer = new EventProducer(`${clientId}-dlq-producer`, brokers);
  }

  async connect() {
    await this.consumer.connect();
    await this.dlqProducer.connect();
    console.log(`[Kafka Consumer] Connected to group '${this.consumer.groupId}'`);
  }

  async disconnect() {
    await this.consumer.disconnect();
    await this.dlqProducer.disconnect();
  }

  /**
   * Subscribes to a topic and processes messages with manual offsets and DLQ
   * @param {string} topic - The topic to listen to
   * @param {Function} handler - Async function(payload) that processes the message
   * @param {number} maxRetries - Number of times to retry before sending to DLQ
   */
  async subscribe(topic, handler, maxRetries = 3) {
    await this.connect();
    
    // fromBeginning: true ensures that if the service boots up late, it processes all past events
    await this.consumer.subscribe({ topic, fromBeginning: true });

    await this.consumer.run({
      // IMPORTANT: Disable auto-commit! 
      // We only want to commit the offset IF our handler succeeds, or IF it fails 3 times and is safely put in the DLQ.
      autoCommit: false,
      
      eachMessage: async ({ topic, partition, message, heartbeat }) => {
        const payload = JSON.parse(message.value.toString());
        let attempts = 0;
        let success = false;

        while (attempts < maxRetries && !success) {
          try {
            attempts++;
            console.log(`[Kafka Consumer] Processing message from '${topic}' (Attempt ${attempts}/${maxRetries})`);
            
            // Execute the business logic!
            await handler(payload);
            
            success = true;
          } catch (error) {
            console.error(`[Kafka Consumer] Error processing message on attempt ${attempts}:`, error.message);
            
            if (attempts >= maxRetries) {
              console.error(`[Kafka Consumer] Message failed ${maxRetries} times. Routing to Dead-Letter Queue (DLQ).`);
              
              // Publish the exact same payload to a special DLQ topic so engineers can inspect it later
              const dlqTopic = `${topic}.dlq`;
              await this.dlqProducer.publish(dlqTopic, message.key?.toString(), {
                originalPayload: payload,
                error: error.message,
                failedAt: new Date().toISOString()
              });
              
              // We consider the message "handled" because it's safely in the DLQ. We break the loop so we can commit the offset.
              success = true; 
            } else {
              // Wait a bit before retrying (Exponential Backoff)
              await new Promise(res => setTimeout(res, 1000 * attempts));
            }
          }
        }

        // If success is true (either the handler worked, or we safely dumped it in the DLQ), 
        // we MANUALLY commit the offset so Kafka knows we are done with it.
        if (success) {
          const offset = (BigInt(message.offset) + 1n).toString();
          await this.consumer.commitOffsets([{ topic, partition, offset }]);
          console.log(`[Kafka Consumer] Successfully committed offset ${offset} for topic '${topic}'`);
        }
      },
    });
  }
}

module.exports = EventConsumer;
