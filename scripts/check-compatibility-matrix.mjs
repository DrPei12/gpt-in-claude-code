#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = resolve(root, 'docs/compatibility-matrix.json');
const documentationPath = resolve(root, 'docs/claude-code-compatibility.md');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const documentation = readFileSync(documentationPath, 'utf8');
const unixLauncher = readFileSync(resolve(root, 'gicc'), 'utf8');
const windowsLauncher = readFileSync(resolve(root, 'gicc.ps1'), 'utf8');
const unixTests = readFileSync(resolve(root, 'test.zsh'), 'utf8');
const windowsTests = readFileSync(resolve(root, 'test.ps1'), 'utf8');
const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

assert.equal(manifest.schema, 1, 'compatibility manifest schema');

const expectedClassifications = [
  'native',
  'translated',
  'pass-through',
  'first-party-only',
  'not-portable',
];
const classificationIds = manifest.classifications.map(({ id }) => id);
assert.deepEqual(classificationIds, expectedClassifications, 'classification IDs and order');

const classificationLabels = new Map();
for (const classification of manifest.classifications) {
  assert.match(classification.id, /^[a-z]+(?:-[a-z]+)*$/, `classification ID ${classification.id}`);
  assert.match(classification.label, /^[A-Z][A-Za-z ]+$/, `classification label ${classification.id}`);
  assert(!classificationLabels.has(classification.id), `duplicate classification ${classification.id}`);
  classificationLabels.set(classification.id, classification.label);
  assert(documentation.includes(`| **${classification.label}** |`), `classification is documented: ${classification.label}`);
}

assert(Array.isArray(manifest.surfaces) && manifest.surfaces.length >= 15, 'capability surfaces are present');
const surfaceIds = new Set();
for (const surface of manifest.surfaces) {
  assert.match(surface.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `surface ID ${surface.id}`);
  assert(!surfaceIds.has(surface.id), `duplicate surface ${surface.id}`);
  surfaceIds.add(surface.id);
  assert(typeof surface.label === 'string' && surface.label.length > 0, `surface label ${surface.id}`);
  assert(Array.isArray(surface.classifications) && surface.classifications.length > 0, `surface classifications ${surface.id}`);
  assert.equal(new Set(surface.classifications).size, surface.classifications.length, `unique classifications ${surface.id}`);

  const row = documentation.split('\n').find((line) => line.startsWith(`| ${surface.label} |`));
  assert(row, `documented matrix row ${surface.label}`);
  for (const status of surface.classifications) {
    const label = classificationLabels.get(status);
    assert(label, `known classification ${status}`);
    assert(new RegExp(`\\*\\*${escapePattern(label)}\\*\\*`, 'i').test(row), `${surface.label} documents ${label}`);
  }
}

assert.deepEqual(manifest.workflowScheduling, {
  owner: 'claude-code-and-model',
  fixedToolLimit: false,
  fixedAgentLimit: false,
  capabilities: [
    'Dynamic Workflow',
    'Ultrareview',
    'nested subagent delegation',
    'Agent Teams',
  ],
}, 'workflow scheduling remains native and uncapped by GICC');
assert(documentation.includes('without a fixed GICC Tool or Agent cap'), 'uncapped workflow contract is documented');
assert(documentation.includes("the model and Claude Code's native scheduler decide concurrency and further delegation"), 'native scheduler ownership is documented');

assert(Array.isArray(manifest.passThroughArguments) && manifest.passThroughArguments.length > 0, 'pass through arguments are present');
assert.equal(new Set(manifest.passThroughArguments).size, manifest.passThroughArguments.length, 'pass through arguments are unique');
for (const option of manifest.passThroughArguments) {
  assert.match(option, /^--[a-z][a-z0-9-]*$/, `pass through option ${option}`);
  assert(documentation.includes(`\`${option}\``), `pass through option is documented: ${option}`);
  assert(unixLauncher.includes(option), `Unix launcher classifies ${option}`);
  assert(unixTests.includes(option), `Unix launcher regression covers ${option}`);
  assert(windowsTests.includes(option), `Windows launcher regression covers ${option}`);
}
assert(windowsLauncher.includes('GICC-only options are a leading prefix. Preserve all tokens'), 'Windows launcher preserves the generic pass through contract');

console.log(`${manifest.surfaces.length} compatibility surfaces and ${manifest.passThroughArguments.length} pass through arguments verified`);
