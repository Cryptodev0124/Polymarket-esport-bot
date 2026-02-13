module.exports = {
  // League of Legends event weights (based on historical impact)
  EVENT_WEIGHTS: {
    FIRST_BLOOD: 0.03,
    FIRST_TOWER: 0.04,
    DRAGON: 0.05,
    BARON_NASHOR: 0.12,
    TEAM_FIGHT_WIN: 0.08,
    INHIBITOR: 0.10,
    ELDER_DRAGON: 0.15,
    KILL_STREAK: 0.02,
    GOLD_LEAD_CHANGE: 0.03,
    RIFT_HERALD: 0.04,
    SHUTDOWN_GOLD: 0.03,
    CHAMPION_PICK: 0.01,
    ACE: 0.07,
    BASE_RACE: 0.20
  },
  
  // Trading parameters
  TRADING: {
    MIN_PROFIT_THRESHOLD: parseFloat(process.env.MIN_PROFIT_THRESHOLD) || 0.02,
    MAX_POSITION_SIZE: parseFloat(process.env.MAX_POSITION_SIZE) || 0.01,
    MAX_DAILY_RISK: parseFloat(process.env.MAX_DAILY_RISK) || 0.05,
    STOP_LOSS_TRIGGER: parseInt(process.env.STOP_LOSS_TRIGGER) || 3,
    COOLDOWN_MINUTES: parseInt(process.env.COOLDOWN_MINUTES) || 10,
    TRADE_DURATION_SECONDS: 30
  },
  
  // APIs
  PANDA_SCORE_BASE_URL: 'https://api.pandascore.co',
  POLYMARKET_BASE_URL: 'https://gamma-api.polymarket.com'
};