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
  kind: "document" | "sheet" | "pdf";
  categoryId: string | null;
  currentPath: string;
  destination: string;
  reason: string;
  evidence: string[];
  modified: string;
  webViewLink?: string;
  previewUrl?: string;
};
export type WikiPage = {
  id: string;
  title: string;
  summary: string;
  sourceIds: string[];
};
export type Plan = {
  id: string;
  folderId: string;
  version: number;
  moveCount: number;
  renameCount: number;
  complete: boolean;
  warnings: string[];
  sources: Source[];
  pages: WikiPage[];
  index?: Source[];
};
export type Job = {
  id: string;
  status: "running" | "completed" | "failed";
  progress: number;
  applied?: boolean;
  message: string;
  plan?: Plan;
};
export type Workspace = {
  folderId: string;
  sources: Source[];
  pages: WikiPage[];
  index?: Source[];
  activity: { id: string; title: string; detail: string; at: string }[];
};
export interface BrainoApi {
  listFolders(parentId?: string): Promise<Folder[]>;
  startScan(folderId: string): Promise<Job>;
  getJob(jobId: string): Promise<Job>;
  savePlan(plan: Plan): Promise<Plan>;
  applyPlan(plan: Plan, requestId: string): Promise<Workspace>;
  getWorkspace(folderId: string): Promise<Workspace | null>;
}
