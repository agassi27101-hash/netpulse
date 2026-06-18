const express = require('express');
const { scanRange } = require('../monitor/discoveryEngine');

function discoveryRouter(db) {
  const router = express.Router();

  const stmtExistingIps = db.prepare('SELECT ip_address FROM devices');

  router.post('/scan', async (req, res) => {
    const { cidr } = req.body;
    if (!cidr) return res.status(400).json({ error: 'cidr is required, e.g. 192.168.1.0/24' });

    try {
      const aliveIps = await scanRange(cidr);
      const existing = new Set(stmtExistingIps.all().map((r) => r.ip_address));
      const results = aliveIps.map((ip) => ({ ip, alreadyMonitored: existing.has(ip) }));
      res.json({ count: results.length, results });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}

module.exports = discoveryRouter;
