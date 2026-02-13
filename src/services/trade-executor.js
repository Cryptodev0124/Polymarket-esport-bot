const { v4: uuidv4 } = require('uuid');
const { TRADING } = require('../../config/constants');
const PolymarketAPI = require('./polymarket-api');
const Trade = require('../models/Trade');
const Portfolio = require('../models/Portfolio');
const logger = require('../utils/logger');

class TradeExecutor {
  constructor() {
    this.activeTrades = new Map();
    this.maxPositionSize = TRADING.MAX_POSITION_SIZE;
  }

  async checkPortfolioLimits() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      let portfolio = await Portfolio.findOne({ date: today });
      
      if (!portfolio) {
        portfolio = new Portfolio({ date: today });
        await portfolio.save();
      }
      
      // Check daily risk limit
      const riskExposure = portfolio.riskExposure;
      const maxDailyRisk = portfolio.startingBalance * TRADING.MAX_DAILY_RISK;
      
      if (riskExposure >= maxDailyRisk) {
        logger.warn('Daily risk limit reached. Trading disabled.');
        portfolio.isTradingEnabled = false;
        await portfolio.save();
        return false;
      }
      
      // Check consecutive losses
      if (portfolio.consecutiveLosses >= TRADING.STOP_LOSS_TRIGGER) {
        logger.warn(`Consecutive losses: ${portfolio.consecutiveLosses}. Entering cooldown.`);
        portfolio.isTradingEnabled = false;
        portfolio.cooldownUntil = new Date(Date.now() + TRADING.COOLDOWN_MINUTES * 60 * 1000);
        await portfolio.save();
        return false;
      }
      
      // Check cooldown period
      if (portfolio.cooldownUntil && new Date() < portfolio.cooldownUntil) {
        return false;
      }
      
      return portfolio.isTradingEnabled;
    } catch (error) {
      logger.error('Error checking portfolio limits:', error);
      return false;
    }
  }

  async executeTrade(matchId, marketId, side, entryPrice, estimatedProbability) {
    try {
      // Check if trading is allowed
      const canTrade = await this.checkPortfolioLimits();
      if (!canTrade) {
        logger.info('Trading disabled due to limits or cooldown');
        return null;
      }
      
      // Calculate position size
      const portfolio = await Portfolio.findOne({ date: new Date().setHours(0, 0, 0, 0) });
      const positionSize = portfolio.currentBalance * this.maxPositionSize;
      
      if (positionSize < 1) {
        logger.warn('Position size too small');
        return null;
      }
      
      // Place order on Polymarket
      const orderResult = await PolymarketAPI.placeOrder(
        marketId,
        side,
        positionSize,
        entryPrice
      );
      
      if (!orderResult) {
        logger.error('Failed to place order');
        return null;
      }
      
      // Create trade record
      const tradeId = uuidv4();
      const trade = new Trade({
        tradeId,
        matchId,
        marketId,
        side,
        entryPrice,
        size: positionSize,
        entryReason: `Arbitrage: Estimated probability ${estimatedProbability.toFixed(3)}, Market price ${entryPrice}`,
        status: 'open'
      });
      
      await trade.save();
      
      // Update portfolio
      portfolio.riskExposure += positionSize;
      portfolio.totalTrades += 1;
      await portfolio.save();
      
      // Start monitoring for exit
      this.monitorTrade(tradeId, marketId, estimatedProbability);
      
      logger.info(`Trade executed: ${tradeId} - ${side} @ ${entryPrice}`);
      return tradeId;
    } catch (error) {
      logger.error('Error executing trade:', error);
      return null;
    }
  }

  async monitorTrade(tradeId, marketId, targetProbability) {
    const startTime = Date.now();
    const maxDuration = TRADING.TRADE_DURATION_SECONDS * 1000;
    
    const monitorInterval = setInterval(async () => {
      try {
        const trade = await Trade.findOne({ tradeId });
        if (!trade || trade.status !== 'open') {
          clearInterval(monitorInterval);
          return;
        }
        
        // Check if maximum duration reached
        if (Date.now() - startTime > maxDuration) {
          await this.exitTrade(tradeId, 'timeout');
          clearInterval(monitorInterval);
          return;
        }
        
        // Get current market price
        const marketData = await PolymarketAPI.getMarketPrices(marketId);
        if (!marketData || !marketData.price) {
          return;
        }
        
        const currentPrice = parseFloat(marketData.price);
        const priceDifference = Math.abs(currentPrice - targetProbability);
        
        // Exit if price has corrected sufficiently
        if (priceDifference < 0.01) { // 1% threshold
          await this.exitTrade(tradeId, 'price_corrected');
          clearInterval(monitorInterval);
        }
        
        // Check for stop loss (if price moves against us significantly)
        const lossThreshold = trade.entryPrice * 0.95; // 5% stop loss
        if (trade.side === 'YES' && currentPrice < lossThreshold) {
          await this.exitTrade(tradeId, 'stop_loss');
          clearInterval(monitorInterval);
        } else if (trade.side === 'NO' && currentPrice > (1 - lossThreshold)) {
          await this.exitTrade(tradeId, 'stop_loss');
          clearInterval(monitorInterval);
        }
      } catch (error) {
        logger.error(`Error monitoring trade ${tradeId}:`, error);
        clearInterval(monitorInterval);
      }
    }, 1000); // Check every second
  }

  async exitTrade(tradeId, reason) {
    try {
      const trade = await Trade.findOne({ tradeId });
      if (!trade || trade.status !== 'open') {
        return;
      }
      
      // Get current market price for exit
      const marketData = await PolymarketAPI.getMarketPrices(trade.marketId);
      if (!marketData || !marketData.price) {
        logger.error(`Cannot exit trade ${tradeId}: No market data`);
        return;
      }
      
      const exitPrice = parseFloat(marketData.price);
      
      // Calculate P&L
      let profitLoss;
      if (trade.side === 'YES') {
        profitLoss = (exitPrice - trade.entryPrice) * trade.size;
      } else {
        profitLoss = (trade.entryPrice - exitPrice) * trade.size;
      }
      
      // Update trade record
      trade.exitPrice = exitPrice;
      trade.profitLoss = profitLoss;
      trade.status = 'closed';
      trade.exitReason = reason;
      trade.closedAt = new Date();
      trade.durationSeconds = Math.floor((trade.closedAt - trade.openedAt) / 1000);
      
      await trade.save();
      
      // Update portfolio
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const portfolio = await Portfolio.findOne({ date: today });
      if (portfolio) {
        portfolio.currentBalance += profitLoss;
        portfolio.dailyProfitLoss += profitLoss;
        portfolio.riskExposure -= trade.size;
        
        if (profitLoss > 0) {
          portfolio.winningTrades += 1;
          portfolio.consecutiveLosses = 0;
        } else {
          portfolio.losingTrades += 1;
          portfolio.consecutiveLosses += 1;
        }
        
        await portfolio.save();
      }
      
      logger.info(`Trade closed: ${tradeId} - P&L: ${profitLoss.toFixed(2)}, Reason: ${reason}`);
      
    } catch (error) {
      logger.error(`Error exiting trade ${tradeId}:`, error);
    }
  }
}

module.exports = new TradeExecutor();