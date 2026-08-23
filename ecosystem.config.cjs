// PM2 ecosystem — deploy agent & dashboard via PM2 (meta: dashboard dikelola PM2 😄)
module.exports = {
  apps: [
    {
      name: "pm2dash-agent",
      cwd: "/root/pm2-dashboard/apps/agent",
      script: "./dist/index.js",
      interpreter: "node",
      env: { NODE_ENV: "production" },
      max_memory_restart: "200M",
      autorestart: true,
    },
    {
      name: "pm2dash-dashboard",
      cwd: "/root/pm2-dashboard/apps/dashboard",
      script: "./dist-server/index.js",
      interpreter: "node",
      env: { NODE_ENV: "production" },
      max_memory_restart: "300M",
      autorestart: true,
    },
  ],
};
