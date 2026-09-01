require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const catalogRoutes = require('./routes/catalog');

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

const PORT = process.env.PORT || 3002;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Catalog service listening on port ${PORT}`);
  });
}

module.exports = app; // export for testing
