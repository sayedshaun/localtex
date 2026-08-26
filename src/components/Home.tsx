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
    try {
      const project = await window.api.createProject(name);
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
          + New Project
        </button>
        <button className="home-import-btn" onClick={handleImportProject}>
          Import from Overleaf…
        </button>
        <div className="home-nav">
          <div className="home-nav-item home-nav-item-active">All Projects</div>
        </div>
      </div>
      <div className="home-content">
        <div className="home-toolbar">
          <input
            className="home-search"
            type="text"
            placeholder="Search projects…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {loading ? (
          <div className="home-empty">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="home-empty">
            {projects.length === 0
              ? "No projects yet — create one to get started."
              : "No projects match your search."}
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
                    <span className="home-row-icon">📄</span>
                    {p.name}
                  </td>
                  <td className="home-row-modified">{formatModified(p.modifiedMs)}</td>
                  <td className="home-row-actions">
                    <button
                      className="home-row-export"
                      onClick={(e) => handleExport(e, p)}
                      title="Export as zip (for Overleaf)"
                    >
                      ⬇
                    </button>
                    <button
                      className="home-row-delete"
                      onClick={(e) => handleDelete(e, p)}
                      title="Delete project"
                    >
                      ×
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
