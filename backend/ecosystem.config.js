module.exports = {
  apps: [
    {
      name: "byl-api",
      script: "app.js",
      cwd: "/var/www/byl-backend",
      env: {
        NODE_ENV: "production",
        TZ: "Europe/Paris"
      }
    },
    {
      name: "byl-cron",
      script: "cron.worker.js",
      cwd: "/var/www/byl-backend",
      env: {
        NODE_ENV: "production",
        TZ: "Europe/Paris",
        CRON_ENABLED: "true"
      }
    }
  ]
};

