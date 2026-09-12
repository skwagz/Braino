import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDrive } from '../src/drive.ts';
import { MIME } from '../src/brain.ts';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
test('Drive adapter follows pagination and sends authorization', async () => {
  const requests: URL[] = [];
  const drive = createDrive({ accessToken: () => 'test-token', fetch: async (input, init) => {
    const url = new URL(String(input)); requests.push(url);
    assert.equal((init!.headers as Record<string, string>).Authorization, 'Bearer test-token');
    return url.searchParams.has('pageToken') ? json({ files: [{ id: 'b' }] }) : json({ files: [{ id: 'a' }], nextPageToken: 'next' });
  }});
  assert.deepEqual((await drive.listChildren('root')).map(f => f.id), ['a', 'b']);
  assert.equal(requests[1].searchParams.get('pageToken'), 'next');
  assert.match(requests[0].searchParams.get('q')!, /trashed = false/);
});

test('reads Docs text and all grid worksheets, including escaped tab names', async () => {
  const ranges: string[] = [];
  const drive = createDrive({ accessToken: () => 'test', fetch: async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/export')) return new Response('Document body');
    if (!url.pathname.includes('/values/')) return json({ sheets: [
      { properties: { title: 'First', sheetType: 'GRID' } },
      { properties: { title: "Team's notes", sheetType: 'GRID' } },
    ] });
    ranges.push(decodeURIComponent(url.pathname.split('/values/')[1]));
    return json({ values: [['Homework', 'assignment']] });
  }});
  assert.equal(await drive.readText({ id: 'doc', name: 'Doc', mimeType: MIME.doc }), 'Document body');
  const text = await drive.readText({ id: 'sheet', name: 'Sheet', mimeType: MIME.sheet });
  assert.deepEqual(ranges, ["'First'", "'Team''s notes'"]);
  assert.match(text, /Worksheet: Team's notes/);
});

test('reuses an existing category folder and rejects duplicates', async () => {
  let count = 1;
  const drive = createDrive({ accessToken: () => 'test', fetch: async () => json({ files: Array.from({ length: count }, (_, i) => ({
    id: `folder-${i}`, mimeType: MIME.folder, appProperties: { brainoCategory: 'school', brainoSourceFolder: 'root' },
  })) }) });
  assert.equal(await drive.ensureCategory('root', 'school'), 'folder-0');
  count = 2;
  await assert.rejects(drive.ensureCategory('root', 'school'), /Duplicate/);
});

test('move uses verified parent parameters and checks result', async () => {
  let patches = 0;
  const drive = createDrive({ accessToken: () => 'test', fetch: async (input, init) => {
    const url = new URL(String(input));
    if (init?.method === 'PATCH') {
      patches++;
      assert.equal(url.searchParams.get('addParents'), 'new');
      assert.equal(url.searchParams.get('removeParents'), 'old');
      return json({ id: 'doc' });
    }
    return json({ id: 'doc', version: '2', parents: ['new'] });
  }});
  await drive.move('doc', 'new', 'old');
  assert.equal(patches, 1);
});

test('authorization errors are redacted and writes are never retried automatically', async () => {
  let calls = 0;
  const drive = createDrive({ accessToken: () => 'secret', fetch: async () => { calls++; return json({ token: 'secret' }, 403); } });
  await assert.rejects(drive.move('doc', 'new', 'old'), error => {
    assert.ok(error instanceof Error); assert.match(error.message, /403/); assert.ok(!error.message.includes('secret')); return true;
  });
  assert.equal(calls, 1);
});
