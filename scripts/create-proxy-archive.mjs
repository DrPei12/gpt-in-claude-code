#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { deflateRawSync, gzipSync } from 'node:zlib';

const [, , format, inputArgument, outputArgument] = process.argv;
if (!['tar.gz', 'zip'].includes(format) || !inputArgument || !outputArgument || process.argv.length !== 5) {
  console.error('Usage: create-proxy-archive.mjs <tar.gz|zip> <input-binary> <output-archive>');
  process.exit(2);
}

const input = resolve(inputArgument);
const output = resolve(outputArgument);
const entryName = format === 'zip' ? 'gicc-proxy.exe' : 'gicc-proxy';
const data = readFileSync(input);
const fixedMtime = 946684800;

if (!/^gicc-proxy_7\.2\.91-gicc\.1_(?:windows|linux|darwin)_(?:amd64|aarch64)(?:\.exe)?$/.test(basename(input))) {
  throw new Error(`unexpected proxy binary name: ${basename(input)}`);
}
if (data.length < 1024 * 1024 || data.length > 200 * 1024 * 1024) {
  throw new Error(`unexpected proxy binary size: ${data.length}`);
}

function writeString(target, offset, length, value) {
  const encoded = Buffer.from(value, 'utf8');
  if (encoded.length > length) throw new Error(`archive header value is too long: ${value}`);
  encoded.copy(target, offset);
}

function writeOctal(target, offset, length, value) {
  const encoded = value.toString(8).padStart(length - 1, '0');
  if (encoded.length !== length - 1) throw new Error(`archive numeric value is too large: ${value}`);
  writeString(target, offset, length, `${encoded}\0`);
}

function createTar() {
  const header = Buffer.alloc(512);
  writeString(header, 0, 100, entryName);
  writeOctal(header, 100, 8, 0o755);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, data.length);
  writeOctal(header, 136, 12, fixedMtime);
  header.fill(0x20, 148, 156);
  header[156] = 0x30;
  writeString(header, 257, 6, 'ustar\0');
  writeString(header, 263, 2, '00');
  writeString(header, 265, 32, 'root');
  writeString(header, 297, 32, 'root');
  writeOctal(header, 329, 8, 0);
  writeOctal(header, 337, 8, 0);
  const checksum = header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0');
  writeString(header, 148, 8, `${checksum}\0 `);
  const padding = Buffer.alloc((512 - (data.length % 512)) % 512);
  return Buffer.concat([header, data, padding, Buffer.alloc(1024)]);
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  return crc >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip() {
  const name = Buffer.from(entryName, 'utf8');
  const compressed = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const dosDate = ((2000 - 1980) << 9) | (1 << 5) | 1;

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(0, 10);
  local.writeUInt16LE(dosDate, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(0x0314, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(dosDate, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(((0o100755 << 16) >>> 0), 38);
  central.writeUInt32LE(0, 42);

  const centralOffset = local.length + name.length + compressed.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([local, name, compressed, central, name, end]);
}

if (format === 'tar.gz') {
  writeFileSync(output, gzipSync(createTar(), { level: 9, mtime: 0 }));
} else {
  writeFileSync(output, createZip());
}
