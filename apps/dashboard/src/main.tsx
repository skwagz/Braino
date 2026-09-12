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
import { api, isDemo } from "./api";
import type { Folder, Job, Plan, Source, WikiPage, Workspace } from "./types";
import "./style.css";

type View = "overview" | "structure" | "wiki" | "activity";
function App() {
  const [view, setView] = useState<View>("overview");
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folder, setFolder] = useState<Folder>();
  const [picker, setPicker] = useState(false);
  const [folderQuery, setFolderQuery] = useState("");
  const [query, setQuery] = useState("");
  const [plan, setPlan] = useState<Plan>();
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
  const sources = workspace?.sources ?? plan?.sources ?? [];
  const pages = workspace?.pages ?? plan?.pages ?? [];
  const destinations = [...new Set(sources.map((s) => s.destination))];
  const filtered = sources.filter((s) =>
    `${s.name} ${s.destination} ${s.reason}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  async function load() {
    setBusy(true);
    setError("");
    try {
      const result = await api.listFolders();
      setFolders(result);
      if (result[0]) {
        setFolder(result[0]);
        setWorkspace(await api.getWorkspace(result[0].id));
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
      setWorkspace(await api.getWorkspace(next.id));
    } catch (e) {
      retryAction.current = () => selectFolder(next);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function scan() {
    if (!folder) return;
    setBusy(true);
    setError("");
    setPlan(undefined);
    setView("structure");
    try {
      let next = await api.startScan(folder.id);
      setJob(next);
      const started = Date.now();
      while (next.status === "running") {
        if (Date.now() - started > 120000)
          throw new Error(
            "Scan is taking longer than expected. Start a new scan to retry.",
          );
        await new Promise((resolve) => setTimeout(resolve, 500));
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
      setView("overview");
    } catch (e) {
      retryAction.current = apply;
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function destination(id: string, value: string) {
    setPlan((p) =>
      p
        ? {
            ...p,
            sources: p.sources.map((s) =>
              s.id === id ? { ...s, destination: value } : s,
            ),
          }
        : p,
    );
    requestId.current = crypto.randomUUID();
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
          <span className="avatar">N</span>
          <div>
            <strong>{folder?.name ?? "Your workspace"}</strong>
            <small>Business workspace</small>
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
              <strong>{isDemo ? "Demo workspace" : "Workspace API"}</strong>
              <small>{isDemo ? "Sample data only" : "Connected service"}</small>
            </div>
          </div>
          <button
            className="nav"
            onClick={() => setPicker(true)}
            disabled={busy}
          >
            <Settings2 size={18} />
            Manage folders
          </button>
          <div className="profile">
            <span className="avatar user">JS</span>
            <div>
              <strong>Workspace team</strong>
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
            {isDemo ? "Interactive demo" : "Live workspace"}
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
              disabled={busy || !folder}
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
              {folder?.fileCount ?? 0} source files
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
                <span>{job.progress}%</span>
              </div>
              <progress value={job.progress} max={100} />
            </section>
          )}
          {view === "overview" && (
            <>
              <div className="stats">
                <div>
                  <span>Source files</span>
                  <strong>
                    {folder?.fileCount ?? 0}
                    <FileText size={19} />
                  </strong>
                  <small>In your selected folder</small>
                </div>
                <div>
                  <span>Organized folders</span>
                  <strong>
                    {destinations.length}
                    <FolderTree size={19} />
                  </strong>
                  <small>
                    {workspace
                      ? "Everything in its place"
                      : "Ready after your first scan"}
                  </small>
                </div>
                <div>
                  <span>Wiki pages</span>
                  <strong>
                    {pages.length}
                    <BookOpen size={19} />
                  </strong>
                  <small>Context for people and AI</small>
                </div>
                <div>
                  <span>Workspace status</span>
                  <strong className="text-stat">
                    {workspace
                      ? "Organized"
                      : plan
                        ? "Ready to review"
                        : "Not scanned"}
                    <span className="status-dot" />
                  </strong>
                  <small>
                    {workspace
                      ? "Latest changes applied"
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
                            Linked knowledge wiki
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
                          disabled={busy || !folder}
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
                      "Adjust where everything belongs",
                    ],
                    [
                      "03",
                      "Make it your workspace",
                      "Apply changes and explore your wiki",
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
                      <strong>Workspace organized</strong>
                      <small>
                        {workspace.sources.length} files organized with their
                        source references preserved
                      </small>
                    </div>
                    <span>Just now</span>
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
                      plan.sources.some((s) => !s.destination.trim())
                    }
                    onClick={() => setConfirm(true)}
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
                      destinations · {pages.length} wiki pages
                    </span>
                    <span className="pill">
                      {workspace ? "Applied" : "Awaiting review"}
                    </span>
                  </div>
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
                      {tab === "proposed" && (
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
                            <input
                              aria-label={`Destination for ${s.name}`}
                              value={s.destination}
                              disabled={busy}
                              onChange={(e) =>
                                destination(s.id, e.target.value)
                              }
                            />
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
              <div className="section-heading">
                <h2>
                  Knowledge index <span className="muted">{pages.length}</span>
                </h2>
                <span className="pill">
                  {workspace ? "Published" : "Preview"}
                </span>
              </div>
              {!pages.length ? (
                <Empty
                  title="Your wiki is waiting to take shape"
                  text="Organize a folder to connect its projects, topics, and source files."
                />
              ) : (
                <>
                  <SearchBox value={query} onChange={setQuery} />
                  <div className="wiki-grid">
                    {pages
                      .filter((p) =>
                        `${p.title} ${p.summary}`
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                      )
                      .map((p) => (
                        <button
                          className="wiki-card"
                          key={p.id}
                          onClick={() => setDetail(p)}
                        >
                          <BookOpen size={23} />
                          <h3>{p.title}</h3>
                          <p>{p.summary}</p>
                          <span>
                            {p.sourceIds.length} sources
                            <ArrowUpRight size={17} />
                          </span>
                        </button>
                      ))}
                  </div>
                  {!pages.some((p) =>
                    `${p.title} ${p.summary}`
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  ) && (
                    <Empty
                      title="No matching pages"
                      text="Try a different project or topic."
                    />
                  )}
                </>
              )}
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
                        {f.path} · {f.fileCount} files
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
              {sources.length} files will be placed in {destinations.length}{" "}
              destination folders. {pages.length} linked wiki pages will be
              created.
            </p>
            <div className="confirmation-note">
              {isDemo
                ? "This is a demo. Only the preview changes; your Google Drive is untouched."
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
                {detail.kind === "sheet" ? "Google Sheet" : "Google Doc"}
              </div>
              <p>{detail.reason}</p>
              <dl>
                <dt>Original location</dt>
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
