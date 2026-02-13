const { EVENT_WEIGHTS } = require('../../config/constants');
const Event = require('../models/Event');
const Match = require('../models/Match');

class OddsCalculator {
  constructor() {
    this.baseProbability = 0.5;
  }

  calculateEventImpact(eventType, context = {}) {
    const baseWeight = EVENT_WEIGHTS[eventType] || 0.01;
    
    // Adjust weights based on context
    let adjustedWeight = baseWeight;
    
    switch (eventType) {
      case 'DRAGON':
        // Elemental dragon type affects impact
        if (context.dragonType === 'ELDER') {
          adjustedWeight = EVENT_WEIGHTS.ELDER_DRAGON;
        }
        // Stacking dragons have more impact
        if (context.dragonCount >= 3) {
          adjustedWeight *= 1.5;
        }
        break;
        
      case 'TEAM_FIGHT_WIN':
        // Larger team fight wins have more impact
        if (context.killDifference >= 3) {
          adjustedWeight *= 1.3;
        }
        break;
        
      case 'GOLD_LEAD_CHANGE':
        // Significant gold swings matter more
        if (Math.abs(context.goldDifference) > 3000) {
          adjustedWeight *= 1.5;
        }
        break;
        
      case 'BARON_NASHOR':
        // Baron impact depends on game time
        if (context.gameTime > 30) {
          adjustedWeight *= 1.2; // Late game baron is more impactful
        }
        break;
    }
    
    return adjustedWeight;
  }

  async calculateWinProbability(matchId) {
    try {
      // Get recent events for this match (last 5 minutes)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      const recentEvents = await Event.find({
        matchId,
        timestamp: { $gte: fiveMinutesAgo }
      }).sort({ timestamp: -1 });
      
      // Get current match state
      const match = await Match.findOne({ matchId });
      if (!match) return { team1: 0.5, team2: 0.5 };
      
      // Start with base probability adjusted by current gold difference
      let team1Prob = 0.5;
      let team2Prob = 0.5;
      
      // Adjust for gold difference (approximately 1% per 1000 gold)
      const goldImpact = match.currentGoldDiff / 1000 * 0.01;
      team1Prob += goldImpact;
      team2Prob -= goldImpact;
      
      // Apply recent events
      for (const event of recentEvents) {
        const impact = event.winProbabilityImpact;
        
        if (event.team === match.team1) {
          team1Prob += impact;
          team2Prob -= impact;
        } else {
          team1Prob -= impact;
          team2Prob += impact;
        }
      }
      
      // Normalize probabilities
      const total = team1Prob + team2Prob;
      team1Prob = Math.max(0.01, Math.min(0.99, team1Prob / total));
      team2Prob = Math.max(0.01, Math.min(0.99, team2Prob / total));
      
      return {
        team1: team1Prob,
        team2: team2Prob
      };
    } catch (error) {
      console.error(`Error calculating win probability for match ${matchId}:`, error);
      return { team1: 0.5, team2: 0.5 };
    }
  }

  estimatePriceFromProbability(probability) {
    // Convert win probability to market price
    // Adjust for Polymarket fees and spread
    const adjustedProbability = probability * 0.98; // Account for 2% fees
    return Math.max(0.01, Math.min(0.99, adjustedProbability));
  }
}

module.exports = new OddsCalculator();