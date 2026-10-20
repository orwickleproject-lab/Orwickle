import { randomUUID, randomInt } from 'node:crypto';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { loadConfig } from '../src/config.js';
import { createMailer } from '../src/auth/mail.js';
const config = loadConfig();
const mailer = createMailer(config);
const imap = new ImapFlow({
  host: 'imap.gmail.com',
  port: 993,
  secure: true,
  auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD },
  logger: false,
  emitLogs: false,
  connectionTimeout: 15000,
  socketTimeout: 20000,
});
const id = randomUUID(),
  code = String(randomInt(1000000)).padStart(6, '0');
let stage = 'mailbox authentication',
  connected = false;
try {
  await imap.connect();
  connected = true;
  stage = 'SMTP delivery';
  await mailer.send({ email: config.SMTP_USER, code, purpose: 'signup', id });
  stage = 'exact tagged message retrieval';
  let verified = false;
  for (let attempt = 0; attempt < 24; attempt++) {
    const lock = await imap.getMailboxLock('INBOX');
    try {
      const ids = await imap.search({ header: { 'X-Orwickle-Challenge-ID': id } }, { uid: true });
      if (ids.length) {
        const msg = await imap.fetchOne(ids.at(-1), { source: true }, { uid: true });
        const parsed = await simpleParser(msg.source);
        if (parsed.text?.includes(`is ${code}.`)) {
          verified = true;
          break;
        }
      }
    } finally {
      lock.release();
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!verified) throw new Error('No exact delivered message');
  console.log(
    'Real OTP email delivered by encrypted SMTP and retrieved from the project inbox by its exact challenge header. No code displayed. Database-backed flows are a separate check.',
  );
} catch {
  console.error(
    `Email delivery verification did not finish at: ${stage}. No secret or email contents displayed.`,
  );
  process.exitCode = 1;
} finally {
  if (connected) {
    try {
      await imap.logout();
    } catch {
      imap.close();
    }
  }
  mailer.close();
}
