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
  locations?: Record<string, string>;
}

export interface PlanEdit { id: string; name: string; categoryId: CategoryId | null }
export function defaultEdits(preview: Preview): PlanEdit[] {
  return preview.report.documents.map(d => ({ id: d.id, name: d.name, categoryId: d.classification.categoryId }));
}
export function editedReport(preview: Preview, edits: PlanEdit[] = defaultEdits(preview)): StructureReport {
  const documents = preview.report.documents.map(d => {
    const edit = edits.find(e => e.id === d.id)!;
    return { ...d, name: edit.name, classification: { ...d.classification, categoryId: edit.categoryId } };
  });
  return { ...preview.report, documents,
    folders: categories.map(c => ({ categoryId: c.id, name: c.name, fileIds: documents.filter(d => d.classification.categoryId === c.id).map(d => d.id) })).filter(f => f.fileIds.length),
    review: documents.filter(d => d.classification.categoryId === null).map(d => d.id) };
}
export function organizationPlan(preview: Preview, edits: PlanEdit[] = defaultEdits(preview)) {
  const plan = planStructure(editedReport(preview, edits), preview.state);
  const renames = edits.filter(e => e.name !== preview.report.documents.find(d => d.id === e.id)!.name)
    .map(e => ({ kind: 'rename' as const, fileId: e.id, name: e.name, oldName: preview.report.documents.find(d => d.id === e.id)!.name }));
  for (const rename of renames) if (preview.state.parents[rename.fileId]?.length !== 1) plan.blocked.push(`Cannot verify parents for ${rename.fileId}`);
  return { blocked: plan.blocked, operations: plan.blocked.length ? [] : [...plan.operations, ...renames] };
}

export async function fileLocations(drive: OrganizingDrive, root: string, ids: string[]) {
  const cache = new Map<string, Metadata>();
  async function metadata(id: string) {
    if (!cache.has(id)) cache.set(id, await drive.metadata(id));
    return cache.get(id)!;
  }
  const locations: Record<string, string> = {};
  for (const id of ids) {
    let parent = (await metadata(id)).parents?.[0];
    const names: string[] = [];
    const seen = new Set<string>();
    while (parent) {
      if (seen.has(parent) || seen.size >= 100) throw new Error('Cannot verify file location');
      seen.add(parent);
      const folder = await metadata(parent); names.unshift(folder.name);
      if (parent === root) break;
      if (folder.parents?.length !== 1) throw new Error('Cannot verify file location');
      parent = folder.parents[0];
    }
    if (parent !== root) throw new Error('Source is outside the selected folder');
    locations[id] = names.join(' / ');
  }
  return locations;
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
    locations: await fileLocations(drive, folderId, [...report.documents.map(d => d.id), ...report.skipped.map(s => s.file.id)]),
  };
}

export interface Event {
  type: 'started' | 'folder-ready' | 'move-started' | 'moved' | 'rename-started' | 'renamed' | 'complete';
  fileId?: string;
  destination?: string;
  oldParent?: string;
  name?: string;
  oldName?: string;
}

// Caller serializes runs and persists events before mutations. The CLI provides
// a local lock and journal; multi-host deployments need a shared lock instead.
export async function applyOrganization(preview: Preview, drive: OrganizingDrive,
  record: (event: Event) => Promise<void>, edits?: PlanEdit[]) {
  if (preview.schemaVersion !== 1) throw new Error('Unsupported preview version');
  const root = preview.report.sourceFolderId;
  const plan = organizationPlan(preview, edits);
  if (plan.blocked.length) throw new Error(plan.blocked.join('; '));
  const currentFolders = await folderState(drive, root);
  const currentIds = new Map(currentFolders.map(f => [f.categoryId, f.fileId]));
  if (currentIds.size !== currentFolders.length) throw new Error('Duplicate category folders');
  for (const saved of preview.state.folders) {
    if (currentIds.get(saved.categoryId) !== saved.fileId) throw new Error('Category folder changed; preview again');
  }
  const moves = plan.operations.filter(o => o.kind === 'move');
  const renames = plan.operations.filter(o => o.kind === 'rename');
  const versions = { ...preview.versions };
  const parentsById = structuredClone(preview.state.parents);
  async function unchanged(fileId: string, parents: string[]) {
    const meta = await drive.metadata(fileId);
    if (!versions[fileId] || meta.version !== versions[fileId] || !sameParents(meta.parents, parents)) {
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
  for (const rename of renames) await unchanged(rename.fileId, parentsById[rename.fileId]);
  await record({ type: 'started' });
  const destinations = new Map<string, string>();
  for (const operation of plan.operations) {
    if (operation.kind === 'ensure-folder') {
      const category = categories.find(c => `${root}:${c.id}` === operation.key);
      if (!category) throw new Error('Invalid destination category');
      const id = await drive.ensureCategory(root, category.id);
      destinations.set(operation.key, id);
      await record({ type: 'folder-ready', fileId: id });
    } else if (operation.kind === 'move') {
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
      const updated = await drive.metadata(operation.fileId);
      versions[operation.fileId] = updated.version; parentsById[operation.fileId] = updated.parents ?? [];
      await record({ type: 'moved', fileId: operation.fileId, destination });
    } else {
      await unchanged(operation.fileId, parentsById[operation.fileId]);
      await record({ type: 'rename-started', fileId: operation.fileId, name: operation.name, oldName: operation.oldName });
      await drive.rename(operation.fileId, operation.name);
      await record({ type: 'renamed', fileId: operation.fileId, name: operation.name, oldName: operation.oldName });
    }
  }
  await record({ type: 'complete' });
  return { moved: moves.length, renamed: renames.length };
}
