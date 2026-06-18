const express = require('express');

function settingsRouter(db) {
  const router = express.Router();

  const stmtAll = db.prepare('SELECT key, value FROM settings');
  const stmtUpsert = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  router.get('/', (req, res) => {
    const rows = stmtAll.all();
    const map = {};
    for (const row of rows) map[row.key] = row.value;
    res.json(map);
  });

  router.put('/', (req, res) => {
    const updates = req.body || {};
    const keys = Object.keys(updates);
    if (keys.length === 0) {
      return res.status(400).json({ error: 'Request body must contain at least one setting' });
    }

    const tx = db.transaction((entries) => {
      for (const [key, value] of entries) {
        stmtUpsert.run(key, String(value));
      }
    });
    tx(Object.entries(updates));

    const rows = stmtAll.all();
    const map = {};
    for (const row of rows) map[row.key] = row.value;
    res.json(map);
  });

  return router;
}

module.exports = settingsRouter;
