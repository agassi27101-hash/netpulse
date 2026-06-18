const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  ip_address TEXT NOT NULL UNIQUE,
  device_type TEXT NOT NULL DEFAULT 'host',
  group_name TEXT DEFAULT 'Default',
  snmp_enabled INTEGER DEFAULT 0,
  snmp_community TEXT DEFAULT 'public',
  snmp_version TEXT DEFAULT '2c',
  snmp_port INTEGER DEFAULT 161,
  notes TEXT,
  enabled INTEGER DEFAULT 1,
  status TEXT DEFAULT 'unknown',
  last_latency_ms REAL,
  last_checked_at TEXT,
  last_status_change_at TEXT,
  consecutive_fails INTEGER DEFAULT 0,
  sys_name TEXT,
  sys_descr TEXT,
  sys_uptime_ticks INTEGER,
  parent_id INTEGER REFERENCES devices(id) ON DELETE SET NULL,
  in_maintenance INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ping_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  alive INTEGER NOT NULL,
  latency_ms REAL
);
CREATE INDEX IF NOT EXISTS idx_ping_metrics_device_ts ON ping_metrics(device_id, ts);

CREATE TABLE IF NOT EXISTS interfaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  if_index INTEGER NOT NULL,
  if_name TEXT,
  if_speed_bps INTEGER,
  if_oper_status TEXT,
  last_in_octets INTEGER,
  last_out_octets INTEGER,
  last_sample_at TEXT,
  UNIQUE(device_id, if_index)
);

CREATE TABLE IF NOT EXISTS interface_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  interface_id INTEGER NOT NULL REFERENCES interfaces(id) ON DELETE CASCADE,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  in_bps REAL,
  out_bps REAL
);
CREATE INDEX IF NOT EXISTS idx_if_metrics_iface_ts ON interface_metrics(interface_id, ts);

CREATE TABLE IF NOT EXISTS alert_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  metric TEXT NOT NULL,
  condition TEXT NOT NULL,
  threshold REAL,
  severity TEXT NOT NULL DEFAULT 'warning',
  device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE,
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id INTEGER REFERENCES alert_rules(id) ON DELETE SET NULL,
  device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  triggered_at TEXT DEFAULT (datetime('now')),
  acknowledged_at TEXT,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS topology_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_a_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  device_b_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  label TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`;

function seedDefaults(db, config) {
  const ruleCount = db.prepare('SELECT COUNT(*) AS c FROM alert_rules').get().c;
  if (ruleCount === 0) {
    const insertRule = db.prepare(`
      INSERT INTO alert_rules (name, metric, condition, threshold, severity, device_id)
      VALUES (?, ?, ?, ?, ?, NULL)
    `);
    insertRule.run('Device down', 'status', 'device_down', null, 'critical');
    insertRule.run('High latency', 'latency', 'above', 150, 'warning');
    insertRule.run('High packet loss', 'packet_loss', 'above', 20, 'warning');
    insertRule.run('Interface down', 'interface_status', 'interface_down', null, 'warning');
  }

  const settingsCount = db.prepare('SELECT COUNT(*) AS c FROM settings').get().c;
  if (settingsCount === 0) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
      .run('poll_interval_seconds', String(config.pollIntervalSeconds));
  }

  const deviceCount = db.prepare('SELECT COUNT(*) AS c FROM devices').get().c;
  if (deviceCount === 0) {
    const insertDevice = db.prepare(`
      INSERT INTO devices (id, name, ip_address, device_type, group_name, snmp_enabled, status, last_latency_ms, parent_id, in_maintenance, consecutive_fails)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertDevice.run(1, 'Core Switch', '127.0.0.1', 'Switch', 'Infrastructure', 0, 'up', 0.8, null, 0, 0);
    insertDevice.run(2, 'Edge Router', '127.0.0.2', 'Router', 'Infrastructure', 0, 'up', 1.5, 1, 0, 0);
    insertDevice.run(3, 'HQ Firewall', '127.0.0.3', 'Firewall', 'Security', 0, 'up', 1.2, 1, 0, 0);
    insertDevice.run(4, 'Web Server', '127.0.0.4', 'Server', 'Production', 0, 'up', 22.0, 2, 0, 0);
    insertDevice.run(5, 'Database Server', '192.168.254.254', 'Server', 'Production', 0, 'down', null, 2, 0, 3);
    insertDevice.run(6, 'Backup NAS', '192.168.254.253', 'Server', 'Storage', 0, 'maintenance', null, 1, 1, 0);
    insertDevice.run(7, 'Remote VPN Gateway', '192.168.254.252', 'Router', 'Remote Office', 0, 'unreachable', null, 5, 0, 0);

    const insertLink = db.prepare(`
      INSERT INTO topology_links (device_a_id, device_b_id, label)
      VALUES (?, ?, ?)
    `);
    insertLink.run(1, 2, 'Core-Uplink');
    insertLink.run(1, 3, 'Core-Security');
    insertLink.run(2, 4, '1Gbps LAN');
    insertLink.run(2, 5, '1Gbps LAN');
    insertLink.run(1, 6, '10Gbps Storage');
    insertLink.run(5, 7, 'IPsec VPN Tunnel');

    const insertAlert = db.prepare(`
      INSERT INTO alerts (rule_id, device_id, severity, message, status, triggered_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', '-10 minutes'))
    `);
    insertAlert.run(1, 5, 'critical', 'Database Server (192.168.254.254) is down', 'active');

    const insertMetric = db.prepare(`
      INSERT INTO ping_metrics (device_id, ts, alive, latency_ms)
      VALUES (?, datetime('now', ?), ?, ?)
    `);
    for (let id of [1, 2, 3, 4]) {
      const baseLat = id === 4 ? 20 : id * 3;
      for (let i = -24; i <= 0; i++) {
        const offset = `${i} hours`;
        const lat = baseLat + Math.random() * 4 - 2;
        insertMetric.run(id, offset, 1, lat);
      }
    }
  }
}

function initDb(config) {
  const dbPath = path.resolve(process.cwd(), config.dbPath);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  
  // Migration checks for existing databases
  try {
    db.exec("ALTER TABLE devices ADD COLUMN parent_id INTEGER REFERENCES devices(id) ON DELETE SET NULL");
  } catch (err) {
    // Ignore column exists error
  }
  try {
    db.exec("ALTER TABLE devices ADD COLUMN in_maintenance INTEGER DEFAULT 0");
  } catch (err) {
    // Ignore column exists error
  }

  seedDefaults(db, config);

  return db;
}

module.exports = { initDb };
