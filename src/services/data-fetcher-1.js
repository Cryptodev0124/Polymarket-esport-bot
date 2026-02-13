const axios = require('axios');

class PolymarketEsportsTracker {
    constructor() {
        this.baseURL = 'https://gamma-api.polymarket.com';
        this.liveGames = new Map(); // gameName -> {events: [], lastUpdated: Date}
    }

    // Detect game from market question
    detectGame(market) {
        const question = market.question.toLowerCase();
        const category = (market.category || '').toLowerCase();
        
        const gamePatterns = {
            'VALORANT': ['valorant', 'vct', 'champions tour', 'masters'],
            'Counter-Strike 2': ['counter-strike', 'cs2', 'cs:2', 'csgo', 'esl pro league', 'blast', 'iem'],
            'Dota 2': ['dota 2', 'dota2', 'the international', 'ti', 'dpc'],
            'League of Legends': ['league of legends', 'lol', 'worlds', 'msi', 'lcs', 'lec', 'lpl'],
            'Overwatch': ['overwatch', 'owl', 'overwatch league'],
            'Call of Duty': ['call of duty', 'cod', 'cwl'],
            'Fortnite': ['fortnite', 'fncs'],
            'Apex Legends': ['apex legends', 'algs'],
            'Rocket League': ['rocket league', 'rlcs'],
            'Rainbow Six Siege': ['rainbow six', 'r6', 'six invitational'],
            'PUBG': ['pubg', 'pubg global championship'],
            'Mobile Legends': ['mobile legends', 'mlbb', 'mpl'],
            'Starcraft': ['starcraft', 'sc2', 'asl'],
            'Fighting Games': ['tekken', 'street fighter', 'evo', 'smash bros', 'guilty gear']
        };

        for (const [game, patterns] of Object.entries(gamePatterns)) {
            if (patterns.some(pattern => question.includes(pattern) || category.includes(pattern))) {
                return game;
            }
        }

        return 'Other Esports';
    }

    // Get event type/tournament from market
    detectEventType(market) {
        const question = market.question.toLowerCase();
        
        if (question.includes('world championship') || question.includes('worlds')) {
            return 'World Championship';
        } else if (question.includes('major')) {
            return 'Major Tournament';
        } else if (question.includes('playoff') || question.includes('play-offs')) {
            return 'Playoffs';
        } else if (question.includes('grand final') || question.includes('grand finals')) {
            return 'Grand Finals';
        } else if (question.includes('semi-final') || question.includes('semifinal')) {
            return 'Semi-Finals';
        } else if (question.includes('quarter-final') || question.includes('quarterfinal')) {
            return 'Quarter-Finals';
        } else if (question.includes('regular season') || question.includes('league match')) {
            return 'Regular Season';
        } else if (question.includes('qualifier')) {
            return 'Qualifier';
        } else if (question.includes('group stage')) {
            return 'Group Stage';
        } else if (question.includes('all-star') || question.includes('all star')) {
            return 'All-Star Event';
        }

        return 'Tournament Match';
    }

    // Get match/teams from market question
    extractMatchDetails(market) {
        const question = market.question;
        
        // Common patterns for team vs team
        const vsPattern = /(.+?)\s+(?:vs\.?|versus)\s+(.+?)(?:\?|$|on|in|at|during)/i;
        const match = question.match(vsPattern);
        
        if (match) {
            return {
                team1: match[1].trim(),
                team2: match[2].trim(),
                type: 'Head-to-Head'
            };
        }
        
        // Tournament winner pattern
        if (question.toLowerCase().includes('winner') || question.toLowerCase().includes('champion')) {
            const tournamentMatch = question.match(/who will win (.+?)(?:\?|$)/i);
            return {
                tournament: tournamentMatch ? tournamentMatch[1].trim() : 'Tournament',
                type: 'Tournament Winner'
            };
        }
        
        // Player performance
        if (question.toLowerCase().includes('kill') || question.toLowerCase().includes('kda')) {
            return { type: 'Player Performance' };
        }
        
        return { type: 'Other' };
    }

    async fetchLiveMarkets() {
        try {
            const response = await axios.get(`${this.baseURL}/markets`, {
                params: {
                    limit: 300,
                    active: 'true',
                    closed: 'false'
                }
            });
            
            return response.data.filter(market => 
                market.active && !market.closed && market.liquidity > 10
            );
            
        } catch (error) {
            console.error('Error fetching markets:', error.message);
            return [];
        }
    }

    async getLiveGamesAndEvents() {
        const markets = await this.fetchLiveMarkets();
        this.liveGames.clear();
        
        // Process all markets
        markets.forEach(market => {
            const game = this.detectGame(market);
            const eventType = this.detectEventType(market);
            const matchDetails = this.extractMatchDetails(market);
            
            if (!this.liveGames.has(game)) {
                this.liveGames.set(game, {
                    game: game,
                    events: [],
                    totalMarkets: 0,
                    totalLiquidity: 0
                });
            }
            
            const gameData = this.liveGames.get(game);
            
            // Check if this event already exists
            const existingEvent = gameData.events.find(e => 
                e.eventName === eventType || 
                (matchDetails.team1 && e.matchDetails?.team1 === matchDetails.team1)
            );
            
            const marketInfo = {
                id: market.id,
                question: market.question,
                slug: market.slug,
                url: `https://polymarket.com/event/${market.slug}`,
                liquidity: market.liquidity,
                volume: market.volume,
                outcomes: market.outcomes || [],
                eventType: eventType,
                matchDetails: matchDetails,
                marketType: market.marketType,
                timestamp: new Date()
            };
            
            if (existingEvent) {
                // Add market to existing event
                existingEvent.markets.push(marketInfo);
                existingEvent.totalLiquidity += market.liquidity;
            } else {
                // Create new event
                gameData.events.push({
                    eventName: eventType,
                    markets: [marketInfo],
                    totalLiquidity: market.liquidity,
                    matchDetails: matchDetails
                });
            }
            
            gameData.totalMarkets++;
            gameData.totalLiquidity += market.liquidity;
        });
        
        return this.formatResults();
    }

    formatResults() {
        const results = [];
        
        for (const [gameName, gameData] of this.liveGames.entries()) {
            // Sort events by liquidity
            gameData.events.sort((a, b) => b.totalLiquidity - a.totalLiquidity);
            
            results.push({
                game: gameName,
                totalEvents: gameData.events.length,
                totalMarkets: gameData.totalMarkets,
                totalLiquidity: gameData.totalLiquidity,
                events: gameData.events.map(event => ({
                    name: event.eventName,
                    matchDetails: event.matchDetails,
                    marketCount: event.markets.length,
                    liquidity: event.totalLiquidity,
                    topMarkets: event.markets
                        .sort((a, b) => b.liquidity - a.liquidity)
                        .slice(0, 3) // Show top 3 markets per event
                }))
            });
        }
        
        // Sort games by total liquidity
        return results.sort((a, b) => b.totalLiquidity - a.totalLiquidity);
    }

    // Get specific game events
    async getGameEvents(gameName) {
        const allGames = await this.getLiveGamesAndEvents();
        return allGames.find(game => 
            game.game.toLowerCase().includes(gameName.toLowerCase()) ||
            gameName.toLowerCase().includes(game.game.toLowerCase())
        );
    }

    // Display formatted results
    displayResults(results) {
        console.log('\n🎮 LIVE ESPORTS GAMES & EVENTS\n');
        console.log('='.repeat(60));
        
        results.forEach((game, index) => {
            console.log(`\n${index + 1}. ${game.game.toUpperCase()}`);
            console.log(`   📊 ${game.totalMarkets} markets | 💰 $${game.totalLiquidity.toLocaleString()} liquidity`);
            console.log(`   🏆 ${game.totalEvents} active events\n`);
            
            game.events.forEach((event, eventIndex) => {
                console.log(`   ${eventIndex + 1}. ${event.name}`);
                
                if (event.matchDetails.team1) {
                    console.log(`      ⚔️  ${event.matchDetails.team1} vs ${event.matchDetails.team2}`);
                } else if (event.matchDetails.tournament) {
                    console.log(`      🏅 ${event.matchDetails.tournament}`);
                }
                
                console.log(`      📈 ${event.marketCount} markets | $${event.liquidity.toLocaleString()} liquidity`);
                
                // Show top market
                if (event.topMarkets.length > 0) {
                    const topMarket = event.topMarkets[0];
                    console.log(`      🔥 Top Market: ${topMarket.question.substring(0, 50)}...`);
                    console.log(`      🔗 ${topMarket.url}`);
                }
                console.log('');
            });
            
            console.log('─'.repeat(60));
        });
    }
}

// 2. **Real-time Monitor with Event Detection**
class EsportsEventMonitor {
    constructor() {
        this.tracker = new PolymarketEsportsTracker();
        this.lastUpdate = new Map(); // game -> last update time
        this.eventHistory = new Map(); // event -> history
    }

    async monitor(intervalMinutes = 5) {
        console.log(`🚀 Starting Esports Event Monitor (checking every ${intervalMinutes} minutes)\n`);
        
        while (true) {
            try {
                await this.checkForUpdates();
                await this.sleep(intervalMinutes * 60 * 1000);
            } catch (error) {
                console.error('Monitor error:', error.message);
                await this.sleep(30000); // Wait 30 seconds on error
            }
        }
    }

    async checkForUpdates() {
        const results = await this.tracker.getLiveGamesAndEvents();
        const now = new Date();
        
        console.log(`\n🕒 ${now.toLocaleTimeString()} - Checking for updates...`);
        
        results.forEach(game => {
            const lastUpdate = this.lastUpdate.get(game.game);
            
            if (!lastUpdate) {
                // First time seeing this game
                console.log(`\n🆕 NEW GAME DETECTED: ${game.game}`);
                this.displayNewGame(game);
            } else if (now - lastUpdate > 30 * 60 * 1000) {
                // Game updated after 30 minutes
                console.log(`\n🔄 UPDATED: ${game.game} has new activity`);
            }
            
            this.lastUpdate.set(game.game, now);
            
            // Check for new events within the game
            game.events.forEach(event => {
                const eventKey = `${game.game}:${event.name}`;
                if (!this.eventHistory.has(eventKey)) {
                    console.log(`🎯 NEW EVENT: ${event.name} in ${game.game}`);
                    this.eventHistory.set(eventKey, {
                        firstSeen: now,
                        marketCount: event.marketCount
                    });
                }
            });
        });
        
        this.tracker.displayResults(results);
    }

    displayNewGame(game) {
        console.log(`🎮 Game: ${game.game}`);
        console.log(`📈 Initial Stats: ${game.totalMarkets} markets, $${game.totalLiquidity} liquidity`);
        console.log(`🏆 Events detected: ${game.events.map(e => e.name).join(', ')}`);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// 3. **REST API Server**
const express = require('express');

class EsportsAPI {
    constructor() {
        this.app = express();
        this.tracker = new PolymarketEsportsTracker();
        this.cache = {
            data: null,
            timestamp: 0,
            ttl: 300000 // 5 minutes
        };
        this.setupRoutes();
    }

    setupRoutes() {
        this.app.use(express.json());
        
        // Get all live games and events
        this.app.get('/api/esports/games', async (req, res) => {
            try {
                // Check cache
                const now = Date.now();
                if (this.cache.data && now - this.cache.timestamp < this.cache.ttl) {
                    return res.json({
                        source: 'cache',
                        cached: true,
                        timestamp: this.cache.timestamp,
                        ...this.cache.data
                    });
                }
                
                const results = await this.tracker.getLiveGamesAndEvents();
                const summary = this.createSummary(results);
                
                // Update cache
                this.cache.data = {
                    summary,
                    games: results
                };
                this.cache.timestamp = now;
                
                res.json({
                    source: 'api',
                    cached: false,
                    timestamp: now,
                    summary,
                    games: results
                });
                
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        // Get specific game
        this.app.get('/api/esports/games/:game', async (req, res) => {
            try {
                const game = await this.tracker.getGameEvents(req.params.game);
                if (game) {
                    res.json(game);
                } else {
                    res.status(404).json({ error: 'Game not found' });
                }
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        // Get events by type
        this.app.get('/api/esports/events/:type', async (req, res) => {
            try {
                const results = await this.tracker.getLiveGamesAndEvents();
                const events = results.flatMap(game => 
                    game.events
                        .filter(event => 
                            event.name.toLowerCase().includes(req.params.type.toLowerCase())
                        )
                        .map(event => ({
                            game: game.game,
                            ...event
                        }))
                );
                res.json({ events });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        // Get high liquidity markets
        this.app.get('/api/esports/top-markets', async (req, res) => {
            try {
                const results = await this.tracker.getLiveGamesAndEvents();
                const allMarkets = results.flatMap(game =>
                    game.events.flatMap(event => event.markets)
                );
                
                const sorted = allMarkets
                    .sort((a, b) => b.liquidity - a.liquidity)
                    .slice(0, 20);
                
                res.json({ topMarkets: sorted });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
    }
    
    createSummary(results) {
        return {
            totalGames: results.length,
            totalEvents: results.reduce((sum, game) => sum + game.events.length, 0),
            totalMarkets: results.reduce((sum, game) => sum + game.totalMarkets, 0),
            totalLiquidity: results.reduce((sum, game) => sum + game.totalLiquidity, 0),
            games: results.map(game => ({
                name: game.game,
                events: game.events.length,
                markets: game.totalMarkets,
                liquidity: game.totalLiquidity
            }))
        };
    }
    
    start(port = 3000) {
        this.app.listen(port, () => {
            console.log(`🎮 Esports API running on http://localhost:${port}`);
            console.log(`📚 Endpoints:`);
            console.log(`   GET /api/esports/games - All games & events`);
            console.log(`   GET /api/esports/games/:game - Specific game events`);
            console.log(`   GET /api/esports/events/:type - Events by type`);
            console.log(`   GET /api/esports/top-markets - Top liquidity markets`);
        });
    }
}

// 4. **CLI Interface**
async function runCLI() {
    const tracker = new PolymarketEsportsTracker();
    const readline = require('readline');
    
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    console.clear();
    console.log('🎮 POLYMARKET ESPORTS TRACKER\n');
    console.log('1. Get all live games & events');
    console.log('2. Search for specific game');
    console.log('3. Start real-time monitor');
    console.log('4. Start API server');
    console.log('5. Exit\n');
    
    rl.question('Select option (1-5): ', async (choice) => {
        switch(choice) {
            case '1':
                console.log('\nFetching live games and events...\n');
                const results = await tracker.getLiveGamesAndEvents();
                tracker.displayResults(results);
                rl.close();
                break;
                
            case '2':
                rl.question('Enter game name: ', async (gameName) => {
                    console.log(`\nSearching for ${gameName}...\n`);
                    const game = await tracker.getGameEvents(gameName);
                    if (game) {
                        console.log(`\n🎮 ${game.game.toUpperCase()}\n`);
                        console.log(`Total Markets: ${game.totalMarkets}`);
                        console.log(`Total Liquidity: $${game.totalLiquidity}`);
                        console.log(`\nEvents:\n`);
                        game.events.forEach((event, index) => {
                            console.log(`${index + 1}. ${event.name}`);
                            console.log(`   Markets: ${event.marketCount}`);
                            console.log(`   Liquidity: $${event.liquidity}`);
                        });
                    } else {
                        console.log(`No live markets found for ${gameName}`);
                    }
                    rl.close();
                });
                break;
                
            case '3':
                const monitor = new EsportsEventMonitor();
                monitor.monitor(5);
                break;
                
            case '4':
                const api = new EsportsAPI();
                api.start(3000);
                break;
                
            case '5':
                rl.close();
                process.exit(0);
                
            default:
                console.log('Invalid choice');
                rl.close();
        }
    });
}

// 5. **Quick Usage Examples**
async function quickExamples() {
    console.log('🚀 Quick Examples\n');
    
    // Example 1: Get all live games
    const tracker = new PolymarketEsportsTracker();
    const games = await tracker.getLiveGamesAndEvents();
    
    console.log('📊 Summary:');
    console.log(`Total Games: ${games.length}`);
    games.forEach(game => {
        console.log(`\n${game.game}:`);
        console.log(`  Events: ${game.events.length}`);
        console.log(`  Markets: ${game.totalMarkets}`);
        console.log(`  Liquidity: $${game.totalLiquidity.toLocaleString()}`);
        
        // Show top event
        if (game.events.length > 0) {
            const topEvent = game.events[0];
            console.log(`  Top Event: ${topEvent.name} ($${topEvent.liquidity.toLocaleString()})`);
        }
    });
    
    // Example 2: Get specific game
    console.log('\n\n🎯 Looking for VALORANT events...');
    const valorant = await tracker.getGameEvents('VALORANT');
    if (valorant) {
        console.log(`Found ${valorant.events.length} VALORANT events:`);
        valorant.events.forEach(event => {
            console.log(`  • ${event.name} - ${event.marketCount} markets`);
        });
    }
}

// Run based on command line argument
const args = process.argv.slice(2);
if (args.includes('--api')) {
    const api = new EsportsAPI();
    api.start(3000);
} else if (args.includes('--monitor')) {
    const monitor = new EsportsEventMonitor();
    monitor.monitor(5);
} else if (args.includes('--quick')) {
    quickExamples();
} else {
    runCLI();
}