import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { writeFileSync } from 'node:fs';
import { loadConfig } from '../src/config.js';
import { createDatabase } from '../src/db.js';
const config = loadConfig(),
  url = new URL(config.DATABASE_URL);
const report = {
  at: new Date().toISOString(),
  hostname: url.hostname,
  execution: process.argv.includes('--tool') ? 'command tool' : 'user terminal',
  dns: {},
  tcp: [],
};
try {
  const addresses = await lookup(url.hostname, { all: true });
  report.dns = {
    resolved: true,
    addressCount: addresses.length,
    families: addresses.map((a) => a.family),
  };
  await Promise.all(
    addresses.flatMap((a, index) =>
      [5432, 6543].map(
        (port) =>
          new Promise((resolve) => {
            const socket = net.connect({ host: a.address, port }, () => {
              report.tcp.push({ addressIndex: index, port, connected: true });
              socket.destroy();
              resolve();
            });
            socket.setTimeout(6000, () => {
              report.tcp.push({ addressIndex: index, port, connected: false, code: 'ETIMEDOUT' });
              socket.destroy();
              resolve();
            });
            socket.on('error', (e) => {
              report.tcp.push({ addressIndex: index, port, connected: false, code: e.code });
              resolve();
            });
          }),
      ),
    ),
  );
} catch (e) {
  report.dns = { resolved: false, code: e.code };
}
const database = createDatabase(config);
try {
  report.query = { ok: true, ...(await database.check()) };
} catch (e) {
  let message = e.message;
  for (const secret of [config.DATABASE_URL, decodeURIComponent(url.password)])
    message = message.split(secret).join('[redacted]');
  report.query = { ok: false, errorClass: e.name, code: e.code || null, message };
} finally {
  await database.close();
}
writeFileSync(
  process.argv.includes('--tool')
    ? '../.local/tool-network-check.json'
    : '../.local/windows-network-check.json',
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
