import { createHash } from 'node:crypto';
import { scanAndSort } from './brain.ts';
import type { DriveFile, DriveReader } from './brain.ts';

export interface EvidenceFact { text: string; quote: string }
export interface WikiExtraction {
  facts: EvidenceFact[];
  topics: string[];
  entities: string[];
}
export interface WikiSource {
  id: string;
  name: string;
  contentHash: string;
  facts: EvidenceFact[];
}
export interface WikiArtifact {
  schemaVersion: 1;
  folderId: string;
  generationVersion: string;
  sources: WikiSource[];
  pages: { key: string; title: string; markdown: string; contentHash: string }[];
}

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const escape = (text: string) => text.replace(/[\\`*_{}\[\]<>()#!|~]/g, '\\$&').replace(/\r?\n/g, ' ');
const filename = (key: string) => `${encodeURIComponent(key)}.md`;

// Exact excerpts establish provenance, not that a model's paraphrase is true.
export function validateExtraction(value: unknown, sourceText: string): WikiExtraction {
  if (!value || typeof value !== 'object') throw new Error('Invalid wiki extraction');
  const data = value as Record<string, unknown>;
  const labels = (input: unknown): string[] => {
    if (!Array.isArray(input) || input.length > 50 || input.some(x => typeof x !== 'string' || !x.trim() || x.length > 200)) {
      throw new Error('Invalid wiki labels');
    }
    return [...new Set((input as string[]).map(x => x.normalize('NFKC').trim().replace(/\s+/gu, ' ')))].sort();
  };
  if (!Array.isArray(data.facts) || !data.facts.length || data.facts.length > 100) throw new Error('Wiki requires 1-100 facts');
  const facts = data.facts.map((fact: unknown): EvidenceFact => {
    if (!fact || typeof fact !== 'object') throw new Error('Invalid wiki fact');
    const { text, quote } = fact as Record<string, unknown>;
    if (typeof text !== 'string' || !text.trim() || text.length > 4000 ||
        typeof quote !== 'string' || !quote.trim() || quote.length > 8000 || !sourceText.includes(quote)) {
      throw new Error('Wiki fact requires text and an exact source excerpt');
    }
    return { text: text.trim(), quote };
  });
  return { facts, topics: labels(data.topics), entities: labels(data.entities) };
}

export async function buildWiki(options: {
  folderId: string;
  generationVersion: string;
  drive: DriveReader;
  extract: (input: { file: DriveFile; text: string }) => Promise<unknown>;
  maxFiles?: number;
}) {
  if (!options.generationVersion.trim()) throw new Error('generationVersion is required');
  const sources = new Map<string, WikiSource>();
  const report = await scanAndSort({
    folderId: options.folderId, drive: options.drive, maxFiles: options.maxFiles,
    extract: async input => {
      const result = validateExtraction(await options.extract(input), input.text);
      sources.set(input.file.id, { id: input.file.id, name: input.file.name,
        contentHash: hash(input.text), facts: result.facts });
      return { summary: result.facts.map(f => f.text).join('\n'), topics: result.topics, entities: result.entities };
    },
  });
  if (!report.complete || !report.sources.length) return { report, artifact: null };
  const keys = new Set(report.pages.map(p => p.key));
  const pages = report.pages.map(page => {
    if (page.links.some(key => !keys.has(key))) throw new Error('Unresolved wiki link');
    const lines = [`# ${escape(page.title)}`, '', '## Sources and Evidence', ''];
    for (const source of page.sources) {
      lines.push(`### [${escape(source.name)}](${source.url})`, '');
      for (const fact of sources.get(source.id)!.facts) {
        lines.push(`- ${escape(fact.text)}`, `  - Evidence: "${escape(fact.quote)}"`, '');
      }
    }
    lines.push('## Related Pages', '');
    if (page.kind !== 'index') lines.push(`[Index](${filename('index')})`, '');
    for (const key of page.links) {
      lines.push(`- [${escape(report.pages.find(p => p.key === key)!.title)}](${filename(key)})`);
    }
    const markdown = `${lines.join('\n').trimEnd()}\n`;
    return { key: page.key, title: page.title, markdown, contentHash: hash(markdown) };
  });
  const artifact: WikiArtifact = { schemaVersion: 1, folderId: options.folderId,
    generationVersion: options.generationVersion, sources: [...sources.values()], pages };
  return { report, artifact };
}

// This is a content diff, not a publication receipt. Persist only after verified writes.
export function diffWiki(next: WikiArtifact, previous: WikiArtifact | null) {
  if (previous && previous.folderId !== next.folderId) throw new Error('Wiki folder mismatch');
  const old = new Map(previous?.pages.map(p => [p.key, p.contentHash]));
  return next.pages.map(page => ({ key: page.key,
    action: !old.has(page.key) ? 'create' as const : old.get(page.key) === page.contentHash ? 'unchanged' as const : 'update' as const,
  }));
}
