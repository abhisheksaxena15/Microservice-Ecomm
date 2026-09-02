require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cartRoutes = require('./routes/cart');

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
  app.listen(PORT, () => {
    console.log(`Cart service listening on port ${PORT}`);
  });
}

module.exports = app; // export for testing
