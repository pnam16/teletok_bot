module.exports = {
  apps: [
    {
      // Logging configuration
      combine_logs: true,

      // Environment
      env: {
        NODE_ENV: "production",
        TZ: "UTC",
      },
      error_file: "./logs/error.log",
      exec_mode: "fork", // Use fork mode for better error isolation
      ignore_watch: ["node_modules", "logs", "*.log"],
      instances: 1, // Single instance for bot

      // Health monitoring
      kill_timeout: 5000, // Time to wait before force killing
      listen_timeout: 10000, // Time to wait for listen event
      log_date_format: "YYYY-MM-DDTHH:mm:ss.SSS",

      // Memory management
      max_memory_restart: "500M", // Restart if memory usage exceeds 500MB

      // Restart configuration
      max_restarts: 10, // Maximum number of restarts
      merge_logs: true,
      min_uptime: "10s", // Minimum uptime before considering restart successful
      name: "teletok_bot",
      out_file: "./logs/output.log",
      restart_delay: 4000, // Delay between restarts
      script: "./src/index.js",
      wait_ready: true, // Wait for ready signal

      // Process management
      watch: false, // Disable file watching in production
    },
  ],
};
