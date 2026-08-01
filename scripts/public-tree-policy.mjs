import { basename } from 'node:path';

export const maximumScannedFileBytes = 20 * 1024 * 1024;

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
  'projects',
  'sessions',
  'shell-snapshots',
  'tasks',
  'telemetry',
  'todos',
  'usage-cache',
]);

const contentPatterns = [
  {
    label: 'local Windows user path',
    pattern: /\b[A-Za-z]:[\\/]Users[\\/][^\\/\r\n"'`<>|?*]+/gi,
  },
  {
    label: 'local Windows workspace path',
    pattern: /\b[A-Za-z]:[\\/](?:Tools|Desktop|Documents|Downloads|Projects|Repos|Workspaces)[\\/][^\\/\r\n"'`<>|?*]+/gi,
  },
  {
    label: 'local POSIX user path',
    pattern: /(?:^|[\s("'`=])\/(?:Users|home)\/[^/\s"'`<>]+/gm,
  },
  { label: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g },
  { label: 'OpenAI secret key', pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { label: 'Anthropic secret key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
];

const fixtureTokenPattern = /^(?:access|alternate|background|codex|disabled|fractional|initial|installed|refresh|secret|test|token)[a-z0-9-]*$/i;
const testKeyPrefix = '-----BEGIN ' + 'PRIVATE KEY-----\\nnot-a-real-key\\n';
const privateKeyPattern = new RegExp('-----BEGIN ' + '(?:RSA |EC |OPENSSH )?' + 'PRIVATE KEY-----');

function normalizePath(relative) {
  return relative.replaceAll('\\', '/');
}

function uniqueMachineValues(environment) {
  const values = [
    environment.USERPROFILE,
    environment.HOME,
    environment.COMPUTERNAME,
  ];
  return [...new Set(values
    .filter((value) => typeof value === 'string' && value.trim().length >= 4)
    .map((value) => value.trim().toLocaleLowerCase('en-US')))];
}

export function inspectPublicPath(relative) {
  const normalized = normalizePath(relative);
  const segments = normalized.split('/');
  const failures = [];
  if (forbiddenBasenames.has(basename(normalized)) && normalized !== 'env.example') {
    failures.push('private runtime file must not be published');
  }
  if (segments.some((segment) => forbiddenPathSegments.has(segment))) {
    failures.push('private runtime directory must not be published');
  }
  return failures;
}

export function inspectPublicContent(data, environment = process.env) {
  if (data.length > maximumScannedFileBytes || data.includes(0)) return [];

  const text = data.toString('utf8');
  const failures = [];
  for (const { label, pattern } of contentPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) failures.push(`detected ${label}`);
  }

  const lowerText = text.toLocaleLowerCase('en-US');
  if (uniqueMachineValues(environment).some((value) => lowerText.includes(value))) {
    failures.push('detected current machine identifier');
  }

  for (const match of text.matchAll(/"(?:access_token|refresh_token)"\s*:\s*"([^"]{12,})"/gi)) {
    if (!fixtureTokenPattern.test(match[1])) failures.push('detected embedded provider token');
  }

  const withoutTestKeySentinels = text
    .replaceAll(testKeyPrefix + '-----END PRIVATE KEY-----', '')
    .replaceAll(testKeyPrefix, '');
  if (privateKeyPattern.test(withoutTestKeySentinels)) {
    failures.push('detected private key material');
  }

  return [...new Set(failures)];
}
