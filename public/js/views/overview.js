/**
 * Overview dashboard view.
 */

import { getDashboardOverview, getAlerts } from '../api.js';
import { formatRelativeTime, getStatusClass, getSeverityClass, formatBps } from '../format.js';
import { subscribe } from '../socket.js';

let overviewData = null;
let alertsData = [];
let unsubscribeDevice = null;
let unsubscribeAlert = null;
let unsubscribeOverview = null;

export async function load() {
  try {
    overviewData = await getDashboardOverview();
    alertsData = await getAlerts('active');
    renderOverview();
    setupSubscriptions();
  } catch (err) {
    console.error('[overview] load error:', err);
    showError(err.message);
  }
}

export function unload() {
  if (unsubscribeDevice) unsubscribeDevice();
  if (unsubscribeAlert) unsubscribeAlert();
  if (unsubscribeOverview) unsubscribeOverview();
}

function setupSubscriptions() {
  // Prevent duplicate event listeners
  if (unsubscribeDevice) unsubscribeDevice();
  if (unsubscribeAlert) unsubscribeAlert();
  if (unsubscribeOverview) unsubscribeOverview();

  unsubscribeDevice = subscribe('device:update', (data) => {
    refreshOverviewData();
  });

  unsubscribeAlert = subscribe('alerts:new', (data) => {
    alertsData.unshift(data);
    if (alertsData.length > 10) alertsData.pop();
    renderAlertsFeed();
  });

  unsubscribeOverview = subscribe('overview:refresh', (data) => {
    refreshOverviewData();
  });
}

async function refreshOverviewData() {
  try {
    overviewData = await getDashboardOverview();
    if (!overviewData) return;

    const bandwidth = overviewData.bandwidth ?? 84.0;
    const currentBps = overviewData.currentBps ?? 850000000;
    const capacityBps = overviewData.capacityBps ?? 1000000000;
    const currentFormatted = formatBps(currentBps);
    const capacityFormatted = formatBps(capacityBps);
    const bandwidthSubText = `${currentFormatted} / ${capacityFormatted}`;

    const latency = overviewData.latency ?? 6.0;
    const uptime = overviewData.uptime ?? 99.90;
    const packetLoss = overviewData.packetLoss ?? 0.02;
    const activeDevices = (overviewData.up ?? 0) + (overviewData.warning ?? 0);
    const alerts = overviewData.activeAlerts ?? 3;

    // Update Bandwidth Card
    updateCardData({
      title: 'Bandwidth',
      value: bandwidth,
      decimals: 1,
      isPercent: true,
      subValue: bandwidthSubText,
      progress: bandwidth,
      status: bandwidth > 90 ? 'warning' : 'healthy'
    });

    // Update Latency Card
    const latencyStatus = latency < 20 ? 'healthy' : latency < 50 ? 'warning' : 'critical';
    updateCardData({
      title: 'Latency',
      value: latency,
      decimals: 0,
      suffix: 'ms',
      subValue: 'Avg response time',
      status: latencyStatus
    });

    // Update Uptime Card
    updateCardData({
      title: 'Uptime',
      value: uptime,
      decimals: 2,
      isPercent: true,
      subValue: 'Last 30 days',
      status: 'healthy'
    });

    // Update Packet Loss Card
    const packetLossStatus = packetLoss < 1.0 ? 'healthy' : packetLoss < 5.0 ? 'warning' : 'critical';
    updateCardData({
      title: 'Packet Loss',
      value: packetLoss,
      decimals: 2,
      isPercent: true,
      subValue: 'Below threshold',
      status: packetLossStatus
    });

    // Update Active Devices Card
    updateCardData({
      title: 'Active Devices',
      value: activeDevices,
      decimals: 0,
      subValue: 'Connected now',
      status: 'healthy'
    });

    // Update Active Alerts Card
    const alertStatus = alerts > 5 ? 'critical' : alerts > 0 ? 'warning' : 'healthy';
    updateCardData({
      title: 'Active Alerts',
      value: alerts,
      decimals: 0,
      subValue: 'Require attention',
      status: alertStatus
    });

    // Update Device Status Summary table values
    const upPercent = overviewData.total ? Math.round((overviewData.up / overviewData.total) * 100) : 0;
    updateSummaryValue('total', overviewData.total ?? 0, false);
    updateSummaryValue('up-percent', upPercent, true);
    updateSummaryValue('maintenance', overviewData.maintenance ?? 0, false);
    updateSummaryValue('unreachable', overviewData.unreachable ?? 0, false);

  } catch (err) {
    console.error('[overview] live refresh failed:', err);
  }
}

function renderOverview() {
  const container = document.getElementById('viewContainer');
  
  const bandwidth = overviewData?.bandwidth ?? 84.0;
  const currentBps = overviewData?.currentBps ?? 850000000;
  const capacityBps = overviewData?.capacityBps ?? 1000000000;
  const currentFormatted = formatBps(currentBps);
  const capacityFormatted = formatBps(capacityBps);
  const bandwidthSubText = `${currentFormatted} / ${capacityFormatted}`;

  const latency = overviewData?.latency ?? 6.0;
  const uptime = overviewData?.uptime ?? 99.90;
  const packetLoss = overviewData?.packetLoss ?? 0.02;
  const activeDevices = (overviewData?.up ?? 0) + (overviewData?.warning ?? 0) || 222;
  const alerts = overviewData?.activeAlerts ?? 3;

  const latencyStatus = latency < 20 ? 'healthy' : latency < 50 ? 'warning' : 'critical';
  const packetLossStatus = packetLoss < 1.0 ? 'healthy' : packetLoss < 5.0 ? 'warning' : 'critical';
  const alertStatus = alerts > 5 ? 'critical' : alerts > 0 ? 'warning' : 'healthy';

  const upPercent = overviewData?.total ? Math.round((overviewData.up / overviewData.total) * 100) : 0;

  container.innerHTML = `
    <div class="overview-page">
      <div class="stat-grid">
        ${renderMetricCard({
          title: 'Bandwidth',
          value: bandwidth,
          decimals: 1,
          isPercent: true,
          subValue: bandwidthSubText,
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
          iconGlow: 'rgba(59,130,246,0.35)',
          iconColor: '#3b82f6',
          trend: 2.5,
          status: bandwidth > 90 ? 'warning' : 'healthy',
          progress: bandwidth,
          staggerIndex: 1,
          link: '#/metrics'
        })}
        ${renderMetricCard({
          title: 'Latency',
          value: latency,
          decimals: 0,
          suffix: 'ms',
          subValue: 'Avg response time',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
          iconGlow: 'rgba(245,158,11,0.35)',
          iconColor: '#f59e0b',
          trend: -1.2,
          status: latencyStatus,
          staggerIndex: 2,
          link: '#/metrics'
        })}
        ${renderMetricCard({
          title: 'Uptime',
          value: uptime,
          decimals: 2,
          isPercent: true,
          subValue: 'Last 30 days',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
          iconGlow: 'rgba(16,185,129,0.35)',
          iconColor: '#10b981',
          status: 'healthy',
          staggerIndex: 3,
          link: '#/metrics'
        })}
        ${renderMetricCard({
          title: 'Packet Loss',
          value: packetLoss,
          decimals: 2,
          isPercent: true,
          subValue: 'Below threshold',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
          iconGlow: 'rgba(34,211,238,0.35)',
          iconColor: '#22d3ee',
          trend: 0.05,
          status: packetLossStatus,
          staggerIndex: 4,
          link: '#/metrics'
        })}
        ${renderMetricCard({
          title: 'Active Devices',
          value: activeDevices,
          decimals: 0,
          subValue: 'Connected now',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>',
          iconGlow: 'rgba(139,92,246,0.35)',
          iconColor: '#a78bfa',
          trend: 5.2,
          status: 'healthy',
          staggerIndex: 5,
          link: '#/devices'
        })}
        ${renderMetricCard({
          title: 'Active Alerts',
          value: alerts,
          decimals: 0,
          subValue: 'Require attention',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
          iconGlow: 'rgba(239,68,68,0.35)',
          iconColor: '#ef4444',
          status: alertStatus,
          staggerIndex: 6,
          link: '#/alerts'
        })}
      </div>

      <div class="grid-2 stagger-7" style="margin-top: var(--space-5);">
        <!-- Recent Active Alerts -->
        <div class="card">
          <div class="card-title">Recent Active Alerts</div>
          <div class="alerts-feed" id="alertsFeed">
            ${alertsData.length === 0 ? '<p class="empty-state">No active alerts</p>' : ''}
          </div>
        </div>

        <!-- Device Status Summary -->
        <div class="card">
          <div class="card-title">Device Status Summary</div>
          <div class="info-grid">
            <a href="#/devices" class="info-row-link">
              <div class="info-row">
                <span class="label">Total Devices</span>
                <span class="value" data-summary-label="total" data-count-target="${overviewData?.total || 0}" style="font-size: 20px; font-weight: 600; color: var(--text);">0</span>
              </div>
            </a>
            <a href="#/devices" class="info-row-link">
              <div class="info-row">
                <span class="label">Up Percentage</span>
                <span class="value" data-summary-label="up-percent" data-count-target="${upPercent}" data-is-percent="true" style="font-size: 20px; font-weight: 600; color: var(--up);">0%</span>
              </div>
            </a>
            <a href="#/devices" class="info-row-link">
              <div class="info-row">
                <span class="label">In Maintenance</span>
                <span class="value" data-summary-label="maintenance" data-count-target="${overviewData?.maintenance || 0}" style="font-size: 20px; font-weight: 600; color: var(--maintenance);">0</span>
              </div>
            </a>
            <a href="#/devices" class="info-row-link">
              <div class="info-row">
                <span class="label">Unreachable</span>
                <span class="value" data-summary-label="unreachable" data-count-target="${overviewData?.unreachable || 0}" style="font-size: 20px; font-weight: 600; color: var(--unreachable);">0</span>
              </div>
            </a>
          </div>
        </div>
      </div>
    </div>
  `;

  renderAlertsFeed();
  setTimeout(animateInitialCountUp, 50);
  setTimeout(animateProgressBars, 50);
}

function renderMetricCard({ title, value, decimals, isPercent, suffix, subValue, icon, iconGlow, iconColor, trend, status, progress, staggerIndex, link = '#' }) {
  const trendHtml = trend !== undefined 
    ? `<div class="trend-badge ${trend >= 0 ? 'up' : 'down'}">
         ${trend >= 0 ? '&uarr;' : '&darr;'} ${Math.abs(trend)}%
       </div>`
    : '';

  const progressHtml = progress !== undefined
    ? `<div class="card-progress-container">
         <div class="card-progress-bar" style="width: 0%;" data-progress-target="${progress}"></div>
       </div>`
    : '';

  return `
    <a href="${link}" class="card-link">
      <div class="card status-${status} stagger-${staggerIndex}" data-card-title="${title}" style="display: flex; flex-direction: column; gap: var(--space-2); min-height: 180px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
          <div class="card-icon-wrap" style="--icon-color: ${iconColor}; --icon-glow: ${iconGlow};">
            ${icon}
          </div>
          ${trendHtml}
        </div>
        
        <div style="margin-top: auto; margin-bottom: auto;">
          <p class="card-label-title" style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.1em; margin-bottom: 6px;">${title}</p>
          <p class="card-metric-value" data-count-target="${value}" data-decimals="${decimals}" data-is-percent="${isPercent}" data-suffix="${suffix || ''}" style="font-size: 28px; font-weight: 700; color: #ffffff; line-height: 1; font-family: var(--font-display);">0</p>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; font-size: 12px; margin-top: 4px;">
          <span class="card-sub-value" style="color: var(--text-faint);">${subValue}</span>
          <div class="card-status-badge ${status}">
            <span class="card-status-dot active-pulse"></span>
            ${status}
          </div>
        </div>
        ${progressHtml}
      </div>
    </a>
  `;
}

function updateCardData({ title, value, decimals, isPercent, suffix, subValue, progress, status }) {
  const card = document.querySelector(`[data-card-title="${title}"]`);
  if (!card) return;

  // Update card status-specific border & shadow colors
  card.className = card.className.replace(/\bstatus-\w+\b/g, `status-${status}`);

  // Animate dynamic count shift
  const valEl = card.querySelector('.card-metric-value');
  if (valEl) {
    const prevTarget = parseFloat(valEl.getAttribute('data-count-target')) || 0;
    valEl.setAttribute('data-count-target', value);
    animateValueUpdate(valEl, prevTarget, value, decimals, isPercent, suffix);
  }

  // Update detail subtext
  const subEl = card.querySelector('.card-sub-value');
  if (subEl) subEl.textContent = subValue;

  // Update status badge
  const badgeEl = card.querySelector('.card-status-badge');
  if (badgeEl) {
    badgeEl.className = `card-status-badge ${status}`;
    badgeEl.innerHTML = `<span class="card-status-dot active-pulse"></span>${status}`;
  }

  // Slide progress bar
  const progressEl = card.querySelector('.card-progress-bar');
  if (progressEl && progress !== undefined) {
    progressEl.setAttribute('data-progress-target', progress);
    progressEl.style.width = `${progress}%`;
  }
}

function updateSummaryValue(label, value, isPercent) {
  const el = document.querySelector(`[data-summary-label="${label}"]`);
  if (!el) return;
  const prev = parseFloat(el.getAttribute('data-count-target')) || 0;
  el.setAttribute('data-count-target', value);
  animateValueUpdate(el, prev, value, 0, isPercent, '');
}

function animateInitialCountUp() {
  const elements = document.querySelectorAll('[data-count-target]');
  elements.forEach(el => {
    const target = parseFloat(el.getAttribute('data-count-target'));
    const isPercent = el.getAttribute('data-is-percent') === 'true';
    const decimals = parseInt(el.getAttribute('data-decimals') || '0', 10);
    const suffix = el.getAttribute('data-suffix') || '';
    if (isNaN(target)) return;
    animateValueUpdate(el, 0, target, decimals, isPercent, suffix);
  });
}

function animateValueUpdate(el, start, end, decimals, isPercent, suffix) {
  if (start === end) return;
  const duration = 800; // 800ms transition time
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Ease out quadratic
    const easeProgress = progress * (2 - progress);
    const currentVal = start + (end - start) * easeProgress;
    
    let formatted = currentVal.toFixed(decimals);
    if (isPercent) formatted += '%';
    if (suffix) formatted += suffix;
    el.textContent = formatted;

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }
  requestAnimationFrame(update);
}

function animateProgressBars() {
  const bars = document.querySelectorAll('[data-progress-target]');
  bars.forEach(bar => {
    const target = parseFloat(bar.getAttribute('data-progress-target'));
    if (!isNaN(target)) {
      setTimeout(() => {
        bar.style.width = `${target}%`;
      }, 100);
    }
  });
}

function renderAlertsFeed() {
  const feedContainer = document.getElementById('alertsFeed');
  if (!feedContainer) return;

  if (alertsData.length === 0) {
    feedContainer.innerHTML = '<p class="empty-state">No active alerts</p>';
    return;
  }

  feedContainer.innerHTML = alertsData.map(alert => `
    <div class="alert-row">
      <span class="chip severity-${alert.severity}">${alert.severity}</span>
      <div class="alert-row-body">
        <div class="alert-row-message">${alert.message}</div>
        <div class="alert-row-meta">
          <span class="mono">${alert.device_name || `Device #${alert.device_id}`}</span>
          <span>&bull;</span>
          <span>${formatRelativeTime(alert.triggered_at)}</span>
        </div>
      </div>
    </div>
  `).join('');
}

function showError(message) {
  const container = document.getElementById('viewContainer');
  container.innerHTML = `<div class="error-state">Error loading overview: ${message}</div>`;
}
