import { loadConfig } from '../src/config.js';
import { createDatabase } from '../src/db.js';
import { hashPassword } from '../src/auth/service.js';
import { z } from 'zod';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const database = createDatabase(loadConfig());
try {
  const data = z
    .object({
      email: z.email().transform((v) => v.toLowerCase()),
      fullName: z.string().trim().min(2).max(100),
      password: z.string().min(12).max(128),
    })
    .strict()
    .parse(JSON.parse(input));
  const existing = (
    await database.query('SELECT role FROM orwickle_auth.accounts WHERE email=$1', [data.email])
  ).rows[0];
  if (existing) {
    if (existing.role !== 'administrator') throw new Error('Existing public account');
    console.log(
      'Administrator already exists; preserved. Use email recovery to change its password.',
    );
  } else {
    await database.query(
      "INSERT INTO orwickle_auth.accounts(full_name,email,password_hash,role,email_verified_at) VALUES($1,$2,$3,'administrator',now())",
      [data.fullName, data.email, await hashPassword(data.password)],
    );
    console.log(
      'Administrator provisioned separately. Fresh sign-in still requires password and email OTP.',
    );
  }
} catch {
  console.error(
    'Administrator provisioning failed. Check owner access, fields, and whether this email belongs to a public account.',
  );
  process.exitCode = 1;
} finally {
  input = '';
  await database.close();
}
