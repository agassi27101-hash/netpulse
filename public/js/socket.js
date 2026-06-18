/**
 * Socket.io client initialization and event wrappers.
 */

let io_socket = null;
const subscriptions = {
  'device:update': [],
  'alerts:new': [],
  'overview:refresh': [],
  'connected': [],
  'disconnect': [],
  'error': []
};

/**
 * Initialize Socket.io connection.
 * Must be called once at startup.
 */
export function initSocket() {
  io_socket = io();

  io_socket.on('connected', (data) => {
    console.log('[socket] connected', data);
    emit('connected', data);
  });

  io_socket.on('device:update', (data) => {
    emit('device:update', data);
  });

  io_socket.on('alerts:new', (data) => {
    emit('alerts:new', data);
  });

  io_socket.on('overview:refresh', (data) => {
    emit('overview:refresh', data);
  });

  io_socket.on('disconnect', () => {
    console.log('[socket] disconnected');
    emit('disconnect');
  });

  io_socket.on('error', (err) => {
    console.error('[socket] error:', err);
    emit('error', err);
  });
}

/**
 * Subscribe to an event.
 * @param {string} eventName - Event name ('device:update', 'alerts:new', etc.)
 * @param {function} callback - Callback function
 * @returns {function} Unsubscribe function
 */
export function subscribe(eventName, callback) {
  if (!subscriptions[eventName]) {
    subscriptions[eventName] = [];
  }
  subscriptions[eventName].push(callback);

  // Return unsubscribe function
  return () => {
    const idx = subscriptions[eventName].indexOf(callback);
    if (idx > -1) {
      subscriptions[eventName].splice(idx, 1);
    }
  };
}

/**
 * Emit event to all subscribers (internal use).
 */
function emit(eventName, data = null) {
  if (subscriptions[eventName]) {
    subscriptions[eventName].forEach(cb => {
      try {
        cb(data);
      } catch (err) {
        console.error(`[socket] callback error for ${eventName}:`, err);
      }
    });
  }
}

/**
 * Get connection status.
 */
export function isConnected() {
  return io_socket && io_socket.connected;
}
