import { MIME } from '../src/brain.ts';
import { buildWiki, diffWiki } from '../src/wiki.ts';
import { writeFile } from 'node:fs/promises';

// Synthetic extraction intentionally quotes complete facts; no AI or Google calls.
const options = {
  folderId: 'demo',
  generationVersion: 'demo-v1',
  drive: {
    async listChildren() {
      return [
        { id: 'roadmap', name: 'Product roadmap', mimeType: MIME.doc },
        { id: 'budget', name: 'Launch budget', mimeType: MIME.sheet },
      ];
    },
    async readText(file: { id: string }) {
      return file.id === 'roadmap' ? 'Ada owns the October launch.' : 'October launch budget: 5000 EUR.';
    },
  },
  async extract({ text }: { text: string }) {
    return { facts: [{ text, quote: text }], topics: ['October launch'], entities: text.includes('Ada') ? ['Ada'] : [] };
  },
};

const first = await buildWiki(options);
if (!first.artifact) throw new Error('Demo wiki validation failed');
console.log('SYNTHETIC DEMO: no Google writes or AI calls. Source URLs use placeholder IDs.\n');
for (const page of first.artifact.pages) {
  console.log(`--- ${encodeURIComponent(page.key)}.md ---\n${page.markdown}`);
}
const rerun = await buildWiki(options);
if (!rerun.artifact) throw new Error('Demo rerun validation failed');
console.log('First run:');
console.table(diffWiki(first.artifact, null));
console.log('Identical rerun:');
console.table(diffWiki(rerun.artifact, first.artifact));
if (process.argv.includes('--ui')) {
  const workspace = {
    folderId: 'wiki-demo',
    sources: first.artifact.sources.map(source => ({
      id: source.id, name: source.name, kind: source.id === 'budget' ? 'sheet' : 'document',
      currentPath: 'Example dataset', destination: 'Example dataset',
      reason: source.facts.map(f => f.text).join(' '), modified: 'Synthetic sample',
    })),
    pages: first.artifact.pages.map(page => {
      const sourceIds = first.report.pages.find(p => p.key === page.key)!.sources.map(s => s.id);
      return { id: page.key, title: page.title,
        summary: page.key === 'index' ? 'Example roadmap and launch budget' : `Source-backed notes about ${page.title}`,
        sourceIds, evidence: first.artifact!.sources.filter(s => sourceIds.includes(s.id)),
        relatedIds: page.key === 'index' ? first.report.pages[0].links : ['index', ...first.report.pages.find(p => p.key === page.key)!.links],
      };
    }),
    activity: [],
  };
  await writeFile(new URL('../apps/dashboard/public/wiki-demo.json', import.meta.url), JSON.stringify(workspace, null, 2) + '\n');
  console.log('Updated dashboard example wiki.');
}
