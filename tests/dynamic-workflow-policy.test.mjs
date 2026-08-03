import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const unix = fs.readFileSync(path.join(root, 'gicc'), 'utf8');
const windows = fs.readFileSync(path.join(root, 'gicc.ps1'), 'utf8');
const configuration = fs.readFileSync(path.join(root, 'docs', 'configuration.md'), 'utf8');
const compatibility = fs.readFileSync(path.join(root, 'docs', 'claude-code-compatibility.md'), 'utf8');

for (const [label, source] of [['Unix launcher', unix], ['Windows launcher', windows]]) {
  assert.doesNotMatch(source, /GICC_MAX_AGENT_CONCURRENCY/, `${label} must not define an Agent cap`);
  assert.doesNotMatch(source, /keep at most \d+ delegated/i, `${label} must not inject a fixed Agent capacity guard`);
  assert.doesNotMatch(source, /Do not spawn or delegate to additional agents/i, `${label} must not block nested delegation`);
  assert.match(source, /Dynamic Workflow, Ultrareview, Agent delegation, nested subagent delegation/,
    `${label} must preserve the complete dynamic workflow surface`);
  assert.match(source, /Do not impose a fixed tool or Agent concurrency limit/,
    `${label} must delegate concurrency decisions to the native scheduler`);
  assert.match(source, /Native Dynamic Workflow, Agent delegation, and further subagent delegation are available/,
    `${label} managed agents must be allowed to delegate further`);
}

assert.doesNotMatch(unix, /export CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY=/,
  'Unix launcher must not publish a Claude Code tool cap');
assert.match(unix, /unset CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY/,
  'Unix launcher must clear stale caps from older GICC launches');
assert.doesNotMatch(windows, /\$env:CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY\s*=/,
  'Windows launcher must not publish a Claude Code tool cap');
assert.match(windows, /Remove-Item Env:CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY/,
  'Windows launcher must clear stale caps from older GICC launches');
assert.doesNotMatch(configuration, /GICC_MAX_(?:TOOL_USE|AGENT)_CONCURRENCY/,
  'configuration docs must not advertise removed GICC concurrency controls');
assert.doesNotMatch(compatibility, /no recursion guards|limit cooldown storms/,
  'compatibility matrix must not retain the removed Agent restrictions');
assert.match(compatibility, /native scheduler decide concurrency and further delegation without a fixed GICC Tool or Agent cap/,
  'compatibility matrix must document native model directed scheduling');

console.log('dynamic workflow policy tests passed');
