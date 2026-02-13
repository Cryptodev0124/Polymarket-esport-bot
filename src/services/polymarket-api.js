const axios = require('axios');
const { POLYMARKET_BASE_URL } = require('../../config/constants');
require('dotenv').config();

class PolymarketAPI {
  constructor() {
    this.apiKey = process.env.POLYMARKET_API_KEY;
    this.headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Fetch esports markets from Polymarket.
   * By default this returns esports markets for "League of Legends".
   * Options:
   *   - liveOnly: boolean (default false) => attempt to return only markets that appear live/open
   *   - titleIncludes: string => filter markets whose title includes this substring (case-insensitive)
   */
  async getEsportsMarkets(slug) {
    try {
        console.log('slug', slug);
        // Fetch all active markets
        const response = await axios.get(`${POLYMARKET_BASE_URL}/markets?slug=league-of-legends-lcp-split-1-2026`, {
            headers: this.headers,
            params: {
                limit: 500,
                active: 'true',
                closed: 'false'
            }
        });

        const market = response.data;
        console.log('market', market);
        
        // Filter for esports markets
        // const esportsKeywords = [
        //     'esports', 'esport', 'gaming', 'game',
        //     'league of legends', 'lol', 'sports'
        // ];

        // const liveEsportsMarkets = markets.filter(market => {
        //     // Check if market is active
        //     // if (!market.active || market.closed) return false;
            
        //     // Check category and question for esports keywords
        //     const category = (market.category || '').toLowerCase();
        //     const question = (market.sport || '').toLowerCase();
            
        //     return esportsKeywords.some(keyword => 
        //         category.includes(keyword) || question.includes(keyword)
        //     );
        // });
        // console.log('liveEsportsMarkets', liveEsportsMarkets);

        return market;
        
    } catch (error) {
        console.error('Error fetching esports markets:', error.message);
        throw error;
    }
  }

  async getMarketPrices(marketId) {
    try {
      const response = await axios.get(
        `${POLYMARKET_BASE_URL}/markets/${marketId}/prices`,
        { headers: this.headers }
      );
      return response.data;
    } catch (error) {
      console.error(`Error fetching prices for market ${marketId}:`, error.message);
      return null;
    }
  }

  async placeOrder(marketId, side, amount, price) {
    try {
      const order = {
        marketId,
        side, // 'YES' or 'NO'
        amount: amount.toString(),
        price: price.toString()
      };

      const response = await axios.post(
        `${POLYMARKET_BASE_URL}/orders`,
        order,
        { headers: this.headers }
      );
      
      console.log(`Order placed: ${side} ${amount} @ ${price} on market ${marketId}`);
      return response.data;
    } catch (error) {
      console.error('Error placing order:', error.message);
      return null;
    }
  }

  async cancelOrder(orderId) {
    try {
      const response = await axios.delete(
        `${POLYMARKET_BASE_URL}/orders/${orderId}`,
        { headers: this.headers }
      );
      return response.data;
    } catch (error) {
      console.error(`Error cancelling order ${orderId}:`, error.message);
      return null;
    }
  }

  async getOrderStatus(orderId) {
    try {
      const response = await axios.get(
        `${POLYMARKET_BASE_URL}/orders/${orderId}`,
        { headers: this.headers }
      );
      return response.data;
    } catch (error) {
      console.error(`Error fetching order status ${orderId}:`, error.message);
      return null;
    }
  }
}

module.exports = new PolymarketAPI();