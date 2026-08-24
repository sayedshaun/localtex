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

export type ElectronApi = {
  ensureDefaultProject: () => Promise<{ dir: string; texPath: string }>;
  readTextFile: (path: string) => Promise<string>;
  writeTextFile: (path: string, contents: string) => Promise<void>;
  readBinaryFileBase64: (path: string) => Promise<string>;
  pathExists: (path: string) => Promise<boolean>;
  openFileDialog: () => Promise<string | null>;

  listProjectTree: (root: string) => Promise<FileEntry[]>;
  createFile: (path: string) => Promise<void>;
  createFolder: (path: string) => Promise<void>;
  renamePath: (from: string, to: string) => Promise<void>;
  deletePath: (path: string) => Promise<void>;

  compileTex: (path: string) => Promise<CompileResult>;

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
