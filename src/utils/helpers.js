const { TRADING } = require('../../config/constants');

class Helpers {
  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static calculatePositionSize(balance, riskPercentage = TRADING.MAX_POSITION_SIZE) {
    return balance * riskPercentage;
  }

  static calculateProfitLoss(entryPrice, exitPrice, size, side) {
    if (side === 'YES') {
      return (exitPrice - entryPrice) * size;
    } else {
      return (entryPrice - exitPrice) * size;
    }
  }

  static formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }

  static isValidPrice(price) {
    return !isNaN(price) && price > 0 && price < 1;
  }

  static calculateConfidenceScore(probability, marketPrice) {
    const discrepancy = Math.abs(probability - marketPrice);
    return Math.min(100, Math.max(0, 100 - (discrepancy * 1000)));
  }
}

module.exports = Helpers;