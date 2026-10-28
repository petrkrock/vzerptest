// PM2-конфиг для продакшена (Вариант Б).
// monitor-server.js сам читает .env из корня проекта (парсер встроен),
// поэтому здесь только управление процессом.
module.exports = {
  apps: [{
    name: process.env.PM2_APP_NAME || 'crm',
    script: './server/monitor-server.js',
    cwd: __dirname,
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '256M',
    env: { NODE_ENV: 'production' },
    out_file: './logs/pm2-out.log',
    error_file: './logs/pm2-error.log',
    merge_logs: true,
    time: true,
  }],
};
