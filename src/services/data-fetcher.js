const axios = require('axios');
const { PANDA_SCORE_BASE_URL } = require('../../config/constants');
require('dotenv').config();

class DataFetcher {
  constructor() {
    this.apiKey = process.env.PANDA_SCORE_API_KEY;
    this.headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Accept': 'application/json'
    };
  }

  async getLiveMatches() {
    try {
      const response = await axios.get(
        `${PANDA_SCORE_BASE_URL}/lol/matches/running`,
        { headers: this.headers }
      );
      return response.data;
    } catch (error) {
      // Log more details to help diagnose 401/authorization issues
      if (error.response) {
        console.error('Error fetching live matches:', error.message, 'status=', error.response.status);
        // Avoid printing full response body if it's large, but include useful message
        try {
          console.error('response data:', JSON.stringify(error.response.data));
        } catch (e) {
          console.error('response data (raw):', error.response.data);
        }
      } else {
        console.error('Error fetching live matches:', error.message);
      }
      return [];
    }
  }

  async getMatchDetails(matchId) {
    try {
      const response = await axios.get(
        `${PANDA_SCORE_BASE_URL}/matches/${matchId}`,
        { headers: this.headers }
      );
      return response.data;
    } catch (error) {
      console.error(`Error fetching match ${matchId}:`, error.message);
      return null;
    }
  }

  async getMatchEvents(gameId) {
    try {
        console.log('debug->gameId', gameId);
      const response = await axios.get(
        `${PANDA_SCORE_BASE_URL}/lol/games/275384/events`,
        { headers: this.headers }
      );
      console.log('response', response.data);
      return response.data;
    } catch (error) {
      console.error(`Error fetching events for game ${gameId}:`, error.message);
      return [];
    }
  }
}

module.exports = new DataFetcher();