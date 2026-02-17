const axios = require('axios');
const { PANDA_SCORE_BASE_URL } = require('../../config/constants');
require('dotenv').config();
const WebSocket = require('ws');
const EventEmitter = require('events');

class DataFetcher {
  constructor() {
    this.apiKey = process.env.PANDA_SCORE_API_KEY;
    this.headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Accept': 'application/json'
    };
    // live sockets and emitters per matchId
    this.sockets = new Map();
    this.emitters = new Map();
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

      let event;
      socket.on('message', data => {
        event = JSON.parse(data);
        console.log('Received event:', event);
      });

      return event;
    } catch (error) {
      console.error(`Error fetching events for match ${matchId}:`, error.message);
      return [];
    }
  }

  /**
   * Subscribe to live WebSocket events for a given matchId.
   * handler(event) will be called for each incoming event.
   * Returns an unsubscribe() function.
   */
  subscribeToMatch(matchId, handler) {
    if (!matchId) throw new Error('matchId required');

    // create emitter if needed
    if (!this.emitters.has(matchId)) {
      this.emitters.set(matchId, new EventEmitter());
    }

    const emitter = this.emitters.get(matchId);
    emitter.on('event', handler);

    // create socket if needed
    if (!this.sockets.has(matchId)) {
      const wsUrl = `wss://live.pandascore.co/matches/${matchId}?token=${this.apiKey}`;
      try {
        const socket = new WebSocket(wsUrl);
        socket.on('open', () => {
          // console.debug(`PandaScore WS open for match ${matchId}`);
        });
        socket.on('message', raw => {
          try {
            const data = JSON.parse(raw.toString());
            const em = this.emitters.get(matchId);
            if (em) em.emit('event', data);
          } catch (e) {
            console.error('Failed to parse WS message for match', matchId, e && e.message);
          }
        });
        socket.on('error', err => {
          console.error('PandaScore WS error for match', matchId, err && err.message);
        });
        socket.on('close', (code, reason) => {
          // remove socket and emitter on close
          // console.debug(`PandaScore WS closed for match ${matchId} ${code}`);
          this.sockets.delete(matchId);
          const em = this.emitters.get(matchId);
          if (em) em.emit('close', { code, reason });
        });

        this.sockets.set(matchId, socket);
      } catch (e) {
        console.error('Failed to create PandaScore WS for match', matchId, e && e.message);
      }
    }

    // return unsubscribe fn
    return () => {
      try {
        const em = this.emitters.get(matchId);
        if (em) em.removeListener('event', handler);
        // if no more listeners, close socket
        if (em && em.listenerCount('event') === 0) {
          const sock = this.sockets.get(matchId);
          if (sock) {
            try { sock.terminate(); } catch (e) { sock.close(); }
            this.sockets.delete(matchId);
          }
          this.emitters.delete(matchId);
        }
      } catch (e) {
        // swallow
      }
    };
  }
}

module.exports = new DataFetcher();