#!/usr/bin/env node
// build-plan.mjs: encrypt the road-to-launch plan for hakoshop.com/plan/
//
//   PLAN_PASSWORD='…' node tools/build-plan.mjs <plan.json>
//
// plan.json lives in the private hako repo (planning/plan.json). It is
// encrypted with AES-256-GCM under a key derived from the password
// (PBKDF2-SHA256), into plan/vault.json, so this public repo only holds
// ciphertext; plan/index.html decrypts it in the browser. Re-run after
// editing the plan or to change the password.
import { webcrypto as crypto } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const ITERATIONS = 250000;
const src = process.argv[2];
const password = process.env.PLAN_PASSWORD;
if (!src || !password) {
  console.error("usage: PLAN_PASSWORD='…' node tools/build-plan.mjs <plan.json>");
  process.exit(1);
}
const plain = readFileSync(src);
JSON.parse(plain);                                   // refuse to encrypt a broken plan
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
  base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
const b64 = u => Buffer.from(u).toString('base64');
mkdirSync(join(SITE, 'plan'), { recursive: true });
writeFileSync(join(SITE, 'plan', 'vault.json'),
  JSON.stringify({ v: 1, iterations: ITERATIONS, salt: b64(salt), iv: b64(iv), data: b64(data) }) + '\n');
console.log(`encrypted ${plain.length} bytes into plan/vault.json`);
