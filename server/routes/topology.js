const express = require('express');

function topologyRouter(db) {
  const router = express.Router();

  const stmtNodes = db.prepare(
    "SELECT id, name, ip_address, device_type, status, group_name FROM devices WHERE enabled = 1"
  );
  const stmtLinks = db.prepare('SELECT * FROM topology_links');
  const stmtDeviceGet = db.prepare('SELECT id FROM devices WHERE id = ?');
  const stmtLinkInsert = db.prepare(
    'INSERT INTO topology_links (device_a_id, device_b_id, label) VALUES (?, ?, ?)'
  );
  const stmtLinkGet = db.prepare('SELECT * FROM topology_links WHERE id = ?');
  const stmtLinkDelete = db.prepare('DELETE FROM topology_links WHERE id = ?');

  router.get('/', (req, res) => {
    res.json({
      nodes: stmtNodes.all(),
      links: stmtLinks.all()
    });
  });

  router.post('/links', (req, res) => {
    const { device_a_id, device_b_id, label } = req.body;
    if (!device_a_id || !device_b_id) {
      return res.status(400).json({ error: 'device_a_id and device_b_id are required' });
    }
    if (device_a_id === device_b_id) {
      return res.status(400).json({ error: 'A device cannot be linked to itself' });
    }
    if (!stmtDeviceGet.get(device_a_id) || !stmtDeviceGet.get(device_b_id)) {
      return res.status(404).json({ error: 'One or both devices not found' });
    }
    const info = stmtLinkInsert.run(device_a_id, device_b_id, label || null);
    res.status(201).json(stmtLinkGet.get(info.lastInsertRowid));
  });

  router.delete('/links/:id', (req, res) => {
    const existing = stmtLinkGet.get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Link not found' });
    stmtLinkDelete.run(req.params.id);
    res.status(204).end();
  });

  return router;
}

module.exports = topologyRouter;
