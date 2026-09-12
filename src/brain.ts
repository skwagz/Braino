export const MIME = {
  folder: 'application/vnd.google-apps.folder',
  doc: 'application/vnd.google-apps.document',
  sheet: 'application/vnd.google-apps.spreadsheet',
};

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  appProperties?: Record<string, string>;
}

// Adapter must list only direct, non-trashed children and handle pagination.
export interface DriveReader {
  listChildren(folderId: string): Promise<DriveFile[]>;
  readText(file: DriveFile): Promise<string>;
}

export interface Knowledge {
  summary: string;
  topics: string[];
  entities: string[];
}

// Supplied by the extraction component. Source text is untrusted data.
export type Extractor = (input: {
  file: DriveFile;
  text: string;
}) => Promise<Knowledge>;

export interface Source {
  id: string;
  name: string;
  url: string;
  summary: string;
}

export interface Page {
  key: string;
  title: string;
  kind: 'index' | 'topic' | 'entity';
  sources: Source[];
  links: string[];
}

export interface Report {
  sources: Source[];
  skipped: { file: DriveFile; reason: string }[];
  errors: { fileId: string; stage: 'scan' | 'extract'; message: string }[];
  pages: Page[];
  complete: boolean;
}

function label(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
}

function validate(value: Knowledge): Knowledge {
  if (!value || typeof value.summary !== 'string' ||
      !Array.isArray(value.topics) || !Array.isArray(value.entities) ||
      [...value.topics, ...value.entities].some(x => typeof x !== 'string')) {
    throw new Error('Extractor returned invalid knowledge');
  }
  return {
    summary: value.summary.trim(),
    topics: value.topics.map(label).filter(Boolean),
    entities: value.entities.map(label).filter(Boolean),
  };
}

export async function scanAndSort(options: {
  folderId: string;
  drive: DriveReader;
  extract: Extractor;
  maxFiles?: number;
  maxFolders?: number;
  maxTextChars?: number;
  outputFolderIds?: string[];
}): Promise<Report> {
  const { folderId, drive, extract } = options;
  const maxFiles = options.maxFiles ?? 30;
  const maxFolders = options.maxFolders ?? 100;
  const maxTextChars = options.maxTextChars ?? 100_000;
  if (!folderId.trim()) throw new Error('folderId is required');
  for (const value of [maxFiles, maxFolders, maxTextChars]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error('Limits must be positive integers');
  }
  const report: Report = { sources: [], skipped: [], errors: [], pages: [], complete: true };
  const queue = [folderId];
  const seenFolders = new Set<string>();
  const seenFiles = new Set<string>();
  const outputFolders = new Set(options.outputFolderIds ?? []);
  const groups = new Map<string, Page>();
  let attempted = 0;

  while (queue.length) {
    const current = queue.shift()!;
    if (seenFolders.has(current)) continue;
    if (seenFolders.size >= maxFolders) { report.complete = false; break; }
    seenFolders.add(current);
    let children: DriveFile[];
    try { children = await drive.listChildren(current); }
    catch (error) {
      report.errors.push({ fileId: current, stage: 'scan', message: String(error) });
      report.complete = false;
      continue;
    }
    // Stable traversal means API ordering cannot change which files reach the cap.
    children = [...children].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    for (const file of children) {
      if (seenFiles.has(file.id)) continue;
      seenFiles.add(file.id);
      if (outputFolders.has(file.id) || file.appProperties?.brainoManaged === 'true' ||
          (file.mimeType === MIME.folder && file.name === 'Braino')) {
        report.skipped.push({ file, reason: 'Braino output excluded' });
        continue;
      }
      if (file.mimeType === MIME.folder) { queue.push(file.id); continue; }
      if (![MIME.doc, MIME.sheet].includes(file.mimeType)) {
        report.skipped.push({ file, reason: 'Unsupported file type' });
        continue;
      }
      if (attempted >= maxFiles) {
        report.skipped.push({ file, reason: 'File limit reached' });
        report.complete = false;
        continue;
      }
      attempted++;
      try {
        const text = await drive.readText(file);
        if (text.length > maxTextChars) throw new Error('Source exceeds text limit; chunking required');
        if (!text.trim()) throw new Error('Source is empty');
        const knowledge = validate(await extract({ file, text }));
        const source: Source = {
          id: file.id, name: file.name,
          url: `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`,
          summary: knowledge.summary,
        };
        report.sources.push(source);
        for (const kind of ['topic', 'entity'] as const) {
          for (const title of kind === 'topic' ? knowledge.topics : knowledge.entities) {
            const key = `${kind}:${encodeURIComponent(title.toLowerCase())}`;
            let page = groups.get(key);
            if (!page) {
              page = { key, title, kind, sources: [], links: [] };
              groups.set(key, page);
            }
            if (!page.sources.some(s => s.id === source.id)) page.sources.push(source);
          }
        }
      } catch (error) {
        report.errors.push({ fileId: file.id, stage: 'extract', message: String(error) });
        report.complete = false;
      }
    }
  }
  const pages = [...groups.values()].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  for (const page of pages) {
    page.links = pages.filter(other => other.key !== page.key &&
      other.sources.some(s => page.sources.some(p => p.id === s.id))).map(p => p.key);
  }
  report.pages = [{ key: 'index', title: 'Braino Index', kind: 'index',
    sources: report.sources, links: pages.map(p => p.key) }, ...pages];
  return report;
}

export interface ExistingPage { key: string; fileId: string }

// Keys are scoped to the selected source folder by the writer. Never delete on
// partial scans: a missing topic may simply be outside the cap or unreadable.
export function planWrites(report: Report, existing: ExistingPage[]) {
  const byKey = new Map<string, string>();
  for (const page of existing) {
    if (byKey.has(page.key)) throw new Error(`Duplicate existing page key: ${page.key}`);
    byKey.set(page.key, page.fileId);
  }
  // Publishing partial data could overwrite previously complete pages.
  if (!report.complete) return [];
  return report.pages.map(page => ({
    action: byKey.has(page.key) ? 'update' as const : 'create' as const,
    fileId: byKey.get(page.key), page,
  }));
}
