#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectPublicContent, inspectPublicPath } from './public-tree-policy.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
  cwd: root,
  encoding: 'utf8',
});
const paths = output.split('\0').filter(Boolean);
const failures = [];

for (const relative of paths) {
  for (const failure of inspectPublicPath(relative)) failures.push(`${relative}: ${failure}`);
  let data;
  try { data = readFileSync(resolve(root, relative)); } catch { continue; }
  for (const failure of inspectPublicContent(data)) failures.push(`${relative}: ${failure}`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`public tree scan passed for ${paths.length} files`);
