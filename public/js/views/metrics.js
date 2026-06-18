/**
 * Metrics dashboard view drawing Chart.js charts.
 */

import { getDashboardCharts } from '../api.js';
import { subscribe } from '../socket.js';

let chartInstances = {};
let unsubscribeOverview = null;

export async function load() {
  try {
    const data = await getDashboardCharts();
    renderPage();
    renderCharts(data);
    setupSubscriptions();
  } catch (err) {
    console.error('[metrics] load error:', err);
    showError(err.message);
  }
}

export function unload() {
  if (unsubscribeOverview) unsubscribeOverview();
  destroyCharts();
}

function setupSubscriptions() {
  // Refresh charts on new monitoring tick
  unsubscribeOverview = subscribe('overview:refresh', async () => {
    try {
      const data = await getDashboardCharts();
      updateCharts(data);
    } catch (err) {
      console.error('[metrics] live refresh failed:', err);
    }
  });
}

function renderPage() {
  const container = document.getElementById('viewContainer');
  container.innerHTML = `
    <div class="metrics-page">
      <div class="grid-2 stagger-1">
        <!-- Bandwidth Usage Card -->
        <div class="card" style="min-height: 330px; display: flex; flex-direction: column;">
          <div style="padding: var(--space-4) var(--space-4) 0 var(--space-4);">
            <div class="card-title" style="margin-bottom: 2px; font-size: 13.5px; font-weight: 700; letter-spacing: 0.1em; color: #ffffff;">BANDWIDTH USAGE</div>
            <div style="font-size: 12px; color: var(--text-faint); font-weight: 500;">% utilization over time</div>
          </div>
          <div class="chart-wrap-container" style="flex-grow: 1; padding: var(--space-4); min-height: 220px; position: relative;">
            <canvas id="bandwidthUsageCanvas"></canvas>
          </div>
        </div>
        
        <!-- Latency Card -->
        <div class="card" style="min-height: 330px; display: flex; flex-direction: column;">
          <div style="padding: var(--space-4) var(--space-4) 0 var(--space-4);">
            <div class="card-title" style="margin-bottom: 2px; font-size: 13.5px; font-weight: 700; letter-spacing: 0.1em; color: #ffffff;">LATENCY</div>
            <div style="font-size: 12px; color: var(--text-faint); font-weight: 500;">milliseconds &bull; real-time</div>
          </div>
          <div class="chart-wrap-container" style="flex-grow: 1; padding: var(--space-4); min-height: 220px; position: relative;">
            <canvas id="latencyCanvas"></canvas>
          </div>
        </div>
      </div>
      
      <div class="grid-2 stagger-2" style="margin-top: var(--space-5);">
        <!-- Traffic Distribution Card -->
        <div class="card" style="min-height: 330px; display: flex; flex-direction: column;">
          <div style="padding: var(--space-4) var(--space-4) 0 var(--space-4);">
            <div class="card-title" style="margin-bottom: 2px; font-size: 13.5px; font-weight: 700; letter-spacing: 0.1em; color: #ffffff;">TRAFFIC DISTRIBUTION</div>
            <div style="font-size: 12px; color: var(--text-faint); font-weight: 500;">upload vs download &bull; Mbps</div>
          </div>
          <div class="chart-wrap-container" style="flex-grow: 1; padding: var(--space-4); min-height: 220px; position: relative;">
            <canvas id="trafficDistributionCanvas"></canvas>
          </div>
        </div>
        
        <!-- Protocol Distribution Card -->
        <div class="card" style="min-height: 330px; display: flex; flex-direction: column;">
          <div style="padding: var(--space-4) var(--space-4) 0 var(--space-4);">
            <div class="card-title" style="margin-bottom: 2px; font-size: 13.5px; font-weight: 700; letter-spacing: 0.1em; color: #ffffff;">PROTOCOL DISTRIBUTION</div>
            <div style="font-size: 12px; color: var(--text-faint); font-weight: 500;">packets by protocol type</div>
          </div>
          <div class="chart-wrap-container" style="flex-grow: 1; padding: var(--space-4); min-height: 220px; position: relative;">
            <canvas id="protocolDistributionCanvas"></canvas>
          </div>
        </div>
      </div>
    </div>
  `;
}

function destroyCharts() {
  Object.keys(chartInstances).forEach(key => {
    if (chartInstances[key]) {
      chartInstances[key].destroy();
      chartInstances[key] = null;
    }
  });
  chartInstances = {};
}

// Chart.js helper defaults for dark NOC mockup styling
const getChartConfig = (type, labels, datasets, maxVal = null) => {
  return {
    type,
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: datasets.length > 1, // only show legend if multi-dataset
          position: 'top',
          labels: {
            boxWidth: 8,
            boxHeight: 8,
            usePointStyle: true,
            color: '#9ca3af',
            font: { family: 'IBM Plex Sans', size: 11 }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          titleColor: '#f3f4f6',
          bodyColor: '#e5e7eb',
          borderColor: 'rgba(255, 255, 255, 0.08)',
          borderWidth: 1,
          borderRadius: 8,
          titleFont: { family: 'IBM Plex Sans', size: 12, weight: '600' },
          bodyFont: { family: 'IBM Plex Sans', size: 12 },
          padding: 10,
          displayColors: true,
          boxWidth: 6,
          boxHeight: 6,
          boxPadding: 4
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.02)',
            drawTicks: false
          },
          ticks: {
            color: '#6b7280',
            font: { family: 'IBM Plex Mono', size: 10 },
            maxTicksLimit: 6
          }
        },
        y: {
          grid: {
            color: 'rgba(255, 255, 255, 0.04)',
            drawTicks: false,
            borderDash: [5, 5]
          },
          ticks: {
            color: '#6b7280',
            font: { family: 'IBM Plex Mono', size: 10 },
            stepSize: maxVal === 100 ? 25 : undefined
          },
          beginAtZero: true,
          max: maxVal
        }
      }
    }
  };
};

function renderCharts(data) {
  destroyCharts();
  if (!data || !data.chartData) return;

  const labels = data.chartData.map(d => d.label);

  // 1. Bandwidth Usage Chart
  const bwCtx = document.getElementById('bandwidthUsageCanvas').getContext('2d');
  const bwGradient = bwCtx.createLinearGradient(0, 0, 0, 200);
  bwGradient.addColorStop(0, 'rgba(59, 130, 246, 0.2)');
  bwGradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');
  chartInstances.bandwidth = new Chart(
    bwCtx,
    getChartConfig('line', labels, [{
      label: 'bandwidth',
      data: data.chartData.map(d => d.bandwidth),
      borderColor: '#3b82f6',
      backgroundColor: bwGradient,
      borderWidth: 2,
      tension: 0.45,
      fill: true,
      pointRadius: 0,
      pointHoverRadius: 4,
      pointHoverBackgroundColor: '#3b82f6',
      pointHoverBorderColor: '#ffffff',
      pointHoverBorderWidth: 1.5
    }], 100)
  );

  // 2. Latency Chart
  const latCtx = document.getElementById('latencyCanvas').getContext('2d');
  const latGradient = latCtx.createLinearGradient(0, 0, 0, 200);
  latGradient.addColorStop(0, 'rgba(245, 158, 11, 0.2)');
  latGradient.addColorStop(1, 'rgba(245, 158, 11, 0.0)');
  chartInstances.latency = new Chart(
    latCtx,
    getChartConfig('line', labels, [{
      label: 'latency (ms)',
      data: data.chartData.map(d => d.latency),
      borderColor: '#f59e0b',
      backgroundColor: latGradient,
      borderWidth: 2,
      tension: 0.45,
      fill: true,
      pointRadius: 0,
      pointHoverRadius: 4,
      pointHoverBackgroundColor: '#f59e0b',
      pointHoverBorderColor: '#ffffff',
      pointHoverBorderWidth: 1.5
    }], 24)
  );

  // 3. Traffic Distribution Chart
  const trafficCtx = document.getElementById('trafficDistributionCanvas').getContext('2d');
  const downGradient = trafficCtx.createLinearGradient(0, 0, 0, 200);
  downGradient.addColorStop(0, 'rgba(167, 139, 250, 0.15)');
  downGradient.addColorStop(1, 'rgba(167, 139, 250, 0.0)');
  const upGradient = trafficCtx.createLinearGradient(0, 0, 0, 200);
  upGradient.addColorStop(0, 'rgba(16, 185, 129, 0.12)');
  upGradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');
  
  chartInstances.traffic = new Chart(
    trafficCtx,
    getChartConfig('line', labels, [
      {
        label: 'download (Mbps)',
        data: data.chartData.map(d => d.download),
        borderColor: '#a78bfa',
        backgroundColor: downGradient,
        borderWidth: 2,
        tension: 0.45,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 3
      },
      {
        label: 'upload (Mbps)',
        data: data.chartData.map(d => d.upload),
        borderColor: '#10b981',
        backgroundColor: upGradient,
        borderWidth: 2,
        tension: 0.45,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 3
      }
    ], 100)
  );

  // 4. Protocol Distribution Chart
  const protoCtx = document.getElementById('protocolDistributionCanvas').getContext('2d');
  const protoKeys = Object.keys(data.protocolData);
  const protoVals = Object.values(data.protocolData);
  chartInstances.protocol = new Chart(
    protoCtx,
    {
      type: 'bar',
      data: {
        labels: protoKeys,
        datasets: [{
          data: protoVals,
          backgroundColor: ['#3b82f6', '#a78bfa', '#f59e0b', '#6b7280'],
          borderRadius: 4,
          maxBarThickness: 40
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(17, 24, 39, 0.95)',
            titleColor: '#f3f4f6',
            bodyColor: '#e5e7eb',
            borderColor: 'rgba(255, 255, 255, 0.08)',
            borderWidth: 1,
            borderRadius: 8,
            padding: 10
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: '#6b7280',
              font: { family: 'IBM Plex Mono', size: 10 }
            }
          },
          y: {
            grid: {
              color: 'rgba(255, 255, 255, 0.04)',
              drawTicks: false,
              borderDash: [5, 5]
            },
            ticks: {
              color: '#6b7280',
              font: { family: 'IBM Plex Mono', size: 10 }
            },
            beginAtZero: true,
            max: 6000
          }
        }
      }
    }
  );
}

function updateCharts(data) {
  if (!data || !data.chartData) return;

  const labels = data.chartData.map(d => d.label);

  if (chartInstances.bandwidth) {
    chartInstances.bandwidth.data.labels = labels;
    chartInstances.bandwidth.data.datasets[0].data = data.chartData.map(d => d.bandwidth);
    chartInstances.bandwidth.update();
  }

  if (chartInstances.latency) {
    chartInstances.latency.data.labels = labels;
    chartInstances.latency.data.datasets[0].data = data.chartData.map(d => d.latency);
    chartInstances.latency.update();
  }

  if (chartInstances.traffic) {
    chartInstances.traffic.data.labels = labels;
    chartInstances.traffic.data.datasets[0].data = data.chartData.map(d => d.download);
    chartInstances.traffic.data.datasets[1].data = data.chartData.map(d => d.upload);
    chartInstances.traffic.update();
  }

  if (chartInstances.protocol) {
    chartInstances.protocol.data.datasets[0].data = Object.values(data.protocolData);
    chartInstances.protocol.update();
  }
}

function showError(message) {
  const container = document.getElementById('viewContainer');
  container.innerHTML = `<div class="error-state">Error loading metrics: ${message}</div>`;
}
