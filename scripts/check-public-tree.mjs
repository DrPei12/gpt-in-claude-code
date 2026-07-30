#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
  cwd: root,
  encoding: 'utf8',
});
const paths = output.split('\0').filter(Boolean);
const failures = [];

const forbiddenBasenames = new Set([
  '.env',
  '.claude.json',
  'auth.json',
  'cliproxyapi.yaml',
  'history.jsonl',
]);
const forbiddenPathSegments = new Set([
  '.claude',
  '.codex',
  'codex-accounts',
  'sessions',
  'shell-snapshots',
  'telemetry',
  'usage-cache',
]);
const contentPatterns = [
  { label: 'local user path', pattern: /C:\\Users\\LOCAL_USER/gi },
  { label: 'private D drive tool path', pattern: /D:\\Tools\\LOCAL_TOOL/gi },
  { label: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g },
  { label: 'OpenAI secret key', pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { label: 'Anthropic secret key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
];

const fixtureTokenPattern = /^(?:access|alternate|background|codex|disabled|fractional|initial|installed|refresh|secret|test|token)[a-z0-9-]*$/i;
const testKeyPrefix = '-----BEGIN ' + 'PRIVATE KEY-----\\nnot-a-real-key\\n';
const privateKeyPattern = new RegExp('-----BEGIN ' + '(?:RSA |EC |OPENSSH )?' + 'PRIVATE KEY-----');

for (const relative of paths) {
  const normalized = relative.replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (forbiddenBasenames.has(basename(normalized)) && normalized !== 'env.example') {
    failures.push(`${relative}: private runtime file must not be published`);
  }
  if (segments.some((segment) => forbiddenPathSegments.has(segment))) {
    failures.push(`${relative}: private runtime directory must not be published`);
  }
  let data;
  try { data = readFileSync(resolve(root, relative)); } catch { continue; }
  if (data.length > 20 * 1024 * 1024 || data.includes(0)) continue;
  const text = data.toString('utf8');
  for (const { label, pattern } of contentPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) failures.push(`${relative}: detected ${label}`);
  }
  for (const match of text.matchAll(/"(?:access_token|refresh_token)"\s*:\s*"([^"]{12,})"/gi)) {
    if (!fixtureTokenPattern.test(match[1])) failures.push(`${relative}: detected embedded provider token`);
  }
  const withoutTestKeySentinels = text
    .replaceAll(testKeyPrefix + '-----END PRIVATE KEY-----', '')
    .replaceAll(testKeyPrefix, '');
  if (privateKeyPattern.test(withoutTestKeySentinels)) {
    failures.push(`${relative}: detected private key material`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`public tree scan passed for ${paths.length} files`);
