const ping = require('ping');

const MAX_HOSTS = 1024; // caps scans at a /22 to keep sweep times reasonable

function ipToInt(ip) {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function intToIp(int) {
  return [(int >>> 24) & 255, (int >>> 16) & 255, (int >>> 8) & 255, int & 255].join('.');
}

function cidrToHosts(cidr) {
  const [base, prefixStr] = (cidr || '').split('/');
  const prefix = parseInt(prefixStr, 10);
  const validBase = base && base.split('.').length === 4;

  if (!validBase || Number.isNaN(prefix) || prefix < 0 || prefix > 32) {
    throw new Error('Enter a valid CIDR range, like 192.168.1.0/24');
  }

  const hostBits = 32 - prefix;
  const size = Math.pow(2, hostBits);
  if (size > MAX_HOSTS + 2) {
    throw new Error(`That range has ${size} addresses. Use a /22 or smaller range.`);
  }

  const baseInt = ipToInt(base);
  const mask = prefix === 0 ? 0 : (~0 << hostBits) >>> 0;
  const network = (baseInt & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;

  const hosts = [];
  for (let i = network + 1; i < broadcast; i++) {
    hosts.push(intToIp(i >>> 0));
  }
  return hosts;
}

/**
 * Pings every address in a CIDR range with a bounded number of workers
 * running concurrently, and returns the addresses that replied.
 */
async function scanRange(cidr, { concurrency = 32, timeoutSeconds = 1 } = {}) {
  const hosts = cidrToHosts(cidr);
  const alive = [];
  let cursor = 0;

  async function worker() {
    while (cursor < hosts.length) {
      const ip = hosts[cursor++];
      try {
        const result = await ping.promise.probe(ip, { timeout: timeoutSeconds });
        if (result.alive) alive.push(ip);
      } catch (err) {
        // unreachable host — ignore and continue the sweep
      }
    }
  }

  const workerCount = Math.min(concurrency, hosts.length) || 1;
  await Promise.all(Array.from({ length: workerCount }, worker));

  return alive.sort((a, b) => ipToInt(a) - ipToInt(b));
}

module.exports = { scanRange, cidrToHosts };
