import nodemailer from 'nodemailer';

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;
const transport = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT || 465),
  secure: process.env.SMTP_SECURE === 'true',
  auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  logger: false,
  debug: false,
  connectionTimeout: 15000,
  socketTimeout: 20000,
});
try {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) throw new Error('Not configured');
  await transport.verify();
  console.log(
    'SMTP authentication and encrypted connection verified. Delivery still requires an OTP flow.',
  );
} catch {
  console.error('SMTP verification failed; check the local sender credential and network.');
  process.exitCode = 1;
} finally {
  transport.close();
}
