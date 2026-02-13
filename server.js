const express = require('express');
const connectDB = require('./config/database');
const ArbitrageBot = require('./src/bot/arbitrage-bot');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    activeMatches: ArbitrageBot.activeMatches.size,
    isRunning: ArbitrageBot.isRunning
  });
});

// Portfolio status endpoint
app.get('/portfolio', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const portfolio = await require('./src/models/Portfolio').findOne({ date: today });
    
    res.json({
      portfolio,
      activeTrades: Array.from(ArbitrageBot.activeMatches.keys())
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
async function startServer() {
  try {
    // Connect to database
    await connectDB();
    
    // Initialize bot
    await ArbitrageBot.initialize();
    
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
    });
    
    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('SIGTERM received. Shutting down gracefully...');
      await ArbitrageBot.stop();
      process.exit(0);
    });
    
    process.on('SIGINT', async () => {
      console.log('SIGINT received. Shutting down gracefully...');
      await ArbitrageBot.stop();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();