import type { BrainoApi, Job, Plan, Workspace } from './types';
import { loadConnection } from './connection';

export const serverPlansEditable = false;
interface ServerRun {
  id: string; folderId: string; createdAt: number;
  status: 'scanning' | 'ready' | 'applying' | 'complete' | 'failed';
  report?: { complete: boolean; documents: { id: string; name: string; url: string; classification: { categoryId: string | null; reason: string } }[];
    folders: { categoryId: string; name: string }[]; errors: { fileId: string }[]; skipped: { file: { name: string }; reason: string }[] };
  plan?: { blocked: string[]; operations: { kind: string }[] }; result?: { moved: number };
}

async function request<T>(path: string, input?: unknown): Promise<T> {
  const status = input === undefined ? undefined : await loadConnection();
  const response = await fetch(path, {
    method: input === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    headers: input === undefined ? undefined : { 'Content-Type': 'application/json', 'x-csrf-token': status!.csrfToken },
    body: input === undefined ? undefined : JSON.stringify(input), signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: 'Connect Google Drive again to continue.', 403: 'Session verification failed. Reload Braino and try again.',
      409: 'This run is busy or no longer ready. Refresh the workspace before trying again.',
      429: 'Too many requests. Wait a moment before trying again.',
      503: 'The server needs Google or AI configuration before this action is available.',
    };
    throw new Error(messages[response.status] ?? `Braino could not complete the request (${response.status}). Try again.`);
  }
  return response.json() as Promise<T>;
}

function plan(run: ServerRun): Plan {
  const report = run.report;
  if (!report) throw new Error('The scan is not ready yet.');
  return { id: run.id, folderId: run.folderId, version: 1,
    plannedMoves: run.plan?.operations.filter(o => o.kind === 'move').length ?? 0,
    complete: report.complete && !(run.plan?.blocked.length),
    warnings: [...(run.plan?.blocked ?? []), ...report.errors.map(e => `Could not process source ${e.fileId}. Start a fresh scan.`),
      ...report.skipped.map(s => `${s.file.name}: ${s.reason}`)],
    sources: report.documents.map(d => ({ id: d.id, name: d.name, kind: 'document',
      currentPath: 'Selected folder', modified: 'Scanned source', webViewLink: d.url,
      destination: report.folders.find(f => f.categoryId === d.classification.categoryId)?.name ?? 'Keep in current folder',
      reason: d.classification.reason })), pages: [] };
}

function job(run: ServerRun): Job {
  const finished = run.status === 'ready' || run.status === 'complete';
  return { id: run.id, status: run.status === 'failed' ? 'failed' : finished ? 'completed' : 'running',
    progress: finished ? 100 : 0,
    message: run.status === 'failed' ? 'Run failed. Refresh and start a fresh scan.' : finished ? 'Your folder plan is ready' : 'Reading and classifying sources',
    ...(finished ? { plan: plan(run) } : {}) };
}

function workspace(run: ServerRun): Workspace {
  const preview = plan(run);
  return { folderId: run.folderId, sources: preview.sources, pages: [], activity: [{ id: run.id,
    title: 'Folder organization complete', detail: `${run.result?.moved ?? 0} files moved into category folders`,
    at: new Date(run.createdAt).toISOString() }] };
}

export const serverApi: BrainoApi = {
  async listFolders() {
    await loadConnection();
    const result = await request<{ folders: { id: string; name: string }[] }>('/api/folders');
    return result.folders.map(f => ({ ...f, path: `My Drive / ${f.name}`, fileCount: 0, modified: 'Scan to inspect' }));
  },
  async startScan(folderId) { return job(await request<ServerRun>('/api/runs', { folderId })); },
  async getJob(id) { return job(await request<ServerRun>(`/api/runs/${encodeURIComponent(id)}`)); },
  async applyPlan(preview) {
    const path = `/api/runs/${encodeURIComponent(preview.id)}`;
    // Reconcile an earlier timed-out apply before considering another POST.
    let run = await request<ServerRun>(path);
    if (run.status === 'ready') run = await request<ServerRun>(`${path}/apply`, {});
    const deadline = Date.now() + 90000;
    while (run.status === 'applying' && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      run = await request<ServerRun>(path);
    }
    if (run.status === 'complete') return workspace(run);
    if (run.status === 'applying') throw new Error('Organization is still running. Retry to check this same run.');
    throw new Error('Organization did not complete. Refresh and create a fresh preview.');
  },
  async getWorkspace(folderId) {
    const { runs } = await request<{ runs: ServerRun[] }>('/api/runs');
    const complete = runs.filter(r => r.folderId === folderId && r.status === 'complete').sort((a, b) => b.createdAt - a.createdAt)[0];
    return complete ? workspace(complete) : null;
  },
};
