import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(import.meta.dirname, '../src/app/opengraph-image.tsx'), 'utf8');

test('Open Graph brand container uses an explicit flex layout for mixed text and nested span', () => {
  assert.match(source, /<div style=\{\{\s*display:\s*"flex",\s*alignItems:\s*"baseline",[^}]*\}\}>mbio<span/);
});

test('Open Graph preview has valid dimensions and maintains mbioTraders brand', () => {
  assert.match(source, /export const size = \{ width: 1200, height: 630 \}/);
  assert.match(source, /export const contentType = "image\/png"/);
  assert.match(source, /<span style=\{\{ color: "#27e3a4" \}\}>Traders<\/span>/);
});
