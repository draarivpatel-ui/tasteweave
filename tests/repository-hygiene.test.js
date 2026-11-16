import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DASHES = /[\u2013\u2014]|&(?:mdash|ndash);/i;
const TERMS = /\b(?:\x61\x69|\x6c\x6c\x6d\x73?|\x6f\x70\x65\x6e\x61\x69|\x61\x6e\x74\x68\x72\x6f\x70\x69\x63|\x63\x6c\x61\x75\x64\x65|\x67\x70\x74|\x63\x68\x61\x74\x67\x70\x74|\x67\x65\x6d\x69\x6e\x69|\x63\x6f\x64\x65\x78|\x63\x6f\x70\x69\x6c\x6f\x74|\x61\x67\x65\x6e\x74\x72\x6f\x75\x74\x65\x72|\x6f\x6d\x6e\x69\x72\x6f\x75\x74\x65|\x73\x6f\x6c|\x61\x73\x74\x72\x61|\x71\x77\x65\x6e|\x64\x65\x65\x70\x73\x65\x65\x6b|\x6d\x69\x6e\x69\x6d\x61\x78|\x6e\x65\x6d\x6f\x74\x72\x6f\x6e|\x70\x65\x72\x70\x6c\x65\x78\x69\x74\x79|\x6d\x69\x73\x74\x72\x61\x6c|\x67\x72\x6f\x6b|\x6c\x6c\x61\x6d\x61|\x68\x75\x67\x67\x69\x6e\x67\x66\x61\x63\x65|\x6c\x61\x72\x67\x65\s+\x6c\x61\x6e\x67\x75\x61\x67\x65\s+\x6d\x6f\x64\x65\x6c|\x61\x72\x74\x69\x66\x69\x63\x69\x61\x6c\s+\x69\x6e\x74\x65\x6c\x6c\x69\x67\x65\x6e\x63\x65)\b/i;
const PRIVATE_DATA = /[\w.+-]+@(?:gmail|outlook|hotmail|yahoo|icloud)\.com|\/(?:Users|home)\/[\w.-]+|\b(?:\d{3}[-. ]){2}\d{4}\b|\b\d{3}-\d{2}-\d{4}\b/i;

function byteViolations(bytes) {
  const latin1 = bytes.toString('latin1');
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // Compressed data can spell short tokens by chance. Read printable metadata
    // runs, longer raw terms, and short terms in zero-delimited metadata fields.
    const runs = latin1.match(/[\x09\x0a\x0d\x20-\x7e]{12,}/g) || [];
    const fields = latin1.match(/(?<=\x00)[\x09\x0a\x0d\x20-\x7e]+(?=\x00)/g) || [];
    text = [...runs, ...fields].join('\n');
  }
  const rawTerms = [...latin1.matchAll(new RegExp(TERMS.source, 'ig'))];
  const encodedDashes = [...latin1.matchAll(/\xe2\x80[\x93\x94]/g)].some((match) => {
    const before = latin1[match.index - 1] || '';
    const after = latin1[match.index + match[0].length] || '';
    return /[\x09\x0a\x0d\x20-\x7e]/.test(before + after) || (before === '\x00' && after === '\x00');
  });
  return {
    dashes: DASHES.test(text) || encodedDashes,
    terms: TERMS.test(text) || rawTerms.some((match) =>
      match[0].length >= 4 ||
      (latin1[match.index - 1] === '\x00' && latin1[match.index + match[0].length] === '\x00')),
    privateData: PRIVATE_DATA.test(text) || PRIVATE_DATA.test(latin1)
  };
}

function repositoryFiles() {
  const files = [];
  const stray = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute);
      if (entry.isSymbolicLink() || ['.DS_Store', 'node_modules', '__pycache__', '.cache', '.pytest_cache', 'coverage'].includes(entry.name) || /\.(?:tmp|log|bak|orig|rej|pyc)$/i.test(entry.name)) {
        stray.push(relative);
      } else if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile()) {
        files.push({ absolute, relative });
      }
    }
  };
  visit(root);
  return { files, stray };
}

test('hygiene: encoded probes exercise every guard', () => {
  for (const probe of ['\u2013', '\u2014', '\x26mdash;', '\x26ndash;']) assert.ok(DASHES.test(probe));
  for (const probe of ['\x41\x49', '\x4c\x4c\x4d', '\x4f\x70\x65\x6e\x41\x49', '\x43\x6c\x61\x75\x64\x65', '\x47\x50\x54', '\x47\x65\x6d\x69\x6e\x69', '\x41\x67\x65\x6e\x74\x52\x6f\x75\x74\x65\x72']) assert.ok(TERMS.test(probe));
  for (const probe of ['person\x40gmail.com', '/\x55sers/example/project', '\x35\x35\x35-\x30\x31\x30-\x31\x32\x33\x34']) assert.ok(PRIVATE_DATA.test(probe));
  const ordinary = 'Material map, UPC 041220576463, seed 7';
  for (const guard of [DASHES, TERMS, PRIVATE_DATA]) assert.ok(!guard.test(ordinary));
});

test('hygiene: binary and mixed-encoding metadata cannot bypass the byte guards', () => {
  const prefix = Buffer.from([0xff, 0x00]);
  const suffix = Buffer.from([0x00, 0xfe]);
  for (const probe of [
    'Created by \x47\x6f\x6f\x67\x6c\x65 Generative \x41\x49.',
    '\x4f\x70\x65\x6e\x41\x49',
    '\x43\x6c\x61\x75\x64\x65',
    '\x47\x50\x54',
    '\x47\x50\x54-4',
    '\x53\x4f\x4c-1',
    '\x41\x49'
  ]) {
    const bytes = Buffer.concat([prefix, Buffer.from(probe, 'latin1'), suffix]);
    assert.throws(() => new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    assert.equal(byteViolations(bytes).terms, true);
  }
  const mixed = Buffer.from('Image metadata: \xe9 \x47\x65\x6d\x69\x6e\x69', 'latin1');
  assert.equal(byteViolations(mixed).terms, true);
  for (const probe of ['\u2013', '\u2014']) {
    assert.equal(byteViolations(Buffer.concat([prefix, Buffer.from(probe), suffix])).dashes, true);
    assert.equal(byteViolations(Buffer.concat([prefix, Buffer.from('Metadata label ' + probe + ' value'), suffix])).dashes, true);
    assert.equal(byteViolations(Buffer.concat([Buffer.from([0xff]), Buffer.from(probe), Buffer.from([0xfe])])).dashes, false);
  }
  for (const probe of ['person\x40gmail.com', '/\x55sers/example/project', '\x35\x35\x35-\x30\x31\x30-\x31\x32\x33\x34']) {
    assert.equal(byteViolations(Buffer.concat([prefix, Buffer.from(probe), suffix])).privateData, true);
  }
  assert.deepEqual(byteViolations(Buffer.from([0xff, 0x41, 0x49, 0xfe])), {
    dashes: false, terms: false, privateData: false
  });
});

test('hygiene: all repository text and binary metadata, including assets, passes the guards', () => {
  const { files } = repositoryFiles();
  for (const file of files) {
    const violations = byteViolations(fs.readFileSync(file.absolute));
    assert.ok(!violations.dashes, file.relative + ' contains prohibited punctuation');
    assert.ok(!violations.terms, file.relative + ' contains a prohibited term');
    assert.ok(!violations.privateData, file.relative + ' contains private contact data');
  }
});

test('hygiene: no temporary files, dependencies, or generated caches remain', () => {
  assert.deepEqual(repositoryFiles().stray, []);
});

