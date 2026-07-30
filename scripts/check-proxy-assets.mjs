#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetRoot = resolve(process.argv[2] || join(root, 'dist', 'proxy-assets'));
const manifest = JSON.parse(readFileSync(join(root, 'proxy', 'manifest.json'), 'utf8'));
const failures = [];

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

for (const [name, expected] of Object.entries(manifest.assets)) {
  const path = join(assetRoot, name);
  if (!existsSync(path)) {
    failures.push(`missing proxy asset: ${name}`);
    continue;
  }
  const actual = sha256(path);
  if (actual !== expected) failures.push(`proxy asset checksum mismatch: ${name}`);
}

if (existsSync(assetRoot)) {
  const unexpected = readdirSync(assetRoot)
    .filter((name) => name.startsWith('gicc-proxy_')
      && /\.(?:zip|tar\.gz)$/.test(name)
      && !Object.hasOwn(manifest.assets, name));
  for (const name of unexpected) failures.push(`unexpected proxy asset: ${name}`);
}

const installerText = [readFileSync(join(root, 'install.sh'), 'utf8'), readFileSync(join(root, 'install.ps1'), 'utf8')].join('\n');
if (!installerText.includes(manifest.bridgeVersion)) failures.push('installers do not reference the manifest bridge version');
if (!installerText.includes(manifest.releaseTag)) failures.push('installers do not reference the manifest release tag');
for (const digest of Object.values(manifest.assets)) {
  if (!installerText.includes(digest)) failures.push(`installers do not pin proxy digest: ${digest}`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`verified ${Object.keys(manifest.assets).length} proxy assets against proxy/manifest.json`);
