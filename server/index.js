const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const config = require('./config');
const { initDb } = require('./db');
const { startScheduler } = require('./monitor/scheduler');

const deviceRouter = require('./routes/devices');
const dashboardRouter = require('./routes/dashboard');
const alertsRouter = require('./routes/alerts');
const topologyRouter = require('./routes/topology');
const discoveryRouter = require('./routes/discovery');
const settingsRouter = require('./routes/settings');

const db = initDb(config);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/devices', deviceRouter(db));
app.use('/api/dashboard', dashboardRouter(db));
app.use('/api', alertsRouter(db));
app.use('/api/topology', topologyRouter(db));
app.use('/api/discovery', discoveryRouter(db));
app.use('/api/settings', settingsRouter(db));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[server] unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

io.on('connection', (socket) => {
  socket.emit('connected', { ok: true });
});

const stopScheduler = startScheduler({ db, io, config });

server.listen(config.port, () => {
  console.log(`NetPulse listening on http://localhost:${config.port}`);
});

function shutdown() {
  console.log('\n[server] shutting down...');
  stopScheduler();
  try {
    db.close();
  } catch (e) {}
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
