import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIME, scanAndSort, planWrites } from '../src/brain.ts';

const doc = (id: string) => ({ id, name: id, mimeType: MIME.doc });
const extract = async () => ({ summary: 'Evidence', topics: [' Launch ', 'launch'], entities: ['Ada'] });

test('walks nested folders, deduplicates sources, excludes output and reports unsupported files', async () => {
  const read: string[] = [];
  const result = await scanAndSort({ folderId: 'root', extract, drive: {
    async listChildren(id) {
      return id === 'root' ? [doc('a'), { id: 'nested', name: 'Nested', mimeType: MIME.folder },
        { id: 'out', name: 'Braino', mimeType: MIME.folder },
        { id: 'pdf', name: 'Notes.pdf', mimeType: 'application/pdf' }] : [doc('a'), doc('b')];
    },
    async readText(file) { read.push(file.id); return 'Source text'; },
  }});
  assert.deepEqual(read, ['a', 'b']);
  assert.equal(result.complete, true);
  assert.equal(result.skipped.length, 2);
  assert.equal(result.pages.length, 3);
  const topic = result.pages.find(p => p.kind === 'topic')!;
  assert.equal(topic.sources.length, 2);
  assert.deepEqual(topic.links, ['entity:ada']);
  assert.ok(topic.sources.every(s => s.url.includes(s.id)));
  const existing = result.pages.map((p, i) => ({ key: p.key, fileId: `output-${i}` }));
  assert.ok(planWrites(result, existing).every(p => p.action === 'update'));
});

test('counts failed files toward cap and blocks writes after incomplete runs', async () => {
  let calls = 0;
  const result = await scanAndSort({ folderId: 'root', maxFiles: 1, extract, drive: {
    async listChildren() { return [doc('b'), doc('a')]; },
    async readText() { calls++; throw new Error('Access denied'); },
  }});
  assert.equal(calls, 1);
  assert.equal(result.errors[0].fileId, 'a');
  assert.equal(result.skipped[0].reason, 'File limit reached');
  assert.deepEqual(planWrites(result, []), []);
});

test('handles folder cycles and malformed extraction without publishing', async () => {
  const result = await scanAndSort({ folderId: 'root', extract: async () => null as never, drive: {
    async listChildren() { return [doc('a'), { id: 'root', name: 'Root', mimeType: MIME.folder }]; },
    async readText() { return 'text'; },
  }});
  assert.equal(result.errors.length, 1);
  assert.equal(result.complete, false);
  assert.deepEqual(planWrites(result, []), []);
});

test('folder failure and oversized content are reported, not silently truncated', async () => {
  const result = await scanAndSort({ folderId: 'root', maxTextChars: 2, extract, drive: {
    async listChildren(id) {
      if (id !== 'root') throw new Error('Folder unavailable');
      return [doc('a'), { id: 'nested', name: 'Nested', mimeType: MIME.folder }];
    },
    async readText() { return 'too long'; },
  }});
  assert.equal(result.errors.length, 2);
  assert.deepEqual(planWrites(result, []), []);
});
