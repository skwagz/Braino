import { MIME, scanAndSort, planWrites } from '../src/brain.ts';

// Fixtures demonstrate orchestration; this is not an LLM implementation.
const report = await scanAndSort({
  folderId: 'demo',
  drive: {
    async listChildren() {
      return [
        { id: 'roadmap', name: 'Product roadmap', mimeType: MIME.doc },
        { id: 'budget', name: 'Launch budget', mimeType: MIME.sheet },
      ];
    },
    async readText(file) {
      return file.id === 'roadmap' ? 'Ada owns the October launch.' : 'October launch budget: 5000 EUR.';
    },
  },
  async extract({ text }) {
    return { summary: text, topics: ['October launch'], entities: text.includes('Ada') ? ['Ada'] : [] };
  },
});
console.log(JSON.stringify({ report, writes: planWrites(report, []) }, null, 2));
