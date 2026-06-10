// Quality gate: validate the extension manifest and syntax-check all JS.
// No dependencies — runs with bare node. Used locally and in CI.

import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const errors = [];

let manifest;
try {
  manifest = JSON.parse(readFileSync('extension/manifest.json', 'utf8'));
} catch (e) {
  errors.push(`manifest.json: ${e.message}`);
}

if (manifest) {
  if (manifest.manifest_version !== 3) {
    errors.push('manifest_version must be 3');
  }
  for (const field of ['name', 'version', 'description']) {
    if (!manifest[field]) errors.push(`manifest is missing "${field}"`);
  }
  // The Chrome Web Store rejects uploads over these limits — fail here instead.
  if (manifest.name?.length > 75) {
    errors.push(`name is ${manifest.name.length} chars — store caps at 75`);
  }
  if (manifest.description?.length > 132) {
    errors.push(`description is ${manifest.description.length} chars — store caps at 132`);
  }
  if (manifest.version && !/^\d+(\.\d+){0,3}$/.test(manifest.version)) {
    errors.push(`version "${manifest.version}" must be 1-4 dot-separated integers`);
  }
}

for (const file of readdirSync('extension').filter((f) => f.endsWith('.js'))) {
  try {
    execFileSync(process.execPath, ['--check', `extension/${file}`], { stdio: 'pipe' });
  } catch (e) {
    errors.push(`${file}: ${e.stderr?.toString().trim() || e.message}`);
  }
}

if (errors.length) {
  console.error('FAIL:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log('All checks passed.');
