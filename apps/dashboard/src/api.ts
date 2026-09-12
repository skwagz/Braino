import type { BrainoApi, Job, Plan, Workspace } from './types';
export const categoryOptions = [
  { id: 'school', name: 'School' }, { id: 'meetings', name: 'Meetings' },
  { id: 'finance', name: 'Finance' }, { id: 'business', name: 'Business' },
  { id: 'personal', name: 'Personal' },
];
export type Session = { mode: 'demo' | 'live'; connected: boolean; email?: string; csrfToken: string; config: { google: boolean; llm: boolean }; classifier: string };
let session: Session | undefined;
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(body !== undefined ? { 'x-csrf-token': session?.csrfToken ?? '' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data as T;
}
export async function getSession() { session = await request<Session>('/api/status'); return session; }
export async function logout() { await request('/api/logout', {}); session = undefined; }
type Run = { id: string; folderId: string; createdAt: number; status: 'scanning' | 'ready' | 'applying' | 'complete' | 'failed'; error?: string; version: number; edits?: { id: string; name: string; categoryId: string | null }[]; locations?: Record<string, string>; result?: { moved: number; renamed?: number }; report?: { complete: boolean; documents: { id: string; name: string; url: string; classification: { categoryId: string | null; reason: string; evidence: string[] } }[]; folders: { categoryId: string; name: string }[]; review: string[]; errors: { message: string }[]; skipped: { file: { id: string; name: string; mimeType: string }; reason: string }[] }; plan?: { blocked: string[]; operations: { kind: string; fileId?: string }[] } };
function planFor(run: Run): Plan | undefined {
  const report = run.report;
  if (!report) return undefined;
  const plan: Plan = { id: run.id, folderId: run.folderId, version: run.version ?? 0, complete: report.complete && !run.plan?.blocked.length,
    warnings: [...report.errors.map(e => e.message), ...(run.plan?.blocked ?? []), ...report.skipped.map(e => `${e.file.name}: ${e.reason}`)],
    sources: report.documents.map(d => ({ id: d.id, name: run.edits?.find(e => e.id === d.id)?.name ?? d.name, categoryId: (run.edits?.find(e => e.id === d.id) ?? { categoryId: d.classification.categoryId }).categoryId, kind: d.url.includes('/spreadsheets/') ? 'sheet' : 'document', currentPath: run.locations?.[d.id] ?? 'Within selected folder', destination: categoryOptions.find(f => f.id === (run.edits?.find(e => e.id === d.id) ?? { categoryId: d.classification.categoryId }).categoryId)?.name ?? 'Keep current location', reason: d.classification.reason, evidence: d.classification.evidence, modified: 'Not provided', ...(session?.mode === 'live' ? { webViewLink: d.url } : {}) })), pages: [],
    renameCount: run.plan?.operations.filter(o => o.kind === 'rename').length ?? 0, moveCount: run.plan?.operations.filter(o => o.kind === 'move').length ?? 0 };
  plan.index = [...plan.sources, ...report.skipped.filter(s => s.file.mimeType === 'application/pdf').map(s => ({
    id: s.file.id, name: s.file.name, kind: 'pdf' as const, categoryId: null,
    currentPath: run.locations?.[s.file.id] ?? 'Within selected folder', destination: 'PDF reference',
    reason: 'PDF document. Open the preview to read it; PDF contents have not been classified.', evidence: [], modified: 'Not provided',
    previewUrl: session?.mode === 'live' ? `https://drive.google.com/file/d/${encodeURIComponent(s.file.id)}/view` : '/sample.pdf',
  }))];
  return plan;
}
function jobFor(run: Run): Job { return { id: run.id, applied: run.status === 'complete', status: run.status === 'failed' ? 'failed' : ['ready', 'complete'].includes(run.status) ? 'completed' : 'running', progress: ['ready', 'complete'].includes(run.status) ? 100 : 0, message: run.error ?? (run.status === 'scanning' ? 'Reading and classifying your documents…' : run.status === 'applying' ? 'Applying your approved structure…' : 'Your structure is ready'), plan: planFor(run) }; }
function workspaceFor(run: Run, history: Run[] = [run]): Workspace { return { folderId: run.folderId, sources: planFor(run)?.sources ?? [], index: planFor(run)?.index ?? [], pages: [], activity: history.map(r => ({ id: r.id, title: r.status === 'complete' ? 'Structure applied' : r.status === 'failed' ? 'Run failed' : r.status === 'ready' ? 'Structure previewed' : 'Run in progress', detail: r.error ?? (r.result ? `${r.result.moved} files moved · ${r.result.renamed ?? 0} renamed` : `${r.report?.documents.length ?? 0} documents scanned`), at: new Date(r.createdAt).toISOString() })) }; }
export const api: BrainoApi = {
  async savePlan(plan) { const run = await request<Run>(`/api/runs/${encodeURIComponent(plan.id)}/plan`, { version: plan.version, sources: plan.sources.map(({ id, name, categoryId }) => ({ id, name, categoryId })) }); const saved = planFor(run); if (!saved) throw new Error('Plan unavailable'); return saved; },
  async listFolders(parentId = 'root') { const data = await request<{ folders: { id: string; name: string }[] }>(`/api/folders?parentId=${encodeURIComponent(parentId)}`); return data.folders.map(f => ({ ...f, path: f.name, fileCount: 0, modified: '' })); },
  async startScan(folderId) { return jobFor(await request<Run>('/api/runs', { folderId })); },
  async getJob(id) { return jobFor(await request<Run>(`/api/runs/${encodeURIComponent(id)}`)); },
  async applyPlan(plan) {
    let run = await request<Run>(`/api/runs/${encodeURIComponent(plan.id)}`);
    if ((run.version ?? 0) !== plan.version) throw new Error('The plan changed. Reload and review it before applying.');
    if (run.status === 'ready') run = await request<Run>(`/api/runs/${encodeURIComponent(plan.id)}/apply`, { version: plan.version });
    const started = Date.now();
    while (run.status === 'applying') {
      if (Date.now() - started > 1800000) throw new Error('Changes are still running. Reload to inspect saved activity before retrying.');
      await new Promise(resolve => setTimeout(resolve, 2000));
      run = await request<Run>(`/api/runs/${encodeURIComponent(plan.id)}`);
    }
    if (run.status !== 'complete') throw new Error(run.error ?? 'Apply did not complete. Inspect the saved run before retrying.');
    return workspaceFor(run);
  },
  async getWorkspace(folderId) { const { runs } = await request<{ runs: Run[] }>('/api/runs'); const history = runs.filter(r => r.folderId === folderId); const completed = history.find(r => r.status === 'complete'); return completed ? workspaceFor(completed, history) : history.length ? { folderId, sources: [], pages: [], activity: workspaceFor(history[0], history).activity } : null; },
};

export async function latestJob(folderId: string) { const { runs } = await request<{ runs: Run[] }>('/api/runs'); const run = runs.find(r => r.folderId === folderId); return run && run.status !== 'complete' ? jobFor(run) : undefined; }
