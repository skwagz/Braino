import test from 'node:test';
import assert from 'node:assert/strict';
import { MIME } from '../src/brain.ts';
import { buildWiki, diffWiki, validateExtraction } from '../src/wiki.ts';

function fixture(text = 'Launch is planned for June.') {
  return { folderId: 'root', generationVersion: 'fixture-v1',
    drive: {
      listChildren: async () => [{ id: 'doc1', name: 'Project notes', mimeType: MIME.doc }],
      readText: async () => text,
    },
    extract: async () => ({ facts: [{ text, quote: text }], topics: ['Launch'], entities: [] }),
  };
}

test('wiki produces stable linked evidence and unchanged reruns', async () => {
  const first = (await buildWiki(fixture())).artifact!;
  const second = (await buildWiki(fixture())).artifact!;
  assert.deepEqual(second, first);
  assert.equal(first.pages.length, 2);
  assert.match(first.pages[0].markdown, /Evidence: "Launch is planned for June\."/);
  assert.match(first.pages[0].markdown, /topic%3Alaunch.md/);
  assert.match(first.pages[1].markdown, /\[Index\]\(index.md\)/);
  assert.ok(diffWiki(first, null).every(p => p.action === 'create'));
  assert.ok(diffWiki(second, first).every(p => p.action === 'unchanged'));
});

test('source edits update dependent content and hashes', async () => {
  const first = (await buildWiki(fixture())).artifact!;
  const second = (await buildWiki(fixture('Launch is planned for July.'))).artifact!;
  assert.notEqual(first.sources[0].contentHash, second.sources[0].contentHash);
  assert.ok(diffWiki(second, first).every(p => p.action === 'update'));
  assert.throws(() => diffWiki({ ...second, folderId: 'other' }, first), /folder mismatch/);
});

test('invalid evidence and incomplete or empty scans never yield publishable artifacts', async () => {
  const input = fixture();
  assert.throws(() => validateExtraction({ facts: [{ text: 'Wrong', quote: 'Not in source' }], topics: [], entities: [] }, 'Source'), /exact source excerpt/);
  const invalid = await buildWiki({ ...input, extract: async () => ({ facts: [], topics: [], entities: [] }) });
  assert.equal(invalid.artifact, null);
  assert.equal(invalid.report.complete, false);
  const empty = await buildWiki({ ...input, drive: { ...input.drive, listChildren: async () => [] } });
  assert.equal(empty.artifact, null);
  const failed = await buildWiki({ ...input, drive: { ...input.drive, readText: async () => { throw new Error('Unavailable'); } } });
  assert.equal(failed.artifact, null);
});
