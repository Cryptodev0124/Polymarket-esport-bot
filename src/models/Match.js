const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
  matchId: {
    type: String,
    required: true,
    unique: true
  },
  team1: {
    type: String,
    required: true
  },
  team2: {
    type: String,
    required: true
  },
  startTime: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['upcoming', 'live', 'finished'],
    default: 'upcoming'
  },
  currentGoldDiff: {
    type: Number,
    default: 0
  },
  currentKills: {
    team1: { type: Number, default: 0 },
    team2: { type: Number, default: 0 }
  },
  objectives: {
    dragons: {
      team1: { type: Number, default: 0 },
      team2: { type: Number, default: 0 }
    },
    barons: {
      team1: { type: Number, default: 0 },
      team2: { type: Number, default: 0 }
    },
    towers: {
      team1: { type: Number, default: 0 },
      team2: { type: Number, default: 0 }
    },
    inhibitors: {
      team1: { type: Number, default: 0 },
      team2: { type: Number, default: 0 }
    }
  },
  estimatedWinProbability: {
    team1: { type: Number, default: 0.5 },
    team2: { type: Number, default: 0.5 }
  },
  polymarketMarketId: String,
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Match', matchSchema);