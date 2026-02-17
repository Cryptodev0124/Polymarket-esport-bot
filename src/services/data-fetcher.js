const axios = require('axios');
const { PANDA_SCORE_BASE_URL } = require('../../config/constants');
require('dotenv').config();
const WebSocket = require('ws');

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
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await axios.get(
          `${PANDA_SCORE_BASE_URL}/matches/${matchId}`,
          { headers: this.headers }
        );
        return response.data;
      } catch (error) {
        if (error.response) {
          console.error(`Error fetching match ${matchId} (attempt ${attempt}):`, error.message, 'status=', error.response.status);
          try { console.error('response data:', JSON.stringify(error.response.data)); } catch (e) { console.error('response data (raw):', error.response.data); }
        } else {
          console.error(`Error fetching match ${matchId} (attempt ${attempt}):`, error.message);
        }

        // small backoff before retrying
        if (attempt < maxAttempts) {
          await new Promise(res => setTimeout(res, 500 * attempt));
        }
      }
    }

    return null;
  }

  async getMatchEvents(matchId) {
    try {
      console.log('debug->matchId', matchId);
      const socket = new WebSocket(`wss://live.pandascore.co/matches/${matchId}?token=${process.env.PANDA_SCORE_API_KEY}`);

      // socket.onmessage = function (event) {
      //   console.log(JSON.parse(event.data))
      //   return JSON.parse(event.data);
      // }
      socket.on('message', data => {
        const event = JSON.parse(data);
        console.log('Received event:', event);
      });
      // const response = await axios.get(
      //   `${PANDA_SCORE_BASE_URL}/lol/games/273905/events`,
      //   { headers: this.headers }
      // );
      // console.log('response', response.data);
      // return response.data;
    } catch (error) {
      console.error(`Error fetching events for match ${matchId}:`, error.message);
      return [];
    }
  }
}

module.exports = new DataFetcher();