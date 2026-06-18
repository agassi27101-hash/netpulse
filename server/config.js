require('dotenv').config();

function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

module.exports = {
  port: toInt(process.env.PORT, 4000),
  dbPath: process.env.DB_PATH || './data/netpulse.db',
  pollIntervalSeconds: toInt(process.env.POLL_INTERVAL_SECONDS, 30),
  deviceTimeoutMs: toInt(process.env.DEVICE_TIMEOUT_MS, 3000),
  failsBeforeDown: toInt(process.env.FAILS_BEFORE_DOWN, 2),
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: toInt(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  },
  alertEmailFrom: process.env.ALERT_EMAIL_FROM || '',
  alertEmailTo: process.env.ALERT_EMAIL_TO || '',
  alertWebhookUrl: process.env.ALERT_WEBHOOK_URL || ''
};
