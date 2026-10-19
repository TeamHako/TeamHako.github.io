#!/usr/bin/env node
// build-box.mjs: encrypt the packaging viewer's artwork for hakoshop.com/box/
//
//   BOX_PASSWORD='…' node tools/build-box.mjs <source-dir>
//
// <source-dir> holds manifest.json and the tex/ files it names (kept out of
// this public repo). Every file is encrypted with AES-256-GCM under a key
// derived from the password (PBKDF2-SHA256), written to box/d/<random>.bin,
// and listed in an encrypted index. box/meta.json holds only the salt, the
// iteration count and the index's file name, so without the password the
// repo shows nothing but noise. The page (box/index.html) decrypts in the
// browser. Re-run to change the password or the artwork.
import { webcrypto as crypto } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(SITE, 'box');
const ITERATIONS = 250000;
const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

const src = process.argv[2];
const password = process.env.BOX_PASSWORD;
if (!src || !password) {
  console.error("usage: BOX_PASSWORD='…' node tools/build-box.mjs <source-dir>");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(src, 'manifest.json'), 'utf8'));
const paths = new Set();
(function walk(v) {
  if (typeof v === 'string') { if (v.startsWith('tex/')) paths.add(v); }
  else if (Array.isArray(v)) v.forEach(walk);
  else if (v && typeof v === 'object') Object.values(v).forEach(walk);
})(manifest);

const hex = n => Buffer.from(crypto.getRandomValues(new Uint8Array(n))).toString('hex');
const salt = crypto.getRandomValues(new Uint8Array(16));
const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
  base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);

async function seal(bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv); out.set(ct, 12);
  return out;
}

if (existsSync(join(OUT, 'd'))) rmSync(join(OUT, 'd'), { recursive: true });
mkdirSync(join(OUT, 'd'), { recursive: true });

const files = {};
for (const p of [...paths].sort()) {
  const type = TYPES[extname(p).toLowerCase()];
  if (!type) throw new Error('unknown file type: ' + p);
  const id = hex(12);
  writeFileSync(join(OUT, 'd', id + '.bin'), await seal(readFileSync(join(src, p))));
  files[p] = { id, type };
}
const indexId = hex(12);
writeFileSync(join(OUT, 'd', indexId + '.bin'),
  await seal(new TextEncoder().encode(JSON.stringify({ manifest, files }))));
writeFileSync(join(OUT, 'meta.json'), JSON.stringify({
  v: 1, iterations: ITERATIONS, salt: Buffer.from(salt).toString('base64'), index: indexId
}, null, 2) + '\n');
console.log(`encrypted ${paths.size} files + index into box/d/`);
