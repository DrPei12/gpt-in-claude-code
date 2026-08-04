#!/usr/bin/env node

import {
  chmodSync,
  closeSync,
  createReadStream,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { arch, homedir, platform } from 'node:os';
import { basename, delimiter, dirname, extname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const SCHEMA = 1;
const CHECKPOINT_MAX_VERSION = 2;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const configDir = resolve(process.env.GICC_CONFIG_DIR || join(homedir(), '.config', 'gpt-in-claude-code'));
const runtimeDir = dirname(fileURLToPath(import.meta.url));
const projectsDir = join(configDir, 'projects');
const contextDir = join(configDir, 'context');
const receiptPath = join(configDir, 'install.json');
const MANAGED_MODELS = new Set(['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']);
const SETTINGS_MODELS = new Set([...MANAGED_MODELS, 'opusplan', 'solplan', 'opus', 'fable', 'sonnet', 'haiku']);
const INSTALL_METHODS = new Set(['homebrew', 'scoop', 'winget', 'archive', 'git']);

function oneOf(...values) {
  const accepted = new Set(values);
  return (value) => accepted.has(value);
}

function integerBetween(minimum, maximum) {
  return (value) => /^(0|[1-9][0-9]*)$/.test(value) && Number(value) >= minimum && Number(value) <= maximum;
}

const SAFE_ENVIRONMENT_RULES = new Map([
  ['GICC_MODEL', (value) => MANAGED_MODELS.has(value)],
  ['GICC_PERMISSION_MODE', oneOf('manual', 'auto', 'acceptEdits', 'dontAsk', 'plan')],
  ['GICC_AUTO_MODE_MODEL', (value) => MANAGED_MODELS.has(value)],
  ['GICC_BACKGROUND_MODEL', (value) => MANAGED_MODELS.has(value)],
  ['GICC_MAX_RETRIES', integerBetween(0, 15)],
  ['GICC_MAX_OUTPUT_TOKENS', integerBetween(1024, 128000)],
  ['GICC_CONTEXT_WINDOW', integerBetween(100000, 1000000)],
  ['GICC_AUTO_COMPACT_WINDOW', integerBetween(100000, 1000000)],
  ['GICC_PLAN_MODE_POLICY', oneOf('conservative', 'normal')],
  ['GICC_USAGE_DISPLAY', oneOf('on', 'off')],
  ['GICC_USAGE_SOURCE', oneOf('auto', 'web', 'app-server')],
  ['GICC_AUTO_UPDATE', oneOf('on', 'notify', 'off')],
  ['GICC_CLAUDE_AUTO_UPDATE', oneOf('on', 'off')],
  ['GICC_SKILL_BRIDGE', oneOf('on', 'off')],
  ['GICC_INSTRUCTION_BRIDGE', oneOf('on', 'off')],
]);

function fail(message, code = 1) {
  process.stderr.write(`gicc: ${message}\n`);
  process.exit(code);
}

function parseOptions(tokens, allowed) {
  const options = { json: false, all: false, cwd: null, session: null, positional: [] };
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--json' && allowed.has('json')) options.json = true;
    else if (token === '--all' && allowed.has('all')) options.all = true;
    else if ((token === '--cwd' || token === '--session') && allowed.has(token.slice(2))) {
      const value = tokens[index + 1];
      if (!value || value.startsWith('--')) fail(`${token} requires a value`, 2);
      options[token.slice(2)] = value;
      index += 1;
    } else if (token.startsWith('--')) fail(`unknown option: ${token}`, 2);
    else options.positional.push(token);
  }
  return options;
}

function output(value, human, json) {
  if (json) process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  else process.stdout.write(`${human(value)}\n`);
}

function safeLstat(path) {
  try { return lstatSync(path); } catch { return null; }
}

function regularFile(path) {
  const stat = safeLstat(path);
  return Boolean(stat?.isFile() && !stat.isSymbolicLink());
}

function readJsonObject(path, maximumBytes = 1024 * 1024) {
  if (!regularFile(path)) return null;
  try {
    if (statSync(path).size > maximumBytes) return null;
    const value = JSON.parse(readFileSync(path, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch { return null; }
}

function validVersion(value) {
  return typeof value === 'string' && value.length <= 64 &&
    /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(value);
}

function receiptInfo() {
  const receipt = readJsonObject(receiptPath);
  return {
    present: Boolean(receipt),
    valid: Boolean(receipt && receipt.schema === 1 && validVersion(receipt.version) &&
      INSTALL_METHODS.has(receipt.method) &&
      receipt.repository === 'DrPei12/gpt-in-claude-code'),
    version: validVersion(receipt?.version) ? receipt.version : null,
    method: INSTALL_METHODS.has(receipt?.method) ? receipt.method : null,
    repository: receipt?.repository === 'DrPei12/gpt-in-claude-code' ? receipt.repository : null,
    claudexShim: receipt?.claudexShim === true,
  };
}

function versionInfo() {
  const sourceManifest = readJsonObject(join(runtimeDir, 'package.json'));
  const receipt = receiptInfo();
  const sourceVersion = validVersion(sourceManifest?.version) ? sourceManifest.version : null;
  return {
    schema: SCHEMA,
    name: 'gpt-in-claude-code',
    version: sourceVersion || receipt.version,
    sourceVersion,
    installedVersion: receipt.version,
    installMethod: receipt.method,
    repository: 'DrPei12/gpt-in-claude-code',
  };
}

function commandAvailable(name) {
  const pathEntries = (process.env.PATH || '').split(delimiter);
  const suffixes = process.platform === 'win32' && !extname(name)
    ? (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
    : [''];
  for (let directory of pathEntries) {
    if (directory.startsWith('"') && directory.endsWith('"')) directory = directory.slice(1, -1);
    if (!directory) directory = process.cwd();
    for (const suffix of suffixes) {
      try {
        const stat = statSync(join(directory, `${name}${suffix}`));
        if (stat.isFile() && (process.platform === 'win32' || (stat.mode & 0o111) !== 0)) return true;
      } catch { }
    }
  }
  return false;
}

function managedFileStatus() {
  const names = ['settings.json', 'codex-session', 'codex-session.ps1', 'statusline', 'statusline.ps1',
    'usage-limit', 'usage-limit.ps1', 'skill-bridge.cjs', 'gicc-runtime.mjs', 'self-update', 'self-update.ps1'];
  const files = {};
  for (const name of names) files[name] = regularFile(join(configDir, name));
  return files;
}

function setupStatus() {
  const receipt = receiptInfo();
  const files = managedFileStatus();
  const settingsPresent = files['settings.json'];
  const settingsValid = Boolean(readJsonObject(join(configDir, 'settings.json')));
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  const prerequisites = {
    node: { available: true, version: process.versions.node, supported: Number.isInteger(nodeMajor) && nodeMajor >= 18 },
    codex: { available: commandAvailable('codex') },
    claudeCode: { available: commandAvailable('claude') },
  };
  const authHome = resolve(process.env.CODEX_HOME || join(homedir(), '.codex'));
  const authentication = { codexFilePresent: regularFile(join(authHome, 'auth.json')) };
  const runtimePresent = files['gicc-runtime.mjs'];
  const platformFilesPresent = process.platform === 'win32'
    ? files['codex-session.ps1'] && files['statusline.ps1'] && files['usage-limit.ps1'] && files['self-update.ps1']
    : files['codex-session'] && files.statusline && files['usage-limit'] && files['self-update'];
  const issues = [];
  if (!receipt.valid) issues.push('install-receipt-invalid');
  if (!prerequisites.node.supported) issues.push('node-unsupported');
  if (!prerequisites.codex.available) issues.push('codex-cli-missing');
  if (!prerequisites.claudeCode.available) issues.push('claude-code-missing');
  if (!authentication.codexFilePresent) issues.push('codex-login-missing');
  if (!settingsPresent) issues.push('settings-missing');
  else if (!settingsValid) issues.push('settings-invalid');
  if (!runtimePresent || !platformFilesPresent) issues.push('managed-runtime-incomplete');
  return {
    schema: SCHEMA,
    ready: issues.length === 0,
    version: versionInfo(),
    platform: { os: platform(), arch: arch() },
    install: receipt,
    prerequisites,
    authentication,
    managedFiles: files,
    issues,
  };
}

function aggregateSessionStatus() {
  const sessions = listSessions({ all: true, cwd: null }).sessions;
  return {
    count: sessions.length,
    unhealthy: sessions.filter((session) => !session.healthy).length,
  };
}

function safeSettings() {
  const settings = readJsonObject(join(configDir, 'settings.json'));
  return {
    model: SETTINGS_MODELS.has(settings?.model) ? settings.model : null,
    tui: settings?.tui === 'fullscreen' ? settings.tui : null,
  };
}

function safeEnvironment() {
  const values = {};
  for (const [name, valid] of SAFE_ENVIRONMENT_RULES) {
    const value = process.env[name];
    if (typeof value === 'string' && valid(value)) values[name] = value;
  }
  return values;
}

function supportBundle() {
  const update = readJsonObject(join(configDir, 'update', 'gicc', 'state.json'));
  const context = contextStatus(null);
  return {
    schema: SCHEMA,
    generatedAt: new Date().toISOString(),
    privacy: {
      containsSecrets: false,
      containsPrompts: false,
      containsHistory: false,
      containsRawLogs: false,
      note: 'Share only after reviewing the generated JSON.',
    },
    setup: setupStatus(),
    settings: safeSettings(),
    environment: safeEnvironment(),
    sessions: aggregateSessionStatus(),
    context: {
      active: context.active,
      previous: context.previous,
      invalid: context.invalid,
      recoverable: context.recoverable,
      corrupt: context.corrupt,
    },
    update: update ? {
      currentVersion: validVersion(update.currentVersion) ? update.currentVersion : null,
      availableVersion: validVersion(update.availableVersion) ? update.availableVersion : null,
      appliedVersion: validVersion(update.appliedVersion) ? update.appliedVersion : null,
      installMethod: INSTALL_METHODS.has(update.installMethod) ? update.installMethod : null,
      lastCheckedAt: Number.isSafeInteger(update.lastCheckedAt) ? update.lastCheckedAt : 0,
      failureCount: Number.isSafeInteger(update.failureCount) ? update.failureCount : 0,
      nextAttemptAt: Number.isSafeInteger(update.nextAttemptAt) ? update.nextAttemptAt : 0,
      hasLastError: typeof update.lastError === 'string' && update.lastError.length > 0,
    } : null,
  };
}

function humanVersion(value) {
  return value.version ? `GICC ${value.version}` : 'GICC version unavailable';
}

function humanSetup(value) {
  const lines = [
    `Setup: ${value.ready ? 'ready' : 'attention required'}`,
    `GICC: ${value.version.version || 'unavailable'} (${value.install.method || 'unknown install method'})`,
    `Node.js: ${value.prerequisites.node.supported ? `v${value.prerequisites.node.version}` : 'unsupported'}`,
    `Codex CLI: ${value.prerequisites.codex.available ? 'available' : 'missing'}`,
    `Claude Code: ${value.prerequisites.claudeCode.available ? 'available' : 'missing'}`,
    `Codex login file: ${value.authentication.codexFilePresent ? 'present' : 'missing'}`,
  ];
  if (value.issues.length) lines.push(`Issues: ${value.issues.join(', ')}`);
  return lines.join('\n');
}

function writeSupportBundle(value, destination) {
  const resolved = resolve(destination);
  if (safeLstat(resolved)) fail(`support bundle target already exists: ${resolved}`, 2);
  let created = false;
  let descriptor = null;
  try {
    descriptor = openSync(resolved, 'wx', 0o600);
    created = true;
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`);
    closeSync(descriptor);
    descriptor = null;
    if (process.platform !== 'win32') chmodSync(resolved, 0o600);
  } catch (error) {
    if (descriptor !== null) try { closeSync(descriptor); } catch { }
    if (created) try { unlinkSync(resolved); } catch { }
    fail(`could not write support bundle: ${error.message}`);
  }
  process.stdout.write(`Wrote sanitized support bundle: ${resolved}\n`);
}

function normalizePath(path) {
  const normalized = resolve(path);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function readChunk(path, start, length) {
  const descriptor = openSync(path, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const count = readSync(descriptor, buffer, 0, length, start);
    return buffer.subarray(0, count).toString('utf8');
  } finally {
    closeSync(descriptor);
  }
}

function parseSampleLines(text, skipFirst, skipLast) {
  const lines = text.split(/\r?\n/);
  if (skipFirst) lines.shift();
  if (skipLast) lines.pop();
  const records = [];
  let invalidLines = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    try { records.push(JSON.parse(line)); }
    catch { invalidLines += 1; }
  }
  return { records, invalidLines };
}

function sampleTranscript(path, id) {
  const stat = lstatSync(path);
  const headBytes = Math.min(stat.size, 256 * 1024);
  const tailStart = Math.max(0, stat.size - 512 * 1024);
  const head = parseSampleLines(readChunk(path, 0, headBytes), false, headBytes < stat.size);
  const tail = tailStart === 0
    ? { records: [], invalidLines: 0 }
    : parseSampleLines(readChunk(path, tailStart, stat.size - tailStart), true, false);
  const records = [...head.records, ...tail.records];
  const matching = records.filter((record) => record && String(record.sessionId || '') === id);
  const root = matching.find((record) => record.isSidechain !== true) || matching[0] || null;
  const issues = [];
  if (!UUID.test(id)) issues.push('filename is not a Claude session UUID');
  if (!root) issues.push('sample contains no matching session record');
  if (head.invalidLines + tail.invalidLines > 0) issues.push('sample contains malformed JSONL records');
  const cwd = typeof root?.cwd === 'string' && root.cwd ? resolve(root.cwd) : null;
  return {
    id,
    cwd,
    root: Boolean(root && root.isSidechain !== true),
    updatedAt: stat.mtime.toISOString(),
    sizeBytes: stat.size,
    resumeCommand: `gicc --resume ${id}`,
    healthy: issues.length === 0,
    issues,
    transcript: { exists: true, file: basename(path), sampledRecords: records.length },
    _path: path,
  };
}

function sessionFiles() {
  if (!existsSync(projectsDir)) return [];
  const files = [];
  for (const projectEntry of readdirSync(projectsDir, { withFileTypes: true })) {
    if (!projectEntry.isDirectory() || projectEntry.isSymbolicLink()) continue;
    const projectPath = join(projectsDir, projectEntry.name);
    for (const entry of readdirSync(projectPath, { withFileTypes: true })) {
      if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith('.jsonl')) continue;
      files.push(join(projectPath, entry.name));
    }
  }
  return files;
}

function listSessions({ all, cwd }) {
  const requestedCwd = all ? null : normalizePath(cwd || process.cwd());
  const sessions = [];
  for (const path of sessionFiles()) {
    const id = basename(path, '.jsonl');
    let session;
    try { session = sampleTranscript(path, id); }
    catch { continue; }
    if (!session.root || (!all && (!session.cwd || normalizePath(session.cwd) !== requestedCwd))) continue;
    delete session._path;
    sessions.push(session);
  }
  sessions.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id));
  return { schema: SCHEMA, cwd: all ? null : resolve(cwd || process.cwd()), sessions };
}

function findSession(id) {
  if (!UUID.test(id)) fail('session ID must be a UUID', 2);
  const matches = sessionFiles().filter((path) => basename(path, '.jsonl').toLowerCase() === id.toLowerCase());
  if (matches.length === 0) fail(`session not found: ${id}`, 3);
  if (matches.length > 1) fail(`session ID is ambiguous across ${matches.length} transcript files: ${id}`, 4);
  const session = sampleTranscript(matches[0], basename(matches[0], '.jsonl'));
  return session;
}

async function inspectTranscript(path, id) {
  let lines = 0;
  let invalidLines = 0;
  let matchingRecords = 0;
  let rootRecords = 0;
  const cwdValues = new Set();
  const input = createReadStream(path, { encoding: 'utf8' });
  const reader = createInterface({ input, crlfDelay: Infinity });
  for await (const line of reader) {
    if (!line.trim()) continue;
    lines += 1;
    let record;
    try { record = JSON.parse(line); }
    catch { invalidLines += 1; continue; }
    if (String(record?.sessionId || '').toLowerCase() !== id.toLowerCase()) continue;
    matchingRecords += 1;
    if (record.isSidechain !== true) rootRecords += 1;
    if (typeof record.cwd === 'string' && record.cwd) cwdValues.add(normalizePath(record.cwd));
  }
  const issues = [];
  if (invalidLines > 0) issues.push(`${invalidLines} malformed JSONL record(s)`);
  if (matchingRecords === 0) issues.push('no record matches the transcript filename session ID');
  if (rootRecords === 0) issues.push('no root session record was found');
  if (cwdValues.size > 1) issues.push('session records contain conflicting working directories');
  return { lines, invalidLines, matchingRecords, rootRecords, cwdCount: cwdValues.size, issues };
}

function readCheckpoint(path) {
  if (!regularFile(path)) return { valid: false, value: null, error: 'not a regular file' };
  let value;
  try { value = JSON.parse(readFileSync(path, 'utf8')); }
  catch { return { valid: false, value: null, error: 'invalid JSON' }; }
  const errors = [];
  if (!Number.isInteger(value?.version) || value.version < 1 || value.version > CHECKPOINT_MAX_VERSION) errors.push('unsupported version');
  if (typeof value?.scope !== 'string' || !value.scope) errors.push('missing scope');
  if (typeof value?.model !== 'string' || !value.model) errors.push('missing model');
  if (!Number.isInteger(value?.generation) || value.generation < 1) errors.push('invalid generation');
  if (!Number.isInteger(value?.raw_prefix_items) || value.raw_prefix_items < 1) errors.push('invalid raw prefix length');
  if (typeof value?.raw_prefix_fingerprint !== 'string' || !/^[0-9a-f]{64}$/i.test(value.raw_prefix_fingerprint)) errors.push('invalid raw prefix fingerprint');
  if (!Array.isArray(value?.replacement) || value.replacement.length === 0) errors.push('empty replacement');
  if (typeof value?.method !== 'string' || !value.method) errors.push('missing method');
  return { valid: errors.length === 0, value, error: errors.join(', ') };
}

function checkpointMatchesSession(checkpoint, sessionId) {
  if (!sessionId) return true;
  const scope = checkpoint?.value?.scope;
  if (typeof scope !== 'string') return false;
  return scope.includes(`session-${sessionId}`) || scope.includes(`:${sessionId}:`);
}

function checkpointFamilies(sessionId = null) {
  if (!existsSync(contextDir)) return [];
  const names = readdirSync(contextDir);
  const bases = new Set();
  for (const name of names) {
    if (name.endsWith('.checkpoint.json')) bases.add(name);
    else if (name.endsWith('.checkpoint.json.previous')) bases.add(name.slice(0, -'.previous'.length));
  }
  const families = [];
  for (const base of bases) {
    const activePath = join(contextDir, base);
    const previousPath = `${activePath}.previous`;
    const active = existsSync(activePath) ? readCheckpoint(activePath) : null;
    const previous = existsSync(previousPath) ? readCheckpoint(previousPath) : null;
    if (sessionId && !checkpointMatchesSession(active, sessionId) && !checkpointMatchesSession(previous, sessionId)) continue;
    families.push({ base, activePath, previousPath, active, previous });
  }
  return families;
}

function contextStatus(sessionId = null) {
  const families = checkpointFamilies(sessionId);
  let active = 0;
  let previous = 0;
  let invalid = 0;
  let recoverable = 0;
  const checkpoints = [];
  for (const family of families) {
    if (family.active?.valid) active += 1;
    if (family.previous?.valid) previous += 1;
    if (family.active && !family.active.valid) invalid += 1;
    if (family.previous && !family.previous.valid) invalid += 1;
    if (family.active && !family.active.valid && family.previous?.valid) recoverable += 1;
    const authoritative = family.active?.valid ? family.active : family.previous?.valid ? family.previous : null;
    checkpoints.push({
      file: family.base,
      state: family.active?.valid ? 'active' : family.previous?.valid ? 'recoverable' : 'invalid',
      scope: authoritative?.value?.scope || null,
      model: authoritative?.value?.model || null,
      generation: authoritative?.value?.generation || null,
      activeError: family.active && !family.active.valid ? family.active.error : null,
      previousError: family.previous && !family.previous.valid ? family.previous.error : null,
    });
  }
  const corrupt = existsSync(contextDir)
    ? readdirSync(contextDir).filter((name) => name.includes('.checkpoint.json.corrupt-')).length
    : 0;
  return { schema: SCHEMA, sessionId, active, previous, invalid, recoverable, corrupt, checkpoints };
}

function quarantinePath(path) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  let candidate = `${path}.corrupt-${stamp}`;
  let suffix = 0;
  while (existsSync(candidate)) { suffix += 1; candidate = `${path}.corrupt-${stamp}-${suffix}`; }
  return candidate;
}

function repairContext(sessionId = null) {
  mkdirSync(contextDir, { recursive: true, mode: 0o700 });
  const actions = [];
  for (const family of checkpointFamilies(sessionId)) {
    if (family.active?.valid) continue;
    if (family.active && !family.active.valid) {
      const quarantined = quarantinePath(family.activePath);
      renameSync(family.activePath, quarantined);
      if (family.previous?.valid) {
        renameSync(family.previousPath, family.activePath);
        actions.push({ file: family.base, action: 'restored-previous', quarantined: basename(quarantined) });
      } else {
        actions.push({ file: family.base, action: 'quarantined-invalid', quarantined: basename(quarantined) });
      }
    } else if (!family.active && family.previous?.valid) {
      renameSync(family.previousPath, family.activePath);
      actions.push({ file: family.base, action: 'restored-previous' });
    }
  }
  return { schema: SCHEMA, sessionId, changed: actions.length, actions, status: contextStatus(sessionId) };
}

function humanSessionList(value) {
  if (value.sessions.length === 0) return `No GICC sessions found for ${value.cwd || 'all projects'}.`;
  return value.sessions.map((session) => [
    `${session.id}  ${session.updatedAt}  ${session.cwd || '<unknown cwd>'}`,
    `  Resume: ${session.resumeCommand}${session.healthy ? '' : `  (${session.issues.join('; ')})`}`,
  ].join('\n')).join('\n');
}

function humanSessionStatus(value) {
  const session = value.session;
  return [
    `Session: ${session.id}`,
    `Working directory: ${session.cwd || '<unknown>'}`,
    `Transcript: ${session.transcript.exists ? 'present' : 'missing'} (${session.sizeBytes} bytes)` ,
    `Context checkpoints: ${value.context.active} active, ${value.context.previous} previous, ${value.context.invalid} invalid`,
    `Resume: ${session.resumeCommand}`,
  ].join('\n');
}

function humanDoctor(value) {
  return [
    `Session doctor: ${value.ok ? 'healthy' : 'issues found'}`,
    `Session: ${value.session.id}`,
    `Transcript: ${value.transcript.lines} JSONL records, ${value.transcript.invalidLines} invalid`,
    `Context: ${value.context.active} active, ${value.context.recoverable} recoverable, ${value.context.invalid} invalid`,
    ...(value.issues.length ? value.issues.map((issue) => `- ${issue}`) : []),
  ].join('\n');
}

function humanContext(value) {
  const status = value.status || value;
  const prefix = value.actions ? `Context repair: ${value.changed} change(s)\n` : '';
  return `${prefix}Context checkpoints: ${status.active} active, ${status.previous} previous, ${status.invalid} invalid, ${status.corrupt} quarantined`;
}

async function sessionCommand(action, tokens) {
  if (action === 'list') {
    const options = parseOptions(tokens, new Set(['json', 'all', 'cwd']));
    if (options.positional.length) fail('Usage: gicc session list [--all] [--cwd PATH] [--json]', 2);
    output(listSessions(options), humanSessionList, options.json);
    return;
  }
  if (action === 'status' || action === 'doctor') {
    const options = parseOptions(tokens, new Set(['json', 'cwd']));
    if (options.positional.length > 1) fail(`Usage: gicc session ${action} [SESSION_ID] [--cwd PATH] [--json]`, 2);
    let id = options.positional[0];
    if (!id) {
      const latest = listSessions({ all: false, cwd: options.cwd }).sessions[0];
      if (!latest) fail(`no GICC session found for ${resolve(options.cwd || process.cwd())}`, 3);
      id = latest.id;
    }
    const session = findSession(id);
    const context = contextStatus(session.id);
    if (action === 'status') {
      delete session._path;
      output({ schema: SCHEMA, session, context }, humanSessionStatus, options.json);
      return;
    }
    const transcript = await inspectTranscript(session._path, session.id);
    const issues = [...transcript.issues];
    const unrecoverableContext = Math.max(0, context.invalid - context.recoverable);
    if (unrecoverableContext > 0) issues.push(`${unrecoverableContext} context checkpoint(s) cannot be recovered automatically`);
    delete session._path;
    output({ schema: SCHEMA, ok: issues.length === 0, session, transcript, context, issues }, humanDoctor, options.json);
    return;
  }
  fail('Usage: gicc session <list|status|doctor> ...', 2);
}

function contextCommand(action, tokens) {
  const options = parseOptions(tokens, new Set(['json', 'session']));
  if (options.positional.length) fail(`Usage: gicc context ${action} [--session SESSION_ID] [--json]`, 2);
  if (options.session && !UUID.test(options.session)) fail('session ID must be a UUID', 2);
  if (action === 'status') output(contextStatus(options.session), humanContext, options.json);
  else if (action === 'repair') output(repairContext(options.session), humanContext, options.json);
  else fail('Usage: gicc context <status|repair> ...', 2);
}

function simpleJsonOptions(tokens, usage) {
  const options = parseOptions(tokens, new Set(['json']));
  if (options.positional.length) fail(usage, 2);
  return options;
}

function supportCommand(tokens) {
  if (tokens[0] === 'bundle') tokens = tokens.slice(1);
  else fail('Usage: gicc support bundle [--json|--output FILE]', 2);
  let json = false;
  let destination = null;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--json') json = true;
    else if (token === '--output') {
      destination = tokens[index + 1];
      if (!destination || destination.startsWith('--')) fail('--output requires a file path', 2);
      index += 1;
    } else fail(`unknown option: ${token}`, 2);
  }
  if (json && destination) fail('--json and --output are mutually exclusive', 2);
  const value = supportBundle();
  if (json) output(value, () => '', true);
  else {
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    writeSupportBundle(value, destination || join(process.cwd(), `gicc-support-${stamp}.json`));
  }
}

const [command, ...argumentsAfterCommand] = process.argv.slice(2);
if (command === 'session') {
  const [action = 'list', ...tokens] = argumentsAfterCommand;
  await sessionCommand(action, tokens);
} else if (command === 'context') {
  const [action = 'status', ...tokens] = argumentsAfterCommand;
  contextCommand(action, tokens);
} else if (command === 'version') {
  const options = simpleJsonOptions(argumentsAfterCommand, 'Usage: gicc version [--json]');
  const value = versionInfo();
  output(value, humanVersion, options.json);
  if (!value.version) process.exitCode = 1;
} else if (command === 'setup') {
  const tokens = argumentsAfterCommand[0] === 'status' ? argumentsAfterCommand.slice(1) : argumentsAfterCommand;
  const options = simpleJsonOptions(tokens, 'Usage: gicc setup [status] [--json]');
  const value = setupStatus();
  output(value, humanSetup, options.json);
  if (!value.ready) process.exitCode = 1;
} else if (command === 'support') supportCommand(argumentsAfterCommand);
else fail('Usage: gicc-runtime <session|context|version|setup|support> ...', 2);
