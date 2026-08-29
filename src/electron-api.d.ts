export type FileEntry = {
  name: string;
  path: string;
  is_dir: boolean;
  children: FileEntry[] | null;
};

export type CompileResult = {
  success: boolean;
  log: string;
  pdf_path: string | null;
};

export type ProjectSummary = {
  name: string;
  dir: string;
  texPath: string | null;
  modifiedMs: number;
};

export type SearchMatch = {
  path: string;
  line: number;
  text: string;
};

export type GitFileStatus = {
  path: string;
  origPath: string | null;
  /** Porcelain index (staged) code: one of " MADRCU?!". */
  index: string;
  /** Porcelain worktree (unstaged) code: one of " MADRCU?!". */
  worktree: string;
};

export type GitStatus = {
  isRepo: boolean;
  branch: string | null;
  files: GitFileStatus[];
  hasCommits: boolean;
  /**
   * Set when the project sits inside a *larger* repo whose root is elsewhere.
   * Porcelain paths would be relative to that root, so the panel reports "not
   * a repo" rather than acting on paths that don't resolve here.
   */
  nestedIn?: string | null;
};

export type GitBranch = {
  name: string;
  current: boolean;
};

export type GitStash = {
  ref: string;
  subject: string;
};

export type GitCommit = {
  hash: string;
  author: string;
  when: string;
  subject: string;
};

export type ElectronApi = {
  ensureProjectsRoot: () => Promise<{ root: string }>;
  listProjects: () => Promise<ProjectSummary[]>;
  createProject: (name: string, lang?: "en" | "multilingual") => Promise<ProjectSummary>;
  exportProject: (dir: string, projectName: string) => Promise<string | null>;
  chooseZipFile: () => Promise<string | null>;
  importProjectZip: (zipPath: string, name: string) => Promise<ProjectSummary>;
  readTextFile: (path: string) => Promise<string>;
  writeTextFile: (path: string, contents: string) => Promise<void>;
  readBinaryFileBase64: (path: string) => Promise<string>;
  pathExists: (path: string) => Promise<boolean>;
  openFileDialog: () => Promise<string | null>;

  listProjectTree: (root: string) => Promise<FileEntry[]>;
  searchProject: (root: string, query: string) => Promise<SearchMatch[]>;
  createFile: (path: string) => Promise<void>;
  createFolder: (path: string) => Promise<void>;
  renamePath: (from: string, to: string) => Promise<void>;
  deletePath: (path: string) => Promise<void>;
  uploadFile: (dir: string) => Promise<void>;

  /**
   * Everyday operations only. Push/pull/clone are deliberately absent — they
   * need credentials, which belong in the terminal where git can prompt.
   */
  gitStatus: (dir: string) => Promise<GitStatus>;
  gitDiff: (dir: string, path: string, staged: boolean) => Promise<string>;
  /** Contents at HEAD, or null when the file is new. Drives the change gutter. */
  gitHeadFile: (dir: string, relPath: string) => Promise<string | null>;
  gitHeadMessage: (dir: string) => Promise<string | null>;
  gitInit: (dir: string) => Promise<void>;
  gitStage: (dir: string, paths: string[]) => Promise<void>;
  gitUnstage: (dir: string, paths: string[]) => Promise<void>;
  gitDiscard: (dir: string, paths: string[]) => Promise<void>;
  gitCommit: (dir: string, message: string, amend?: boolean) => Promise<void>;
  gitBranches: (dir: string) => Promise<GitBranch[]>;
  gitCheckoutBranch: (dir: string, branch: string) => Promise<void>;
  gitCreateBranch: (dir: string, branch: string) => Promise<void>;
  gitStashList: (dir: string) => Promise<GitStash[]>;
  gitStashPush: (dir: string, message?: string) => Promise<void>;
  gitStashApply: (dir: string, ref: string, drop: boolean) => Promise<void>;
  gitStashDrop: (dir: string, ref: string) => Promise<void>;
  gitLog: (dir: string, limit?: number) => Promise<GitCommit[]>;

  compileTex: (path: string) => Promise<CompileResult>;
  syncForward: (
    texPath: string,
    line: number,
  ) => Promise<{ page: number; x: number; y: number } | null>;
  syncReverse: (
    texPath: string,
    page: number,
    x: number,
    y: number,
  ) => Promise<{ path: string; line: number } | null>;

  ptySpawn: (opts: {
    cols: number;
    rows: number;
    cwd?: string;
  }) => Promise<string>;
  ptyWrite: (id: string, data: string) => Promise<void>;
  ptyResize: (id: string, cols: number, rows: number) => Promise<void>;
  ptyKill: (id: string) => Promise<void>;
  onPtyOutput: (
    callback: (payload: { id: string; data: string }) => void,
  ) => () => void;
  onPtyExit: (callback: (payload: { id: string }) => void) => () => void;
};

declare global {
  interface Window {
    api: ElectronApi;
  }
}
