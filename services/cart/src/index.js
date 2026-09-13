require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cartRoutes = require('./routes/cart');
const { EventConsumer } = require('event-bus');

const consumer = new EventConsumer('cart-service', 'cart-group', ['localhost:9092']);

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/cart', cartRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', service: 'Cart' });
});

const PORT = process.env.PORT || 3003;

if (require.main === module) {
  app.listen(PORT, async () => {
    console.log(`Cart service listening on port ${PORT}`);
    
    // Subscribe to the Ping-Pong event from Catalog!
    await consumer.subscribe('test.topic', async (payload) => {
      console.log('🎉 [Cart Service] Received Ping-Pong Event from Kafka:', payload);
    }).catch(console.error);
  });
}

module.exports = app; // export for testing
