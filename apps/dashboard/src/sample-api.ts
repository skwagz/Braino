import type { BrainoApi, Folder, Job, Plan, Source, Workspace } from "./types";


export const folders: Folder[] = [
  ...(new URLSearchParams(window.location.search).get('example') === 'wiki' ? [{
    id: 'wiki-demo', name: 'Example wiki', path: 'Sample data / Roadmap and budget', fileCount: 2, modified: 'Synthetic sample',
  }] : []),
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
      modified: "Sep 10, 2026", categoryId: null, evidence: [],
    }));
  return {
    id: `plan-${folderId}`,
    folderId,
    version: 1, moveCount: sources.length, renameCount: 0,
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
export const sampleApi: BrainoApi = {
  async savePlan(plan) { return structuredClone(plan); },
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
    if (folderId === 'wiki-demo') {
      const response = await fetch('/wiki-demo.json');
      if (!response.ok) throw new Error('Example wiki unavailable. Run npm run wiki:demo -- --ui from the repository root.');
      const workspace = await response.json() as Workspace;
      workspace.sources = workspace.sources.map(source => ({ ...source, categoryId: source.categoryId ?? null, evidence: source.evidence ?? [] }));
      return workspace;
    }
    return structuredClone(workspaces.get(folderId) ?? null);
  },
};
