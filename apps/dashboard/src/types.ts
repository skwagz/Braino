export type Folder = {
  id: string;
  name: string;
  path: string;
  fileCount: number;
  modified: string;
};
export type Source = {
  id: string;
  name: string;
  kind: "document" | "sheet";
  currentPath: string;
  destination: string;
  reason: string;
  modified: string;
  webViewLink?: string;
};
export type WikiPage = {
  id: string;
  title: string;
  summary: string;
  sourceIds: string[];
  evidence?: { id: string; name: string; facts: { text: string; quote: string }[] }[];
  relatedIds?: string[];
};
export type Plan = {
  id: string;
  folderId: string;
  version: number;
  complete: boolean;
  warnings: string[];
  sources: Source[];
  pages: WikiPage[];
  plannedMoves?: number;
};
export type Job = {
  id: string;
  status: "running" | "completed" | "failed";
  progress: number;
  message: string;
  plan?: Plan;
};
export type Workspace = {
  folderId: string;
  sources: Source[];
  pages: WikiPage[];
  activity: { id: string; title: string; detail: string; at: string }[];
};
export interface BrainoApi {
  listFolders(): Promise<Folder[]>;
  startScan(folderId: string): Promise<Job>;
  getJob(jobId: string): Promise<Job>;
  applyPlan(plan: Plan, requestId: string): Promise<Workspace>;
  getWorkspace(folderId: string): Promise<Workspace | null>;
}
