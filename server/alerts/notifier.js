const nodemailer = require('nodemailer');

let cachedTransporter = null;

function getTransporter(config) {
  if (!config.smtp.host) return null;
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined
    });
  }
  return cachedTransporter;
}

async function sendEmailAlert(alert, config) {
  const transporter = getTransporter(config);
  if (!transporter || !config.alertEmailTo) return;
  try {
    await transporter.sendMail({
      from: config.alertEmailFrom || config.smtp.user,
      to: config.alertEmailTo,
      subject: `[${alert.severity.toUpperCase()}] ${alert.device_name || 'NetPulse'} alert`,
      text: alert.message
    });
  } catch (err) {
    console.error('[notifier] email send failed:', err.message);
  }
}

async function sendWebhookAlert(alert, config) {
  if (!config.alertWebhookUrl) return;
  try {
    await fetch(config.alertWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `[${alert.severity.toUpperCase()}] ${alert.message}`,
        severity: alert.severity,
        device: alert.device_name || null
      })
    });
  } catch (err) {
    console.error('[notifier] webhook send failed:', err.message);
  }
}

async function notify(alert, config) {
  await Promise.allSettled([sendEmailAlert(alert, config), sendWebhookAlert(alert, config)]);
}

module.exports = { notify };
