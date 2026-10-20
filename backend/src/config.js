import { z } from 'zod';

const optionalText = z.preprocess(
  (value) => value === '' ? undefined : value,
  z.string().optional(),
);

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.enum(['127.0.0.1', '0.0.0.0', '::1']).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: optionalText.refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return ['postgres:', 'postgresql:'].includes(url.protocol)
        && Boolean(url.hostname && url.username && url.password)
        && url.pathname.length > 1 && !url.search && !url.hash;
    } catch {
      return false;
    }
  }),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(10).default(5),
  DATABASE_SSL_CA_FILE: optionalText,
  SESSION_SECRET: optionalText.refine((v) => !v || v.length >= 64),
  OTP_PEPPER: optionalText.refine((v) => !v || v.length >= 64),
  ADMIN_ORIGIN: z.url().default('http://localhost:5173'),
  SMTP_HOST: optionalText,
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(465),
  SMTP_SECURE: z.enum(['true', 'false']).default('true'),
  SMTP_USER: optionalText,
  SMTP_PASSWORD: optionalText,
  MAIL_FROM: optionalText,
}).superRefine((value, context) => {
  if (value.NODE_ENV === 'production' && !value.DATABASE_URL) {
    context.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'Required' });
  }
  if (value.NODE_ENV === 'production') {
    for (const field of ['SESSION_SECRET','OTP_PEPPER','SMTP_HOST','SMTP_USER','SMTP_PASSWORD','MAIL_FROM']) {
      if (!value[field]) context.addIssue({ code: 'custom', path: [field], message: 'Required' });
    }
    if (!value.ADMIN_ORIGIN.startsWith('https://')) context.addIssue({ code:'custom',path:['ADMIN_ORIGIN'],message:'HTTPS required' });
  }
});

export function loadConfig(environment = process.env) {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))];
    // Never include environment values or a database URL in errors.
    throw new Error(`Invalid environment configuration: ${fields.join(', ')}`);
  }
  return parsed.data;
}
