/**
 * Settings view.
 */

import * as api from '../api.js';

let settingsData = null;

export async function load() {
  try {
    settingsData = await api.getSettings();
    renderSettingsPage();
    attachEventListeners();
  } catch (err) {
    console.error('[settings] load error:', err);
    showError(err.message);
  }
}

export function unload() {
  // Cleanup if needed
}

function renderSettingsPage() {
  const container = document.getElementById('viewContainer');
  const pollInterval = settingsData?.poll_interval_seconds || 30;

  container.innerHTML = `
    <div class="settings-page">
      <div class="view-header">
        <h2>Settings</h2>
      </div>

      <div class="settings-section card section-gap stagger-1">
        <div class="card-title">Monitoring Configuration</div>
        <div class="field" style="max-width: 320px; margin-bottom: var(--space-4);">
          <label>Poll Interval (seconds)</label>
          <input type="number" id="pollIntervalInput" value="${pollInterval}" min="5" max="3600">
          <span class="help-text">How often to check device status (5–3600 seconds)</span>
        </div>
        <button class="btn btn-primary" id="savePollBtn">Save Poll Interval</button>
      </div>

      <div class="settings-section card section-gap stagger-2">
        <div class="card-title">System Information</div>
        <div class="info-grid">
          <div class="info-row">
            <span class="label">NetPulse Version</span>
            <span class="value">1.0.0</span>
          </div>
          <div class="info-row">
            <span class="label">Backend</span>
            <span class="value">Node.js + Express</span>
          </div>
          <div class="info-row">
            <span class="label">Frontend</span>
            <span class="value">Vanilla JavaScript ES6 Modules</span>
          </div>
          <div class="info-row">
            <span class="label">Database</span>
            <span class="value">SQLite3 (WAL mode)</span>
          </div>
        </div>
      </div>

      <div class="settings-section card section-gap stagger-3">
        <div class="card-title">Security Note</div>
        <div style="font-size: 13.5px; color: var(--text-muted); line-height: 1.6;">
          <p style="margin-bottom: var(--space-2);">NetPulse v1 does not include built-in authentication. For production use, consider:</p>
          <ul style="margin: 0; padding-left: var(--space-4); display: flex; flex-direction: column; gap: 4px;">
            <li>Running behind a reverse proxy (nginx, Apache) with authentication</li>
            <li>Restricting network access with firewall rules</li>
            <li>Using VPN or private network connectivity</li>
          </ul>
        </div>
      </div>

      <div class="settings-section card section-gap stagger-4">
        <div class="card-title">Support & Documentation</div>
        <p style="color: var(--text-muted); font-size: 13.5px;">
          For bug reports, feature requests, or documentation, see the project README.
        </p>
      </div>
    </div>
  `;

  attachEventListeners();
}

function attachEventListeners() {
  document.getElementById('savePollBtn').addEventListener('click', async () => {
    const newInterval = parseInt(document.getElementById('pollIntervalInput').value, 10);

    if (isNaN(newInterval) || newInterval < 5 || newInterval > 3600) {
      alert('Poll interval must be between 5 and 3600 seconds');
      return;
    }

    try {
      await api.updateSettings({ poll_interval_seconds: newInterval });
      alert('Poll interval updated. Changes will apply to the next polling cycle.');
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  });
}

function showError(message) {
  const container = document.getElementById('viewContainer');
  container.innerHTML = `<div class="error-state">Error loading settings: ${message}</div>`;
}
