import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
try {
  const values = [process.env.SUPABASE_ACCESS_TOKEN];
  for (const file of ['backend/.env', 'backend/.env.migrations'])
    if (existsSync(root + file)) {
      const env = parseEnv(readFileSync(root + file, 'utf8'));
      for (const [key, value] of Object.entries(env)) {
        if (/PASSWORD|SECRET|PEPPER|TOKEN/.test(key)) values.push(value);
        if (key === 'DATABASE_URL' && value) {
          values.push(value, decodeURIComponent(new URL(value).password));
        }
      }
    }
  const needles = values.filter((v) => v && v.length >= 12).map((v) => Buffer.from(v));
  const inspect = (data, label) => {
    if (needles.some((n) => data.includes(n))) throw new Error(`Credential found in ${label}`);
  };
  const files = [
    ...new Set(
      execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
        cwd: root,
      })
        .toString()
        .split('\0')
        .filter(Boolean),
    ),
  ];
  for (const file of files) inspect(readFileSync(root + file), file);
  const ids = execFileSync('git', ['rev-list', '--objects', '--all'], { cwd: root })
    .toString()
    .trim()
    .split('\n')
    .map((line) => line.split(' ')[0]);
  inspect(
    execFileSync('git', ['cat-file', '--batch'], {
      cwd: root,
      input: ids.join('\n') + '\n',
      maxBuffer: 64 * 1024 * 1024,
    }),
    'Git history',
  );
  let logs = 0;
  for (const entry of readdirSync(root + '.local', { withFileTypes: true }))
    if (entry.isFile() && /\.(log|txt)$/.test(entry.name)) {
      inspect(readFileSync(root + '.local/' + entry.name), entry.name);
      logs++;
    }
  console.log(
    JSON.stringify({
      sourceFilesChecked: files.length,
      gitObjectsChecked: ids.length,
      localLogsChecked: logs,
      credentialsFound: false,
    }),
  );
} catch (e) {
  console.error(
    e.message.startsWith('Credential found in ') ? e.message : 'Secret audit could not complete',
  );
  process.exitCode = 1;
}
