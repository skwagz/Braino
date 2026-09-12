import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIME } from '../src/brain.ts';
import { classifyByContent, structureFolder, planStructure } from '../src/structure.ts';

const file = { id: 'doc', name: 'School homework', mimeType: MIME.doc };
const drive = { async listChildren() { return [file]; }, async readText() { return 'Meeting minutes: agenda and attendees. Action items follow.'; } };

test('contents override misleading filename; evidence is from the document', async () => {
  const report = await structureFolder({ folderId: 'root', drive });
  assert.equal(report.documents[0].classification.categoryId, 'meetings');
  assert.deepEqual(report.folders[0].fileIds, ['doc']);
  assert.ok(report.documents[0].classification.evidence.length >= 2);
});

test('ambiguous, unknown, repeated and partial-word signals need review', async () => {
  for (const text of ['hello world', 'homework homework homework', 'homework assignment agenda attendees', 'examination coursework']) {
    assert.equal((await classifyByContent({ file, text })).categoryId, null);
  }
});

test('known category samples classify without an external service', async () => {
  for (const [text, category] of [
    ['Lecture homework assignment', 'school'], ['invoice payment due receipt', 'finance'],
    ['customer marketing sales', 'business'], ['travel itinerary packing list vacation', 'personal'],
  ]) assert.equal((await classifyByContent({ file, text })).categoryId, category);
});

test('move plan reuses folders and a rerun after moving is a no-op', async () => {
  const report = await structureFolder({ folderId: 'root', drive });
  const state = { sourceFolderId: 'root', folders: [{ categoryId: 'meetings' as const, fileId: 'meetings-folder' }], parents: { doc: ['nested-folder'] } };
  const plan = planStructure(report, state);
  assert.equal(plan.operations[0].kind, 'ensure-folder');
  assert.deepEqual(plan.operations[1], { kind: 'move', fileId: 'doc', destinationKey: 'root:meetings', expectedParents: ['nested-folder'], removeParents: ['nested-folder'] });
  assert.deepEqual(planStructure(report, { ...state, parents: { doc: ['meetings-folder'] } }).operations, []);
});

test('missing parents and conflicting folder state block unsafe planning', async () => {
  const report = await structureFolder({ folderId: 'root', drive });
  assert.equal(planStructure(report, { sourceFolderId: 'root', folders: [], parents: {} }).operations.length, 0);
  assert.equal(planStructure(report, { sourceFolderId: 'root', folders: [], parents: { doc: ['a', 'b'] } }).blocked.length, 1);
  assert.throws(() => planStructure(report, { sourceFolderId: 'other', folders: [], parents: {} }), /scope/);
  assert.throws(() => planStructure(report, { sourceFolderId: 'root', folders: [
    { categoryId: 'meetings', fileId: 'x' }, { categoryId: 'meetings', fileId: 'y' },
  ], parents: {} }), /duplicate/);
});

test('invalid model evidence and empty files prevent execution plans', async () => {
  const report = await structureFolder({ folderId: 'root', drive, classify: async () => ({
    categoryId: 'school', reason: 'school', evidence: ['fabricated text'], method: 'test',
  }) });
  assert.equal(report.complete, false);
  assert.equal(report.errors.length, 1);
  assert.deepEqual(planStructure(report, { sourceFolderId: 'root', folders: [], parents: {} }).operations, []);
  const empty = await structureFolder({ folderId: 'root', drive: { ...drive, async readText() { return ''; } } });
  assert.equal(empty.errors.length, 1);
});

test('unclassified documents stay in review and produce no move', async () => {
  const report = await structureFolder({ folderId: 'root', drive: { ...drive, async readText() { return 'Unclear'; } } });
  assert.deepEqual(report.review, ['doc']);
  assert.deepEqual(planStructure(report, { sourceFolderId: 'root', folders: [], parents: {} }).operations, []);
});
