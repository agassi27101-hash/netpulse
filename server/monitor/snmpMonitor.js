const snmp = require('net-snmp');

// Standard MIB-II / IF-MIB object identifiers
const OID = {
  sysDescr: '1.3.6.1.2.1.1.1.0',
  sysUpTime: '1.3.6.1.2.1.1.3.0',
  sysName: '1.3.6.1.2.1.1.5.0',
  ifTable: '1.3.6.1.2.1.2.2'
};

// Column indexes within IF-MIB::ifEntry (1.3.6.1.2.1.2.2.1.<col>)
const IF_COL = {
  DESCR: 2,
  SPEED: 5,
  OPER_STATUS: 8,
  IN_OCTETS: 10,
  OUT_OCTETS: 16
};

function openSession(device, config) {
  const session = snmp.createSession(device.ip_address, device.snmp_community || 'public', {
    port: device.snmp_port || 161,
    retries: 1,
    timeout: config.deviceTimeoutMs,
    version: device.snmp_version === '1' ? snmp.Version1 : snmp.Version2c
  });
  // Without a listener, transport errors would throw an uncaught exception
  // and crash the whole monitoring process.
  session.on('error', () => {});
  return session;
}

function getSystemInfo(device, config) {
  return new Promise((resolve) => {
    let session;
    try {
      session = openSession(device, config);
    } catch (err) {
      return resolve(null);
    }
    session.get([OID.sysDescr, OID.sysUpTime, OID.sysName], (error, varbinds) => {
      session.close();
      if (error) return resolve(null);
      try {
        const [descrVb, uptimeVb, nameVb] = varbinds;
        resolve({
          sysDescr: snmp.isVarbindError(descrVb) ? null : descrVb.value.toString(),
          sysUpTimeTicks: snmp.isVarbindError(uptimeVb) ? null : Number(uptimeVb.value),
          sysName: snmp.isVarbindError(nameVb) ? null : nameVb.value.toString()
        });
      } catch (err) {
        resolve(null);
      }
    });
  });
}

/**
 * Walks the standard IF-MIB interface table and returns one row per
 * interface. Tested against generic IF-MIB output; some vendors expose
 * extra columns via ifXTable (64-bit counters, ifName) which can be
 * layered on top of this for very high-throughput links.
 */
function getInterfaceTable(device, config) {
  return new Promise((resolve) => {
    let session;
    try {
      session = openSession(device, config);
    } catch (err) {
      return resolve([]);
    }
    session.table(OID.ifTable, 20, (error, table) => {
      session.close();
      if (error || !table) return resolve([]);
      const rows = [];
      for (const ifIndexKey of Object.keys(table)) {
        const row = table[ifIndexKey];
        const ifIndex = Number(ifIndexKey);
        const descrRaw = row[IF_COL.DESCR];
        rows.push({
          ifIndex,
          ifDescr: descrRaw != null ? descrRaw.toString() : `if${ifIndex}`,
          ifSpeed: row[IF_COL.SPEED] != null ? Number(row[IF_COL.SPEED]) : null,
          ifOperStatus: row[IF_COL.OPER_STATUS] != null ? Number(row[IF_COL.OPER_STATUS]) : null,
          ifInOctets: row[IF_COL.IN_OCTETS] != null ? Number(row[IF_COL.IN_OCTETS]) : null,
          ifOutOctets: row[IF_COL.OUT_OCTETS] != null ? Number(row[IF_COL.OUT_OCTETS]) : null
        });
      }
      resolve(rows);
    });
  });
}

module.exports = { getSystemInfo, getInterfaceTable };
