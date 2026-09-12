import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { scanAndSort, planWrites } from '../src/brain.ts';
import type { DriveFile } from '../src/brain.ts';

// Replay text retrieved by the Codex Drive connector. This is neither a live
// Drive API adapter nor an LLM extractor. The virtual root is a selected corpus,
// not an assertion about actual Drive folder membership or traversal.
const input = process.argv[2];
if (!input) throw new Error('Usage: node examples/connector-scan.ts <connector-snapshot.json>');
const records: { file: DriveFile; text?: string; error?: string }[] = JSON.parse(readFileSync(input, 'utf8'));
assert.ok(records.length > 0, 'Snapshot must contain documents');
assert.equal(new Set(records.map(r => r.file.id)).size, records.length);
const extracted = new Set<string>();
const report = await scanAndSort({
  folderId: 'connector-selected-corpus',
  maxFiles: records.length,
  drive: {
    async listChildren(id) {
      assert.equal(id, 'connector-selected-corpus');
      return records.map(r => r.file);
    },
    async readText(file) {
      const record = records.find(r => r.file.id === file.id)!;
      if (record.error) throw new Error(record.error);
      assert.equal(typeof record.text, 'string');
      return record.text!;
    },
  },
  async extract({ file, text }) {
    assert.equal(text, records.find(r => r.file.id === file.id)!.text);
    extracted.add(file.id);
    // Deliberately mechanical: exercises grouping without claiming semantics.
    return { summary: `Connector text: ${text.length} characters`, topics: ['Connector smoke test'], entities: [] };
  },
});
const eligible = records.filter(r => !r.error && r.text?.trim() && r.text.length <= 100_000);
assert.equal(report.sources.length, eligible.length);
assert.equal(extracted.size, eligible.length);
assert.equal(report.errors.length, records.length - eligible.length);
assert.equal(report.complete, eligible.length === records.length);
assert.equal(planWrites(report, []).length, report.complete ? report.pages.length : 0);
assert.ok(report.sources.every(s => s.url.includes(encodeURIComponent(s.id))));
console.log(JSON.stringify({
  mode: 'connector snapshot replay; mechanical extraction; no Drive writes',
  discovered: records.length,
  retrieved: records.filter(r => typeof r.text === 'string').length,
  extracted: extracted.size,
  report,
  plannedWrites: planWrites(report, []).length,
  documents: records.map(r => ({
    ...r.file, characters: r.text?.length,
    sha256: r.text === undefined ? undefined : createHash('sha256').update(r.text).digest('hex'),
    readError: r.error,
  })),
}, null, 2));
