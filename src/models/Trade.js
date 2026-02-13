const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema({
  tradeId: {
    type: String,
    required: true,
    unique: true
  },
  matchId: {
    type: String,
    required: true
  },
  marketId: {
    type: String,
    required: true
  },
  side: {
    type: String,
    enum: ['YES', 'NO'],
    required: true
  },
  entryPrice: {
    type: Number,
    required: true
  },
  exitPrice: Number,
  size: {
    type: Number,
    required: true
  },
  profitLoss: Number,
  status: {
    type: String,
    enum: ['open', 'closed', 'cancelled'],
    default: 'open'
  },
  entryReason: String,
  exitReason: String,
  openedAt: {
    type: Date,
    default: Date.now
  },
  closedAt: Date,
  durationSeconds: Number
});

module.exports = mongoose.model('Trade', tradeSchema);