/**
 * Devices management view.
 */

import * as api from '../api.js';
import { formatBytes, formatBps, formatUptime, formatRelativeTime, getStatusClass } from '../format.js';
import { createLatencyChart, createBandwidthChart } from '../charts.js';
import { subscribe } from '../socket.js';

let devicesData = [];
let selectedDeviceId = null;
let latencyChart = null;
let bandwidthCharts = {};
let unsubscribeDevice = null;

export async function load() {
  try {
    devicesData = await api.getDevices();
    renderDevicesPage();
    setupSubscriptions();
  } catch (err) {
    console.error('[devices] load error:', err);
    showError(err.message);
  }
}

export function unload() {
  if (unsubscribeDevice) unsubscribeDevice();
  // Clean up charts
  if (latencyChart) latencyChart.destroy();
  Object.values(bandwidthCharts).forEach(chart => chart && chart.destroy());
}

function setupSubscriptions() {
  unsubscribeDevice = subscribe('device:update', (data) => {
    // Update device in local list
    const idx = devicesData.findIndex(d => d.id === data.id);
    if (idx > -1) {
      devicesData[idx] = { ...devicesData[idx], ...data };
      const q = document.getElementById('deviceSearchInput')?.value || '';
      renderDeviceTable(q);
      if (selectedDeviceId === data.id) {
        renderDeviceDetail(devicesData[idx], true);
      }
    } else {
      // New device added - reload entire list from server to fetch full details
      load();
    }
  });
}

function getDeviceIconAndColor(type) {
  const t = (type || 'other').toLowerCase();
  if (t.includes('server') || t.includes('switch') || t.includes('router') || t.includes('firewall') || t.includes('core') || t.includes('gateway')) {
    return {
      color: '#60a5fa', // clean neon blue/lavender
      icon: `<svg class="device-type-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>`
    };
  }
  if (t.includes('laptop') || t.includes('workstation') || t.includes('desktop') || t.includes('pc') || t.includes('station') || t.includes('admin') || t.includes('dev')) {
    return {
      color: '#34d399', // green/teal
      icon: `<svg class="device-type-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`
    };
  }
  if (t.includes('phone') || t.includes('mobile') || t.includes('tablet') || t.includes('wifi')) {
    return {
      color: '#a78bfa', // purple
      icon: `<svg class="device-type-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>`
    };
  }
  return {
    color: '#9ca3af', // gray
    icon: `<svg class="device-type-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2" ry="2"></rect><line x1="12" y1="2" x2="12" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg>`
  };
}

function renderDevicesPage() {
  const container = document.getElementById('viewContainer');
  container.innerHTML = `
    <div class="devices-page">
      <div class="view-header">
        <h2>Network Devices</h2>
        <div class="view-actions">
          <button class="btn btn-primary" id="addDeviceBtn">+ Add Device</button>
          <button class="btn btn-secondary" id="discoveryBtn">🔍 Scan Network</button>
        </div>
      </div>

      <div class="devices-content">
        <div class="devices-list card">
          <div class="table-header-block">
            <div class="table-header-left">
              <h3 class="table-title">CONNECTED DEVICES</h3>
              <span class="table-subtitle" id="deviceSubtitle">0 of 0 shown</span>
            </div>
            <div class="table-header-right">
              <div class="search-box-container">
                <svg class="search-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" class="search-input-mock" id="deviceSearchInput" placeholder="Search devices...">
              </div>
            </div>
          </div>
          <div class="devices-table-wrap">
            <table class="devices-table" id="devicesTable">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>IP Address / URL</th>
                  <th>Status</th>
                  <th>Bandwidth</th>
                  <th>Latency</th>
                  <th>Uptime</th>
                  <th>Location</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="devicesTableBody"></tbody>
            </table>
          </div>
        </div>

        <div class="device-detail" id="deviceDetail" style="display: none;">
          <div id="deviceDetailContent"></div>
        </div>
      </div>
    </div>

    <!-- Add/Edit Device Modal -->
    <div class="modal-backdrop" id="deviceModal" style="display: none;">
      <div class="modal">
        <div class="modal-header">
          <h3 id="deviceModalTitle">Add Device</h3>
          <button class="btn btn-ghost btn-sm" id="closeDeviceModal">&times;</button>
        </div>
        <form id="deviceForm">
          <div class="field">
            <label>Device Name *</label>
            <input type="text" name="name" required>
          </div>
          <div class="field">
            <label>IP Address or URL *</label>
            <input type="text" name="ip_address" placeholder="e.g., 192.168.1.1, myhost.local, or https://google.com" required>
          </div>
          <div class="field">
            <label>Device Type</label>
            <select name="device_type">
              <option>Router</option>
              <option>Switch</option>
              <option>Server</option>
              <option>Printer</option>
              <option>Firewall</option>
              <option>Other</option>
            </select>
          </div>
          <div class="field">
            <label>Location / Group</label>
            <input type="text" name="group_name" placeholder="e.g., US-East-1, Office-SF">
          </div>
          <div class="field">
            <label>Parent Device (for dependency alert suppression)</label>
            <select name="parent_id" id="deviceParentSelect">
              <option value="">None</option>
            </select>
          </div>
          <div class="checkbox-row" style="margin-bottom: var(--space-4); display: flex; align-items: center; gap: var(--space-2);">
            <input type="checkbox" name="in_maintenance" id="deviceMaintenanceCheckbox">
            <label for="deviceMaintenanceCheckbox">In Maintenance Mode (suppress notifications)</label>
          </div>

          <fieldset style="border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--space-4); margin-bottom: var(--space-4);">
            <legend style="padding: 0 var(--space-2); color: var(--text-muted); font-size: 12.5px; font-weight: 600;">SNMP Configuration (Optional)</legend>
            <div class="checkbox-row" style="margin-bottom: var(--space-3); display: flex; align-items: center; gap: var(--space-2);">
              <input type="checkbox" name="snmp_enabled" id="snmpEnabledCheckbox">
              <label for="snmpEnabledCheckbox">Enable SNMP</label>
            </div>
            <div id="snmpFields" style="display: none;">
              <div class="field">
                <label>SNMP Version</label>
                <select name="snmp_version">
                  <option value="2c">2c</option>
                  <option value="1">1</option>
                </select>
              </div>
              <div class="field">
                <label>Community String</label>
                <input type="text" name="snmp_community" placeholder="public">
              </div>
              <div class="field">
                <label>SNMP Port</label>
                <input type="number" name="snmp_port" value="161">
              </div>
            </div>
          </fieldset>

          <div class="field">
            <label>Notes</label>
            <textarea name="notes" rows="3"></textarea>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn" id="cancelDeviceBtn">Cancel</button>
            <button type="submit" class="btn btn-primary">Save Device</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Discovery Modal -->
    <div class="modal-backdrop" id="discoveryModal" style="display: none;">
      <div class="modal">
        <div class="modal-header">
          <h3>Network Discovery</h3>
          <button class="btn btn-ghost btn-sm" id="closeDiscoveryModal">&times;</button>
        </div>
        <div class="modal-body" style="display: flex; flex-direction: column; gap: var(--space-3);">
          <div class="field" style="margin-bottom: 0;">
            <label>CIDR Range</label>
            <input type="text" id="cidrInput" placeholder="192.168.1.0/24">
            <small class="help-text">Enter a CIDR range to scan (max /22)</small>
          </div>
          <button class="btn btn-primary" id="startScanBtn">Start Scan</button>
          <div id="discoveryResults" style="margin-top: var(--space-3);"></div>
        </div>
      </div>
    </div>
  `;

  renderDeviceTable();
  attachEventListeners();
}

function renderDeviceTable(searchQuery = '') {
  const tbody = document.getElementById('devicesTableBody');
  const filtered = devicesData.filter(device => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase().trim();
    return (device.name || '').toLowerCase().includes(q) ||
           (device.ip_address || '').toLowerCase().includes(q) ||
           (device.group_name || '').toLowerCase().includes(q);
  });

  const subtitle = document.getElementById('deviceSubtitle');
  if (subtitle) {
    subtitle.textContent = `${filtered.length} of ${devicesData.length} shown`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--text-faint); padding: var(--space-6);">
          No devices match your search
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map((device, idx) => {
    const staggerClass = `stagger-${Math.min(idx + 1, 9)}`;
    const { color, icon } = getDeviceIconAndColor(device.device_type);
    const activeClass = device.id === selectedDeviceId ? 'active-row' : '';

    let statusLabel = 'Unknown';
    if (device.status === 'up') statusLabel = 'Online';
    else if (device.status === 'warning') statusLabel = 'Warning';
    else if (device.status === 'down' || device.status === 'unreachable') statusLabel = 'Offline';
    else if (device.status === 'maintenance') statusLabel = 'Maintenance';

    const bwVal = device.bandwidth_utilization ?? 0;
    let bwClass = 'bw-low';
    if (bwVal >= 80) bwClass = 'bw-high';
    else if (bwVal >= 50) bwClass = 'bw-medium';

    const lat = device.last_latency_ms;
    let latClass = 'latency-offline';
    let latDisplay = '—';
    if (lat !== null) {
      latDisplay = `${Math.round(lat)}ms`;
      if (lat < 15) latClass = 'latency-healthy';
      else if (lat < 35) latClass = 'latency-warning';
      else latClass = 'latency-critical';
    }

    const uptimeDisplay = device.uptime_pct !== undefined ? `${device.uptime_pct.toFixed(2)}%` : '100.00%';
    const locationDisplay = device.group_name && device.group_name.trim() !== '' ? device.group_name : 'Default';

    return `
      <tr class="device-row ${activeClass} ${staggerClass}" data-device-id="${device.id}">
        <td>
          <div class="device-cell">
            <div class="device-icon-wrap" style="--icon-color: ${color}; --icon-glow: ${color}4d;">
              ${icon}
            </div>
            <span class="device-name-text">${device.name}</span>
          </div>
        </td>
        <td class="monospace" style="color: var(--text-muted);">${device.ip_address}</td>
        <td>
          <span class="status-pill status-${device.status}">
            <span class="status-dot"></span>
            ${statusLabel}
          </span>
        </td>
        <td>
          <div class="bandwidth-cell">
            <div class="bw-progress-container">
              <div class="bw-progress-bar ${bwClass}" style="width: ${bwVal}%;"></div>
            </div>
            <span class="bw-percent-label">${Math.round(bwVal)}%</span>
          </div>
        </td>
        <td>
          <span class="latency-cell ${latClass}">${latDisplay}</span>
        </td>
        <td>
          <span class="uptime-cell">${uptimeDisplay}</span>
        </td>
        <td>
          <span class="location-capsule">${locationDisplay}</span>
        </td>
        <td>
          <div style="display: flex; align-items: center;">
            <button class="action-btn" data-action="detail" data-id="${device.id}" title="Details">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </button>
            <button class="action-btn" data-action="edit" data-id="${device.id}" title="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            </button>
            <button class="action-btn delete" data-action="delete" data-id="${device.id}" title="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderDeviceDetail(device, isUpdate = false) {
  // Show detail pane, load charts
  const detailDiv = document.getElementById('deviceDetail');
  detailDiv.style.display = 'block';

  const contentWrapper = document.querySelector('.devices-content');
  if (contentWrapper) {
    contentWrapper.classList.add('has-detail');
  }

  const detailContent = detailDiv.querySelector('.device-detail-content');
  const isSameDevice = detailContent && detailContent.getAttribute('data-device-id') === String(device.id);

  if (!isSameDevice) {
    detailDiv.innerHTML = `<div class="loading">Loading device details...</div>`;
  }

  Promise.all([
    api.getDevicePingMetrics(device.id, '24h'),
    api.getDeviceInterfaces(device.id)
  ]).then(([pingMetrics, interfaces]) => {
    if (selectedDeviceId === device.id) {
      renderDetailContent(device, pingMetrics, interfaces, isSameDevice);
    }
  }).catch(err => {
    if (!isSameDevice) {
      detailDiv.innerHTML = `<div class="error-state">Error loading: ${err.message}</div>`;
    } else {
      console.error('[devices] detail live refresh error:', err);
    }
  });
}

function renderDetailContent(device, pingMetrics, interfaces, isUpdate = false) {
  const detailDiv = document.getElementById('deviceDetail');

  if (isUpdate) {
    // 1. Silent update: update DOM elements directly in the existing structure
    const statusDot = document.getElementById('detailStatusDot');
    if (statusDot) {
      statusDot.className = `pulse-dot pulse-dot-lg ${getStatusClass(device.status)}`;
    }

    const statusChip = document.getElementById('detailStatusChip');
    if (statusChip) {
      statusChip.className = `chip ${getStatusClass(device.status)}`;
      statusChip.textContent = device.status;
    }

    const uptimeVal = document.getElementById('detailUptimeVal');
    if (uptimeVal && device.sys_uptime_ticks) {
      uptimeVal.textContent = formatUptime(device.sys_uptime_ticks);
    }

    // 2. Update existing latency chart in-place smoothly
    const canvas = document.getElementById('latencyChartCanvas');
    if (canvas) {
      latencyChart = createLatencyChart(canvas, pingMetrics, latencyChart);
    }

    // 3. Update existing interface charts in-place smoothly
    if (interfaces.length > 0) {
      interfaces.forEach((iface, idx) => {
        api.getInterfaceMetrics(device.id, iface.id, '24h').then(metrics => {
          const canvas = document.getElementById(`bwChart${idx}`);
          if (canvas) {
            bandwidthCharts[iface.id] = createBandwidthChart(canvas, metrics, bandwidthCharts[iface.id]);
          }
        }).catch(err => console.error('[devices] update interface chart error:', err));
      });
    }
    return;
  }

  detailDiv.innerHTML = `
    <div class="device-detail-content" data-device-id="${device.id}">
      <div class="detail-header">
        <div class="detail-title-row">
          <span id="detailStatusDot" class="pulse-dot pulse-dot-lg ${getStatusClass(device.status)}"></span>
          <h2>${device.name}</h2>
        </div>
        <button class="btn btn-ghost btn-sm" id="closeDetailBtn">&times;</button>
      </div>
      
      <div class="card section-gap">
        <div class="card-title">System Information</div>
        <div class="info-grid">
          <div class="info-row">
            <span class="label">IP / URL</span>
            <span class="value">${device.ip_address}</span>
          </div>
          <div class="info-row">
            <span class="label">Status</span>
            <span class="value"><span id="detailStatusChip" class="chip ${getStatusClass(device.status)}">${device.status}</span></span>
          </div>
          <div class="info-row">
            <span class="label">Device Type</span>
            <span class="value">${device.device_type || '—'}</span>
          </div>
          ${device.parent_id ? `
          <div class="info-row">
            <span class="label">Parent Device</span>
            <span class="value">${devicesData.find(d => d.id === device.parent_id)?.name || `Device #${device.parent_id}`}</span>
          </div>
          ` : ''}
          ${device.sys_name ? `
          <div class="info-row">
            <span class="label">System Name</span>
            <span class="value">${device.sys_name}</span>
          </div>
          ` : ''}
          ${device.sys_uptime_ticks ? `
          <div class="info-row">
            <span class="label">Uptime</span>
            <span id="detailUptimeVal" class="value">${formatUptime(device.sys_uptime_ticks)}</span>
          </div>
          ` : ''}
        </div>
      </div>

      <div class="card section-gap">
        <div class="card-title">Ping Latency (Last 24h)</div>
        <div class="chart-wrap">
          <canvas id="latencyChartCanvas"></canvas>
        </div>
      </div>

      ${interfaces.length > 0 ? `
        <div class="card section-gap">
          <div class="card-title">Monitored SNMP Interfaces</div>
          <div id="interfacesContainer"></div>
        </div>
      ` : ''}
    </div>
  `;

  // Render latency chart
  setTimeout(() => {
    const canvas = document.getElementById('latencyChartCanvas');
    if (canvas) {
      latencyChart = createLatencyChart(canvas, pingMetrics, latencyChart);
    }

    // Render interface charts
    if (interfaces.length > 0) {
      renderInterfaceCharts(device.id, interfaces);
    }

    // Attach close detail handler
    const closeBtn = document.getElementById('closeDetailBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        const detailDiv = document.getElementById('deviceDetail');
        if (detailDiv) detailDiv.style.display = 'none';
        const contentWrapper = document.querySelector('.devices-content');
        if (contentWrapper) contentWrapper.classList.remove('has-detail');
        selectedDeviceId = null;
        renderDeviceTable(document.getElementById('deviceSearchInput')?.value || '');
      });
    }
  }, 0);
}

function renderInterfaceCharts(deviceId, interfaces) {
  const container = document.getElementById('interfacesContainer');
  container.innerHTML = interfaces.map((iface, idx) => `
    <div class="interface-card">
      <div class="interface-card-header">
        <span class="name">${iface.if_name}</span>
      </div>
      <div class="chart-wrap-sm">
        <canvas id="bwChart${idx}"></canvas>
      </div>
    </div>
  `).join('');

  // Load and render bandwidth charts
  interfaces.forEach((iface, idx) => {
    api.getInterfaceMetrics(deviceId, iface.id, '24h').then(metrics => {
      const canvas = document.getElementById(`bwChart${idx}`);
      if (canvas) {
        bandwidthCharts[iface.id] = createBandwidthChart(canvas, metrics, bandwidthCharts[iface.id]);
      }
    }).catch(err => console.error('chart error:', err));
  });
}

function attachEventListeners() {
  // Add device
  document.getElementById('addDeviceBtn').addEventListener('click', () => {
    openDeviceModal(null);
  });

  // Discovery
  document.getElementById('discoveryBtn').addEventListener('click', () => {
    document.getElementById('discoveryModal').style.display = 'flex';
  });

  // Search input filter
  const searchInput = document.getElementById('deviceSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      renderDeviceTable(e.target.value);
    });
  }

  // Device table actions (using closest to handle clicks on SVG icon elements or row clicks)
  document.getElementById('devicesTableBody').addEventListener('click', (e) => {
    const actionBtn = e.target.closest('[data-action]');
    const deviceRow = e.target.closest('.device-row');

    if (actionBtn) {
      const action = actionBtn.getAttribute('data-action');
      const id = parseInt(actionBtn.getAttribute('data-id'), 10);

      if (action === 'detail') {
        selectedDeviceId = id;
        const device = devicesData.find(d => d.id === id);
        renderDeviceDetail(device);
        renderDeviceTable(document.getElementById('deviceSearchInput')?.value || '');
      } else if (action === 'edit') {
        openDeviceModal(id);
      } else if (action === 'delete') {
        if (confirm('Delete device?')) {
          api.deleteDevice(id).then(() => {
            devicesData = devicesData.filter(d => d.id !== id);
            const q = document.getElementById('deviceSearchInput')?.value || '';
            renderDeviceTable(q);
            document.getElementById('deviceDetail').style.display = 'none';
            const contentWrapper = document.querySelector('.devices-content');
            if (contentWrapper) contentWrapper.classList.remove('has-detail');
            selectedDeviceId = null;
          }).catch(err => alert(`Error: ${err.message}`));
        }
      }
    } else if (deviceRow) {
      const id = parseInt(deviceRow.getAttribute('data-device-id'), 10);
      selectedDeviceId = id;
      const device = devicesData.find(d => d.id === id);
      renderDeviceDetail(device);
      renderDeviceTable(document.getElementById('deviceSearchInput')?.value || '');
    }
  });

  // Device form
  document.getElementById('deviceForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const deviceData = {
      name: formData.get('name'),
      ip_address: formData.get('ip_address'),
      device_type: formData.get('device_type'),
      group_name: formData.get('group_name'),
      parent_id: formData.get('parent_id') || '',
      in_maintenance: formData.get('in_maintenance') ? 1 : 0,
      snmp_enabled: formData.get('snmp_enabled') ? 1 : 0,
      snmp_version: formData.get('snmp_version'),
      snmp_community: formData.get('snmp_community'),
      snmp_port: parseInt(formData.get('snmp_port'), 10),
      notes: formData.get('notes'),
      enabled: 1
    };

    const editingId = parseInt(document.getElementById('deviceForm').getAttribute('data-device-id') || '0', 10);

    const promise = editingId
      ? api.updateDevice(editingId, deviceData)
      : api.createDevice(deviceData);

    promise
      .then(() => {
        load();
        closeDeviceModal();
      })
      .catch(err => alert(`Error: ${err.message}`));
  });

  // SNMP checkbox toggle
  document.querySelector('[name="snmp_enabled"]').addEventListener('change', (e) => {
    document.getElementById('snmpFields').style.display = e.target.checked ? 'block' : 'none';
  });

  // Close modals
  document.getElementById('closeDeviceModal').addEventListener('click', closeDeviceModal);
  document.getElementById('cancelDeviceBtn').addEventListener('click', closeDeviceModal);
  document.getElementById('closeDiscoveryModal').addEventListener('click', () => {
    document.getElementById('discoveryModal').style.display = 'none';
  });

  // Discovery scan
  document.getElementById('startScanBtn').addEventListener('click', () => {
    const cidr = document.getElementById('cidrInput').value;
    if (!cidr) {
      alert('Enter a CIDR range');
      return;
    }

    document.getElementById('discoveryResults').innerHTML = '<p class="loading">Scanning...</p>';

    api.scanNetwork(cidr).then(result => {
      const html = result.results.map(r => `
        <div class="discovery-result">
          <span class="monospace">${r.ip}</span>
          ${r.alreadyMonitored ? '<span class="badge-info">Already monitored</span>' : '<button class="btn-small" data-add-ip="${r.ip}">+ Add</button>'}
        </div>
      `).join('');

      document.getElementById('discoveryResults').innerHTML = `<p>Found ${result.count} device(s)</p><div>${html}</div>`;

      // Attach add buttons
      document.querySelectorAll('[data-add-ip]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const ip = e.target.getAttribute('data-add-ip');
          openDeviceModal(null, ip);
        });
      });
    }).catch(err => {
      document.getElementById('discoveryResults').innerHTML = `<div class="error-state">Error: ${err.message}</div>`;
    });
  });
}

function openDeviceModal(deviceId, prefillIp = null) {
  const modal = document.getElementById('deviceModal');
  const form = document.getElementById('deviceForm');
  const title = document.getElementById('deviceModalTitle');

  form.reset();
  form.removeAttribute('data-device-id');

  // Populate parent select list
  const parentSelect = document.getElementById('deviceParentSelect');
  if (parentSelect) {
    parentSelect.innerHTML = '<option value="">None</option>' +
      devicesData
        .filter(d => !deviceId || d.id !== deviceId) // exclude self
        .map(d => `<option value="${d.id}">${d.name} (${d.ip_address})</option>`)
        .join('');
  }

  if (deviceId) {
    const device = devicesData.find(d => d.id === deviceId);
    if (device) {
      title.textContent = 'Edit Device';
      form.setAttribute('data-device-id', deviceId);
      form.name.value = device.name;
      form.ip_address.value = device.ip_address;
      form.device_type.value = device.device_type || 'Other';
      form.group_name.value = device.group_name || '';
      form.parent_id.value = device.parent_id || '';
      form.in_maintenance.checked = !!device.in_maintenance;
      form.snmp_enabled.checked = device.snmp_enabled;
      form.snmp_version.value = device.snmp_version || '2c';
      form.snmp_community.value = device.snmp_community || 'public';
      form.snmp_port.value = device.snmp_port || 161;
      form.notes.value = device.notes || '';
    }
  } else {
    title.textContent = 'Add Device';
    if (prefillIp) {
      form.ip_address.value = prefillIp;
    }
  }

  // Ensure SNMP config fields visibility matches checkbox state exactly
  document.getElementById('snmpFields').style.display = form.snmp_enabled.checked ? 'block' : 'none';

  modal.style.display = 'flex';
}

function closeDeviceModal() {
  document.getElementById('deviceModal').style.display = 'none';
}

function showError(message) {
  const container = document.getElementById('viewContainer');
  container.innerHTML = `<div class="error-state">Error loading devices: ${message}</div>`;
}
