/**
 * Network Topology view using vis-network.
 */

import * as api from '../api.js';
import { getStatusClass } from '../format.js';
import { subscribe } from '../socket.js';

let topologyData = null;
let network = null;
let unsubscribeDevice = null;
let isTopologyActive = false;

export async function load() {
  try {
    isTopologyActive = true;
    topologyData = await api.getTopology();
    renderTopologyPage();
    setupSubscriptions();
  } catch (err) {
    console.error('[topology] load error:', err);
    showError(err.message);
  }
}

export function unload() {
  isTopologyActive = false;
  if (unsubscribeDevice) unsubscribeDevice();
  if (network) {
    network.destroy();
    network = null;
  }
}

function setupSubscriptions() {
  unsubscribeDevice = subscribe('device:update', (data) => {
    // Update node color if status changed
    if (network && data.id) {
      const node = network.body.nodes[data.id];
      if (node) {
        node.updateOptions({
          color: getNodeColor(data.status)
        });
      }
    }
  });
}

function renderTopologyPage() {
  const container = document.getElementById('viewContainer');
  container.innerHTML = `
    <div class="topology-page">
      <div class="topology-header" style="margin-bottom: var(--space-4); display: flex; align-items: center; justify-content: space-between;">
        <h2>Network Topology</h2>
        <div class="topology-controls">
          <button class="btn btn-sm" id="fitBtn">Fit to View</button>
          <button class="btn btn-sm" id="resetPhysicsBtn">Reset Physics</button>
        </div>
      </div>

      <div class="topology-layout">
        <div id="topology-canvas"></div>
        <div class="topology-side" id="topologySidebar"></div>
      </div>
    </div>
  `;

  renderTopologySidebarPlaceholder();
  initVisNetwork();
  attachEventListeners();
}

function initVisNetwork() {
  const container = document.getElementById('topology-canvas');

  // Build nodes
  const nodes = topologyData.nodes.map(device => ({
    id: device.id,
    label: device.name,
    title: `${device.name}\n${device.ip_address}\nStatus: ${device.status}`,
    color: getNodeColor(device.status),
    font: {
      color: '#f3f4f6',
      size: 14,
      face: 'IBM Plex Sans'
    },
    physics: true,
    shape: 'dot',
    size: 24,
    borderWidth: 2,
    borderWidthSelected: 3
  }));

  // Build edges (links)
  const edges = topologyData.links.map(link => ({
    from: link.device_a_id,
    to: link.device_b_id,
    label: link.label || '',
    color: { color: 'rgba(255, 255, 255, 0.15)', highlight: '#3b82f6', hover: 'rgba(255, 255, 255, 0.3)' },
    font: {
      color: '#9ca3af',
      size: 11,
      face: 'IBM Plex Mono'
    },
    physics: true
  }));

  const data = { nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges) };
  const options = {
    physics: {
      enabled: true,
      stabilization: { iterations: 200 },
      barnesHut: {
        gravitationalConstant: -26000,
        centralGravity: 0.3,
        springLength: 200,
        springConstant: 0.04
      }
    },
    interaction: {
      navigationButtons: true,
      keyboard: true,
      zoomView: true,
      dragView: true,
      hover: true
    },
    nodes: {
      margin: 10,
      widthConstraint: { maximum: 100 }
    }
  };

  network = new vis.Network(container, data, options);

  // Live traffic particle overlay
  network.on('afterDrawing', (ctx) => {
    if (!isTopologyActive || !network) return;

    const positions = network.getPositions();
    const links = topologyData?.links || [];

    ctx.save();
    links.forEach(link => {
      const fromPos = positions[link.device_a_id];
      const toPos = positions[link.device_b_id];

      if (fromPos && toPos) {
        const fromNode = topologyData.nodes.find(n => n.id === link.device_a_id);
        const toNode = topologyData.nodes.find(n => n.id === link.device_b_id);

        // If either node is down, don't draw flowing traffic
        const isLinkDown = (fromNode && (fromNode.status === 'down' || fromNode.status === 'unreachable')) ||
                           (toNode && (toNode.status === 'down' || toNode.status === 'unreachable'));
                           
        if (isLinkDown) return;

        const isWarning = (fromNode && fromNode.status === 'warning') || (toNode && toNode.status === 'warning');
        const isMaintenance = (fromNode && fromNode.status === 'maintenance') || (toNode && toNode.status === 'maintenance');

        let color = '#3b82f6'; // Neon blue for healthy
        let speedMult = 1.0;

        if (isWarning) {
          color = '#f59e0b'; // Neon amber for warning
          speedMult = 0.6;
        } else if (isMaintenance) {
          color = '#a78bfa'; // Lavender for maintenance
          speedMult = 0.3;
        }

        const time = Date.now() / 1000;
        const progress = (time * 0.25 * speedMult) % 1;

        const numParticles = 2;
        for (let i = 0; i < numParticles; i++) {
          const offset = (progress + (i / numParticles)) % 1;
          const x = fromPos.x + (toPos.x - fromPos.x) * offset;
          const y = fromPos.y + (toPos.y - fromPos.y) * offset;

          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.shadowBlur = 8;
          ctx.shadowColor = color;
          ctx.fill();
          ctx.closePath();
        }
      }
    });
    ctx.restore();

    // Trigger next redraw frame
    requestAnimationFrame(() => {
      if (isTopologyActive && network) {
        network.redraw();
      }
    });
  });

  // Click node to show details
  network.on('click', (params) => {
    if (params.nodes.length > 0) {
      const nodeId = params.nodes[0];
      const device = topologyData.nodes.find(d => d.id === nodeId);
      if (device) {
        showDeviceDetail(device);
      }
    }
  });
}

function showDeviceDetail(device) {
  const sidebar = document.getElementById('topologySidebar');
  sidebar.innerHTML = `
    <div class="card">
      <div class="card-title" style="margin-bottom: var(--space-3);">${device.name}</div>
      <div style="display: flex; flex-direction: column; gap: var(--space-3);">
        <div class="info-row">
          <span class="label">IP Address</span>
          <span class="value">${device.ip_address}</span>
        </div>
        <div class="info-row">
          <span class="label">Status</span>
          <span class="value"><span class="chip ${getStatusClass(device.status)}">${device.status}</span></span>
        </div>
        <div class="info-row">
          <span class="label">Device Type</span>
          <span class="value">${device.device_type || '—'}</span>
        </div>
        ${device.latency_ms !== null && device.latency_ms !== undefined ? `
        <div class="info-row">
          <span class="label">Latency</span>
          <span class="value">${device.latency_ms} ms</span>
        </div>
        ` : ''}
      </div>
    </div>
    <button class="btn btn-sm btn-ghost" id="deselectDeviceBtn" style="margin-top: var(--space-2); align-self: flex-start;">&larr; Back to Legend</button>
  `;

  document.getElementById('deselectDeviceBtn').addEventListener('click', () => {
    renderTopologySidebarPlaceholder();
  });
}

function renderTopologySidebarPlaceholder() {
  const sidebar = document.getElementById('topologySidebar');
  sidebar.innerHTML = `
    <div class="sidebar-placeholder" style="margin-bottom: var(--space-4);">Select a device to view details</div>
    <div class="card">
      <div class="card-title">Legend</div>
      <div class="legend">
        <div class="legend-item"><span class="pulse-dot status-up"></span> Up</div>
        <div class="legend-item"><span class="pulse-dot status-warning"></span> Warning</div>
        <div class="legend-item"><span class="pulse-dot status-down"></span> Down</div>
        <div class="legend-item"><span class="pulse-dot status-unreachable"></span> Unreachable</div>
        <div class="legend-item"><span class="pulse-dot status-maintenance"></span> Maintenance</div>
        <div class="legend-item"><span class="pulse-dot status-unknown"></span> Unknown</div>
      </div>
    </div>
  `;
}

function getNodeColor(status) {
  const colors = {
    up: {
      background: 'rgba(16, 185, 129, 0.22)',
      border: '#10b981',
      highlight: { background: 'rgba(16, 185, 129, 0.45)', border: '#10b981' },
      hover: { background: 'rgba(16, 185, 129, 0.35)', border: '#10b981' }
    },
    down: {
      background: 'rgba(239, 68, 68, 0.22)',
      border: '#ef4444',
      highlight: { background: 'rgba(239, 68, 68, 0.45)', border: '#ef4444' },
      hover: { background: 'rgba(239, 68, 68, 0.35)', border: '#ef4444' }
    },
    warning: {
      background: 'rgba(245, 158, 11, 0.22)',
      border: '#f59e0b',
      highlight: { background: 'rgba(245, 158, 11, 0.45)', border: '#f59e0b' },
      hover: { background: 'rgba(245, 158, 11, 0.35)', border: '#f59e0b' }
    },
    maintenance: {
      background: 'rgba(167, 139, 250, 0.22)',
      border: '#a78bfa',
      highlight: { background: 'rgba(167, 139, 250, 0.45)', border: '#a78bfa' },
      hover: { background: 'rgba(167, 139, 250, 0.35)', border: '#a78bfa' }
    },
    unreachable: {
      background: 'rgba(244, 63, 94, 0.22)',
      border: '#f43f5e',
      highlight: { background: 'rgba(244, 63, 94, 0.45)', border: '#f43f5e' },
      hover: { background: 'rgba(244, 63, 94, 0.35)', border: '#f43f5e' }
    },
    unknown: {
      background: 'rgba(107, 114, 128, 0.22)',
      border: '#6b7280',
      highlight: { background: 'rgba(107, 114, 128, 0.45)', border: '#6b7280' },
      hover: { background: 'rgba(107, 114, 128, 0.35)', border: '#6b7280' }
    }
  };
  return colors[status] || colors.unknown;
}

function attachEventListeners() {
  document.getElementById('fitBtn').addEventListener('click', () => {
    if (network) network.fit();
  });

  document.getElementById('resetPhysicsBtn').addEventListener('click', () => {
    if (network) {
      network.physics.stabilize();
    }
  });
}

function showError(message) {
  const container = document.getElementById('viewContainer');
  container.innerHTML = `<div class="error-state">Error loading topology: ${message}</div>`;
}
