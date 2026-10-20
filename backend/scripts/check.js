import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

function check(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) check(path);
    else if (entry.name.endsWith('.js')) execFileSync(process.execPath, ['--check', path]);
  }
}
for (const directory of ['src', 'scripts', 'test']) check(directory);
console.log('JavaScript syntax checks passed');
