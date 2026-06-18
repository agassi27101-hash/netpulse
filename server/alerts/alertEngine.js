/**
 * Checks one device against every alert rule that applies to it
 * (global rules with device_id = NULL, plus any rules scoped to this
 * device specifically). Opens a new active alert the first time a
 * condition becomes true, and auto-resolves it the moment the
 * condition clears. Returns any alerts that were newly opened, so the
 * caller can fan them out to notifications / sockets.
 */
function evaluateDeviceAlerts({ db, device }) {
  const triggeredAlerts = [];

  if (device.in_maintenance || device.status === 'unreachable') {
    // Suppress and resolve existing active alerts for this device
    db.prepare("UPDATE alerts SET status = 'resolved', resolved_at = datetime('now') WHERE device_id = ? AND status = 'active'").run(device.id);
    return triggeredAlerts;
  }

  const rules = db.prepare(
    'SELECT * FROM alert_rules WHERE enabled = 1 AND (device_id IS NULL OR device_id = ?)'
  ).all(device.id);

  const findActive = db.prepare(
    "SELECT * FROM alerts WHERE rule_id = ? AND device_id = ? AND status = 'active'"
  );
  const insertAlert = db.prepare(
    'INSERT INTO alerts (rule_id, device_id, severity, message) VALUES (?, ?, ?, ?)'
  );
  const resolveAlert = db.prepare(
    "UPDATE alerts SET status = 'resolved', resolved_at = datetime('now') WHERE rule_id = ? AND device_id = ? AND status = 'active'"
  );

  for (const rule of rules) {
    const evaluation = evaluateRule(db, device, rule);
    const existing = findActive.get(rule.id, device.id);

    if (evaluation.triggered) {
      if (!existing) {
        const info = insertAlert.run(rule.id, device.id, rule.severity, evaluation.message);
        triggeredAlerts.push({
          id: info.lastInsertRowid,
          rule_id: rule.id,
          device_id: device.id,
          device_name: device.name,
          severity: rule.severity,
          message: evaluation.message,
          status: 'active'
        });
      }
    } else if (existing) {
      resolveAlert.run(rule.id, device.id);
    }
  }

  return triggeredAlerts;
}

function evaluateRule(db, device, rule) {
  if (rule.metric === 'status' && rule.condition === 'device_down') {
    return {
      triggered: device.status === 'down',
      message: `${device.name} (${device.ip_address}) is down`
    };
  }

  if (rule.metric === 'latency' && rule.condition === 'above') {
    const triggered = device.last_latency_ms != null && device.last_latency_ms > rule.threshold;
    return {
      triggered,
      message: triggered
        ? `${device.name} latency is ${Math.round(device.last_latency_ms)}ms (threshold ${rule.threshold}ms)`
        : null
    };
  }

  if (rule.metric === 'packet_loss' && rule.condition === 'above') {
    const recent = db.prepare(
      'SELECT alive FROM ping_metrics WHERE device_id = ? ORDER BY ts DESC LIMIT 10'
    ).all(device.id);
    if (recent.length < 5) return { triggered: false, message: null };
    const lossPct = (recent.filter((r) => r.alive === 0).length / recent.length) * 100;
    const triggered = lossPct > rule.threshold;
    return {
      triggered,
      message: triggered
        ? `${device.name} packet loss is ${lossPct.toFixed(0)}% over the last ${recent.length} checks (threshold ${rule.threshold}%)`
        : null
    };
  }

  if (rule.metric === 'interface_status' && rule.condition === 'interface_down') {
    const downIfaces = db.prepare(
      "SELECT if_name FROM interfaces WHERE device_id = ? AND if_oper_status = 'down'"
    ).all(device.id);
    const triggered = downIfaces.length > 0;
    return {
      triggered,
      message: triggered
        ? `${device.name}: ${downIfaces.length} interface(s) down (${downIfaces.map((i) => i.if_name).join(', ')})`
        : null
    };
  }

  return { triggered: false, message: null };
}

module.exports = { evaluateDeviceAlerts };
