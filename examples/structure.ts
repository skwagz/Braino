import { readFileSync } from 'node:fs';
import { MIME } from '../src/brain.ts';
import type { DriveFile } from '../src/brain.ts';
import { structureFolder, planStructure } from '../src/structure.ts';

const path = process.argv[2];
const records: { file: DriveFile; text?: string; error?: string }[] = path
  ? JSON.parse(readFileSync(path, 'utf8'))
  : [
    { file: { id: '1', name: 'Untitled', mimeType: MIME.doc }, text: 'Semester lecture notes. Homework assignment for the exam.' },
    { file: { id: '2', name: 'School project', mimeType: MIME.doc }, text: 'Meeting minutes: agenda, attendees and action items.' },
    { file: { id: '3', name: 'Notes', mimeType: MIME.doc }, text: 'The weather was nice today.' },
  ];
if (!records.length || new Set(records.map(r => r.file.id)).size !== records.length) throw new Error('Expected unique documents');
const report = await structureFolder({
  folderId: 'preview-root', maxFiles: records.length,
  drive: {
    async listChildren(id) {
      if (id !== 'preview-root') throw new Error('Snapshot does not include folder traversal');
      return records.map(r => r.file);
    },
    async readText(file) {
      const record = records.find(r => r.file.id === file.id)!;
      if (record.error || typeof record.text !== 'string') throw new Error(record.error ?? 'Missing text');
      return record.text;
    },
  },
});
// Actual snapshots do not prove current Drive parents. Only the built-in demo
// has known mock parents; real snapshots produce a classification preview only.
console.log(JSON.stringify({ mode: path ? 'snapshot classification preview' : 'offline demo', report,
  plan: path ? undefined : planStructure(report, { sourceFolderId: 'preview-root', folders: [],
    parents: Object.fromEntries(records.map(r => [r.file.id, ['preview-root']])) }),
}, null, 2));
