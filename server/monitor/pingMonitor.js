const ping = require('ping');

/**
 * Sends a single ICMP echo request or an HTTP/HTTPS GET request to a device,
 * reporting whether it replied and how long it took. Relies on the system
 * `ping` binary for IP/hostname targets, and native `fetch` for HTTP/HTTPS URLs.
 */
async function checkPing(device, config) {
  const address = (device.ip_address || '').trim();
  const isUrl = address.startsWith('http://') || address.startsWith('https://');

  if (isUrl) {
    const start = performance.now();
    const timeoutMs = config.deviceTimeoutMs || 3000;
    try {
      const response = await fetch(address, {
        method: 'GET',
        headers: {
          'User-Agent': 'NetPulse/1.0 Network Monitoring'
        },
        signal: AbortSignal.timeout(timeoutMs)
      });
      const latencyMs = performance.now() - start;

      // Consume the response body asynchronously to release connection resources without blocking latency timing
      response.text().catch(() => {});

      const alive = response.status >= 200 && response.status < 400;
      return {
        alive,
        latencyMs: Math.round(latencyMs)
      };
    } catch (err) {
      const latencyMs = performance.now() - start;
      return {
        alive: false,
        latencyMs: null,
        error: err.name === 'TimeoutError' ? 'HTTP request timed out' : err.message
      };
    }
  }

  const timeoutSeconds = Math.max(1, Math.round(config.deviceTimeoutMs / 1000));
  try {
    const result = await ping.promise.probe(address, {
      timeout: timeoutSeconds
    });
    const latencyMs = result.alive && result.time !== 'unknown' ? parseFloat(result.time) : null;
    return {
      alive: !!result.alive,
      latencyMs: Number.isFinite(latencyMs) ? latencyMs : null
    };
  } catch (err) {
    return { alive: false, latencyMs: null, error: err.message };
  }
}

module.exports = { checkPing };
