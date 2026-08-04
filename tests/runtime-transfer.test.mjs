import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = join(root, 'gicc-runtime.mjs');
const temporary = mkdtempSync(join(tmpdir(), 'gicc-transfer-test-'));
const configDir = join(temporary, 'config');
const codexHome = join(temporary, 'codex-home');
const fakeBin = join(temporary, 'bin');
const project = join(temporary, 'project');
const transcriptDir = join(configDir, 'projects', 'fixture-project');
const trace = join(temporary, 'codex-requests.jsonl');
const sessionId = '123e4567-e89b-12d3-a456-426614174000';
const brokenSessionId = '223e4567-e89b-12d3-a456-426614174001';
const threadId = '323e4567-e89b-12d3-a456-426614174002';
const transcript = join(transcriptDir, `${sessionId}.jsonl`);
const fakeCodex = join(fakeBin, 'fake-codex.mjs');

function run(args, environment = {}) {
  return spawnSync(process.execPath, [runtime, ...args], {
    cwd: project,
    env: {
      ...process.env,
      PATH: `${fakeBin}${delimiter}${process.env.PATH || ''}`,
      GICC_CONFIG_DIR: configDir,
      CODEX_HOME: codexHome,
      FAKE_CODEX_TRACE: trace,
      FAKE_CODEX_THREAD_ID: threadId,
      ...environment,
    },
    encoding: 'utf8',
    timeout: 15000,
  });
}

function successfulJson(args, environment = {}) {
  const result = run([...args, '--json'], environment);
  assert.equal(result.status, 0, `runtime ${args.join(' ')} failed:\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

function installFakeCodex() {
  writeFileSync(fakeCodex, `
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

if (process.argv[2] !== 'app-server') process.exit(2);
const reader = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of reader) {
  if (!line.trim()) continue;
  const request = JSON.parse(line);
  if (request.method) appendFileSync(process.env.FAKE_CODEX_TRACE, JSON.stringify(request) + '\\n');
  if (request.method === 'initialize') {
    process.stdout.write(JSON.stringify({ id: request.id, result: { userAgent: 'fake-codex' } }) + '\\n');
  } else if (request.method === 'externalAgentConfig/import') {
    if (process.env.FAKE_CODEX_MODE === 'unsupported') {
      process.stdout.write(JSON.stringify({ id: request.id, error: { code: -32601, message: 'method not found' } }) + '\\n');
      continue;
    }
    const session = request.params.migrationItems[0].details.sessions[0];
    const canonicalSource = realpathSync(session.path);
    const hash = createHash('sha256').update(readFileSync(canonicalSource)).digest('hex');
    mkdirSync(process.env.CODEX_HOME, { recursive: true });
    writeFileSync(join(process.env.CODEX_HOME, 'external_agent_session_imports.json'), JSON.stringify({ records: [{
      source_path: canonicalSource,
      content_sha256: hash,
      imported_thread_id: process.env.FAKE_CODEX_THREAD_ID,
    }] }));
    process.stdout.write(JSON.stringify({ id: request.id, result: {} }) + '\\n');
    process.stdout.write(JSON.stringify({ method: 'externalAgentConfig/import/completed', params: {} }) + '\\n');
  } else if (request.id !== undefined && request.method) {
    process.stdout.write(JSON.stringify({ id: request.id, error: { code: -32601, message: 'unexpected method' } }) + '\\n');
  }
}
`, { mode: 0o700 });

  if (process.platform === 'win32') {
    writeFileSync(join(fakeBin, 'codex.cmd'), `@echo off\r\n"${process.execPath}" "${fakeCodex}" %*\r\n`);
  } else {
    const wrapper = join(fakeBin, 'codex');
    writeFileSync(wrapper, `#!/usr/bin/env bash\nexec "${process.execPath}" "${fakeCodex}" "$@"\n`);
    chmodSync(wrapper, 0o755);
  }
}

try {
  for (const directory of [configDir, codexHome, fakeBin, project, transcriptDir]) {
    mkdirSync(directory, { recursive: true });
  }
  installFakeCodex();
  const privatePrompt = 'private transcript content must never become a command argument or result';
  writeFileSync(transcript, [
    JSON.stringify({ sessionId, cwd: project, isSidechain: false, type: 'user', message: privatePrompt }),
    JSON.stringify({ sessionId, cwd: project, isSidechain: false, type: 'assistant', message: 'private answer' }),
    '',
  ].join('\n'), { mode: 0o600 });
  const originalTranscript = readFileSync(transcript);

  const transferred = successfulJson(['transfer', sessionId]);
  assert.equal(transferred.schema, 1);
  assert.equal(transferred.sessionId, sessionId);
  assert.equal(transferred.threadId, threadId);
  assert.equal(transferred.resumeCommand, `codex resume ${threadId}`);
  assert.equal(transferred.modelInvocation, false);
  assert(!JSON.stringify(transferred).includes(privatePrompt));
  assert.deepEqual(readFileSync(transcript), originalTranscript, 'transfer modified the Claude transcript');

  const requests = readFileSync(trace, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.deepEqual(requests.map((request) => request.method), ['initialize', 'initialized', 'externalAgentConfig/import']);
  assert.equal(requests.some((request) => request.method === 'turn/start'), false, 'transfer invoked a model turn');
  const migration = requests.find((request) => request.method === 'externalAgentConfig/import').params;
  assert.equal(migration.migrationItems[0].itemType, 'SESSIONS');
  assert.equal(migration.migrationItems[0].details.sessions[0].path, transcript);
  assert.equal(migration.migrationItems[0].details.sessions[0].cwd, project);
  assert.deepEqual(migration.migrationItems[0].details.subagents, []);

  const defaultLatest = successfulJson(['transfer']);
  assert.equal(defaultLatest.sessionId, sessionId);

  const explicitSource = successfulJson(['transfer', '--source', transcript]);
  assert.equal(explicitSource.threadId, threadId);

  const outside = join(temporary, `${sessionId}.jsonl`);
  writeFileSync(outside, readFileSync(transcript));
  const outsideResult = run(['transfer', '--source', outside]);
  assert.equal(outsideResult.status, 2);
  assert.match(outsideResult.stderr, /inside the GICC session store/);

  const broken = join(transcriptDir, `${brokenSessionId}.jsonl`);
  writeFileSync(broken, '{not-json}\n');
  const brokenResult = run(['transfer', '--source', broken]);
  assert.equal(brokenResult.status, 4);
  assert.match(brokenResult.stderr, /not safe to transfer/);

  const unsupported = run(['transfer', sessionId], { FAKE_CODEX_MODE: 'unsupported' });
  assert.equal(unsupported.status, 1);
  assert.match(unsupported.stderr, /does not support native Claude session transfer/);
  assert.match(unsupported.stderr, /@openai\/codex@latest/);

  const launcher = process.platform === 'win32'
    ? {
      command: join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      args: ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'gicc.ps1')],
    }
    : { command: 'bash', args: [join(root, 'gicc')] };
  const launcherResult = spawnSync(launcher.command, [...launcher.args, 'transfer', sessionId, '--json'], {
    cwd: project,
    env: {
      ...process.env,
      PATH: `${fakeBin}${delimiter}${process.env.PATH || ''}`,
      GICC_CONFIG_DIR: configDir,
      GICC_RUNTIME_HELPER: runtime,
      CODEX_HOME: codexHome,
      FAKE_CODEX_TRACE: trace,
      FAKE_CODEX_THREAD_ID: threadId,
    },
    encoding: 'utf8',
    timeout: 15000,
  });
  assert.equal(launcherResult.status, 0, launcherResult.stderr);
  assert.equal(JSON.parse(launcherResult.stdout).threadId, threadId);

  console.log('runtime native session transfer tests passed');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
