import { useEffect, useMemo, useState } from "react";
import type { ProjectSummary } from "../electron-api";
import type { PromptRequest } from "./PromptDialog";

function formatModified(ms: number): string {
  const diff = Date.now() - ms;
  const day = 86_400_000;
  if (diff < day) return "Today";
  if (diff < 2 * day) return "Yesterday";
  const days = Math.floor(diff / day);
  if (days < 30) return `${days} days ago`;
  return new Date(ms).toLocaleDateString();
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14">
      <path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" d="M8 2.5v11M2.5 8h11" />
    </svg>
  );
}

function ImportIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14">
      <path fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" d="M8 1.5v7.3M5 6l3 3 3-3" />
      <path fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" d="M2.5 11v2.2c0 .7.6 1.3 1.3 1.3h8.4c.7 0 1.3-.6 1.3-1.3V11" />
    </svg>
  );
}

function FolderNavIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14">
      <path fill="currentColor" d="M1.5 3.5h4l1.2 1.4H14a.5.5 0 0 1 .5.5v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-8a.5.5 0 0 1 .5-.5z" opacity="0.9" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14">
      <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" d="M10.5 10.5 14 14" />
    </svg>
  );
}

function ProjectDocIcon() {
  return (
    <svg viewBox="0 0 32 32" width="20" height="20">
      <path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" d="M8 3h11l6 6v19a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" d="M19 3v6h6" />
      <path stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" d="M11 17h10M11 21h10M11 13h5" opacity="0.7" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15">
      <path fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" d="M8 1.8v7.6M4.8 6.6 8 9.8l3.2-3.2" />
      <path fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" d="M2.3 11.5v1.7c0 .8.6 1.5 1.5 1.5h8.4c.9 0 1.5-.7 1.5-1.5v-1.7" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15">
      <path fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h10M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M6.7 7.3v4.4M9.3 7.3v4.4" />
      <path fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" d="M3.8 4.5l.6 8.4a1.2 1.2 0 0 0 1.2 1.1h4.8a1.2 1.2 0 0 0 1.2-1.1l.6-8.4" />
    </svg>
  );
}

function PdfIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15">
      <path fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" d="M3.5 1.5h6.2L12.5 5v9.5h-9z" />
      <text x="8" y="12" textAnchor="middle" fontSize="5.2" fontWeight="700" fill="currentColor">
        PDF
      </text>
    </svg>
  );
}

function EmptyStateIcon() {
  return (
    <svg viewBox="0 0 96 96" width="72" height="72">
      <circle cx="48" cy="48" r="46" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 6" opacity="0.4" />
      <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" d="M32 24h22l14 14v34a2 2 0 0 1-2 2H32a2 2 0 0 1-2-2V26a2 2 0 0 1 2-2z" />
      <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" d="M54 24v14h14" />
      <path stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" d="M36 50h20M36 58h20M36 42h10" opacity="0.6" />
    </svg>
  );
}

export default function Home({
  onOpenProject,
  promptForName,
}: {
  onOpenProject: (dir: string, texPath: string | null) => void;
  promptForName: (request: PromptRequest) => Promise<string | null>;
}) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  async function refresh() {
    const list = await window.api.listProjects();
    setProjects(list);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, query]);

  async function handleNewProject() {
    const name = await promptForName({ title: "New project name:" });
    if (!name) return;
    const multilingual = window.confirm(
      "Set up for a non-Latin-script language (Bengali, Arabic, Hindi, etc.) with XeLaTeX + polyglossia?\n\nOK = multilingual template, Cancel = plain English template.",
    );
    try {
      const project = await window.api.createProject(
        name,
        multilingual ? "multilingual" : "en",
      );
      await refresh();
      onOpenProject(project.dir, project.texPath);
    } catch (e) {
      alert(String(e));
    }
  }

  async function handleDelete(e: React.MouseEvent, project: ProjectSummary) {
    e.stopPropagation();
    if (!window.confirm(`Delete project "${project.name}" and everything in it?`)) return;
    try {
      await window.api.deletePath(project.dir);
      await refresh();
    } catch (err) {
      alert(String(err));
    }
  }

  async function handleExport(e: React.MouseEvent, project: ProjectSummary) {
    e.stopPropagation();
    try {
      await window.api.exportProject(project.dir, project.name);
    } catch (err) {
      alert(String(err));
    }
  }

  async function handleViewPdf(e: React.MouseEvent, project: ProjectSummary) {
    e.stopPropagation();
    const pdfPath = `${project.dir}/main.pdf`;
    const exists = await window.api.pathExists(pdfPath);
    if (!exists) {
      alert("This project hasn't been compiled yet — open it and hit Compile first.");
      return;
    }
    onOpenProject(project.dir, pdfPath);
  }

  async function handleImportProject() {
    const zipPath = await window.api.chooseZipFile();
    if (!zipPath) return;
    const defaultName = zipPath.split("/").pop()!.replace(/\.zip$/i, "");
    const name = await promptForName({
      title: "Import as project name:",
      defaultValue: defaultName,
    });
    if (!name) return;
    try {
      const project = await window.api.importProjectZip(zipPath, name);
      await refresh();
      onOpenProject(project.dir, project.texPath);
    } catch (e) {
      alert(String(e));
    }
  }

  return (
    <div className="home">
      <div className="home-sidebar">
        <button className="home-new-btn" onClick={handleNewProject}>
          <PlusIcon />
          New Project
        </button>
        <button className="home-import-btn" onClick={handleImportProject}>
          <ImportIcon />
          Import from Overleaf
        </button>
        <div className="home-nav">
          <div className="home-nav-item home-nav-item-active">
            <FolderNavIcon />
            All Projects
          </div>
        </div>
      </div>
      <div className="home-content">
        <div className="home-toolbar">
          <div className="home-search-wrap">
            <span className="home-search-icon">
              <SearchIcon />
            </span>
            <input
              className="home-search"
              type="text"
              placeholder="Search projects…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {!loading && projects.length > 0 && (
            <span className="home-count">
              {projects.length} project{projects.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {loading ? (
          <div className="home-empty" />
        ) : filtered.length === 0 ? (
          <div className="home-empty">
            <div className="home-empty-icon">
              <EmptyStateIcon />
            </div>
            <div className="home-empty-title">
              {projects.length === 0 ? "No projects yet" : "No matches"}
            </div>
            <div className="home-empty-subtitle">
              {projects.length === 0
                ? "Create your first project to get started."
                : "Try a different search term."}
            </div>
            {projects.length === 0 && (
              <button className="home-empty-cta" onClick={handleNewProject}>
                <PlusIcon />
                New Project
              </button>
            )}
          </div>
        ) : (
          <table className="home-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Last Modified</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.dir}
                  className="home-row"
                  onClick={() => onOpenProject(p.dir, p.texPath)}
                >
                  <td className="home-row-title">
                    <span className="home-row-icon">
                      <ProjectDocIcon />
                    </span>
                    {p.name}
                  </td>
                  <td className="home-row-modified">{formatModified(p.modifiedMs)}</td>
                  <td className="home-row-actions">
                    <button
                      className="home-row-action home-row-pdf"
                      onClick={(e) => handleViewPdf(e, p)}
                      title="View compiled PDF"
                    >
                      <PdfIcon />
                    </button>
                    <button
                      className="home-row-action home-row-export"
                      onClick={(e) => handleExport(e, p)}
                      title="Export as zip (for Overleaf)"
                    >
                      <DownloadIcon />
                    </button>
                    <button
                      className="home-row-action home-row-delete"
                      onClick={(e) => handleDelete(e, p)}
                      title="Delete project"
                    >
                      <TrashIcon />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
