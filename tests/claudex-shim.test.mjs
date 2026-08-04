import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const marker = 'GICC compatibility shim for gpt-in-claude-code';
const bashSource = readFileSync(path.join(root, 'claudex'), 'utf8');
const powerShellSource = readFileSync(path.join(root, 'claudex.ps1'), 'utf8');
const cmdSource = readFileSync(path.join(root, 'claudex.cmd'), 'utf8');

for (const [name, source] of [
  ['claudex', bashSource],
  ['claudex.ps1', powerShellSource],
  ['claudex.cmd', cmdSource],
]) {
  assert(source.includes(marker), `${name} is missing the managed shim marker`);
  assert(!/(ANTHROPIC|OPENAI|proxy|token|credential|session)/i.test(source),
    `${name} must not duplicate provider, authentication, or session logic`);
}
assert(bashSource.includes('exec "$launcher_dir/gicc" "$@"'),
  'Unix shim does not replace itself with the sibling canonical launcher');
assert(powerShellSource.includes("Join-Path $PSScriptRoot 'gicc.ps1'") &&
  powerShellSource.includes('& $launcher @args'),
  'PowerShell shim does not forward to the sibling canonical launcher');
assert(cmdSource.includes('"%~dp0claudex.ps1" %*'),
  'CMD shim does not forward to the sibling PowerShell shim');

const temporary = mkdtempSync(path.join(tmpdir(), 'gicc-claudex-shim-'));
try {
  const expected = ['codex', '--model', 'value with spaces', '--', 'literal&token'];
  const capture = path.join(temporary, 'capture.json');
  if (process.platform === 'win32') {
    copyFileSync(path.join(root, 'claudex.ps1'), path.join(temporary, 'claudex.ps1'));
    writeFileSync(path.join(temporary, 'gicc.ps1'), [
      "$payload = ConvertTo-Json -Compress -InputObject @($args)",
      "[IO.File]::WriteAllText($env:GICC_SHIM_CAPTURE, $payload)",
      '& cmd.exe /d /c exit 23',
      '',
    ].join('\r\n'));
    const result = spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
      path.join(temporary, 'claudex.ps1'), ...expected,
    ], { env: { ...process.env, GICC_SHIM_CAPTURE: capture }, encoding: 'utf8' });
    assert.equal(result.status, 23, `PowerShell shim did not preserve launcher exit status: ${result.stderr}`);
  } else {
    copyFileSync(path.join(root, 'claudex'), path.join(temporary, 'claudex'));
    writeFileSync(path.join(temporary, 'gicc'), [
      '#!/usr/bin/env bash',
      "node -e 'require(\"fs\").writeFileSync(process.env.GICC_SHIM_CAPTURE, JSON.stringify(process.argv.slice(1)))' -- \"$@\"",
      'exit 23',
      '',
    ].join('\n'));
    chmodSync(path.join(temporary, 'claudex'), 0o755);
    chmodSync(path.join(temporary, 'gicc'), 0o755);
    const result = spawnSync(path.join(temporary, 'claudex'), expected, {
      env: { ...process.env, GICC_SHIM_CAPTURE: capture }, encoding: 'utf8',
    });
    assert.equal(result.status, 23, `Unix shim did not preserve launcher exit status: ${result.stderr}`);
  }
  assert.deepEqual(JSON.parse(readFileSync(capture, 'utf8')), expected,
    'claudex shim changed forwarded arguments');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

console.log('claudex compatibility shim checks passed');
