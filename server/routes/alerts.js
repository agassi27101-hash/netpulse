const express = require('express');

function toBit(value, fallback) {
  if (value === undefined || value === null) return fallback;
  return value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0;
}

function alertsRouter(db) {
  const router = express.Router();

  const stmtAlertsAll = db.prepare(`
    SELECT alerts.*, devices.name AS device_name, devices.ip_address AS device_ip
    FROM alerts
    LEFT JOIN devices ON devices.id = alerts.device_id
    ORDER BY triggered_at DESC
  `);
  const stmtAlertsByStatus = db.prepare(`
    SELECT alerts.*, devices.name AS device_name, devices.ip_address AS device_ip
    FROM alerts
    LEFT JOIN devices ON devices.id = alerts.device_id
    WHERE alerts.status = ?
    ORDER BY triggered_at DESC
  `);
  const stmtAlertGet = db.prepare('SELECT * FROM alerts WHERE id = ?');
  const stmtAck = db.prepare(
    "UPDATE alerts SET status = 'acknowledged', acknowledged_at = datetime('now') WHERE id = ? AND status = 'active'"
  );
  const stmtResolve = db.prepare(
    "UPDATE alerts SET status = 'resolved', resolved_at = datetime('now') WHERE id = ? AND status != 'resolved'"
  );

  router.get('/alerts', (req, res) => {
    const { status } = req.query;
    if (status) return res.json(stmtAlertsByStatus.all(status));
    res.json(stmtAlertsAll.all());
  });

  router.post('/alerts/:id/acknowledge', (req, res) => {
    const existing = stmtAlertGet.get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Alert not found' });
    stmtAck.run(req.params.id);
    res.json(stmtAlertGet.get(req.params.id));
  });

  router.post('/alerts/:id/resolve', (req, res) => {
    const existing = stmtAlertGet.get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Alert not found' });
    stmtResolve.run(req.params.id);
    res.json(stmtAlertGet.get(req.params.id));
  });

  // --- Alert rules ---
  const stmtRulesAll = db.prepare(`
    SELECT alert_rules.*, devices.name AS device_name
    FROM alert_rules
    LEFT JOIN devices ON devices.id = alert_rules.device_id
    ORDER BY alert_rules.id
  `);
  const stmtRuleGet = db.prepare('SELECT * FROM alert_rules WHERE id = ?');
  const stmtRuleInsert = db.prepare(`
    INSERT INTO alert_rules (name, metric, condition, threshold, severity, device_id, enabled)
    VALUES (@name, @metric, @condition, @threshold, @severity, @device_id, @enabled)
  `);
  const stmtRuleUpdate = db.prepare(`
    UPDATE alert_rules SET
      name = @name,
      metric = @metric,
      condition = @condition,
      threshold = @threshold,
      severity = @severity,
      device_id = @device_id,
      enabled = @enabled
    WHERE id = @id
  `);
  const stmtRuleDelete = db.prepare('DELETE FROM alert_rules WHERE id = ?');

  function normalizeRule(body, existing) {
    const deviceId = body.device_id !== undefined ? body.device_id : existing?.device_id;
    return {
      name: body.name !== undefined ? body.name : existing?.name,
      metric: body.metric !== undefined ? body.metric : existing?.metric,
      condition: body.condition !== undefined ? body.condition : existing?.condition,
      threshold: body.threshold !== undefined ? Number(body.threshold) : (existing?.threshold ?? null),
      severity: body.severity !== undefined ? body.severity : (existing?.severity || 'warning'),
      device_id: deviceId === '' || deviceId === undefined ? null : deviceId,
      enabled: toBit(body.enabled, existing ? existing.enabled : 1)
    };
  }

  router.get('/alert-rules', (req, res) => {
    res.json(stmtRulesAll.all());
  });

  router.post('/alert-rules', (req, res) => {
    if (!req.body.name || !req.body.metric || !req.body.condition) {
      return res.status(400).json({ error: 'name, metric, and condition are required' });
    }
    const payload = normalizeRule(req.body, null);
    const info = stmtRuleInsert.run(payload);
    res.status(201).json(stmtRuleGet.get(info.lastInsertRowid));
  });

  router.put('/alert-rules/:id', (req, res) => {
    const existing = stmtRuleGet.get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Alert rule not found' });
    const payload = normalizeRule(req.body, existing);
    stmtRuleUpdate.run({ ...payload, id: existing.id });
    res.json(stmtRuleGet.get(existing.id));
  });

  router.delete('/alert-rules/:id', (req, res) => {
    const existing = stmtRuleGet.get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Alert rule not found' });
    stmtRuleDelete.run(req.params.id);
    res.status(204).end();
  });

  return router;
}

module.exports = alertsRouter;
