require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const catalogRoutes = require('./routes/catalog');
const { EventProducer } = require('event-bus');

const producer = new EventProducer('catalog-service', ['localhost:9092']);

const app = express();

app.use(cors());
app.use(express.json());

// Serve uploaded images statically
app.use('/api/catalog/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/catalog', catalogRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', service: 'Catalog' });
});

// Dummy route for Ping-Pong testing (Day 6)
app.post('/api/catalog/test-event', async (req, res) => {
  try {
    await producer.publish('test.topic', 'dummy-key', { 
      message: "Hello from Catalog via Kafka!", 
      timestamp: new Date().toISOString() 
    });
    res.json({ success: true, message: 'Event published to Kafka!' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to publish event' });
  }
});

const PORT = process.env.PORT || 3002;

if (require.main === module) {
  app.listen(PORT, async () => {
    console.log(`Catalog service listening on port ${PORT}`);
    // Connect Kafka Producer
    await producer.connect().catch(console.error);
  });
}

module.exports = app; // export for testing
