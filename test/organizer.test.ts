import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIME } from '../src/brain.ts';
import type { Metadata, OrganizingDrive } from '../src/drive.ts';
import { previewOrganization, applyOrganization } from '../src/organizer.ts';

function fixture() {
  const files = new Map<string, Metadata>([
    ['root', { id: 'root', name: 'Test', mimeType: MIME.folder, version: '1' }],
    ['doc', { id: 'doc', name: 'Untitled', mimeType: MIME.doc, version: '1', parents: ['root'] }],
  ]);
  const mutations: string[] = [];
  const drive: OrganizingDrive = {
    async metadata(id) { const file = files.get(id); if (!file) throw new Error('Missing'); return structuredClone(file); },
    async listChildren(id) { return [...files.values()].filter(f => f.parents?.includes(id)).map(f => structuredClone(f)); },
    async readText() { return 'Homework assignment lecture exam'; },
    async ensureCategory(root, category) {
      if (!files.has(category)) {
        mutations.push('create');
        files.set(category, { id: category, name: category, mimeType: MIME.folder, version: '1', parents: [root],
          appProperties: { brainoCategory: category, brainoSourceFolder: root } });
      }
      return category;
    },
    async move(id, destination) {
      mutations.push('move');
      const file = files.get(id)!;
      file.parents = [destination]; file.version = String(Number(file.version) + 1);
    },
  };
  return { drive, files, mutations };
}

test('preview is read-only; apply creates and moves; fresh rerun makes no changes', async () => {
  const { drive, mutations, files } = fixture();
  const preview = await previewOrganization({ folderId: 'root', drive });
  assert.deepEqual(mutations, []);
  const events: string[] = [];
  assert.deepEqual(await applyOrganization(preview, drive, async e => { events.push(e.type); }), { moved: 1 });
  assert.deepEqual(files.get('doc')!.parents, ['school']);
  assert.deepEqual(events, ['started', 'folder-ready', 'move-started', 'moved', 'complete']);
  const again = await previewOrganization({ folderId: 'root', drive });
  assert.deepEqual(await applyOrganization(again, drive, async () => {}), { moved: 0 });
  assert.deepEqual(mutations, ['create', 'move']);
});

test('stale content or moved parent blocks before any writes', async () => {
  for (const field of ['version', 'parents']) {
    const { drive, files, mutations } = fixture();
    const preview = await previewOrganization({ folderId: 'root', drive });
    if (field === 'version') files.get('doc')!.version = '2';
    else files.get('doc')!.parents = ['elsewhere'];
    await assert.rejects(applyOrganization(preview, drive, async () => {}), /changed/);
    assert.deepEqual(mutations, []);
  }
});

test('document changed during export makes scan incomplete', async () => {
  const { drive, files } = fixture();
  drive.readText = async () => { files.get('doc')!.version = '2'; return 'Homework lecture exam'; };
  const preview = await previewOrganization({ folderId: 'root', drive });
  assert.equal(preview.report.complete, false);
  await assert.rejects(applyOrganization(preview, drive, async () => {}), /incomplete/);
});

test('journal failure stops before mutations and source ancestry is checked', async () => {
  const { drive, mutations } = fixture();
  const preview = await previewOrganization({ folderId: 'root', drive });
  await assert.rejects(applyOrganization(preview, drive, async () => { throw new Error('Disk full'); }), /Disk full/);
  assert.deepEqual(mutations, []);
});

test('changed ancestor blocks even when document metadata has not changed', async () => {
  const { drive, files, mutations } = fixture();
  files.set('nested', { id: 'nested', name: 'Nested', mimeType: MIME.folder, version: '1', parents: ['root'] });
  files.get('doc')!.parents = ['nested'];
  const preview = await previewOrganization({ folderId: 'root', drive });
  files.get('nested')!.parents = [];
  await assert.rejects(applyOrganization(preview, drive, async () => {}), /ancestry/);
  assert.deepEqual(mutations, []);
});

test('failed move has a started event but no success event', async () => {
  const { drive } = fixture();
  const preview = await previewOrganization({ folderId: 'root', drive });
  drive.move = async () => { throw new Error('Network interrupted'); };
  const events: string[] = [];
  await assert.rejects(applyOrganization(preview, drive, async e => { events.push(e.type); }), /Network interrupted/);
  assert.equal(events.at(-1), 'move-started');
  assert.ok(!events.includes('complete'));
});
