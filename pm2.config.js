module.exports = {
  apps: [{
    name: 'polymarket-bot',
    script: 'src/bot.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    
    // Environment
    env: {
      NODE_ENV: 'production',
      NODE_OPTIONS: '--max-old-space-size=512'
    },
    
    // Logging
    error_file: 'logs/pm2-err.log',
    out_file: 'logs/pm2-out.log',
    log_file: 'logs/pm2-combined.log',
    time: true,
    
    // Restart policy
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 3000,
    
    // Kill timeout for graceful shutdown
    kill_timeout: 5000,
    listen_timeout: 8000,
    
    // Monitoring
    instance_var: 'INSTANCE_ID'
  }]
};