/**
 * Chart.js helper functions for common chart types.
 */

import { parseSqliteDate } from './format.js';

/**
 * Create or update a line chart for ping latency over time.
 * @param {HTMLCanvasElement} canvas - Canvas element to render into
 * @param {Array} metrics - Array of {ts, alive, latency_ms}
 * @param {Chart|null} existingChart - Existing chart instance (will be destroyed and recreated)
 * @returns {Chart} Chart.js Chart instance
 */
export function createLatencyChart(canvas, metrics, existingChart = null) {
  if (existingChart) {
    existingChart.destroy();
  }

  // Filter to only "up" pings and extract data
  const upMetrics = metrics.filter(m => m.alive);
  const labels = upMetrics.map(m => {
    const date = parseSqliteDate(m.ts);
    return date ? date.toLocaleTimeString() : '';
  });
  const data = upMetrics.map(m => m.latency_ms);

  const ctx = canvas.getContext('2d');
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Latency (ms)',
          data,
          borderColor: '#5B8CFF',
          backgroundColor: 'rgba(91, 140, 255, 0.1)',
          borderWidth: 2,
          tension: 0.3,
          fill: true,
          pointRadius: 3,
          pointBackgroundColor: '#5B8CFF'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          labels: { color: '#E6E9ED' }
        }
      },
      scales: {
        y: {
          ticks: { color: '#8B95A5' },
          grid: { color: '#242B36' },
          beginAtZero: true
        },
        x: {
          ticks: { color: '#8B95A5' },
          grid: { color: '#242B36' }
        }
      }
    }
  });
}

/**
 * Create or update a stacked area/line chart for interface bandwidth (in/out).
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {Array} metrics - Array of {ts, in_bps, out_bps}
 * @param {Chart|null} existingChart - Existing chart instance
 * @returns {Chart} Chart.js Chart instance
 */
export function createBandwidthChart(canvas, metrics, existingChart = null) {
  if (existingChart) {
    existingChart.destroy();
  }

  const labels = metrics.map(m => {
    const date = parseSqliteDate(m.ts);
    return date ? date.toLocaleTimeString() : '';
  });

  const inData = metrics.map(m => formatBpsForChart(m.in_bps));
  const outData = metrics.map(m => formatBpsForChart(m.out_bps));

  const ctx = canvas.getContext('2d');
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Inbound',
          data: inData,
          borderColor: '#34D399',
          backgroundColor: 'rgba(52, 211, 153, 0.1)',
          borderWidth: 2,
          tension: 0.3,
          fill: true,
          pointRadius: 2
        },
        {
          label: 'Outbound',
          data: outData,
          borderColor: '#B98CFF',
          backgroundColor: 'rgba(185, 140, 255, 0.1)',
          borderWidth: 2,
          tension: 0.3,
          fill: true,
          pointRadius: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          labels: { color: '#E6E9ED' }
        }
      },
      scales: {
        y: {
          ticks: { color: '#8B95A5' },
          grid: { color: '#242B36' },
          beginAtZero: true
        },
        x: {
          ticks: { color: '#8B95A5' },
          grid: { color: '#242B36' }
        }
      }
    }
  });
}

/**
 * Helper: Convert bps to simplified numeric value for charting.
 * (In a production app, you'd show this with axis labels, but for simplicity we store Mbps/Kbps)
 */
function formatBpsForChart(bps) {
  if (!bps || bps === 0) return 0;
  return bps / 1_000_000; // Convert to Mbps
}
