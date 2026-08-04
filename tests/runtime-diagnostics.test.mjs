import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = join(root, 'gicc-runtime.mjs');
const packageVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const temporary = mkdtempSync(join(tmpdir(), 'gicc-diagnostics-test-'));
const configDir = join(temporary, 'config');
const codexHome = join(temporary, 'codex-home');
const fakeBin = join(temporary, 'bin');
const project = join(temporary, 'project');
const secretValues = [
  'support-secret-token-value',
  'private support prompt value',
  'private support answer value',
  'private update failure detail',
  'private settings model value',
  'private environment value',
  temporary,
];

function run(args, extra = {}) {
  const result = spawnSync(process.execPath, [runtime, ...args], {
    cwd: project,
    env: {
      ...process.env,
      PATH: `${fakeBin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH || ''}`,
      GICC_CONFIG_DIR: configDir,
      CODEX_HOME: codexHome,
      GICC_MODEL: 'gpt-5.6-sol',
      GICC_PLAN_MODE_POLICY: secretValues[5],
      GICC_PROXY_TOKEN: secretValues[0],
      ...extra,
    },
    encoding: 'utf8',
  });
  return result;
}

function successfulJson(args) {
  const result = run(args);
  assert.equal(result.status, 0, `runtime ${args.join(' ')} failed:\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

function launcherJson(executable, args) {
  const result = spawnSync(executable.command, [...executable.prefix, ...args], {
    cwd: project,
    env: {
      ...process.env,
      PATH: `${fakeBin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH || ''}`,
      GICC_CONFIG_DIR: configDir,
      GICC_RUNTIME_HELPER: runtime,
      CODEX_HOME: codexHome,
    },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `launcher ${args.join(' ')} failed:\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

function writeCommand(name) {
  if (process.platform === 'win32') {
    writeFileSync(join(fakeBin, `${name}.cmd`), '@echo off\r\nexit /b 0\r\n');
  } else {
    const path = join(fakeBin, name);
    writeFileSync(path, '#!/usr/bin/env bash\nexit 0\n');
    chmodSync(path, 0o755);
  }
}

try {
  for (const directory of [configDir, codexHome, fakeBin, project, join(configDir, 'projects', 'fixture'),
    join(configDir, 'context'), join(configDir, 'update', 'gicc')]) mkdirSync(directory, { recursive: true });
  for (const name of ['codex', 'claude']) writeCommand(name);
  writeFileSync(join(codexHome, 'auth.json'), JSON.stringify({ tokens: { access_token: secretValues[0] } }));
  writeFileSync(join(configDir, 'install.json'), `${JSON.stringify({
    schema: 1,
    version: packageVersion,
    method: 'git',
    binDir: join(temporary, 'installed-bin'),
    repository: 'DrPei12/gpt-in-claude-code',
    claudexShim: true,
  })}\n`);
  writeFileSync(join(configDir, 'settings.json'), `${JSON.stringify({
    model: secretValues[4],
    tui: 'fullscreen',
    hooks: { private: secretValues[0] },
  })}\n`);
  writeFileSync(join(configDir, 'gicc-runtime.mjs'), '// installed runtime fixture\n');
  const platformFiles = process.platform === 'win32'
    ? ['codex-session.ps1', 'statusline.ps1', 'usage-limit.ps1', 'self-update.ps1']
    : ['codex-session', 'statusline', 'usage-limit', 'self-update'];
  for (const name of platformFiles) writeFileSync(join(configDir, name), 'fixture\n');
  const sessionId = '123e4567-e89b-12d3-a456-426614174000';
  writeFileSync(join(configDir, 'projects', 'fixture', `${sessionId}.jsonl`), [
    JSON.stringify({ sessionId, cwd: project, isSidechain: false, message: secretValues[1] }),
    JSON.stringify({ sessionId, cwd: project, isSidechain: false, message: secretValues[2] }),
    '',
  ].join('\n'));
  writeFileSync(join(configDir, 'update', 'gicc', 'state.json'), `${JSON.stringify({
    schema: 1,
    currentVersion: packageVersion,
    availableVersion: packageVersion,
    installMethod: 'git',
    lastCheckedAt: 123,
    failureCount: 1,
    nextAttemptAt: 456,
    lastError: secretValues[3],
  })}\n`);

  const version = successfulJson(['version', '--json']);
  assert.equal(version.version, packageVersion);
  assert.equal(version.installedVersion, packageVersion);

  const setup = successfulJson(['setup', 'status', '--json']);
  assert.equal(setup.ready, true);
  assert.equal(setup.install.claudexShim, true);
  assert.equal(setup.prerequisites.codex.available, true);
  assert.equal(setup.prerequisites.claudeCode.available, true);

  const launcher = process.platform === 'win32'
    ? {
      command: join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      prefix: ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'gicc.ps1')],
    }
    : { command: 'bash', prefix: [join(root, 'gicc')] };
  assert.equal(launcherJson(launcher, ['version', '--json']).version, packageVersion);
  assert.equal(launcherJson(launcher, ['setup', 'status', '--json']).ready, true);
  assert.equal(launcherJson(launcher, ['support', 'bundle', '--json']).privacy.containsSecrets, false);

  const bundle = successfulJson(['support', 'bundle', '--json']);
  assert.equal(bundle.privacy.containsSecrets, false);
  assert.equal(bundle.sessions.count, 1);
  assert.equal(bundle.context.active, 0);
  assert.equal(bundle.update.hasLastError, true);
  const serialized = JSON.stringify(bundle);
  for (const secret of secretValues) assert(!serialized.includes(secret), `support bundle leaked: ${secret}`);
  assert(!serialized.includes(sessionId), 'support bundle leaked a session ID');
  assert(!serialized.includes('hooks'), 'support bundle included unapproved settings');
  assert.equal(bundle.settings.model, null, 'support bundle included an invalid settings value');
  assert(!Object.hasOwn(bundle.environment, 'GICC_PLAN_MODE_POLICY'), 'support bundle included an invalid environment value');

  const destination = join(project, 'support.json');
  const written = run(['support', 'bundle', '--output', destination]);
  assert.equal(written.status, 0, written.stderr);
  const writtenText = readFileSync(destination, 'utf8');
  assert.deepEqual(JSON.parse(writtenText).privacy, bundle.privacy);
  if (process.platform !== 'win32') assert.equal(statSync(destination).mode & 0o777, 0o600);
  const overwrite = run(['support', 'bundle', '--output', destination]);
  assert.equal(overwrite.status, 2, 'support bundle overwrote an existing file');

  console.log('runtime diagnostics and support bundle checks passed');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
