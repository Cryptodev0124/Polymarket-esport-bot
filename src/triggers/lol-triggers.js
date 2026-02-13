const OddsCalculator = require('../services/odds-calculator');
const Event = require('../models/Event');
const Match = require('../models/Match');

class LoLTriggers {
  constructor() {
    this.eventHandlers = {
      'first_blood': this.handleFirstBlood,
      'first_tower': this.handleFirstTower,
      'dragon': this.handleDragon,
      'baron': this.handleBaron,
      'inhibitor': this.handleInhibitor,
      'team_fight': this.handleTeamFight,
      'elder_dragon': this.handleElderDragon,
      'kill': this.handleKill,
      'tower': this.handleTower,
      'gold_lead_change': this.handleGoldLeadChange
    };
  }

  async processEvent(matchId, eventType, data) {
    const handler = this.eventHandlers[eventType];
    if (handler) {
      return await handler.call(this, matchId, data);
    }
    return null;
  }

  async handleFirstBlood(matchId, data) {
    const impact = OddsCalculator.calculateEventImpact('FIRST_BLOOD', data);
    
    const event = new Event({
      matchId,
      eventType: 'FIRST_BLOOD',
      team: data.team,
      details: data,
      winProbabilityImpact: impact
    });
    
    await event.save();
    return impact;
  }

  async handleFirstTower(matchId, data) {
    const impact = OddsCalculator.calculateEventImpact('FIRST_TOWER', data);
    
    const event = new Event({
      matchId,
      eventType: 'FIRST_TOWER',
      team: data.team,
      details: data,
      winProbabilityImpact: impact
    });
    
    await event.save();
    return impact;
  }

  async handleDragon(matchId, data) {
    const impact = OddsCalculator.calculateEventImpact('DRAGON', data);
    
    const event = new Event({
      matchId,
      eventType: 'DRAGON',
      team: data.team,
      details: data,
      winProbabilityImpact: impact
    });
    
    await event.save();
    return impact;
  }

  async handleBaron(matchId, data) {
    const impact = OddsCalculator.calculateEventImpact('BARON_NASHOR', data);
    
    const event = new Event({
      matchId,
      eventType: 'BARON_NASHOR',
      team: data.team,
      details: data,
      winProbabilityImpact: impact
    });
    
    await event.save();
    return impact;
  }

  async handleInhibitor(matchId, data) {
    const impact = OddsCalculator.calculateEventImpact('INHIBITOR', data);
    
    const event = new Event({
      matchId,
      eventType: 'INHIBITOR',
      team: data.team,
      details: data,
      winProbabilityImpact: impact
    });
    
    await event.save();
    return impact;
  }

  async handleTeamFight(matchId, data) {
    const impact = OddsCalculator.calculateEventImpact('TEAM_FIGHT_WIN', data);
    
    const event = new Event({
      matchId,
      eventType: 'TEAM_FIGHT_WIN',
      team: data.winningTeam,
      details: data,
      winProbabilityImpact: impact
    });
    
    await event.save();
    return impact;
  }

  async handleElderDragon(matchId, data) {
    const impact = OddsCalculator.calculateEventImpact('ELDER_DRAGON', data);
    
    const event = new Event({
      matchId,
      eventType: 'ELDER_DRAGON',
      team: data.team,
      details: data,
      winProbabilityImpact: impact
    });
    
    await event.save();
    return impact;
  }

  async handleKill(matchId, data) {
    // Update match kills count
    await Match.findOneAndUpdate(
      { matchId },
      { 
        $inc: { 
          [`currentKills.${data.team === 'team1' ? 'team1' : 'team2'}`]: 1 
        } 
      }
    );
    
    // Check for kill streaks
    if (data.isStreak) {
      const impact = OddsCalculator.calculateEventImpact('KILL_STREAK', data);
      
      const event = new Event({
        matchId,
        eventType: 'KILL_STREAK',
        team: data.team,
        details: data,
        winProbabilityImpact: impact
      });
      
      await event.save();
      return impact;
    }
    
    return 0.001; // Small impact for regular kills
  }

  async handleTower(matchId, data) {
    // Update match tower count
    await Match.findOneAndUpdate(
      { matchId },
      { 
        $inc: { 
          [`objectives.towers.${data.team === 'team1' ? 'team1' : 'team2'}`]: 1 
        } 
      }
    );
    
    return 0.002; // Small impact for regular towers
  }

  async handleGoldLeadChange(matchId, data) {
    // Update match gold difference
    await Match.findOneAndUpdate(
      { matchId },
      { currentGoldDiff: data.goldDifference }
    );
    
    if (Math.abs(data.goldDifference) > 2000) {
      const impact = OddsCalculator.calculateEventImpact('GOLD_LEAD_CHANGE', data);
      
      const event = new Event({
        matchId,
        eventType: 'GOLD_LEAD_CHANGE',
        team: data.goldDifference > 0 ? 'team1' : 'team2',
        details: data,
        winProbabilityImpact: impact
      });
      
      await event.save();
      return impact;
    }
    
    return 0.001;
  }
}

module.exports = new LoLTriggers();