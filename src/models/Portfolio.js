const mongoose = require('mongoose');

const portfolioSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    unique: true
  },
  startingBalance: {
    type: Number,
    required: true,
    default: 1000
  },
  currentBalance: {
    type: Number,
    required: true,
    default: 1000
  },
  dailyProfitLoss: {
    type: Number,
    default: 0
  },
  totalTrades: {
    type: Number,
    default: 0
  },
  winningTrades: {
    type: Number,
    default: 0
  },
  losingTrades: {
    type: Number,
    default: 0
  },
  consecutiveLosses: {
    type: Number,
    default: 0
  },
  riskExposure: {
    type: Number,
    default: 0
  },
  isTradingEnabled: {
    type: Boolean,
    default: true
  },
  cooldownUntil: Date
});

module.exports = mongoose.model('Portfolio', portfolioSchema);