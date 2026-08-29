import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type {
  GitBranch,
  GitCommit,
  GitFileStatus,
  GitStash,
  GitStatus,
} from "../electron-api";
import type { PromptRequest } from "./PromptDialog";

function StageIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14">
      <path fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" d="M8 3.5v9M3.5 8h9" />
    </svg>
  );
}

function UnstageIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14">
      <path fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" d="M3.5 8h9" />
    </svg>
  );
}

function DiscardIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        d="M13 8a5 5 0 1 1-1.6-3.7M13 2.6V5h-2.4"
      />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        d="M13.2 7a5.2 5.2 0 1 0-1.4 4M13.4 2.4v3.2h-3.2"
      />
    </svg>
  );
}

function BranchIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13">
      <circle cx="4.5" cy="3.5" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="4.5" cy="12.5" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="11.5" cy="6" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path fill="none" stroke="currentColor" strokeWidth="1.3" d="M4.5 5.1v5.8M11.5 7.6c0 2-2.2 2.3-4.4 2.9" />
    </svg>
  );
}

function StashIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13">
      <path fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" d="M2.5 5.5h11v7a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z" />
      <path fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" d="M4.5 3.2h7M6 8.5h4" />
    </svg>
  );
}

function CommitDotIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12">
      <circle cx="8" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" d="M1.5 8h3.3M11.2 8h3.3" />
    </svg>
  );
}

/** VS Code's single-letter status badge, plus the colour it uses for it. */
function statusBadge(code: string): { letter: string; title: string; cls: string } {
  switch (code) {
    case "M":
      return { letter: "M", title: "Modified", cls: "git-badge-m" };
    case "A":
      return { letter: "A", title: "Added", cls: "git-badge-a" };
    case "D":
      return { letter: "D", title: "Deleted", cls: "git-badge-d" };
    case "R":
      return { letter: "R", title: "Renamed", cls: "git-badge-r" };
    case "C":
      return { letter: "C", title: "Copied", cls: "git-badge-r" };
    case "U":
      return { letter: "U", title: "Conflicted", cls: "git-badge-u" };
    case "?":
      return { letter: "U", title: "Untracked", cls: "git-badge-untracked" };
    case "!":
      return { letter: "I", title: "Ignored", cls: "git-badge-untracked" };
    default:
      return { letter: code.trim() || "•", title: "Changed", cls: "git-badge-m" };
  }
}

/**
 * The paths an operation on this entry must cover. A rename is a single
 * porcelain entry naming two paths; acting on only the new one leaves the
 * staged deletion of the old one behind — which a later commit would apply.
 */
function pathsOf(file: GitFileStatus): string[] {
  return file.origPath && file.origPath !== file.path
    ? [file.path, file.origPath]
    : [file.path];
}

type RowAction = {
  key: string;
  title: string;
  icon: ReactNode;
  cls?: string;
  run: () => void;
};

function FileRow({
  file,
  code,
  active,
  onOpen,
  actions,
}: {
  file: GitFileStatus;
  code: string;
  active: boolean;
  onOpen: () => void;
  actions: RowAction[];
}) {
  const badge = statusBadge(code);
  const name = file.path.split("/").pop()!;
  const dir = file.path.slice(0, file.path.length - name.length).replace(/\/$/, "");

  return (
    <div
      className={"git-file-row" + (active ? " git-file-row-active" : "")}
      onClick={onOpen}
      title={
        (file.origPath ? `${file.origPath} → ${file.path}` : file.path) +
        ` — ${badge.title}. Click to view the diff.`
      }
    >
      <span className="git-file-name">{name}</span>
      {dir && <span className="git-file-dir">{dir}</span>}
      <span className="git-file-actions">
        {actions.map((a) => (
          <button
            key={a.key}
            className={"git-file-action" + (a.cls ? ` ${a.cls}` : "")}
            title={a.title}
            onClick={(e) => {
              e.stopPropagation();
              a.run();
            }}
          >
            {a.icon}
          </button>
        ))}
      </span>
      <span className={"git-badge " + badge.cls} title={badge.title}>
        {badge.letter}
      </span>
    </div>
  );
}

export default function GitPanel({
  rootDir,
  refreshToken,
  onOpenDiff,
  onWorktreeWillChange,
  onRepoChanged,
  promptForName,
}: {
  rootDir: string;
  /** Bump to force a re-read of status (e.g. after a save or compile). */
  refreshToken: number;
  onOpenDiff: (filePath: string, diff: string, staged: boolean) => void;
  /**
   * Awaited before an operation that rewrites the worktree, so the host can
   * cancel and drain autosaves that would otherwise land mid-operation.
   */
  onWorktreeWillChange: () => Promise<void>;
  /**
   * Fired after every operation. `worktree` is true when files on disk may have
   * been rewritten, meaning the open buffer has to be re-read; index-only
   * operations (stage, unstage, commit) must NOT reload, or they'd discard the
   * user's unsaved typing.
   */
  onRepoChanged: (worktree: boolean) => void;
  promptForName: (request: PromptRequest) => Promise<string | null>;
}) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [stashes, setStashes] = useState<GitStash[]>([]);
  const [message, setMessage] = useState("");
  const [amend, setAmend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const branchMenuRef = useRef<HTMLDivElement>(null);

  // Guards against out-of-order refreshes. Without it a slow refresh for the
  // previous project can resolve last and repaint its files/branches while
  // `rootDir` already points elsewhere — and acting on such a row would run
  // git against the wrong repository.
  const refreshGeneration = useRef(0);

  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    const current = () => refreshGeneration.current === generation;
    try {
      const next = await window.api.gitStatus(rootDir);
      if (!current()) return;
      setStatus(next);
      if (!next.isRepo) {
        setCommits([]);
        setBranches([]);
        setStashes([]);
        return;
      }
      const log = next.hasCommits ? await window.api.gitLog(rootDir, 50) : [];
      if (!current()) return;
      setCommits(log);
      const branchList = await window.api.gitBranches(rootDir);
      if (!current()) return;
      setBranches(branchList);
      const stashList = await window.api.gitStashList(rootDir);
      if (!current()) return;
      setStashes(stashList);
    } catch {
      if (!current()) return;
      setStatus({ isRepo: false, branch: null, files: [], hasCommits: false, nestedIn: null });
    }
  }, [rootDir]);

  // A row's path only means anything against the repo it was read from, so
  // clear the selection when the project changes.
  useEffect(() => {
    setActivePath(null);
  }, [rootDir]);

  useEffect(() => {
    refresh();
  }, [refresh, refreshToken]);

  // Close the branch dropdown when the click lands outside it. Containment is
  // checked explicitly rather than relying on stopPropagation, so a stale
  // listener can never swallow the click that was meant to open the menu.
  useEffect(() => {
    if (!branchMenuOpen) return;
    function onDown(e: MouseEvent) {
      if (!branchMenuRef.current?.contains(e.target as Node)) {
        setBranchMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [branchMenuOpen]);

  /**
   * Run a mutation, then resync this panel and the rest of the app.
   *
   * `worktree` marks operations that can rewrite files on disk. Those need the
   * host to drain autosaves first and to re-read the open buffer afterwards;
   * index-only operations must skip the reload so unsaved typing survives.
   *
   * The resync happens in `finally` because a *failed* git command can still
   * have changed things — `git stash pop` writes conflict markers into the
   * worktree and then exits nonzero — and leaving the UI unsynced there means
   * the next keystroke overwrites the result.
   */
  async function run(action: () => Promise<void>, worktree = false) {
    setBusy(true);
    if (worktree) await onWorktreeWillChange();
    try {
      await action();
    } catch (e) {
      alert(String(e).replace(/^Error:\s*/, ""));
    } finally {
      await refresh();
      onRepoChanged(worktree);
      setBusy(false);
    }
  }

  async function openDiff(file: GitFileStatus, staged: boolean) {
    setActivePath(file.path);
    try {
      const diff = await window.api.gitDiff(rootDir, file.path, staged);
      onOpenDiff(file.path, diff, staged);
    } catch (e) {
      alert(String(e));
    }
  }

  async function toggleAmend() {
    const next = !amend;
    setAmend(next);
    // Amending rewrites HEAD, so start from its message rather than blank.
    if (next && !message.trim()) {
      const head = await window.api.gitHeadMessage(rootDir);
      if (head) setMessage(head);
    }
  }

  function doCommit() {
    if (!message.trim()) return;
    run(async () => {
      await window.api.gitCommit(rootDir, message.trim(), amend);
      setMessage("");
      setAmend(false);
    });
  }

  if (!status) {
    return <div className="git-panel git-panel-empty">Loading…</div>;
  }

  if (!status.isRepo) {
    return (
      <div className="git-panel">
        <div className="panel-header">
          <span>Source Control</span>
        </div>
        <div className="git-init-block">
          {status.nestedIn ? (
            <div className="git-init-text">
              This project sits inside a larger repository at{" "}
              <code>{status.nestedIn}</code>. Git reports paths relative to that
              root, so the panel can’t safely act on them from here — use the
              terminal for this repository.
            </div>
          ) : (
            <>
              <div className="git-init-text">
                This project isn’t a git repository yet. Initialize one to track
                changes and commit your work.
              </div>
              <button
                className="git-init-btn"
                disabled={busy}
                onClick={() => run(() => window.api.gitInit(rootDir), true)}
              >
                Initialize Repository
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // Porcelain gives an index code and a worktree code per file; a file can
  // legitimately appear in both lists (staged edit + later unstaged edit).
  const staged = status.files.filter((f) => f.index !== " " && f.index !== "?");
  const changed = status.files.filter((f) => f.worktree !== " ");
  const canCommit = !!message.trim() && (amend || staged.length > 0);

  return (
    <div className="git-panel">
      <div className="panel-header">
        <span>Source Control</span>
        <span className="git-header-actions">
          <button
            className="git-header-btn"
            title="Stash all changes (including untracked)"
            disabled={busy || (staged.length === 0 && changed.length === 0)}
            onClick={() =>
              run(async () => {
                const m = await promptForName({
                  title: "Stash message:",
                  defaultValue: "WIP",
                  confirmLabel: "Stash",
                });
                // promptForName returns null for BOTH cancel and empty input,
                // so a null has to abort — stashing on Escape would silently
                // sweep the user's work out of the worktree.
                if (!m) return;
                await window.api.gitStashPush(rootDir, m);
              }, true)
            }
          >
            <StashIcon />
          </button>
          <button
            className="git-header-btn"
            title="Refresh"
            disabled={busy}
            onClick={() => run(async () => {})}
          >
            <RefreshIcon />
          </button>
        </span>
      </div>

      <div className="git-branch-bar" ref={branchMenuRef}>
        <button
          className="git-branch-btn"
          title="Switch or create a branch"
          disabled={busy}
          onClick={() => setBranchMenuOpen((v) => !v)}
        >
          <BranchIcon />
          <span className="git-branch-name">{status.branch ?? "(no branch)"}</span>
          <span className="git-branch-caret">▾</span>
        </button>
        {!status.hasCommits && <span className="git-branch-note">no commits yet</span>}
        {branchMenuOpen && (
          <div className="git-branch-menu">
            <button
              className="git-branch-menu-item git-branch-menu-new"
              onClick={() => {
                setBranchMenuOpen(false);
                run(async () => {
                  const name = await promptForName({
                    title: "New branch name:",
                    confirmLabel: "Create",
                  });
                  if (!name) return;
                  await window.api.gitCreateBranch(rootDir, name);
                }, true);
              }}
            >
              + Create new branch…
            </button>
            {branches.length > 0 && <div className="git-branch-menu-sep" />}
            {branches.map((b) => (
              <button
                key={b.name}
                className={
                  "git-branch-menu-item" + (b.current ? " git-branch-menu-current" : "")
                }
                disabled={b.current}
                onClick={() => {
                  setBranchMenuOpen(false);
                  if (b.current) return;
                  run(() => window.api.gitCheckoutBranch(rootDir, b.name), true);
                }}
              >
                {b.current ? "✓ " : "  "}
                {b.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="git-commit-box">
        <textarea
          className="git-commit-input"
          placeholder={
            amend
              ? "Amend the last commit's message"
              : `Message (commit on ${status.branch ?? "branch"})`
          }
          value={message}
          rows={2}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            // VS Code commits on Ctrl/Cmd+Enter from the message box.
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              if (canCommit && !busy) doCommit();
            }
          }}
        />
        <div className="git-commit-row-actions">
          <button
            className="git-commit-btn"
            disabled={busy || !canCommit}
            title={
              !message.trim()
                ? "Enter a commit message"
                : amend
                  ? "Amend the last commit"
                  : staged.length === 0
                    ? "Stage a change first"
                    : "Commit staged changes"
            }
            onClick={doCommit}
          >
            ✓ {amend ? "Amend" : "Commit"}
          </button>
          <button
            className={"git-amend-toggle" + (amend ? " active" : "")}
            disabled={busy || !status.hasCommits}
            title={
              status.hasCommits
                ? "Amend the previous commit instead of creating a new one"
                : "Nothing to amend yet"
            }
            onClick={toggleAmend}
          >
            Amend
          </button>
        </div>
      </div>

      <div className="git-scroll">
        {staged.length > 0 && (
          <div className="git-section">
            <div className="git-section-header">
              <span>Staged Changes</span>
              <span className="git-section-actions">
                <button
                  className="git-file-action"
                  title="Unstage all"
                  disabled={busy}
                  onClick={() =>
                    run(() => window.api.gitUnstage(rootDir, staged.flatMap(pathsOf)))
                  }
                >
                  <UnstageIcon />
                </button>
              </span>
              <span className="git-section-count">{staged.length}</span>
            </div>
            {staged.map((f) => (
              <FileRow
                key={`staged-${f.path}`}
                file={f}
                code={f.index}
                active={activePath === f.path}
                onOpen={() => openDiff(f, true)}
                actions={[
                  {
                    key: "unstage",
                    title: "Unstage change",
                    icon: <UnstageIcon />,
                    run: () => run(() => window.api.gitUnstage(rootDir, pathsOf(f))),
                  },
                ]}
              />
            ))}
          </div>
        )}

        {changed.length > 0 && (
          <div className="git-section">
            <div className="git-section-header">
              <span>Changes</span>
              <span className="git-section-actions">
                <button
                  className="git-file-action"
                  title="Stage all changes"
                  disabled={busy}
                  onClick={() =>
                    run(() => window.api.gitStage(rootDir, changed.flatMap(pathsOf)))
                  }
                >
                  <StageIcon />
                </button>
              </span>
              <span className="git-section-count">{changed.length}</span>
            </div>
            {changed.map((f) => (
              <FileRow
                key={`changed-${f.path}`}
                file={f}
                code={f.worktree}
                active={activePath === f.path}
                onOpen={() => openDiff(f, false)}
                actions={[
                  {
                    key: "discard",
                    title: "Discard changes",
                    icon: <DiscardIcon />,
                    cls: "git-file-action-danger",
                    run: () => {
                      if (
                        !window.confirm(
                          `Discard changes to "${f.path}"? This cannot be undone.`,
                        )
                      )
                        return;
                      run(() => window.api.gitDiscard(rootDir, pathsOf(f)), true);
                    },
                  },
                  {
                    key: "stage",
                    title: "Stage change",
                    icon: <StageIcon />,
                    run: () => run(() => window.api.gitStage(rootDir, pathsOf(f))),
                  },
                ]}
              />
            ))}
          </div>
        )}

        {staged.length === 0 && changed.length === 0 && (
          <div className="git-clean">No changes.</div>
        )}

        {stashes.length > 0 && (
          <div className="git-section">
            <div className="git-section-header">
              <span>Stashes</span>
              <span className="git-section-count">{stashes.length}</span>
            </div>
            {stashes.map((s) => (
              <div className="git-stash-row" key={s.ref} title={`${s.ref} — ${s.subject}`}>
                <span className="git-stash-subject">{s.subject}</span>
                <span className="git-file-actions">
                  <button
                    className="git-file-action"
                    title="Pop (apply and remove)"
                    disabled={busy}
                    onClick={() => run(() => window.api.gitStashApply(rootDir, s.ref, true), true)}
                  >
                    <StageIcon />
                  </button>
                  <button
                    className="git-file-action git-file-action-danger"
                    title="Drop this stash"
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm(`Drop stash "${s.subject}"?`)) return;
                      run(() => window.api.gitStashDrop(rootDir, s.ref));
                    }}
                  >
                    <DiscardIcon />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}

        {commits.length > 0 && (
          <div className="git-section">
            <div className="git-section-header">
              <span>History</span>
              <span className="git-section-count">{commits.length}</span>
            </div>
            {commits.map((c) => (
              <div
                className="git-commit-row"
                key={c.hash}
                title={`${c.subject}\n${c.author} · ${c.when}\n${c.hash}`}
              >
                <span className="git-commit-graph">
                  <CommitDotIcon />
                </span>
                <span className="git-commit-main">
                  <span className="git-commit-subject">{c.subject}</span>
                  <span className="git-commit-meta">
                    {c.author} · {c.when}
                  </span>
                </span>
                <span className="git-commit-hash">{c.hash}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
