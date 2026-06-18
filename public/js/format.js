/**
 * Format utility functions for display values.
 */

/**
 * Format bytes to human-readable string (B, KB, MB, GB, TB).
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  return `${val.toFixed(2)} ${units[i]}`;
}

/**
 * Format bits per second to human-readable string.
 * Input: bits per second (numeric).
 * Output: "1.23 Mbps", "500 Kbps", etc.
 */
export function formatBps(bps) {
  if (!bps || bps === 0) return '0 bps';
  const units = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps'];
  const k = 1000;
  const i = Math.floor(Math.log(Math.abs(bps)) / Math.log(k));
  const val = bps / Math.pow(k, i);
  return `${val.toFixed(2)} ${units[i]}`;
}

/**
 * Format SNMP sysUpTime (in 1/100ths of a second) to human-readable uptime.
 * Input: ticks (centiseconds).
 * Output: "42 days, 3:45:12"
 */
export function formatUptime(ticks) {
  if (!ticks || ticks < 0) return 'Unknown';
  const totalSecs = Math.floor(ticks / 100);

  const days = Math.floor(totalSecs / 86400);
  const hours = Math.floor((totalSecs % 86400) / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  if (days > 0) {
    return `${days} day${days !== 1 ? 's' : ''}, ${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Safely parses an SQLite UTC datetime string (YYYY-MM-DD HH:MM:SS) or ISO string into a JS Date object.
 */
export function parseSqliteDate(str) {
  if (!str) return null;
  if (typeof str === 'string' && !str.includes('T') && !str.includes('Z')) {
    // SQLite returns "YYYY-MM-DD HH:MM:SS" -> convert to standard ISO UTC format
    return new Date(str.replace(' ', 'T') + '.000Z');
  }
  return new Date(str);
}

/**
 * Format relative time (seconds ago, minutes ago, etc.).
 */
export function formatRelativeTime(isoString) {
  if (!isoString) return 'Never';

  const date = parseSqliteDate(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffSecs = Math.floor(diffMs / 1000);

  if (diffSecs < 60) return `${diffSecs}s ago`;
  if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
  if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
  return `${Math.floor(diffSecs / 86400)}d ago`;
}

/**
 * Format ISO timestamp to local time string.
 */
export function formatDateTime(isoString) {
  const date = parseSqliteDate(isoString);
  return date ? date.toLocaleString() : '';
}

/**
 * Format a status value with color class name.
 */
export function getStatusClass(status) {
  const map = {
    up: 'status-up',
    down: 'status-down',
    warning: 'status-warning',
    unknown: 'status-unknown'
  };
  return map[status] || 'status-unknown';
}

/**
 * Format severity level with color class.
 */
export function getSeverityClass(severity) {
  const map = {
    critical: 'severity-critical',
    warning: 'severity-warning',
    info: 'severity-info'
  };
  return map[severity] || 'severity-info';
}
