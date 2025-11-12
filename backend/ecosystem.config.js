module.exports = {
  apps: [
    {
      name: "byl-api",
      script: "app.js",
      env: { NODE_ENV: "production", CRON_ENABLED: "false" }
    },
    {
      name: "byl-cron",
      script: "cron.worker.js",
      env: { NODE_ENV: "production", CRON_ENABLED: "true" }
    }
  ]
};

