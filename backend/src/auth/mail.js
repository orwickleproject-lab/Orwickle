import nodemailer from 'nodemailer';
import { HttpError } from '../middleware/errors.js';

export function createMailer(config) {
  const configured = Boolean(
    config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASSWORD && config.MAIL_FROM,
  );
  const transport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE === 'true',
    requireTLS: true,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD },
    logger: false,
    debug: false,
    connectionTimeout: 15000,
    socketTimeout: 20000,
  });
  return {
    configured,
    async send({ email, code, purpose, id }) {
      if (!configured)
        throw new HttpError(
          503,
          'EMAIL_UNAVAILABLE',
          'Email delivery needs local sender configuration.',
        );
      const action = {
        signup: 'verify your email',
        login: 'sign in',
        recovery: 'reset your password',
      }[purpose];
      try {
        await transport.sendMail({
          from: { name: 'Orwickle', address: config.MAIL_FROM },
          to: email,
          subject: `Orwickle · ${action}`,
          headers: { 'X-Orwickle-Challenge-ID': id },
          text: `Your Orwickle code to ${action} is ${code}.\n\nIt expires in 10 minutes and works once, only for this request. Never share it. If you did not request this, ignore this email.\n\nOrwickle`,
        });
      } catch {
        throw new HttpError(
          503,
          'EMAIL_UNAVAILABLE',
          'Email could not be delivered. Please try again later.',
        );
      }
    },
    close() {
      transport.close();
    },
  };
}
