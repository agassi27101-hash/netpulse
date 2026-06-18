/**
 * API Client for NetPulse backend.
 * Wraps fetch calls with JSON serialization and error handling.
 */

const API_BASE = '/api';

async function apiCall(method, endpoint, body = null) {
  const url = `${API_BASE}${endpoint}`;
  const options = { method, headers: { 'Content-Type': 'application/json' } };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data && data.error) errMsg = data.error;
    } catch (e) {
      // ignore parsing failure on error response body
    }
    throw new Error(errMsg);
  }

  if (res.status === 204) {
    return null;
  }

  return res.json();
}

// ─────────────────────────────────────────────────────────────────
// DEVICES
// ─────────────────────────────────────────────────────────────────

export async function getDevices() {
  return apiCall('GET', '/devices');
}

export async function getDevice(id) {
  return apiCall('GET', `/devices/${id}`);
}

export async function createDevice(device) {
  return apiCall('POST', '/devices', device);
}

export async function updateDevice(id, device) {
  return apiCall('PUT', `/devices/${id}`, device);
}

export async function deleteDevice(id) {
  return apiCall('DELETE', `/devices/${id}`);
}

export async function getDeviceInterfaces(id) {
  return apiCall('GET', `/devices/${id}/interfaces`);
}

export async function getDevicePingMetrics(id, range = '24h') {
  return apiCall('GET', `/devices/${id}/metrics/ping?range=${encodeURIComponent(range)}`);
}

export async function getInterfaceMetrics(deviceId, interfaceId, range = '24h') {
  return apiCall('GET', `/devices/${deviceId}/metrics/interfaces/${interfaceId}?range=${encodeURIComponent(range)}`);
}

// ─────────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────────

export async function getDashboardOverview() {
  return apiCall('GET', '/dashboard');
}

// ─────────────────────────────────────────────────────────────────
// ALERTS
// ─────────────────────────────────────────────────────────────────

export async function getAlerts(status = null) {
  const url = status ? `/alerts?status=${encodeURIComponent(status)}` : '/alerts';
  return apiCall('GET', url);
}

export async function acknowledgeAlert(id) {
  return apiCall('POST', `/alerts/${id}/acknowledge`);
}

export async function resolveAlert(id) {
  return apiCall('POST', `/alerts/${id}/resolve`);
}

export async function getAlertRules() {
  return apiCall('GET', '/alert-rules');
}

export async function createAlertRule(rule) {
  return apiCall('POST', '/alert-rules', rule);
}

export async function updateAlertRule(id, rule) {
  return apiCall('PUT', `/alert-rules/${id}`, rule);
}

export async function deleteAlertRule(id) {
  return apiCall('DELETE', `/alert-rules/${id}`);
}

// ─────────────────────────────────────────────────────────────────
// TOPOLOGY
// ─────────────────────────────────────────────────────────────────

export async function getTopology() {
  return apiCall('GET', '/topology');
}

export async function addTopologyLink(deviceAId, deviceBId, label = '') {
  return apiCall('POST', '/topology/links', { device_a_id: deviceAId, device_b_id: deviceBId, label });
}

export async function deleteTopologyLink(deviceAId, deviceBId) {
  return apiCall('DELETE', `/topology/links/${deviceAId}/${deviceBId}`);
}

// ─────────────────────────────────────────────────────────────────
// DISCOVERY
// ─────────────────────────────────────────────────────────────────

export async function scanNetwork(cidr) {
  return apiCall('POST', '/discovery/scan', { cidr });
}

// ─────────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────────

export async function getSettings() {
  return apiCall('GET', '/settings');
}

export async function updateSettings(settings) {
  return apiCall('PUT', '/settings', settings);
}
