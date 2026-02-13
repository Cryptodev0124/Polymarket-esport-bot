const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  matchId: {
    type: String,
    required: true
  },
  eventType: {
    type: String,
    required: true,
    enum: [
      'FIRST_BLOOD', 'FIRST_TOWER', 'DRAGON', 'BARON_NASHOR',
      'TEAM_FIGHT_WIN', 'INHIBITOR', 'ELDER_DRAGON', 'KILL_STREAK',
      'GOLD_LEAD_CHANGE', 'RIFT_HERALD', 'SHUTDOWN_GOLD',
      'CHAMPION_PICK', 'ACE', 'BASE_RACE', 'KILL', 'TOWER_DESTROYED'
    ]
  },
  team: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  details: mongoose.Schema.Types.Mixed,
  winProbabilityImpact: {
    type: Number,
    required: true
  }
});

module.exports = mongoose.model('Event', eventSchema);