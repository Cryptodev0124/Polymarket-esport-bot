const cron = require('node-cron');
const DataFetcher = require('../services/data-fetcher');
const PolymarketAPI = require('../services/polymarket-api');
const OddsCalculator = require('../services/odds-calculator');
const TradeExecutor = require('../services/trade-executor');
const LoLTriggers = require('../triggers/lol-triggers');
const Match = require('../models/Match');
const { TRADING } = require('../../config/constants');
const logger = require('../utils/logger');

// Helpers: normalization and fuzzy/token matching to improve market <-> team mapping
const normalize = (s) => {
    if (!s) return '';
    // strip diacritics, punctuation, normalize spaces, lowercase
    try {
        return s
            .toString()
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .replace(/[^a-zA-Z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    } catch (e) {
        return s.toString().toLowerCase();
    }
};

const tokenize = (s) => normalize(s).split(' ').filter(Boolean);

const levenshtein = (a, b) => {
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
    }
    return dp[m][n];
};

const similarity = (a, b) => {
    if (!a || !b) return 0;
    const lev = levenshtein(a, b);
    const maxLen = Math.max(a.length, b.length);
    return maxLen === 0 ? 1 : 1 - lev / maxLen;
};

// For a team name (may be multi-token), check that each token has a close match in title tokens
const teamMatchesTitle = (teamName, title, threshold = 0.75) => {
    const teamTokens = tokenize(teamName);
    const titleTokens = tokenize(title);
    if (teamTokens.length === 0 || titleTokens.length === 0) return false;

    return teamTokens.every(tt => {
        // exact substring is quickest
        if (title.includes(normalize(tt))) return true;
        // otherwise find a title token with similarity >= threshold
        return titleTokens.some(tk => similarity(tt, tk) >= threshold);
    });
};

class ArbitrageBot {
    constructor() {
        this.activeMatches = new Map();
        this.isRunning = false;
    }

    async initialize() {
        logger.info('Initializing Arbitrage Bot...');

        // Schedule match discovery every 10 seconds
        cron.schedule('*/10 * * * * *', () => this.discoverActiveMatches());

        // Schedule portfolio reset at midnight
        cron.schedule('0 0 * * *', () => this.resetDailyPortfolio());

        // Start match discovery immediately
        await this.discoverActiveMatches();

        this.isRunning = true;
        logger.info('Arbitrage Bot initialized and running');
    }

    async discoverActiveMatches() {
        try {
            logger.info('Discovering active matches...');

            // Get live matches from PandaScore
            const liveMatches = await DataFetcher.getLiveMatches();
            console.log('liveMatches', liveMatches);

            // Get Polymarket markets (only live/active markets to reduce noise)
            // const markets = await PolymarketAPI.getEsportsMarkets();
            //   console.log('e-markets', markets.length);
            let markets = [];

            for (const match of liveMatches) {
                // Safely extract opponent names (PandaScore may omit fields)
                const teamA = (match.opponents?.[0]?.opponent?.name || '').toLowerCase();
                const teamB = (match.opponents?.[1]?.opponent?.name || '').toLowerCase();

                console.log('game', match.games);

                // Find corresponding Polymarket market using normalized + fuzzy/token matching.
                // const market = markets.find(m => {
                //     const titleRaw = (m.title || m.question || '');
                //     const title = normalize(titleRaw);

                //     // Quick path: both team substrings appear in normalized title
                //     if (teamA && teamB && title.includes(teamA) && title.includes(teamB)) return true;

                //     // Token/fuzzy match: ensure both teams have matching tokens inside the title
                //     const teamAMatches = teamA ? teamMatchesTitle(teamA, title) : false;
                //     const teamBMatches = teamB ? teamMatchesTitle(teamB, title) : false;
                //     if (teamAMatches && teamBMatches) return true;

                //     // As a fallback, check reversed order or short-name presence
                //     // (e.g., "TL vs TSM" vs "Team Liquid vs TSM")
                //     // We'll also check if any token from either team appears in title tokens.
                //     const titleTokens = tokenize(titleRaw);
                //     const teamATokens = tokenize(teamA);
                //     const teamBTokens = tokenize(teamB);
                //     const tokenMatchA = teamATokens.some(t => titleTokens.some(tt => similarity(t, tt) >= 0.8));
                //     const tokenMatchB = teamBTokens.some(t => titleTokens.some(tt => similarity(t, tt) >= 0.8));
                //     if (tokenMatchA && tokenMatchB) return true;

                //     return false;
                // });
                const slug = match.slug;
                const market = await PolymarketAPI.getEsportsMarkets(slug);
                // markets =  markets.push(market);

                if (market) {
                    await this.registerMatch(match, market);
                } else {
                    // Debug: log unmatched teams and a small sample of market titles to help tuning
                    try {
                        const sampleTitles = markets.slice(0, 8).map(m => ({ id: m.id, title: m.title || m.question }));
                        logger.warn(`No matching Polymarket market found for ${match.opponents?.[0]?.opponent?.name || 'unknown'} vs ${match.opponents?.[1]?.opponent?.name || 'unknown'}. Sample market titles: ${JSON.stringify(sampleTitles)}`);
                    } catch (e) {
                        // swallow
                    }
                }
            }

            logger.info(`Discovered ${this.activeMatches.size} active matches`);
        } catch (error) {
            logger.error('Error discovering matches:', error);
        }
    }

    async registerMatch(matchData, marketData) {
        const matchId = matchData.id.toString();
        const games = matchData.games || [];
        const gameIds = games.map(g => g.id.toString());
        // pick the game id of the currently running game (fallback to first game)
        const runningGame = games.find(g => g.status.toString().toLowerCase() === 'running');
        const gameId = runningGame ? runningGame.id.toString() : null;
        if (!gameId) {
            logger.warn(`No gameId available for match ${matchId}, skipping registration`);
            return;
        }

        if (this.activeMatches.has(matchId)) {
            return; // Already registered
        }

        try {
            // Create or update match record
            const match = await Match.findOneAndUpdate(
                { matchId },
                {
                    matchId,
                    team1: matchData.opponents[0]?.opponent.name || 'Team 1',
                    team2: matchData.opponents[1]?.opponent.name || 'Team 2',
                    startTime: new Date(matchData.scheduled_at),
                    status: 'live',
                    polymarketMarketId: marketData.id,
                    lastUpdated: new Date()
                },
                { upsert: true, new: true }
            );

            // Start monitoring this match
            this.monitorMatch(gameId, matchId, marketData.id);
            this.activeMatches.set(matchId, {
                match,
                marketId: marketData.id,
                lastEventTime: Date.now()
            });

            logger.info(`Registered match: ${match.team1} vs ${match.team2}`);
        } catch (error) {
            logger.error(`Error registering match ${matchId}:`, error);
        }
    }

    async monitorMatch(gameId, matchId, marketId) {
        // Poll for match events every 2 seconds
        const pollInterval = setInterval(async () => {
            try {
                if (!this.activeMatches.has(matchId)) {
                    clearInterval(pollInterval);
                    return;
                }

                // Get latest events
                const events = await DataFetcher.getMatchEvents(gameId);
                
                const matchInfo = this.activeMatches.get(matchId);

                for (const event of events) {
                    // Process event if it's new
                    if (event.timestamp > matchInfo.lastEventTime) {
                        await this.processMatchEvent(matchId, event);
                        matchInfo.lastEventTime = event.timestamp;
                    }
                }

                // Update match status
                await this.updateMatchStatus(matchId);

            } catch (error) {
                logger.error(`Error monitoring match ${matchId}:`, error);
            }
        }, 2000); // Poll every 2 seconds
    }

    async processMatchEvent(matchId, eventData) {
        try {
            // Parse event type and data
            const eventType = this.parseEventType(eventData);
            if (!eventType) return;

            // Process through triggers
            const impact = await LoLTriggers.processEvent(matchId, eventType, eventData);

            if (impact > 0) {
                // Calculate new win probability
                const probabilities = await OddsCalculator.calculateWinProbability(matchId);

                // Get current market price
                const matchInfo = this.activeMatches.get(matchId);
                if (!matchInfo) return;

                const marketData = await PolymarketAPI.getMarketPrices(matchInfo.marketId);
                if (!marketData || !marketData.price) return;

                const marketPrice = parseFloat(marketData.price);
                const estimatedPrice = OddsCalculator.estimatePriceFromProbability(probabilities.team1);

                // Check for arbitrage opportunity
                const opportunity = this.findArbitrageOpportunity(
                    marketPrice,
                    estimatedPrice,
                    // Use registered match record's team1 (matchData was undefined here)
                    matchInfo.match?.team1 || ''
                );

                if (opportunity) {
                    await this.executeArbitrageTrade(
                        matchId,
                        matchInfo.marketId,
                        opportunity.side,
                        marketPrice,
                        estimatedPrice
                    );
                }
            }
        } catch (error) {
            logger.error(`Error processing event for match ${matchId}:`, error);
        }
    }

    parseEventType(eventData) {
        // Parse PandaScore event type to our trigger types
        if (eventData.type === 'kill') return 'kill';
        if (eventData.type === 'building_destroy') return 'tower';
        if (eventData.type === 'monster_kill') {
            if (eventData.monster_type === 'dragon') return 'dragon';
            if (eventData.monster_type === 'baron') return 'baron';
            if (eventData.monster_type === 'rift_herald') return 'rift_herald';
        }
        if (eventData.type === 'first_blood') return 'first_blood';
        if (eventData.type === 'first_tower') return 'first_tower';
        if (eventData.type === 'inhibitor_destroy') return 'inhibitor';
        if (eventData.type === 'gold_lead') return 'gold_lead_change';
        return null;
    }

    findArbitrageOpportunity(marketPrice, estimatedPrice, team) {
        const priceDifference = Math.abs(marketPrice - estimatedPrice);

        // Only trade if difference exceeds threshold
        if (priceDifference < TRADING.MIN_PROFIT_THRESHOLD) {
            return null;
        }

        if (estimatedPrice > marketPrice) {
            // Market underestimates team's chances
            return {
                side: 'YES',
                discrepancy: estimatedPrice - marketPrice
            };
        } else {
            // Market overestimates team's chances
            return {
                side: 'NO',
                discrepancy: marketPrice - estimatedPrice
            };
        }
    }

    async executeArbitrageTrade(matchId, marketId, side, marketPrice, estimatedPrice) {
        logger.info(`Arbitrage opportunity found: ${side} @ ${marketPrice}, Estimated: ${estimatedPrice}`);

        const tradeId = await TradeExecutor.executeTrade(
            matchId,
            marketId,
            side,
            marketPrice,
            estimatedPrice
        );

        if (tradeId) {
            logger.info(`Arbitrage trade executed: ${tradeId}`);
        }
    }

    async updateMatchStatus(matchId) {
        try {
            const matchData = await DataFetcher.getMatchDetails(matchId);

            if (matchData.status === 'finished') {
                // Match ended, clean up
                this.activeMatches.delete(matchId);

                await Match.findOneAndUpdate(
                    { matchId },
                    { status: 'finished' }
                );

                logger.info(`Match ${matchId} finished and removed from monitoring`);
            }
        } catch (error) {
            logger.error(`Error updating match status ${matchId}:`, error);
        }
    }

    async resetDailyPortfolio() {
        try {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            yesterday.setHours(0, 0, 0, 0);

            // Archive yesterday's portfolio
            const oldPortfolio = await Portfolio.findOne({ date: yesterday });
            if (oldPortfolio) {
                // You might want to save this to an archive collection
                console.log(`Yesterday's P&L: ${oldPortfolio.dailyProfitLoss}`);
            }

            // Create new portfolio for today
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const newPortfolio = new Portfolio({
                date: today,
                startingBalance: oldPortfolio ? oldPortfolio.currentBalance : 1000,
                currentBalance: oldPortfolio ? oldPortfolio.currentBalance : 1000
            });

            await newPortfolio.save();
            logger.info('Daily portfolio reset');

        } catch (error) {
            logger.error('Error resetting portfolio:', error);
        }
    }

    async stop() {
        this.isRunning = false;
        this.activeMatches.clear();
        logger.info('Arbitrage Bot stopped');
    }
}

module.exports = new ArbitrageBot();