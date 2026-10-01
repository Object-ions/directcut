module.exports = {
  apps: [
    {
      name: 'directcut',
      cwd: __dirname + '/server',
      script: 'index.js',
      autorestart: true,
      max_memory_restart: '300M',
      env: { NODE_ENV: 'production' },
    },
  ],
};
