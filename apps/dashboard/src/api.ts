import type { BrainoApi, Folder, Job, Plan, Source, Workspace } from "./types";

export const folders: Folder[] = [
  {
    id: "northstar",
    name: "Northstar Studio",
    path: "My Drive / Northstar Studio",
    fileCount: 8,
    modified: "Today",
  },
  {
    id: "launch",
    name: "Autumn launch",
    path: "My Drive / Projects / Autumn launch",
    fileCount: 4,
    modified: "Yesterday",
  },
  {
    id: "fundraising",
    name: "Fundraising",
    path: "My Drive / Fundraising",
    fileCount: 3,
    modified: "Sep 10",
  },
];
const sourceData: [string, Source["kind"], string, string, string][] = [
  [
    "Launch plan v3",
    "document",
    "Loose files",
    "Projects/Autumn launch",
    "Launch milestones and delivery responsibilities.",
  ],
  [
    "Q4 operating budget",
    "sheet",
    "Spreadsheets",
    "Finance",
    "Operating costs and quarterly budget assumptions.",
  ],
  [
    "Customer interview notes",
    "document",
    "Loose files",
    "Customers/Research",
    "Customer feedback informing the autumn launch.",
  ],
  [
    "Brand guidelines",
    "document",
    "Shared",
    "Company",
    "Shared brand identity and writing principles.",
  ],
  [
    "Launch spend",
    "sheet",
    "Spreadsheets",
    "Projects/Autumn launch",
    "Campaign spending tied to the launch project.",
  ],
  [
    "Supplier agreement",
    "document",
    "Shared",
    "Legal",
    "Supplier terms and delivery obligations.",
  ],
  [
    "Team meeting - Sep 10",
    "document",
    "Loose files",
    "Company/Decisions",
    "Team decisions and recorded follow-up actions.",
  ],
  [
    "Investor update",
    "document",
    "Loose files",
    "Finance/Fundraising",
    "Business progress and financing context.",
  ],
];
const delay = () => new Promise((resolve) => setTimeout(resolve, 350));
const jobs = new Map<string, { folderId: string; step: number }>();
const workspaces = new Map<string, Workspace>();
function makePlan(folderId: string): Plan {
  const folder = folders.find((f) => f.id === folderId);
  if (!folder) throw new Error("Folder not found. Choose another folder.");
  const sources = sourceData
    .slice(0, folder.fileCount)
    .map(([name, kind, currentPath, destination, reason], i) => ({
      id: `${folderId}-${i}`,
      name,
      kind,
      currentPath,
      destination,
      reason,
      modified: "Sep 10, 2026",
    }));
  return {
    id: `plan-${folderId}`,
    folderId,
    version: 1,
    complete: true,
    warnings: [],
    sources,
    pages: [
      {
        id: "index",
        title: "Workspace index",
        summary:
          "A connected guide to projects, company knowledge, and source documents.",
        sourceIds: sources.map((s) => s.id),
      },
      {
        id: "launch",
        title: "Autumn launch",
        summary:
          "The launch plan connects delivery milestones with customer research and campaign spending. Refer to the original files for the underlying detail.",
        sourceIds: sources
          .filter((s) => /Launch|Customer/.test(s.name))
          .map((s) => s.id),
      },
      {
        id: "finance",
        title: "Financial overview",
        summary:
          "Operating assumptions and budget information, with direct references to the source spreadsheets.",
        sourceIds: sources.filter((s) => s.kind === "sheet").map((s) => s.id),
      },
    ].filter((p) => p.sourceIds.length > 0),
  };
}
const mock: BrainoApi = {
  async listFolders() {
    await delay();
    return structuredClone(folders);
  },
  async startScan(folderId) {
    await delay();
    const id = crypto.randomUUID();
    jobs.set(id, { folderId, step: 0 });
    return { id, status: "running", progress: 0, message: "Discovering files" };
  },
  async getJob(id) {
    await delay();
    const job = jobs.get(id);
    if (!job) throw new Error("Scan expired. Start a new scan.");
    job.step++;
    return {
      id,
      status: job.step >= 3 ? "completed" : "running",
      progress: Math.min(100, job.step * 34),
      message: [
        "Discovering files",
        "Reading documents and spreadsheets",
        "Connecting topics and planning folders",
        "Your structure is ready",
      ][Math.min(job.step, 3)],
      ...(job.step >= 3 ? { plan: makePlan(job.folderId) } : {}),
    };
  },
  async applyPlan(plan, requestId) {
    await delay();
    if (!plan.complete) throw new Error("Resolve scan issues before applying.");
    const workspace: Workspace = {
      folderId: plan.folderId,
      sources: structuredClone(plan.sources),
      pages: structuredClone(plan.pages),
      activity: [
        {
          id: requestId,
          title: "Workspace organized",
          detail: `${plan.sources.length} files placed and ${plan.pages.length} wiki pages created`,
          at: new Date().toISOString(),
        },
      ],
    };
    workspaces.set(plan.folderId, workspace);
    return structuredClone(workspace);
  },
  async getWorkspace(folderId) {
    await delay();
    return structuredClone(workspaces.get(folderId) ?? null);
  },
};

// Set window.BRAINO_CONFIG before this module loads to use the proposed HTTP API.
declare global {
  interface Window {
    BRAINO_CONFIG?: { apiBaseUrl: string };
  }
}
const base = window.BRAINO_CONFIG?.apiBaseUrl;
export const isDemo = !base;
async function request<T>(
  path: string,
  body?: unknown,
  requestId?: string,
): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(requestId ? { "Idempotency-Key": requestId } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(`Request failed (${response.status}). Please retry.`);
  return response.json() as Promise<T>;
}
export const api: BrainoApi = base
  ? {
      listFolders: () => request<Folder[]>("/folders"),
      startScan: (folderId) => request<Job>("/scans", { folderId }),
      getJob: (id) => request<Job>(`/jobs/${encodeURIComponent(id)}`),
      applyPlan: (plan, id) =>
        request<Workspace>(
          `/plans/${encodeURIComponent(plan.id)}/apply`,
          {
            version: plan.version,
            sources: plan.sources.map(({ id, destination }) => ({
              id,
              destination,
            })),
          },
          id,
        ),
      getWorkspace: (folderId) =>
        request<Workspace | null>(
          `/workspaces/${encodeURIComponent(folderId)}`,
        ),
    }
  : mock;
