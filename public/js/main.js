/**
 * Main router and app bootstrap.
 * Hash-based routing: #/overview, #/devices, etc.
 */

import { initSocket, isConnected, subscribe } from './socket.js';
import * as overviewView from './views/overview.js';
import * as devicesView from './views/devices.js';
import * as topologyView from './views/topology.js';
import * as alertsView from './views/alerts.js';
import * as settingsView from './views/settings.js';

const VIEWS = {
  overview: { module: overviewView, title: 'Network Monitor' },
  devices: { module: devicesView, title: 'Network Devices' },
  topology: { module: topologyView, title: 'Network Topology' },
  alerts: { module: alertsView, title: 'Network Alerts' },
  settings: { module: settingsView, title: 'Network Settings' }
};

let currentView = null;
let currentViewName = null;

/**
 * Initialize the app.
 */
function init() {
  // Initialize Socket.io
  initSocket();

  // Subscribe to connection changes
  subscribe('connected', () => {
    updateConnectionIndicator(true);
  });

  subscribe('disconnect', () => {
    updateConnectionIndicator(false);
  });

  // Handle hash changes
  window.addEventListener('hashchange', handleRouteChange);

  // Initial route load
  handleRouteChange();

  // Update time in topbar every second
  setInterval(() => {
    const now = new Date();
    document.getElementById('topbarTime').textContent = now.toLocaleTimeString();
  }, 1000);
}

/**
 * Handle route change from hash.
 */
async function handleRouteChange() {
  const hash = window.location.hash.slice(1); // Remove #
  const cleanHash = hash.startsWith('/') ? hash.slice(1) : hash;
  const parts = cleanHash.split('/');
  const viewName = parts[0] || 'overview';

  if (!VIEWS[viewName]) {
    window.location.hash = '#/overview';
    return;
  }

  await loadView(viewName);
}

/**
 * Load and render a view.
 */
async function loadView(viewName) {
  // Unload current view if exists
  if (currentView && currentView.module.unloadView) {
    currentView.module.unloadView();
  } else if (currentView && currentView.module.unload) {
    currentView.module.unload();
  }

  currentViewName = viewName;
  currentView = VIEWS[viewName];

  // Update page title
  const pageTitle = document.getElementById('pageTitle');
  pageTitle.textContent = currentView.title;

  // Update sidebar active state
  updateSidebarActive(viewName);

  // Load view
  try {
    const loadFn = currentView.module.load || currentView.module.loadView;
    if (loadFn) {
      await loadFn();
    } else {
      // Try standard names
      const loadName = `load${viewName.charAt(0).toUpperCase() + viewName.slice(1)}`;
      if (typeof currentView.module[loadName] === 'function') {
        await currentView.module[loadName]();
      }
    }
  } catch (err) {
    console.error(`[main] error loading ${viewName}:`, err);
    document.getElementById('viewContainer').innerHTML = `
      <div class="error-state">
        Error loading ${currentView.title}: ${err.message}
      </div>
    `;
  }
}

/**
 * Update sidebar navigation active state.
 */
function updateSidebarActive(viewName) {
  document.querySelectorAll('.nav-link').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-view') === viewName);
  });
}

/**
 * Update connection indicator dot and label.
 */
function updateConnectionIndicator(connected) {
  const dot = document.getElementById('connectionDot');
  const label = document.getElementById('connectionLabel');

  if (connected) {
    dot.className = 'conn-dot connected';
    label.textContent = 'Connected';
  } else {
    dot.className = 'conn-dot disconnected';
    label.textContent = 'Offline';
  }
}

// Boot app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
