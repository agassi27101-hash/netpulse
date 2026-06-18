/**
 * Alerts view.
 */

import * as api from '../api.js';
import { formatRelativeTime, getSeverityClass } from '../format.js';
import { subscribe } from '../socket.js';

let alertsData = [];
let alertRulesData = [];
let activeFilter = 'active';
let unsubscribeAlert = null;

export async function load() {
  try {
    alertsData = await api.getAlerts(activeFilter);
    alertRulesData = await api.getAlertRules();
    renderAlertsPage();
    setupSubscriptions();
  } catch (err) {
    console.error('[alerts] load error:', err);
    showError(err.message);
  }
}

export function unload() {
  if (unsubscribeAlert) unsubscribeAlert();
}

function setupSubscriptions() {
  unsubscribeAlert = subscribe('alerts:new', (data) => {
    alertsData.unshift(data);
    renderAlertsList();
  });
}

function renderAlertsPage() {
  const container = document.getElementById('viewContainer');
  container.innerHTML = `
    <div class="alerts-page">
      <div class="view-header">
        <h2>Alerts</h2>
        <div class="range-tabs">
          <button class="range-tab ${activeFilter === 'active' ? 'active' : ''}" data-filter="active">Active</button>
          <button class="range-tab ${activeFilter === 'acknowledged' ? 'active' : ''}" data-filter="acknowledged">Acknowledged</button>
          <button class="range-tab ${activeFilter === 'resolved' ? 'active' : ''}" data-filter="resolved">Resolved</button>
          <button class="range-tab ${activeFilter === null ? 'active' : ''}" data-filter="">All</button>
        </div>
      </div>

      <div class="card alerts-content section-gap stagger-1" style="padding: 0; overflow: hidden;">
        <div class="card-title" style="padding: var(--space-4) var(--space-5); margin-bottom: 0; border-bottom: 1px solid var(--border);">Alerts Feed</div>
        <div class="alerts-list" id="alertsList" style="max-height: 400px; overflow-y: auto; padding: 0 var(--space-5);">
          ${alertsData.length === 0 ? '<p class="empty-state">No alerts</p>' : ''}
        </div>
      </div>

      <div class="alerts-rules-section stagger-2">
        <div class="rules-header">
          <h3>Alert Rules</h3>
          <button class="btn btn-primary" id="addRuleBtn">+ New Rule</button>
        </div>
        <div class="rules-list" id="rulesList">
          ${alertRulesData.length === 0 ? '<p class="empty-state">No alert rules</p>' : ''}
        </div>
      </div>
    </div>

    <!-- Alert Rule Modal -->
    <div class="modal-backdrop" id="ruleModal" style="display: none;">
      <div class="modal">
        <div class="modal-header">
          <h3 id="ruleModalTitle">Add Alert Rule</h3>
          <button class="btn btn-ghost btn-sm" id="closeRuleModal">&times;</button>
        </div>
        <form id="ruleForm">
          <div class="field">
            <label>Rule Name *</label>
            <input type="text" name="name" required>
          </div>
          <div class="field">
            <label>Metric *</label>
            <select name="metric" required>
              <option value="">Select metric...</option>
              <option value="device_down">Device Status</option>
              <option value="latency">Latency</option>
              <option value="packet_loss">Packet Loss</option>
              <option value="interface_down">Interface Status</option>
            </select>
          </div>
          <div class="field">
            <label>Condition *</label>
            <select name="condition" required>
              <option value="">Select condition...</option>
              <option value="above">Above</option>
              <option value="below">Below</option>
              <option value="equals">Equals</option>
            </select>
          </div>
          <div class="field">
            <label>Threshold *</label>
            <input type="text" name="threshold" placeholder="e.g., 200 (for latency ms) or 50 (for % loss)" required>
          </div>
          <div class="field">
            <label>Severity *</label>
            <select name="severity" required>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div class="field">
            <label>Device (optional, leave empty for all)</label>
            <select name="device_id">
              <option value="">All Devices</option>
            </select>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn" id="cancelRuleBtn">Cancel</button>
            <button type="submit" class="btn btn-primary">Save Rule</button>
          </div>
        </form>
      </div>
    </div>
  `;

  renderAlertsList();
  renderRulesList();
  attachEventListeners();
}

function renderAlertsList() {
  const listContainer = document.getElementById('alertsList');
  if (alertsData.length === 0) {
    listContainer.innerHTML = '<p class="empty-state">No alerts</p>';
    return;
  }

  listContainer.innerHTML = alertsData.map((alert, idx) => {
    const staggerClass = `stagger-${Math.min(idx + 1, 9)}`;
    return `
      <div class="alert-row ${staggerClass}">
        <span class="chip severity-${alert.severity}">${alert.severity}</span>
        <div class="alert-row-body">
          <div class="alert-row-message">${alert.message}</div>
          <div class="alert-row-meta">
            <span class="mono">Device: ${alert.device_name || `#${alert.device_id}`}</span>
            <span>&bull;</span>
            <span>Status: ${alert.status}</span>
            <span>&bull;</span>
            <span>${formatRelativeTime(alert.triggered_at)}</span>
          </div>
        </div>
        <div class="alert-row-actions">
          ${alert.status === 'active' ? `
            <button class="btn btn-sm btn-ghost" data-action="acknowledge" data-id="${alert.id}">Acknowledge</button>
          ` : ''}
          ${alert.status !== 'resolved' ? `
            <button class="btn btn-sm btn-ghost" data-action="resolve" data-id="${alert.id}">Resolve</button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Attach action handlers
  listContainer.addEventListener('click', (e) => {
    const action = e.target.getAttribute('data-action');
    const id = parseInt(e.target.getAttribute('data-id'), 10);

    if (action === 'acknowledge') {
      api.acknowledgeAlert(id).then(() => {
        load();
      }).catch(err => alert(`Error: ${err.message}`));
    } else if (action === 'resolve') {
      api.resolveAlert(id).then(() => {
        load();
      }).catch(err => alert(`Error: ${err.message}`));
    }
  });
}

function renderRulesList() {
  const listContainer = document.getElementById('rulesList');
  if (alertRulesData.length === 0) {
    listContainer.innerHTML = '<p class="empty-state">No alert rules</p>';
    return;
  }

  listContainer.innerHTML = alertRulesData.map((rule, idx) => {
    const staggerClass = `stagger-${Math.min(idx + 1, 9)}`;
    return `
      <div class="card ${staggerClass}" style="margin-bottom: var(--space-3);">
        <div class="card-title">
          <h4>${rule.name}</h4>
          <span class="chip severity-${rule.severity}">${rule.severity}</span>
        </div>
        <div style="margin-bottom: var(--space-4); font-size: 13px; color: var(--text-muted); display: flex; flex-direction: column; gap: 4px;">
          <div><strong>Metric:</strong> <span class="mono">${rule.metric}</span></div>
          <div><strong>Condition:</strong> <span class="mono">${rule.condition} ${rule.threshold || ''}</span></div>
        </div>
        <div class="modal-actions" style="border-top: none; padding-top: 0; margin-top: 0; margin-bottom: 0;">
          <button class="btn btn-sm" data-action="edit-rule" data-id="${rule.id}">Edit</button>
          <button class="btn btn-sm btn-danger" data-action="delete-rule" data-id="${rule.id}">Delete</button>
        </div>
      </div>
    `;
  }).join('');

  // Attach rule action handlers
  listContainer.addEventListener('click', (e) => {
    const action = e.target.getAttribute('data-action');
    const id = parseInt(e.target.getAttribute('data-id'), 10);

    if (action === 'delete-rule') {
      if (confirm('Delete rule?')) {
        api.deleteAlertRule(id).then(() => {
          load();
        }).catch(err => alert(`Error: ${err.message}`));
      }
    } else if (action === 'edit-rule') {
      const rule = alertRulesData.find(r => r.id === id);
      if (rule) {
        openRuleModal(rule);
      }
    }
  });
}

function attachEventListeners() {
  // Tab filters
  document.querySelectorAll('.range-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const filter = e.target.getAttribute('data-filter');
      activeFilter = filter || null;
      load();
    });
  });

  // Add rule button
  document.getElementById('addRuleBtn').addEventListener('click', () => {
    openRuleModal(null);
  });

  // Rule form
  document.getElementById('ruleForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const ruleData = {
      name: formData.get('name'),
      metric: formData.get('metric'),
      condition: formData.get('condition'),
      threshold: formData.get('threshold'),
      severity: formData.get('severity'),
      device_id: formData.get('device_id') ? parseInt(formData.get('device_id'), 10) : null,
      enabled: 1
    };

    const ruleId = parseInt(document.getElementById('ruleForm').getAttribute('data-rule-id') || '0', 10);
    const promise = ruleId
      ? api.updateAlertRule(ruleId, ruleData)
      : api.createAlertRule(ruleData);

    promise
      .then(() => {
        load();
        closeRuleModal();
      })
      .catch(err => alert(`Error: ${err.message}`));
  });

  // Close rule modal
  document.getElementById('closeRuleModal').addEventListener('click', closeRuleModal);
  document.getElementById('cancelRuleBtn').addEventListener('click', closeRuleModal);
}

function openRuleModal(rule) {
  const modal = document.getElementById('ruleModal');
  const form = document.getElementById('ruleForm');
  const title = document.getElementById('ruleModalTitle');

  form.reset();
  form.removeAttribute('data-rule-id');

  if (rule) {
    title.textContent = 'Edit Alert Rule';
    form.setAttribute('data-rule-id', rule.id);
    form.name.value = rule.name;
    form.metric.value = rule.metric;
    form.condition.value = rule.condition;
    form.threshold.value = rule.threshold;
    form.severity.value = rule.severity;
    form.device_id.value = rule.device_id || '';
  } else {
    title.textContent = 'New Alert Rule';
  }

  modal.style.display = 'flex';
}

function closeRuleModal() {
  document.getElementById('ruleModal').style.display = 'none';
}

function showError(message) {
  const container = document.getElementById('viewContainer');
  container.innerHTML = `<div class="error-state">Error loading alerts: ${message}</div>`;
}
