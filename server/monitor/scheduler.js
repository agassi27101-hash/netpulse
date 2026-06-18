const { checkPing } = require('./pingMonitor');
const { getSystemInfo, getInterfaceTable } = require('./snmpMonitor');
const { evaluateDeviceAlerts } = require('../alerts/alertEngine');
const { notify } = require('../alerts/notifier');

const COUNTER_32_MAX = Math.pow(2, 32);

function computeCounterDelta(oldVal, newVal) {
  if (oldVal == null || newVal == null) return null;
  let delta = newVal - oldVal;
  if (delta < 0) delta += COUNTER_32_MAX; // 32-bit counter wrapped around
  return delta;
}

function sqliteTimeToDate(sqliteTs) {
  // better-sqlite3 / SQLite datetime('now') returns "YYYY-MM-DD HH:MM:SS" in UTC
  return new Date(sqliteTs.replace(' ', 'T') + 'Z');
}

function startScheduler({ db, io, config }) {
  let timer = null;
  let stopped = false;
  let running = false;

  const stmtUpdateDevice = db.prepare(`
    UPDATE devices SET
      status = @status,
      last_latency_ms = @latencyMs,
      last_checked_at = datetime('now'),
      last_status_change_at = CASE WHEN status != @status THEN datetime('now') ELSE last_status_change_at END,
      consecutive_fails = @fails,
      sys_name = COALESCE(@sysName, sys_name),
      sys_descr = COALESCE(@sysDescr, sys_descr),
      sys_uptime_ticks = COALESCE(@sysUptimeTicks, sys_uptime_ticks)
    WHERE id = @id
  `);
  const stmtInsertPing = db.prepare(
    'INSERT INTO ping_metrics (device_id, alive, latency_ms) VALUES (?, ?, ?)'
  );
  const stmtUpsertInterface = db.prepare(`
    INSERT INTO interfaces (device_id, if_index, if_name, if_speed_bps, if_oper_status, last_in_octets, last_out_octets, last_sample_at)
    VALUES (@deviceId, @ifIndex, @ifName, @ifSpeedBps, @ifOperStatus, @inOctets, @outOctets, datetime('now'))
    ON CONFLICT(device_id, if_index) DO UPDATE SET
      if_name = excluded.if_name,
      if_speed_bps = excluded.if_speed_bps,
      if_oper_status = excluded.if_oper_status,
      last_in_octets = excluded.last_in_octets,
      last_out_octets = excluded.last_out_octets,
      last_sample_at = excluded.last_sample_at
  `);
  const stmtGetInterface = db.prepare('SELECT * FROM interfaces WHERE device_id = ? AND if_index = ?');
  const stmtInsertIfMetric = db.prepare(
    'INSERT INTO interface_metrics (interface_id, in_bps, out_bps) VALUES (?, ?, ?)'
  );
  const stmtGetPollInterval = db.prepare("SELECT value FROM settings WHERE key = 'poll_interval_seconds'");

  function getPollIntervalMs() {
    const row = stmtGetPollInterval.get();
    const seconds = row ? parseInt(row.value, 10) : NaN;
    const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : config.pollIntervalSeconds;
    return safeSeconds * 1000;
  }

  async function pollOneDevice(device) {
    let status;
    let fails = device.consecutive_fails || 0;
    let pingResult = { alive: false, latencyMs: null };

    if (device.in_maintenance) {
      status = 'maintenance';
      fails = 0;
    } else {
      pingResult = await checkPing(device, config);
      const alive = pingResult.alive;
      fails = alive ? 0 : (device.consecutive_fails || 0) + 1;

      if (alive) {
        status = 'up';
      } else if (fails >= config.failsBeforeDown) {
        let parentIsDown = false;
        if (device.parent_id) {
          const parent = db.prepare('SELECT status FROM devices WHERE id = ?').get(device.parent_id);
          if (parent && (parent.status === 'down' || parent.status === 'unreachable')) {
            parentIsDown = true;
          }
        }
        status = parentIsDown ? 'unreachable' : 'down';
      } else if (device.status === 'up' || device.status === 'unknown') {
        status = 'warning';
      } else {
        status = device.status;
      }
    }

    let sysInfo = null;
    const snmpActive = device.snmp_enabled && pingResult.alive && !device.in_maintenance;
    if (snmpActive) {
      sysInfo = await getSystemInfo(device, config);
    }

    stmtUpdateDevice.run({
      status,
      latencyMs: pingResult.latencyMs,
      fails,
      sysName: sysInfo ? sysInfo.sysName : null,
      sysDescr: sysInfo ? sysInfo.sysDescr : null,
      sysUptimeTicks: sysInfo ? sysInfo.sysUpTimeTicks : null,
      id: device.id
    });

    if (!device.in_maintenance) {
      stmtInsertPing.run(device.id, pingResult.alive ? 1 : 0, pingResult.latencyMs);
    }

    const updatedDevice = {
      ...device,
      status,
      last_latency_ms: pingResult.latencyMs,
      consecutive_fails: fails
    };

    if (snmpActive) {
      const ifRows = await getInterfaceTable(device, config);
      for (const row of ifRows) {
        const existing = stmtGetInterface.get(device.id, row.ifIndex);
        let inBps = null;
        let outBps = null;

        if (existing && existing.last_sample_at) {
          const elapsedSec = (Date.now() - sqliteTimeToDate(existing.last_sample_at).getTime()) / 1000;
          if (elapsedSec > 0) {
            const inDelta = computeCounterDelta(existing.last_in_octets, row.ifInOctets);
            const outDelta = computeCounterDelta(existing.last_out_octets, row.ifOutOctets);
            if (inDelta != null) inBps = (inDelta * 8) / elapsedSec;
            if (outDelta != null) outBps = (outDelta * 8) / elapsedSec;
          }
        }

        stmtUpsertInterface.run({
          deviceId: device.id,
          ifIndex: row.ifIndex,
          ifName: row.ifDescr,
          ifSpeedBps: row.ifSpeed,
          ifOperStatus: row.ifOperStatus === 1 ? 'up' : 'down',
          inOctets: row.ifInOctets,
          outOctets: row.ifOutOctets
        });

        const ifRecord = stmtGetInterface.get(device.id, row.ifIndex);
        if (ifRecord && (inBps != null || outBps != null)) {
          stmtInsertIfMetric.run(ifRecord.id, inBps, outBps);
        }
      }
    }

    const newAlerts = evaluateDeviceAlerts({ db, device: updatedDevice });
    for (const alert of newAlerts) {
      notify(alert, config).catch(() => {});
    }

    io.emit('device:update', {
      id: device.id,
      status,
      last_latency_ms: pingResult.latencyMs,
      last_checked_at: new Date().toISOString()
    });
    if (newAlerts.length) io.emit('alerts:new', newAlerts);
  }

  async function tick() {
    if (running) return;
    running = true;
    try {
      const devices = db.prepare('SELECT * FROM devices WHERE enabled = 1').all();
      await Promise.allSettled(devices.map(pollOneDevice));
      io.emit('overview:refresh');
    } catch (err) {
      console.error('[scheduler] tick failed:', err.message);
    } finally {
      running = false;
    }
  }

  async function loop() {
    await tick();
    if (stopped) return;
    timer = setTimeout(loop, getPollIntervalMs());
  }

  loop();

  return function stopScheduler() {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

module.exports = { startScheduler };
