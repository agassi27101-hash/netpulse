# NetPulse – Network Monitoring System

A self-hosted, real-time network monitoring dashboard for tracking device uptime, latency, bandwidth, and alerts. Built with Node.js/Express backend and vanilla JavaScript frontend.

## Features

✅ **Device Monitoring**
- Ping-based uptime/status detection (ICMP)
- Optional SNMP v1/v2c system information and interface metrics
- Real-time status updates via WebSocket (Socket.io)
- Device discovery via CIDR range scanning

✅ **Performance Metrics**
- Ping latency histor (24h, 7d, 30d)
- Per-interface bandwidth graphs (inbound/outbound in bps)
- SNMP system uptime and interface status
- 32-bit counter wraparound handling

✅ **Alerts & Notifications**
- Configurable alert rules (device down, high latency, packet loss, interface down)
- Alert severity levels (Info, Warning, Critical)
- Email notifications (via SMTP) and webhook integration
- Alert acknowledgment and resolution tracking

✅ **Network Topology**
- Visual network map using vis-network
- Status-colored device nodes with physics simulation
- Custom link labeling between devices
- Real-time status updates in topology view

✅ **Web Dashboard**
- Dark NOC-style interface with animated pulse indicators
- Sidebar navigation (Overview, Devices, Topology, Alerts, Settings)
- Real-time WebSocket connection indicator
- Responsive Chart.js visualizations

## Tech Stack

**Backend**
- Node.js 16+ (tested with v22.22.2)
- Express.js for REST API
- Socket.io for real-time updates
- better-sqlite3 for local database (WAL mode)
- net-snmp for SNMP v1/v2c queries
- ping for ICMP probes (cross-platform, no raw socket privileges required)

**Frontend**
- Vanilla JavaScript ES6 Modules (no build step needed)
- Chart.js 4.4.4 for time-series charting
- vis-network 9.1.9 for network topology visualization
- Socket.io client for real-time updates
- IBM Plex Sans & Mono fonts from Google Fonts

**Database**
- SQLite3 with WAL (Write-Ahead Logging) mode
- Schema: devices, ping_metrics, interfaces, interface_metrics, alert_rules, alerts, topology_links, settings

## Installation

### Prerequisites
- **Node.js** 16.0.0 or later (npm 7+)
- **ICMP access** for ping (typically available on all OSes, no special privileges needed)
- Optional: **SNMP-enabled devices** in your network for detailed monitoring

### Setup

1. **Clone/Extract the project:**
   ```bash
   cd netpulse
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your settings:
   ```env
   PORT=4000                                    # Web server port
   DB_PATH=./data/netpulse.db                  # SQLite database location
   POLL_INTERVAL_SECONDS=30                    # Device check frequency
   DEVICE_TIMEOUT_MS=3000                      # Ping timeout per device
   FAILS_BEFORE_DOWN=2                         # Consecutive failures to mark down
   
   # Optional: Email alerts via SMTP
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-password
   ALERT_EMAIL_FROM=netpulse@yourdomain.com
   ALERT_EMAIL_TO=ops@yourdomain.com
   
   # Optional: Webhook alerts (POST JSON alerts to external URL)
   ALERT_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK
   ```

4. **Start the server:**
   ```bash
   npm start
   ```
   
   Or with auto-reload during development:
   ```bash
   npm run dev
   ```

5. **Open the dashboard:**
   - Navigate to `http://localhost:4000`
   - Add your first device: **Devices → + Add Device**
   - Start monitoring!

## Usage

### Adding Devices

**Manual Entry:**
1. Go to **Devices** tab
2. Click **+ Add Device**
3. Enter IP address and optional SNMP credentials
4. Save

**Network Scan (Discovery):**
1. Click **🔍 Scan Network**
2. Enter CIDR range (e.g., `192.168.1.0/24`, max `/22` for safety)
3. Review discovered IPs and add to monitoring

### Configuring Alerts

1. Go to **Alerts** tab
2. Click **+ New Rule**
3. Set metric (device status, latency, packet loss, interface status)
4. Define threshold and severity
5. Optionally restrict to specific device
6. Save

Alert rules are evaluated every poll cycle. Active alerts appear in **Overview** and trigger notifications immediately.

### SNMP Setup (Optional)

If your devices support SNMP v1/v2c:
1. Verify SNMP is enabled on the device
2. Note the community string (default: `public`)
3. When adding device in NetPulse, check **Enable SNMP**
4. Enter community string and SNMP port (usually 161)
5. Save

NetPulse will automatically query:
- System description, name, uptime
- Interface table (names, speeds, status, byte counters)

**Supported MIBs:**
- SNMPv2-MIB (sysDescr, sysName, sysUpTime, ifTable)
- Standard IF-MIB object identifiers

### Topology Map

1. Go to **Topology** tab
2. Devices appear as colored nodes (green=up, red=down, yellow=warning)
3. Click a device node to see details in sidebar
4. Drag nodes to arrange; physics simulation stabilizes layout
5. Use **Fit to View** to zoom to all devices

### Settings

- **Poll Interval:** Adjust how often devices are checked (5–3600 seconds)
- Changes apply on the next polling cycle
- Bandwidth and latency metrics are sampled at poll interval frequency

## Architecture

```
netpulse/
├── server/
│   ├── index.js                 # Express + Socket.io server
│   ├── config.js                # Configuration loader (dotenv)
│   ├── db.js                    # SQLite3 init & schema
│   ├── monitor/
│   │   ├── scheduler.js         # Main polling loop & metric collection
│   │   ├── pingMonitor.js       # ICMP ping checks
│   │   ├── snmpMonitor.js       # SNMP queries
│   │   └── discoveryEngine.js   # CIDR scanning & device discovery
│   ├── alerts/
│   │   ├── alertEngine.js       # Alert rule evaluation & state tracking
│   │   └── notifier.js          # Email & webhook delivery
│   └── routes/
│       ├── devices.js           # CRUD for monitored devices
│       ├── dashboard.js         # Overview stats endpoint
│       ├── alerts.js            # Alert & rule management
│       ├── topology.js          # Network topology endpoints
│       ├── discovery.js         # Network scan endpoint
│       └── settings.js          # Configuration endpoints
├── public/
│   ├── index.html               # HTML shell
│   ├── css/
│   │   └── style.css            # Dark NOC design system
│   └── js/
│       ├── main.js              # Router & app bootstrap
│       ├── api.js               # Fetch wrappers for all endpoints
│       ├── format.js            # Display formatters (bytes, uptime, time)
│       ├── charts.js            # Chart.js helpers
│       ├── socket.js            # Socket.io subscription wrapper
│       └── views/
│           ├── overview.js      # Dashboard view
│           ├── devices.js       # Device list & detail view
│           ├── topology.js      # Network visualization
│           ├── alerts.js        # Alert management
│           └── settings.js      # Configuration UI
├── data/
│   └── netpulse.db              # SQLite database (created on first run)
├── package.json
├── .env.example
└── README.md
```

## Database Schema

**devices**
- `id, name, ip_address (UNIQUE), device_type, group_name, snmp_enabled/version/community/port`
- `status (up|down|warning|unknown), last_latency_ms, last_checked_at`
- `consecutive_fails, last_status_change_at, sys_name, sys_descr, sys_uptime_ticks`

**ping_metrics** *(indexed by device_id, ts)*
- Device-level latency history: `device_id, timestamp, alive (0|1), latency_ms`

**interfaces**
- Per-interface SNMP data: `device_id, if_index, if_name, if_speed_bps, if_oper_status`
- `last_in_octets, last_out_octets, last_sample_at`

**interface_metrics** *(indexed by interface_id, ts)*
- Bandwidth over time: `interface_id, timestamp, in_bps, out_bps`

**alert_rules & alerts**
- Condition definitions & triggered instances
- Supports device-scoped or global (all devices) rules

**topology_links**
- Custom device-to-device link labels for map visualization

**settings**
- Key-value store: `poll_interval_seconds`, etc.

## Known Limitations

### SNMP
- **32-bit counters only:** Interface byte counters wrap every ~4.3 seconds on 100 Gbps links. Future version will add IF-MIB 64-bit support (ifHCInOctets, ifHCOutOctets).
- **SNMPv1/v2c only:** No SNMPv3 support in v1.
- **Vendor quirks:** Some devices may return non-standard OID values; test before relying on system info parsing.

### Alerts
- Packet loss calculation requires ≥5 ping samples over the window; rules with fewer samples may be inaccurate.
- No alert de-duplication; multiple rules can trigger simultaneously for the same issue.

### Security
- **No built-in authentication** in v1. Recommended safeguards:
  - Run behind a reverse proxy (nginx, Apache) with authentication
  - Restrict network access with firewall rules
  - Use VPN or private subnets
  - Do **not** expose to untrusted networks

### Performance
- SQLite is suitable for <1000 devices. For larger networks, consider PostgreSQL (requires schema migration).
- Browser may lag with >500 devices in the table view.

## Troubleshooting

### Devices show "unknown" status
- Check network connectivity to device IP
- Verify firewall allows ICMP (ping)
- Try pinging manually: `ping <ip>`

### SNMP data not appearing
- Confirm SNMP is enabled on the device
- Verify community string is correct
- Check SNMP port (default 161)
- Test SNMP access: `snmpwalk -v 2c -c <community> <ip> 1.3.6.1.2.1.1.1.0`

### High CPU/memory usage
- Reduce poll interval (longer = less frequent checks)
- Limit number of devices with SNMP enabled
- Check `data/netpulse.db` size; consider archiving old metrics

### Alerts not sending
- Verify email credentials in `.env` (test with a personal email first)
- Check firewall allows outbound SMTP (usually port 587 or 25)
- Webhook: Ensure URL is publicly accessible and doesn't require authentication

## Extension Ideas

### Future Features (v2+)
- [ ] **SNMPv3 support** for encrypted, authenticated queries
- [ ] **64-bit interface counters** (IF-MIB ifHCInOctets/ifHCOutOctets) for high-speed links
- [ ] **Auto-topology discovery** via LLDP/CDP neighbor queries
- [ ] **Multi-user authentication** (local accounts or LDAP/OAuth)
- [ ] **API key/token auth** for programmatic access
- [ ] **Metrics export** (Prometheus, InfluxDB, Grafana integration)
- [ ] **Custom alert webhooks** with templating (Slack, Teams, Discord)
- [ ] **Device groups & tags** for bulk actions
- [ ] **Mobile app** (React Native)
- [ ] **Configuration backup/restore**
- [ ] **Database migrations** for PostgreSQL, MySQL support
- [ ] **GeoIP-based topology maps**

### Community Contributions Welcome
Feel free to fork and submit PRs for bug fixes, optimizations, or new features.

## License

MIT

## Support

For issues, feature requests, or documentation improvements, please open an issue or PR.

---

**Version:** 1.0.0  
**Last Updated:** June 2026  
**Built with:** Node.js, Express, Chart.js, vis-network, SQLite
