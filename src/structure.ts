import { scanAndSort } from './brain.ts';
import type { DriveReader, DriveFile } from './brain.ts';

export const categories = [
  { id: 'school', name: 'School', terms: ['homework', 'assignment', 'lecture', 'syllabus', 'exam', 'coursework', 'semester', 'curriculum'] },
  { id: 'meetings', name: 'Meetings', terms: ['meeting minutes', 'agenda', 'attendees', 'action items', 'standup', 'meeting notes'] },
  { id: 'finance', name: 'Finance', terms: ['invoice', 'payment due', 'balance sheet', 'expense', 'tax return', 'receipt', 'revenue', 'budget'] },
  { id: 'business', name: 'Business', terms: ['customer', 'marketing', 'sales', 'business plan', 'product roadmap', 'stakeholder', 'launch plan'] },
  { id: 'personal', name: 'Personal', terms: ['travel itinerary', 'grocery', 'journal', 'recipe', 'vacation', 'packing list'] },
] as const;

export type CategoryId = typeof categories[number]['id'];
export interface Classification {
  categoryId: CategoryId | null;
  reason: string;
  evidence: string[];
  method: string;
}
export type Classifier = (input: { file: DriveFile; text: string }) => Promise<Classification>;

// Offline baseline, intentionally conservative. Replace this port with an LLM
// classifier for semantic understanding; the planner never executes model text.
export const classifyByContent: Classifier = async ({ text }) => {
  const normalized = text.toLowerCase();
  const ranked = categories.map(category => ({
    category,
    hits: category.terms.flatMap(term => {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = new RegExp(`\\b${escaped}\\b`, 'i').exec(normalized);
      return match ? [text.slice(match.index, match.index + term.length)] : [];
    }),
  })).sort((a, b) => b.hits.length - a.hits.length);
  const [best, next] = ranked;
  if (best.hits.length < 2 || best.hits.length - next.hits.length < 2) {
    return { categoryId: null, reason: 'Insufficient or conflicting content signals; review needed.', evidence: best.hits, method: 'content-rules-v1' };
  }
  return { categoryId: best.category.id, reason: `Content matches ${best.category.name}: ${best.hits.join(', ')}.`, evidence: best.hits, method: 'content-rules-v1' };
};

function validate(result: Classification, text: string): Classification {
  if (!result || (result.categoryId !== null && !categories.some(c => c.id === result.categoryId)) ||
      typeof result.reason !== 'string' || !result.reason.trim() ||
      typeof result.method !== 'string' || !result.method.trim() ||
      !Array.isArray(result.evidence) || result.evidence.some(e => typeof e !== 'string' || !e.trim() || !text.includes(e)) ||
      (result.categoryId !== null && !result.evidence.length)) {
    throw new Error('Invalid classification or evidence not found in source');
  }
  return result;
}

export async function structureFolder(options: {
  folderId: string;
  drive: DriveReader;
  classify?: Classifier;
  maxFiles?: number;
  maxFolders?: number;
  maxTextChars?: number;
  outputFolderIds?: string[];
}) {
  const decisions = new Map<string, Classification>();
  const scan = await scanAndSort({ ...options, extract: async input => {
    const decision = validate(await (options.classify ?? classifyByContent)(input), input.text);
    decisions.set(input.file.id, decision);
    return { summary: decision.reason, topics: [], entities: [] };
  }});
  const documents = scan.sources.map(source => ({ ...source, classification: decisions.get(source.id)! }));
  return {
    sourceFolderId: options.folderId,
    complete: scan.complete,
    documents,
    folders: categories.map(c => ({ categoryId: c.id, name: c.name,
      fileIds: documents.filter(d => d.classification.categoryId === c.id).map(d => d.id) })).filter(f => f.fileIds.length),
    review: documents.filter(d => d.classification.categoryId === null).map(d => d.id),
    errors: scan.errors,
    skipped: scan.skipped,
  };
}

export type StructureReport = Awaited<ReturnType<typeof structureFolder>>;
export interface FolderState {
  sourceFolderId: string;
  folders: { categoryId: CategoryId; fileId: string }[];
  parents: Record<string, string[]>;
}
export type Operation =
  | { kind: 'ensure-folder'; key: string; name: string; parentId: string; existingId?: string }
  | { kind: 'move'; fileId: string; destinationKey: string; expectedParents: string[]; removeParents: string[] };

// Pure preview: caller must explicitly apply through a Drive writer. Missing
// current-parent metadata blocks moves instead of guessing their source folder.
export function planStructure(report: StructureReport, state: FolderState): {
  blocked: string[]; operations: Operation[];
} {
  if (state.sourceFolderId !== report.sourceFolderId) throw new Error('Folder scope mismatch');
  const blocked: string[] = [];
  if (!report.complete) blocked.push('Scan is incomplete');
  const byCategory = new Map<CategoryId, string>();
  const ids = new Set<string>();
  for (const folder of state.folders) {
    if (!categories.some(c => c.id === folder.categoryId) || !folder.fileId ||
        folder.fileId === state.sourceFolderId || byCategory.has(folder.categoryId) || ids.has(folder.fileId)) {
      throw new Error('Invalid or duplicate category folder mapping');
    }
    byCategory.set(folder.categoryId, folder.fileId);
    ids.add(folder.fileId);
  }
  const operations: Operation[] = [];
  for (const folder of report.folders) {
    const key = `${report.sourceFolderId}:${folder.categoryId}`;
    const existingId = byCategory.get(folder.categoryId);
    const moves: Operation[] = [];
    for (const fileId of folder.fileIds) {
      const parents = state.parents[fileId];
      if (!parents?.length || parents.some(p => typeof p !== 'string' || !p)) {
        blocked.push(`Missing current parents for ${fileId}`);
        continue;
      }
      if (existingId && parents.includes(existingId)) continue;
      // A legacy multi-parent file needs explicit handling, not removal of
      // unrelated folder memberships.
      if (parents.length !== 1) { blocked.push(`Multiple parents require review for ${fileId}`); continue; }
      moves.push({ kind: 'move', fileId, destinationKey: key, expectedParents: [...parents], removeParents: [...parents] });
    }
    if (moves.length) {
      operations.push({ kind: 'ensure-folder', key, name: folder.name, parentId: report.sourceFolderId, existingId });
      operations.push(...moves);
    }
  }
  return { blocked, operations: blocked.length ? [] : operations };
}
