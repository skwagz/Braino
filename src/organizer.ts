import { MIME } from './brain.ts';
import { categories, structureFolder, planStructure } from './structure.ts';
import type { Classifier, CategoryId, FolderState, StructureReport } from './structure.ts';
import type { Metadata, OrganizingDrive } from './drive.ts';

export interface Preview {
  schemaVersion: 1;
  createdAt: string;
  report: StructureReport;
  state: FolderState;
  versions: Record<string, string>;
}

const sameParents = (a: string[] = [], b: string[] = []) =>
  a.length === b.length && [...a].sort().every((p, i) => p === [...b].sort()[i]);

async function folderState(drive: OrganizingDrive, root: string) {
  const rootFile = await drive.metadata(root);
  if (rootFile.mimeType !== MIME.folder) throw new Error('Select a folder');
  return (await drive.listChildren(root)).filter(f => f.mimeType === MIME.folder &&
    f.appProperties?.brainoSourceFolder === root && categories.some(c => c.id === f.appProperties?.brainoCategory))
    .map(f => ({ categoryId: f.appProperties!.brainoCategory as CategoryId, fileId: f.id }));
}

export async function previewOrganization(options: {
  folderId: string; drive: OrganizingDrive; classify?: Classifier; maxFiles?: number;
}): Promise<Preview> {
  const { drive, folderId } = options;
  const folders = await folderState(drive, folderId);
  const snapshots = new Map<string, Metadata>();
  const report = await structureFolder({ ...options, drive: {
    listChildren: id => drive.listChildren(id),
    async readText(file) {
      const before = await drive.metadata(file.id);
      const text = await drive.readText(file);
      const after = await drive.metadata(file.id);
      if (before.version !== after.version || !sameParents(before.parents, after.parents)) {
        throw new Error('File changed during reading; scan again');
      }
      snapshots.set(file.id, after);
      return text;
    },
  }});
  return { schemaVersion: 1, createdAt: new Date().toISOString(), report,
    state: { sourceFolderId: folderId, folders,
      parents: Object.fromEntries(report.documents.map(d => [d.id, snapshots.get(d.id)?.parents ?? []])) },
    versions: Object.fromEntries(report.documents.map(d => [d.id, snapshots.get(d.id)!.version])),
  };
}

export interface Event {
  type: 'started' | 'folder-ready' | 'move-started' | 'moved' | 'complete';
  fileId?: string;
  destination?: string;
  oldParent?: string;
}

// Caller serializes runs and persists events before mutations. The CLI provides
// a local lock and journal; multi-host deployments need a shared lock instead.
export async function applyOrganization(preview: Preview, drive: OrganizingDrive,
  record: (event: Event) => Promise<void>) {
  if (preview.schemaVersion !== 1) throw new Error('Unsupported preview version');
  const root = preview.report.sourceFolderId;
  const plan = planStructure(preview.report, preview.state);
  if (plan.blocked.length) throw new Error(plan.blocked.join('; '));
  const currentFolders = await folderState(drive, root);
  const currentIds = new Map(currentFolders.map(f => [f.categoryId, f.fileId]));
  if (currentIds.size !== currentFolders.length) throw new Error('Duplicate category folders');
  for (const saved of preview.state.folders) {
    if (currentIds.get(saved.categoryId) !== saved.fileId) throw new Error('Category folder changed; preview again');
  }
  const moves = plan.operations.filter(o => o.kind === 'move');
  async function unchanged(fileId: string, parents: string[]) {
    const meta = await drive.metadata(fileId);
    if (!preview.versions[fileId] || meta.version !== preview.versions[fileId] || !sameParents(meta.parents, parents)) {
      throw new Error(`File ${fileId} changed since preview; preview again`);
    }
    // Parent chains must still lead to the selected root before moving a file.
    let parent = meta.parents?.[0];
    const seen = new Set<string>();
    while (parent !== root) {
      if (!parent || seen.has(parent) || seen.size >= 100) throw new Error('Source is outside the selected folder');
      seen.add(parent);
      const ancestor = await drive.metadata(parent);
      if (ancestor.parents?.length !== 1) throw new Error('Cannot verify source folder ancestry');
      parent = ancestor.parents[0];
    }
  }
  // Preflight every file before any mutation, and recheck each just before move.
  for (const move of moves) await unchanged(move.fileId, move.expectedParents);
  await record({ type: 'started' });
  const destinations = new Map<string, string>();
  for (const operation of plan.operations) {
    if (operation.kind === 'ensure-folder') {
      const category = categories.find(c => `${root}:${c.id}` === operation.key);
      if (!category) throw new Error('Invalid destination category');
      const id = await drive.ensureCategory(root, category.id);
      destinations.set(operation.key, id);
      await record({ type: 'folder-ready', fileId: id });
    } else {
      await unchanged(operation.fileId, operation.expectedParents);
      const destination = destinations.get(operation.destinationKey)!;
      const folder = await drive.metadata(destination);
      if (folder.mimeType !== MIME.folder || !folder.parents?.includes(root) ||
          folder.appProperties?.brainoSourceFolder !== root ||
          `${root}:${folder.appProperties?.brainoCategory}` !== operation.destinationKey) {
        throw new Error('Destination changed; preview again');
      }
      await record({ type: 'move-started', fileId: operation.fileId, destination, oldParent: operation.removeParents[0] });
      await drive.move(operation.fileId, destination, operation.removeParents[0]);
      await record({ type: 'moved', fileId: operation.fileId, destination });
    }
  }
  await record({ type: 'complete' });
  return { moved: moves.length };
}
