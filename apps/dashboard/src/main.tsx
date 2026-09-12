import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  FileText,
  Folder as FolderIcon,
  FolderTree,
  Grid2X2,
  History,
  Loader2,
  Network,
  Search,
  Settings2,
  Sheet,
  Sparkles,
  X,
} from "lucide-react";
import { api, getSession, logout, latestJob, categoryOptions, type Session } from "./api";
import type { Folder, Job, Plan, Source, WikiPage, Workspace } from "./types";
import "./style.css";

type View = "overview" | "structure" | "wiki" | "activity";
function App() {
  const [session, setSession] = useState<Session>();
  const isDemo = session?.mode === "demo";
  const canScan = !!session?.connected && (isDemo || session.config.llm);
  const [parentId, setParentId] = useState("root");
  const [view, setView] = useState<View>("overview");
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folder, setFolder] = useState<Folder>();
  const [picker, setPicker] = useState(false);
  const [folderQuery, setFolderQuery] = useState("");
  const [query, setQuery] = useState("");
  const [plan, setPlan] = useState<Plan>();
  const [dirty, setDirty] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [job, setJob] = useState<Job>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [detail, setDetail] = useState<Source | WikiPage>();
  const [tab, setTab] = useState("proposed");
  const dialog = useRef<HTMLDialogElement>(null);
  const requestId = useRef("");
  const retryAction = useRef<() => Promise<void>>(() => load());
  const sources = plan?.sources ?? workspace?.sources ?? [];
  const pages = workspace?.pages ?? plan?.pages ?? [];
  const destinations = [...new Set(sources.filter(s => s.categoryId).map((s) => s.destination))];
  const index = workspace?.index ?? plan?.index ?? sources;
  const indexed = index.filter(s => `${s.name} ${s.currentPath} ${s.destination} ${s.reason} ${s.evidence.join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  const filtered = sources.filter((s) =>
    `${s.name} ${s.destination} ${s.reason}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  async function load() {
    setBusy(true);
    setError("");
    try {
      const status = await getSession();
      setSession(status);
      if (!status.connected) return;
      const result = await api.listFolders();
      setFolders(result);
      if (result[0]) {
        setFolder(result[0]);
        await restore(result[0].id);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if ((picker || confirm || detail) && !dialog.current?.open)
      dialog.current?.showModal();
  }, [picker, confirm, detail]);
  function closeDialog() {
    dialog.current?.close();
    setPicker(false);
    setConfirm(false);
    setDetail(undefined);
  }
  async function selectFolder(next: Folder) {
    setDirty(false);
    closeDialog();
    setBusy(true);
    setError("");
    setPlan(undefined);
    setWorkspace(null);
    setJob(undefined);
    setFolder(next);
    setQuery("");
    setView("overview");
    try {
      await restore(next.id);
    } catch (e) {
      retryAction.current = () => selectFolder(next);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function restore(folderId: string) {
    setWorkspace(await api.getWorkspace(folderId));
    let saved = await latestJob(folderId);
    if (!saved) return;
    const started = Date.now();
    while (saved.status === "running") {
      setJob(saved);
      if (Date.now() - started > 1800000) throw new Error("Run is still active. Reload to check progress.");
      await new Promise(resolve => setTimeout(resolve, 2000));
      saved = await api.getJob(saved.id);
    }
    setJob(saved);
    if (saved.status === "failed") { setError(saved.message); return; }
    if (saved.applied) { setWorkspace(await api.getWorkspace(folderId)); setPlan(undefined); return; }
    setPlan(saved.plan);
    setWorkspace(null);
    setView("structure");
  }
  async function browse() {
    setBusy(true); setError("");
    try { setFolders(await api.listFolders(parentId.trim() || "root")); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function disconnect() {
    setBusy(true);
    try { await logout(); setFolder(undefined); setFolders([]); setPlan(undefined); setWorkspace(null); setJob(undefined); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function scan() {
    if (!folder) return;
    setDirty(false);
    setBusy(true);
    setError("");
    setPlan(undefined);
    setWorkspace(null);
    setView("structure");
    try {
      let next = await api.startScan(folder.id);
      setJob(next);
      const started = Date.now();
      while (next.status === "running") {
        if (Date.now() - started > 1800000)
          throw new Error(
            "Scan is still running. Reload to inspect saved activity before starting another scan.",
          );
        await new Promise((resolve) => setTimeout(resolve, 2000));
        next = await api.getJob(next.id);
        setJob(next);
      }
      if (next.status === "failed" || !next.plan)
        throw new Error(next.message || "Scan failed. Please retry.");
      setPlan(next.plan);
      setWorkspace(null);
      setTab("proposed");
      requestId.current = crypto.randomUUID();
    } catch (e) {
      retryAction.current = scan;
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!plan) return;
    closeDialog();
    setBusy(true);
    setError("");
    try {
      setWorkspace(await api.applyPlan(plan, requestId.current));
      setPlan(undefined);
      setView("overview");
    } catch (e) {
      retryAction.current = apply;
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function editSource(id: string, changes: Partial<Source>) {
    setPlan(previous => previous ? { ...previous, sources: previous.sources.map(s => s.id === id ? { ...s, ...changes } : s) } : previous);
    setDirty(true);
  }
  async function reviewEdits() {
    if (!plan) return;
    setBusy(true); setError('');
    try {
      if (dirty) { setPlan(await api.savePlan(plan)); setDirty(false); }
      setConfirm(true);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const nav = [
    { id: "overview", label: "Overview", icon: Grid2X2 },
    { id: "structure", label: "Folder structure", icon: FolderTree },
    { id: "wiki", label: "Knowledge wiki", icon: BookOpen },
    { id: "activity", label: "Activity", icon: History },
  ] as const;
  return (
    <div className="app">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView("overview");
          }}
        >
          <span className="brand-icon">
            <Network size={23} />
          </span>
          braino<span className="brand-dot">.</span>
        </a>
        <div className="workspace-switch">
          <span className="avatar">{folder?.name.slice(0, 1) ?? "B"}</span>
          <div>
            <strong>{folder?.name ?? "Your workspace"}</strong>
            <small>Selected Drive folder</small>
          </div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={view === id ? "nav active" : "nav"}
              onClick={() => {
                setView(id);
                setQuery("");
              }}
            >
              <Icon size={18} />
              {label}
              {id === "wiki" && pages.length > 0 && (
                <span className="count">{pages.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="connection">
            <span className="status-dot" />
            <div>
              <strong>{isDemo ? "Demo workspace" : session?.connected ? "Google Drive connected" : "Google Drive disconnected"}</strong>
              <small>{isDemo ? "Synthetic data · Rules classifier" : session?.email ?? "Connect to get started"}</small>
            </div>
          </div>
          {!isDemo && (session?.connected ? <button className="nav" disabled={busy} onClick={disconnect}>Disconnect Google</button> : <a className="nav" href="/auth/google/start">Connect Google Drive</a>)}
          <button
            className="nav"
            onClick={() => setPicker(true)}
            disabled={busy}
          >
            <Settings2 size={18} />
            Manage folders
          </button>
          <div className="profile">
            <span className="avatar user">{isDemo ? "D" : "G"}</span>
            <div>
              <strong>{isDemo ? "Demo session" : session?.email ?? "Google account"}</strong>
              <small>{isDemo ? "Preview environment" : "Braino"}</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <strong>{nav.find((n) => n.id === view)?.label}</strong>
          </div>
          <span className="demo-badge">
            {!session ? "Connecting…" : isDemo ? "Backend demo" : "Live workspace"}
          </span>
        </header>
        <main>
          <div className="heading">
            <div>
              <div className="eyebrow">YOUR BUSINESS, CONNECTED</div>
              <h1>
                {view === "overview"
                  ? "A place for everything."
                  : view === "structure"
                    ? "Bring your files together."
                    : view === "wiki"
                      ? "Your shared business brain."
                      : "Every change, accounted for."}
              </h1>
              <p>
                {view === "overview"
                  ? "Turn scattered files into a workspace that makes sense."
                  : view === "structure"
                    ? "Review the structure before anything moves."
                    : view === "wiki"
                      ? "Connected knowledge, grounded in your source files."
                      : "Follow the changes to your workspace."}
              </p>
            </div>
            <button
              className="primary"
              disabled={busy || !folder || !canScan}
              onClick={scan}
            >
              {busy ? (
                <Loader2 className="spin" size={17} />
              ) : (
                <Sparkles size={17} />
              )}{" "}
              {workspace
                ? "Refresh workspace"
                : plan
                  ? "Scan again"
                  : "Organize workspace"}
            </button>
          </div>
          {session && !isDemo && !session.config.google && <div className="confirmation-note">Google login needs configuration on the server before you can connect.</div>}
          {session && !isDemo && !session.config.llm && <div className="confirmation-note">AI scanning needs an API key configured on the server.</div>}
          {session && !isDemo && <div className="confirmation-note">Scanning sends text from your selected documents to OpenRouter. Folder moves happen only after you approve a plan.</div>}
          {error && (
            <div className="error" role="alert">
              {error}
              <button onClick={() => retryAction.current()} disabled={busy}>
                Retry
              </button>
            </div>
          )}
          <section className="folder-bar">
            <span className="drive-mark">
              <FolderIcon size={24} />
            </span>
            <div>
              <strong>
                {folder?.name ??
                  (busy ? "Loading folders..." : "No folders available")}
              </strong>
              <small>{folder?.path ?? "Connect a folder to get started"}</small>
            </div>
            <span className="folder-meta">
              {sources.length || "—"} source files
            </span>
            <button
              className="secondary"
              onClick={() => setPicker(true)}
              disabled={busy}
            >
              Change folder
              <ChevronRight size={15} />
            </button>
          </section>
          {busy && job && (
            <section className="progress-section" aria-live="polite">
              <div>
                <Loader2 className="spin" size={20} />
                <strong>{job.message}</strong>
                <span>{job.status === "running" ? "Working" : "Complete"}</span>
              </div>
              <progress value={job.status === "running" ? undefined : 100} max={100} />
            </section>
          )}
          {view === "overview" && (
            <>
              <div className="stats">
                <div>
                  <span>Source files</span>
                  <strong>
                    {sources.length || "—"}
                    <FileText size={19} />
                  </strong>
                  <small>Documents in the latest scan</small>
                </div>
                <div>
                  <span>Proposed categories</span>
                  <strong>
                    {destinations.length}
                    <FolderTree size={19} />
                  </strong>
                  <small>
                    {workspace
                      ? "From the latest scan"
                      : "Ready after your first scan"}
                  </small>
                </div>
                <div>
                  <span>Indexed files</span>
                  <strong>
                    {index.length}
                    <BookOpen size={19} />
                  </strong>
                  <small>Search names, descriptions and locations</small>
                </div>
                <div>
                  <span>Workspace status</span>
                  <strong className="text-stat">
                    {workspace
                      ? "Run saved"
                      : plan
                        ? "Ready to review"
                        : "Not scanned"}
                    <span className="status-dot" />
                  </strong>
                  <small>
                    {workspace
                      ? "See activity for the outcome"
                      : "Your original files are untouched"}
                  </small>
                </div>
              </div>
              <div className="overview-grid">
                <section className="workspace-section">
                  <div className="section-heading">
                    <h2>
                      {workspace
                        ? "Explore your workspace"
                        : "From scattered to structured"}
                    </h2>
                    <span className="pill">
                      {workspace ? "Connected" : "THE FIRST STEP"}
                    </span>
                  </div>
                  {workspace ? (
                    <>
                      <SearchBox value={query} onChange={setQuery} />
                      <FileList sources={filtered} onSelect={setDetail} />
                    </>
                  ) : (
                    <>
                      <div className="transformation">
                        <div className="loose-files">
                          <span>
                            <FileText size={17} />
                            Plans & notes
                          </span>
                          <span>
                            <Sheet size={17} />
                            Budgets & trackers
                          </span>
                          <span>
                            <FileText size={17} />
                            Shared documents
                          </span>
                        </div>
                        <div className="transform-arrow">
                          <ArrowRight size={22} />
                        </div>
                        <div className="structured">
                          <strong>
                            <FolderTree size={19} />
                            Your business brain
                          </strong>
                          <span>
                            <span className="tree-line" />
                            Organized source files
                          </span>
                          <span>
                            <span className="tree-line" />
                            Content-based categories
                          </span>
                          <span>
                            <span className="tree-line" />
                            Searchable context
                          </span>
                        </div>
                      </div>
                      <div className="section-footer">
                        <span>A clear structure. The same source files.</span>
                        <button
                          className="text-button"
                          disabled={busy || !folder || !canScan}
                          onClick={plan ? () => setView("structure") : scan}
                        >
                          {plan
                            ? "Review your structure"
                            : "Build your structure"}
                          <ArrowRight size={16} />
                        </button>
                      </div>
                    </>
                  )}
                </section>
                <section className="steps-section">
                  <div className="section-heading">
                    <h2>Your next steps</h2>
                    <CircleHelp size={17} />
                  </div>
                  {[
                    [
                      "01",
                      "Choose your folder",
                      folder?.name ?? "Select your business files",
                    ],
                    [
                      "02",
                      "Review the structure",
                      "Check categories and supporting evidence",
                    ],
                    [
                      "03",
                      "Make it your workspace",
                      "Approve moves to category folders",
                    ],
                  ].map(([n, title, subtitle], i) => (
                    <div className="step" key={n}>
                      <span
                        className={
                          i === 0 || workspace
                            ? "step-number done"
                            : "step-number"
                        }
                      >
                        {i === 0 || workspace ? <Check size={15} /> : n}
                      </span>
                      <div>
                        <strong>{title}</strong>
                        <small>{subtitle}</small>
                      </div>
                    </div>
                  ))}
                </section>
              </div>
              <section className="recent">
                <div className="section-heading">
                  <h2>
                    {workspace
                      ? "Latest activity"
                      : "Built for your next question"}
                  </h2>
                  {workspace && (
                    <button
                      className="text-button"
                      onClick={() => setView("activity")}
                    >
                      View activity
                      <ArrowRight size={15} />
                    </button>
                  )}
                </div>
                {workspace ? (
                  <div className="activity-row">
                    <CheckCircle2 size={20} />
                    <div>
                      <strong>{workspace.activity[0]?.title}</strong>
                      <small>
                        {workspace.activity[0]?.detail}
                      </small>
                    </div>
                    <span>{workspace.activity[0] ? new Date(workspace.activity[0].at).toLocaleString() : ""}</span>
                  </div>
                ) : (
                  <div className="question-grid">
                    {[
                      "Where is our launch plan?",
                      "What belongs to this project?",
                      "Which files explain our budget?",
                    ].map((q) => (
                      <div className="question" key={q}>
                        <Search size={17} />
                        <span>{q}</span>
                        <ArrowUpRight size={16} />
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
          {view === "structure" && (
            <section>
              <div className="section-heading">
                <div className="tabs">
                  <button
                    className={tab === "proposed" ? "selected" : ""}
                    onClick={() => setTab("proposed")}
                  >
                    Proposed structure
                  </button>
                  <button
                    className={tab === "original" ? "selected" : ""}
                    onClick={() => setTab("original")}
                  >
                    Original locations
                  </button>
                </div>
                {plan && !workspace && (
                  <button
                    className="primary"
                    disabled={
                      busy ||
                      !plan.complete ||
                      plan.sources.some((s) => !s.name.trim() || /[\/\\\x00-\x1f]/.test(s.name))
                    }
                    onClick={reviewEdits}
                  >
                    Review & apply
                    <ArrowRight size={16} />
                  </button>
                )}
              </div>
              {!plan && !workspace ? (
                <Empty
                  title={
                    busy
                      ? "Building your structure"
                      : "Your structure starts here"
                  }
                  text={
                    busy
                      ? "Reading your selected folder and connecting the files."
                      : "Scan the folder to see where your files belong."
                  }
                />
              ) : (
                <>
                  <div className="plan-summary">
                    <CheckCircle2 size={18} />
                    <span>
                      {sources.length} files · {destinations.length}{" "}
                      categories · {dirty ? 'Unsaved edits' : `${plan?.moveCount ?? 0} moves · ${plan?.renameCount ?? 0} renames`}
                    </span>
                    <span className="pill">
                      {workspace ? "Applied" : "Awaiting review"}
                    </span>
                  </div>
                  {!workspace && <p>Edit file names and destination categories below. Review &amp; apply saves your plan for approval; Drive changes happen only after confirmation.</p>}
                  {plan?.warnings.map((w) => (
                    <div className="error" key={w}>
                      {w}
                    </div>
                  ))}
                  <div className="structure-layout">
                    <aside className="tree">
                      <strong>
                        <FolderIcon size={17} />
                        {folder?.name}
                      </strong>
                      {[
                        ...new Set(
                          sources.map((s) =>
                            tab === "original" ? s.currentPath : s.destination,
                          ),
                        ),
                      ].map((path) => (
                        <div key={path}>
                          <FolderIcon size={16} />
                          <span>{path}</span>
                          <small>
                            {
                              sources.filter(
                                (s) =>
                                  (tab === "original"
                                    ? s.currentPath
                                    : s.destination) === path,
                              ).length
                            }
                          </small>
                        </div>
                      ))}
                      {tab === "proposed" && pages.length > 0 && (
                        <div className="wiki-tree">
                          <BookOpen size={16} />
                          Braino wiki<small>{pages.length}</small>
                        </div>
                      )}
                    </aside>
                    <div className="file-table">
                      <div className="table-label">
                        <span>SOURCE FILE</span>
                        <span>
                          {tab === "original"
                            ? "CURRENT LOCATION"
                            : "DESTINATION"}
                        </span>
                      </div>
                      {sources.map((s) => (
                        <div className="file-row" key={s.id}>
                          <button
                            className="file-title"
                            onClick={() => setDetail(s)}
                          >
                            {s.kind === "sheet" ? (
                              <Sheet size={19} className="sheet" />
                            ) : (
                              <FileText size={19} className="doc" />
                            )}
                            <span>
                              <strong>{s.name}</strong>
                              <small>{s.reason}</small>
                            </span>
                          </button>
                          {tab === "original" ? (
                            <span className="path">{s.currentPath}</span>
                          ) : workspace ? (
                            <span className="path">{s.destination}</span>
                          ) : (
                            <div className="file-edits">
                              <label>File name<input aria-label={`File name for ${s.id}`} value={s.name} maxLength={255} disabled={busy} onChange={e => editSource(s.id, { name: e.target.value })} /></label>
                              <label>Destination<select aria-label={`Destination for ${s.id}`} value={s.categoryId ?? ''} disabled={busy} onChange={e => editSource(s.id, { categoryId: e.target.value || null, destination: categoryOptions.find(c => c.id === e.target.value)?.name ?? 'Keep current location' })}>
                                <option value="">Keep current location</option>
                                {categoryOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select></label>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </section>
          )}
          {view === "wiki" && (
            <section>
              <div className="section-heading"><h2>Knowledge index <span className="muted">{index.length}</span></h2><span className="pill">{workspace ? 'Saved locations' : 'Scan snapshot'}</span></div>
              <p>Find files by name, category, description, evidence or folder location. Locations reflect the last scan or completed changes; scan again to refresh external changes.</p>
              <SearchBox value={query} onChange={setQuery} />
              <div className="wiki-grid">
                {indexed.map(s => <article className="wiki-card index-card" key={s.id}>
                  <button className="text-button" onClick={() => setDetail(s)}><FileText size={20} /><h3>{s.name}</h3></button>
                  <p>{s.reason}</p>
                  <dl><dt>Location</dt><dd>{s.currentPath}</dd><dt>Category</dt><dd>{s.destination}</dd></dl>
                  {s.previewUrl ? <a href={s.previewUrl} target="_blank" rel="noreferrer">View PDF <ArrowUpRight size={16} /></a> : s.webViewLink ? <a href={s.webViewLink} target="_blank" rel="noreferrer">Open original <ArrowUpRight size={16} /></a> : <small>Sample file</small>}
                </article>)}
              </div>
              {!indexed.length && <Empty title={index.length ? 'No matching files' : 'Your index starts with a scan'} text={index.length ? 'Try a file name, topic or folder.' : 'Scan your selected folder to build its searchable index.'} />}
            </section>
          )}
          {view === "activity" && (
            <section>
              <div className="section-heading">
                <h2>Workspace history</h2>
                <History size={18} />
              </div>
              {workspace?.activity.length ? (
                workspace.activity.map((a) => (
                  <div className="activity-row" key={a.id}>
                    <CheckCircle2 size={20} />
                    <div>
                      <strong>{a.title}</strong>
                      <small>{a.detail}</small>
                    </div>
                    <span>{new Date(a.at).toLocaleString()}</span>
                  </div>
                ))
              ) : (
                <Empty
                  title="A fresh start"
                  text="Your applied changes will appear here."
                />
              )}
            </section>
          )}
          <footer>
            <span>
              <Network size={14} /> A little structure. A lot more clarity.
            </span>
            <span>
              {isDemo
                ? "Demo data · No Google Drive changes"
                : "Braino workspace"}
            </span>
          </footer>
        </main>
      </div>
      <dialog ref={dialog} onCancel={closeDialog}>
        <div className="dialog-heading">
          <h2>
            {picker
              ? "Choose a folder"
              : confirm
                ? "Apply this structure?"
                : detail && "sourceIds" in detail
                  ? detail.title
                  : detail?.name}
          </h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            title="Close"
            onClick={closeDialog}
          >
            <X size={20} />
          </button>
        </div>
        {picker ? (
          <>
            {error && <p role="alert">{error}</p>}
            <label>Parent folder ID (use root for My Drive)<input aria-label="Parent folder ID" value={parentId} onChange={e => setParentId(e.target.value)} /></label>
            <button className="secondary" disabled={busy} onClick={browse}>Browse subfolders</button>
            <SearchBox value={folderQuery} onChange={setFolderQuery} />
            <div className="folder-options">
              {folders
                .filter((f) =>
                  `${f.name} ${f.path}`
                    .toLowerCase()
                    .includes(folderQuery.toLowerCase()),
                )
                .map((f) => (
                  <button key={f.id} onClick={() => selectFolder(f)}>
                    <FolderIcon size={23} />
                    <span>
                      <strong>{f.name}</strong>
                      <small>
                        {f.path}
                      </small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                ))}
              {!folders.some((f) =>
                `${f.name} ${f.path}`
                  .toLowerCase()
                  .includes(folderQuery.toLowerCase()),
              ) && <p>No folders match your search.</p>}
            </div>
          </>
        ) : confirm ? (
          <>
            <p>
              {plan?.moveCount ?? 0} files will move and {plan?.renameCount ?? 0} files will be renamed. Files set to keep their current location will stay in place. The search index will show the updated locations.
            </p>
            <div className="confirmation-note">
              {isDemo
                ? "This is a demo. Only synthetic demo files move; your Google Drive is untouched."
                : "Review the destinations before confirming. The server must verify permissions and record each change."}
            </div>
            <div className="dialog-actions">
              <button className="secondary" onClick={closeDialog}>
                Keep reviewing
              </button>
              <button className="primary" onClick={apply}>
                Apply structure
                <Check size={16} />
              </button>
            </div>
          </>
        ) : detail ? (
          "sourceIds" in detail ? (
            <>
              <p>{detail.summary}</p>
              <h3>Source files</h3>
              <FileList
                sources={sources.filter((s) => detail.sourceIds.includes(s.id))}
                onSelect={setDetail}
              />
            </>
          ) : (
            <>
              <div className="detail-kind">
                {detail.kind === "sheet" ? <Sheet /> : <FileText />}
                {detail.kind === "sheet" ? "Google Sheet" : detail.kind === "pdf" ? "PDF document" : "Google Doc"}
              </div>
              <p>{detail.reason}</p>
              {detail.previewUrl && <a href={detail.previewUrl} target="_blank" rel="noreferrer">View PDF in a new tab</a>}
              <h3>Supporting evidence</h3>
              {detail.evidence.map((text, i) => <blockquote key={i}>{text}</blockquote>)}
              <dl>
                <dt>Indexed location</dt>
                <dd>{detail.currentPath}</dd>
                <dt>Destination</dt>
                <dd>{detail.destination}</dd>
                <dt>Last modified</dt>
                <dd>{detail.modified}</dd>
              </dl>
              {isDemo && (
                <div className="confirmation-note">
                  Sample document. No live source is connected.
                </div>
              )}
            </>
          )
        ) : null}
      </dialog>
    </div>
  );
}
function SearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="search">
      <Search size={18} />
      <input
        aria-label="Search"
        placeholder="Search folders, files, or topics..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          className="icon-button"
          aria-label="Clear search"
          onClick={() => onChange("")}
        >
          <X size={15} />
        </button>
      )}
    </label>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <FolderTree size={35} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function FileList({
  sources,
  onSelect,
}: {
  sources: Source[];
  onSelect: (source: Source) => void;
}) {
  return (
    <div className="file-list">
      {sources.length ? (
        sources.map((s) => (
          <React.Fragment key={s.id}>
            <button onClick={() => onSelect(s)}>
              {s.kind === "sheet" ? (
                <Sheet className="sheet" size={19} />
              ) : (
                <FileText className="doc" size={19} />
              )}
              <span>
                <strong>{s.name}</strong>
                <small>{s.destination}</small>
              </span>
              <ChevronRight size={16} />
            </button>
            {s.webViewLink &&
              /^https:\/\/(drive|docs)\.google\.com\//.test(s.webViewLink) && (
                <a
                  className="text-button"
                  href={s.webViewLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open {s.name} in Drive
                  <ArrowUpRight size={14} />
                </a>
              )}
          </React.Fragment>
        ))
      ) : (
        <p className="empty-search">No files match your search.</p>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
