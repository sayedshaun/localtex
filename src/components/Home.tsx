import { useEffect, useState } from "react";
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

  async function refresh() {
    const list = await window.api.listProjects();
    setProjects(list);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

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

  return (
    <div className="home">
      <div className="home-header">
        <h1>Your Projects</h1>
        <button className="home-new-btn" onClick={handleNewProject}>
          + New Project
        </button>
      </div>
      {loading ? (
        <div className="home-empty">Loading…</div>
      ) : projects.length === 0 ? (
        <div className="home-empty">
          No projects yet — create one to get started.
        </div>
      ) : (
        <div className="home-grid">
          {projects.map((p) => (
            <div
              key={p.dir}
              className="home-card"
              onClick={() => onOpenProject(p.dir, p.texPath)}
            >
              <div className="home-card-icon">📄</div>
              <div className="home-card-name">{p.name}</div>
              <div className="home-card-meta">{formatModified(p.modifiedMs)}</div>
              <button
                className="home-card-delete"
                onClick={(e) => handleDelete(e, p)}
                title="Delete project"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
