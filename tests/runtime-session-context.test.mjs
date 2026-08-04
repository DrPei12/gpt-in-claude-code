import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = join(root, 'gicc-runtime.mjs');
const temporary = mkdtempSync(join(tmpdir(), 'gicc-runtime-test-'));
const configDir = join(temporary, 'config');
const project = join(temporary, 'project');
const otherProject = join(temporary, 'other-project');
const transcriptDir = join(configDir, 'projects', 'fixture-project');
const contextDir = join(configDir, 'context');
const sessionId = '123e4567-e89b-12d3-a456-426614174000';
const otherSessionId = '223e4567-e89b-12d3-a456-426614174001';
const mismatchedFilenameId = '323e4567-e89b-12d3-a456-426614174002';

function writeJsonLines(path, records) {
  writeFileSync(path, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`, { mode: 0o600 });
}

function checkpoint(scope, generation = 1) {
  return {
    version: 2,
    scope,
    model: 'gpt-5.6-sol',
    generation,
    raw_prefix_items: 3,
    raw_prefix_fingerprint: 'a'.repeat(64),
    replacement: [{ type: 'compaction', encrypted_content: 'opaque' }],
    method: 'remote',
    input_tokens_before: 240000,
    input_tokens_after: 120000,
    created_at: '2026-08-03T00:00:00Z',
  };
}

function run(args, cwd = project) {
  const result = spawnSync(process.execPath, [runtime, ...args], {
    cwd,
    env: { ...process.env, GICC_CONFIG_DIR: configDir },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `runtime ${args.join(' ')} failed:\n${result.stderr}`);
  return result.stdout;
}

function json(args, cwd = project) {
  return JSON.parse(run([...args, '--json'], cwd));
}

function runLauncherResult(executable, args, environment = {}) {
  return spawnSync(executable, args, {
    cwd: project,
    env: {
      ...process.env,
      GICC_CONFIG_DIR: configDir,
      GICC_RUNTIME_HELPER: runtime,
      ...environment,
    },
    encoding: 'utf8',
  });
}

function runLauncher(executable, args, environment = {}) {
  const result = runLauncherResult(executable, args, environment);
  assert.equal(result.status, 0, `${executable} ${args.join(' ')} failed:\n${result.stderr}`);
  return result.stdout;
}

try {
  mkdirSync(transcriptDir, { recursive: true });
  mkdirSync(contextDir, { recursive: true });
  mkdirSync(project, { recursive: true });
  mkdirSync(otherProject, { recursive: true });

  writeJsonLines(join(transcriptDir, `${sessionId}.jsonl`), [
    { sessionId, cwd: project, isSidechain: false, type: 'user', message: 'private user prompt must not be emitted' },
    { sessionId, cwd: project, isSidechain: false, type: 'assistant', message: 'private answer must not be emitted' },
  ]);
  writeJsonLines(join(transcriptDir, `${otherSessionId}.jsonl`), [
    { sessionId: otherSessionId, cwd: otherProject, isSidechain: false, type: 'user', message: 'other private prompt' },
  ]);
  writeJsonLines(join(transcriptDir, `${mismatchedFilenameId}.jsonl`), [
    { sessionId, cwd: project, isSidechain: false, type: 'user', message: 'mismatched private prompt' },
  ]);

  const activeCheckpoint = join(contextDir, 'active.checkpoint.json');
  writeFileSync(activeCheckpoint, `${JSON.stringify(checkpoint(`claude:session-${sessionId}:agent:main`), null, 2)}\n`);
  const recoverCheckpoint = join(contextDir, 'recover.checkpoint.json');
  writeFileSync(recoverCheckpoint, '{"broken":\n');
  writeFileSync(`${recoverCheckpoint}.previous`, `${JSON.stringify(checkpoint(`claude:session-${sessionId}:agent:worker`, 2), null, 2)}\n`);
  const unknownCheckpoint = join(contextDir, 'unknown.checkpoint.json');
  writeFileSync(unknownCheckpoint, '{"also-broken":\n');

  const listed = json(['session', 'list']);
  assert.equal(listed.schema, 1);
  assert.deepEqual(listed.sessions.map((session) => session.id), [sessionId]);
  assert.equal(listed.sessions[0].cwd, project);
  assert.equal(listed.sessions[0].resumeCommand, `gicc --resume ${sessionId}`);
  assert(!JSON.stringify(listed).includes('private user prompt'), 'session inventory leaked transcript content');

  const all = json(['session', 'list', '--all']);
  assert.deepEqual(new Set(all.sessions.map((session) => session.id)), new Set([sessionId, otherSessionId]));

  const status = json(['session', 'status', sessionId]);
  assert.equal(status.session.id, sessionId);
  assert.equal(status.session.transcript.exists, true);
  assert.equal(status.context.active, 1);
  assert.equal(status.context.previous, 1);

  const doctor = json(['session', 'doctor', sessionId]);
  assert.equal(doctor.ok, true);
  assert.equal(doctor.transcript.invalidLines, 0);

  const contextStatus = json(['context', 'status', '--session', sessionId]);
  assert.equal(contextStatus.active, 1);
  assert.equal(contextStatus.previous, 1);
  assert.equal(contextStatus.invalid, 1);

  const repaired = json(['context', 'repair', '--session', sessionId]);
  assert.equal(repaired.changed, 1);
  assert.equal(JSON.parse(readFileSync(recoverCheckpoint, 'utf8')).generation, 2);
  assert(!statSync(activeCheckpoint).isSymbolicLink());
  assert(readdirSync(contextDir).some((name) => name.startsWith('recover.checkpoint.json.corrupt-')));
  assert.equal(readFileSync(unknownCheckpoint, 'utf8'), '{"also-broken":\n', 'session scoped repair touched an unidentifiable checkpoint');

  const repairedStatus = json(['context', 'status', '--session', sessionId]);
  assert.equal(repairedStatus.active, 2);
  assert.equal(repairedStatus.previous, 0);

  const human = run(['session', 'list']);
  assert.match(human, new RegExp(sessionId));
  assert.match(human, /gicc --resume/);
  assert(!human.includes('private user prompt'));

  if (process.platform === 'win32') {
    const powershell = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const listedThroughPowerShell = JSON.parse(runLauncher(powershell, [
      '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'gicc.ps1'),
      'session', 'list', '--json',
    ]));
    assert.deepEqual(listedThroughPowerShell.sessions.map((session) => session.id), [sessionId]);
    const resumeWithoutInstallation = runLauncherResult(powershell, [
      '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'gicc.ps1'),
      'session', 'resume', sessionId,
    ]);
    assert.notEqual(resumeWithoutInstallation.status, 0);
    assert.match(resumeWithoutInstallation.stderr, /missing .*env/i);
  }

  if (process.platform !== 'win32') {
    const bashProbe = spawnSync('bash', ['--version'], { encoding: 'utf8' });
    if (!bashProbe.error && bashProbe.status === 0) {
      const listedThroughBash = JSON.parse(runLauncher('bash', [join(root, 'gicc'), 'session', 'list', '--json']));
      assert.deepEqual(listedThroughBash.sessions.map((session) => session.id), [sessionId]);
      const resumeWithoutInstallation = runLauncherResult('bash', [join(root, 'gicc'), 'session', 'resume', sessionId]);
      assert.notEqual(resumeWithoutInstallation.status, 0);
      assert.match(resumeWithoutInstallation.stderr, /missing .*env/i);
    }
  }

  console.log('runtime session and context tests passed');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
